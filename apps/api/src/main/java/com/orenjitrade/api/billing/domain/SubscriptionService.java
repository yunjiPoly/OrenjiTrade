package com.orenjitrade.api.billing.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.billing.domain.BillingProvider.BillingProviderException;
import com.orenjitrade.api.billing.domain.BillingProvider.EventKind;
import com.orenjitrade.api.billing.domain.SubscriptionRows.BillingWebhookRow;
import com.orenjitrade.api.billing.domain.SubscriptionRows.SubscriptionEventRow;
import com.orenjitrade.api.billing.domain.SubscriptionRows.SubscriptionRow;
import com.orenjitrade.api.billing.domain.SubscriptionRows.WebhookState;
import com.orenjitrade.api.billing.events.SubscriptionChanged;
import com.orenjitrade.api.billing.infra.BillingWebhookRepository;
import com.orenjitrade.api.billing.infra.SubscriptionRepository;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.featureflags.domain.FeatureFlagKeys;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import com.orenjitrade.api.users.domain.UserAccountService;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * Subscriptions (Phase 10 contract "Plans and limits"): checkout through the {@link
 * BillingProvider}, activation and renewals from verified provider webhooks, cancellation by the
 * member (at the period end or at once) or an admin, the period job and the admin views. An
 * entitling subscription (TRIAL, ACTIVE, PAST_DUE) sets {@code user_account.plan_code} to its plan
 * and grants {@code PREMIUM_USER}; its end sets FREE and revokes the role, so {@link Limits} and
 * {@link Entitlements} follow at once. Every change appends a {@code subscription_event} and
 * publishes {@link SubscriptionChanged}.
 */
@Service
public class SubscriptionService {

    public static final String ACTION_ADMIN_CANCEL = "subscription.cancel";
    public static final String TARGET_SUBSCRIPTION = "SUBSCRIPTION";

    /** Web paths the provider returns to (the {@code /premium} page). */
    public static final String SUCCESS_PATH = "/premium?checkout=success";

    public static final String CANCEL_PATH = "/premium?checkout=cancelled";

    /** Mobile store providers whose receipts are validated by a reserved route. */
    static final List<String> STORE_PROVIDERS = List.of("apple", "google");

    private static final Logger log = LoggerFactory.getLogger(SubscriptionService.class);

    private final SubscriptionRepository repository;
    private final BillingWebhookRepository webhooks;
    private final BillingProvider provider;
    private final PlanService plans;
    private final UserAccountService accounts;
    private final FeatureFlags featureFlags;
    private final AuditService auditService;
    private final ApplicationEventPublisher events;
    private final TimeProvider timeProvider;
    private final JsonMapper jsonMapper;

    public SubscriptionService(
            SubscriptionRepository repository,
            BillingWebhookRepository webhooks,
            BillingProvider provider,
            PlanService plans,
            UserAccountService accounts,
            FeatureFlags featureFlags,
            AuditService auditService,
            ApplicationEventPublisher events,
            TimeProvider timeProvider,
            JsonMapper jsonMapper) {
        this.repository = repository;
        this.webhooks = webhooks;
        this.provider = provider;
        this.plans = plans;
        this.accounts = accounts;
        this.featureFlags = featureFlags;
        this.auditService = auditService;
        this.events = events;
        this.timeProvider = timeProvider;
        this.jsonMapper = jsonMapper;
    }

    /**
     * An opened (or resumed) checkout.
     *
     * @param subscription the PENDING subscription
     * @param url where the member pays
     * @param clientSecret client secret of an embedded form (Stripe; never stored)
     * @param resumed whether an open checkout of the same plan was answered again
     */
    public record CheckoutResult(
            SubscriptionRow subscription,
            String url,
            @Nullable String clientSecret,
            boolean resumed) {}

    /**
     * What applying a provider event did.
     *
     * @param status PROCESSED or IGNORED
     * @param subscriptionId the subscription concerned, when known
     * @param error reason code of an IGNORED event
     */
    public record ApplyOutcome(
            WebhookState status, @Nullable UUID subscriptionId, @Nullable String error) {

        static ApplyOutcome processed(UUID subscriptionId) {
            return new ApplyOutcome(WebhookState.PROCESSED, subscriptionId, null);
        }

        static ApplyOutcome ignored(@Nullable UUID subscriptionId, String error) {
            return new ApplyOutcome(WebhookState.IGNORED, subscriptionId, error);
        }
    }

    /**
     * A subscription with its history and webhooks (admin detail).
     *
     * @param subscription the row
     * @param events history, oldest first
     * @param webhooks linked provider webhooks, oldest first
     */
    public record SubscriptionDetail(
            SubscriptionRow subscription,
            List<SubscriptionEventRow> events,
            List<BillingWebhookRow> webhooks) {}

    // ---------------------------------------------------------------------------------------
    // Member
    // ---------------------------------------------------------------------------------------

    /** The live subscription of an account (checkout in progress or entitling). */
    @Transactional(readOnly = true)
    public Optional<SubscriptionRow> live(UUID userId) {
        return repository.findLive(userId);
    }

    /**
     * Opens a checkout of {@code planCode}: 404 FEATURE_DISABLED while {@code premiumPlans} is off
     * for the caller; 400 for FREE, unknown, inactive or free plans and providers other than the
     * active one; 409 ALREADY_SUBSCRIBED while a subscription entitles the caller. An open checkout
     * of the same plan is answered again; one of another plan is abandoned.
     */
    @Transactional
    public CheckoutResult checkout(
            AuthenticatedUser caller, String planCode, @Nullable String providerId) {
        UUID userId = caller.userId();
        featureFlags.require(FeatureFlagKeys.PREMIUM_PLANS, userId);
        accounts.requireActive(userId);
        requireProvider(providerId);
        String code = planCode.trim().toUpperCase(Locale.ROOT);
        PlanRules plan =
                plans.find(code)
                        .filter(PlanRules::active)
                        .filter(found -> !PlanCodes.FREE.equals(found.code()))
                        .filter(found -> found.monthlyPrice().signum() > 0)
                        .orElseThrow(() -> invalid("planCode", "must be an active paid plan code"));

        repository.lockAccount(userId);
        Instant now = now();
        Optional<SubscriptionRow> live = repository.lockLive(userId);
        if (live.isPresent()) {
            SubscriptionRow current = live.get();
            if (current.status().entitling()) {
                throw new ApiException(
                                ErrorCode.ALREADY_SUBSCRIBED,
                                current.cancelAtPeriodEnd()
                                        ? "Your subscription stays active until the end of the"
                                                + " paid period"
                                        : "You already have an active subscription")
                        .withProperty("subscriptionId", current.id().toString())
                        .withProperty("currentStatus", current.status().name());
            }
            if (current.planCode().equals(plan.code())
                    && current.provider().equals(provider.providerId())
                    && current.checkoutUrl() != null) {
                return new CheckoutResult(current, current.checkoutUrl(), null, true);
            }
            repository.end(current.id(), SubscriptionStatus.CANCELLED, now);
            record(current.id(), "CHECKOUT_ABANDONED", null, userId, Map.of("trigger", "NEW"));
        }

        UUID id = UUID.randomUUID();
        repository.insertPending(
                id,
                userId,
                plan.id(),
                provider.providerId(),
                plan.monthlyPrice(),
                plan.currency(),
                now);
        BillingProvider.Checkout checkout;
        try {
            checkout =
                    provider.startCheckout(
                            new BillingProvider.CheckoutRequest(
                                    id,
                                    userId,
                                    plan.code(),
                                    plan.name(),
                                    plan.monthlyPrice(),
                                    plan.currency(),
                                    SUCCESS_PATH,
                                    CANCEL_PATH));
        } catch (BillingProviderException e) {
            log.warn("Billing checkout for subscription {} failed: {}", id, e.getMessage());
            throw new ApiException(
                    ErrorCode.SERVICE_UNAVAILABLE,
                    "The billing provider is not available; please try again later");
        }
        repository.setCheckout(id, checkout.checkoutRef(), checkout.url(), now);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("plan", plan.code());
        details.put("amount", plan.monthlyPrice().toPlainString());
        details.put("currency", plan.currency());
        details.put("provider", provider.providerId());
        record(id, "CHECKOUT_STARTED", null, userId, details);
        SubscriptionRow created = require(id);
        return new CheckoutResult(created, checkout.url(), checkout.clientSecret(), false);
    }

    /**
     * Cancels the caller's subscription: an open checkout is abandoned at once; an entitling one
     * ends at the period end ({@code atPeriodEnd}, the default: the plan stays until then) or
     * immediately (FREE at once). 404 without a live subscription.
     */
    @Transactional
    public SubscriptionRow cancel(AuthenticatedUser caller, boolean atPeriodEnd) {
        UUID userId = caller.userId();
        repository.lockAccount(userId);
        SubscriptionRow row =
                repository
                        .lockLive(userId)
                        .orElseThrow(() -> ApiException.notFound("No active subscription"));
        return cancelRow(row, atPeriodEnd, userId, "MEMBER");
    }

    /** The caller's fake checkout (404 for other members and unknown references). */
    @Transactional(readOnly = true)
    public SubscriptionRow checkoutOf(UUID userId, String providerId, String checkoutRef) {
        return repository
                .findByCheckoutRef(providerId, checkoutRef)
                .filter(row -> row.userId().equals(userId))
                .orElseThrow(() -> ApiException.notFound("Checkout not found"));
    }

    // ---------------------------------------------------------------------------------------
    // Provider events (applied after commit, in the webhook processing transaction)
    // ---------------------------------------------------------------------------------------

    /** Applies a verified provider event; idempotent (replays are IGNORED). */
    @Transactional
    public ApplyOutcome apply(
            String providerId,
            String providerEventId,
            EventKind kind,
            @Nullable String checkoutRef,
            @Nullable String subscriptionRef,
            @Nullable Instant periodStart,
            @Nullable Instant periodEnd,
            @Nullable String failureCode) {
        return switch (kind) {
            case CHECKOUT_COMPLETED ->
                    checkoutRef == null
                            ? ApplyOutcome.ignored(null, "MISSING_REFERENCE")
                            : completed(
                                    providerId,
                                    providerEventId,
                                    checkoutRef,
                                    subscriptionRef,
                                    periodStart,
                                    periodEnd);
            case CHECKOUT_FAILED ->
                    checkoutRef == null
                            ? ApplyOutcome.ignored(null, "MISSING_REFERENCE")
                            : checkoutFailed(providerId, providerEventId, checkoutRef, failureCode);
            case SUBSCRIPTION_RENEWED ->
                    subscriptionRef == null
                            ? ApplyOutcome.ignored(null, "MISSING_REFERENCE")
                            : renewed(
                                    providerId,
                                    providerEventId,
                                    subscriptionRef,
                                    periodStart,
                                    periodEnd);
            case PAYMENT_FAILED ->
                    subscriptionRef == null
                            ? ApplyOutcome.ignored(null, "MISSING_REFERENCE")
                            : paymentFailed(
                                    providerId, providerEventId, subscriptionRef, failureCode);
            case SUBSCRIPTION_CANCELLED ->
                    subscriptionRef == null
                            ? ApplyOutcome.ignored(null, "MISSING_REFERENCE")
                            : cancelledByProvider(providerId, providerEventId, subscriptionRef);
            case OTHER -> ApplyOutcome.ignored(null, "UNHANDLED_TYPE");
        };
    }

    private ApplyOutcome completed(
            String providerId,
            String providerEventId,
            String checkoutRef,
            @Nullable String subscriptionRef,
            @Nullable Instant periodStart,
            @Nullable Instant periodEnd) {
        Optional<SubscriptionRow> found = repository.lockByCheckoutRef(providerId, checkoutRef);
        if (found.isEmpty()) {
            return ApplyOutcome.ignored(null, "UNKNOWN_CHECKOUT");
        }
        SubscriptionRow row = found.get();
        if (row.status().entitling()) {
            return ApplyOutcome.ignored(row.id(), "ALREADY_ACTIVE");
        }
        if (row.status() != SubscriptionStatus.PENDING) {
            // Paid after the checkout was abandoned: never charge twice, cancel at the provider.
            if (subscriptionRef != null) {
                cancelQuietly(subscriptionRef, false);
            }
            record(
                    row.id(),
                    "LATE_CHECKOUT_CANCELLED",
                    providerEventId,
                    null,
                    Map.of("status", row.status().name()));
            return ApplyOutcome.ignored(row.id(), "CHECKOUT_ABANDONED");
        }
        if (subscriptionRef == null) {
            return ApplyOutcome.ignored(row.id(), "MISSING_REFERENCE");
        }
        Instant now = now();
        Instant start = periodStart != null ? periodStart : now;
        Instant end = periodEnd != null && periodEnd.isAfter(start) ? periodEnd : oneMonth(start);
        repository.activate(row.id(), subscriptionRef, start, end, now);
        accounts.applyPlan(row.userId(), row.planCode(), true);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("plan", row.planCode());
        details.put("periodEnd", end.toString());
        record(row.id(), "ACTIVATED", providerEventId, null, details);
        publish(row, "ACTIVATED", SubscriptionStatus.ACTIVE, now);
        log.info("Subscription {} ACTIVE ({})", row.id(), row.planCode());
        return ApplyOutcome.processed(row.id());
    }

    private ApplyOutcome checkoutFailed(
            String providerId,
            String providerEventId,
            String checkoutRef,
            @Nullable String failureCode) {
        Optional<SubscriptionRow> found = repository.lockByCheckoutRef(providerId, checkoutRef);
        if (found.isEmpty()) {
            return ApplyOutcome.ignored(null, "UNKNOWN_CHECKOUT");
        }
        SubscriptionRow row = found.get();
        if (row.status() != SubscriptionStatus.PENDING) {
            return ApplyOutcome.ignored(row.id(), "NOT_PENDING");
        }
        repository.recordCheckoutFailure(row.id(), truncate(failureCode), now());
        record(
                row.id(),
                "CHECKOUT_FAILED",
                providerEventId,
                null,
                Map.of("failureCode", failureCode == null ? "unknown" : truncate(failureCode)));
        return ApplyOutcome.processed(row.id());
    }

    private ApplyOutcome renewed(
            String providerId,
            String providerEventId,
            String subscriptionRef,
            @Nullable Instant periodStart,
            @Nullable Instant periodEnd) {
        Optional<SubscriptionRow> found = repository.lockByProviderRef(providerId, subscriptionRef);
        if (found.isEmpty()) {
            return ApplyOutcome.ignored(null, "UNKNOWN_SUBSCRIPTION");
        }
        SubscriptionRow row = found.get();
        if (!row.status().entitling()) {
            return ApplyOutcome.ignored(row.id(), "SUBSCRIPTION_ENDED");
        }
        Instant currentEnd = row.currentPeriodEnd() != null ? row.currentPeriodEnd() : now();
        Instant start = periodStart != null ? periodStart : currentEnd;
        Instant end = periodEnd != null && periodEnd.isAfter(start) ? periodEnd : oneMonth(start);
        if (!end.isAfter(currentEnd)) {
            return ApplyOutcome.ignored(row.id(), "STALE_PERIOD");
        }
        Instant now = now();
        repository.renew(row.id(), start, end, now);
        accounts.applyPlan(row.userId(), row.planCode(), true);
        record(row.id(), "RENEWED", providerEventId, null, Map.of("periodEnd", end.toString()));
        publish(row, "RENEWED", SubscriptionStatus.ACTIVE, now);
        return ApplyOutcome.processed(row.id());
    }

    private ApplyOutcome paymentFailed(
            String providerId,
            String providerEventId,
            String subscriptionRef,
            @Nullable String failureCode) {
        Optional<SubscriptionRow> found = repository.lockByProviderRef(providerId, subscriptionRef);
        if (found.isEmpty()) {
            return ApplyOutcome.ignored(null, "UNKNOWN_SUBSCRIPTION");
        }
        SubscriptionRow row = found.get();
        if (!row.status().entitling()) {
            return ApplyOutcome.ignored(row.id(), "SUBSCRIPTION_ENDED");
        }
        Instant now = now();
        repository.markPastDue(row.id(), truncate(failureCode), now);
        record(
                row.id(),
                "PAYMENT_FAILED",
                providerEventId,
                null,
                Map.of("failureCode", failureCode == null ? "unknown" : truncate(failureCode)));
        publish(row, "PAYMENT_FAILED", SubscriptionStatus.PAST_DUE, now);
        return ApplyOutcome.processed(row.id());
    }

    private ApplyOutcome cancelledByProvider(
            String providerId, String providerEventId, String subscriptionRef) {
        Optional<SubscriptionRow> found = repository.lockByProviderRef(providerId, subscriptionRef);
        if (found.isEmpty()) {
            return ApplyOutcome.ignored(null, "UNKNOWN_SUBSCRIPTION");
        }
        SubscriptionRow row = found.get();
        if (!row.status().live()) {
            return ApplyOutcome.ignored(row.id(), "ALREADY_ENDED");
        }
        end(row, SubscriptionStatus.CANCELLED, providerEventId, null, "PROVIDER");
        return ApplyOutcome.processed(row.id());
    }

    // ---------------------------------------------------------------------------------------
    // Period job (subscriptions-period)
    // ---------------------------------------------------------------------------------------

    /** Entitling subscriptions whose paid period has ended. */
    @Transactional(readOnly = true)
    public List<SubscriptionRow> periodEnded(int limit) {
        return repository.periodEnded(now(), limit);
    }

    /**
     * Ends a subscription whose member cancelled at the period end, once the period is over
     * (CANCELLED, FREE). Returns whether it ended now.
     */
    @Transactional
    public boolean endCancelledAtPeriodEnd(UUID subscriptionId) {
        Optional<SubscriptionRow> found = repository.lock(subscriptionId);
        if (found.isEmpty()) {
            return false;
        }
        SubscriptionRow row = found.get();
        if (!row.status().entitling()
                || !row.cancelAtPeriodEnd()
                || row.currentPeriodEnd() == null
                || row.currentPeriodEnd().isAfter(now())) {
            return false;
        }
        end(row, SubscriptionStatus.CANCELLED, null, null, "PERIOD_END");
        return true;
    }

    /**
     * Expires a subscription that was not renewed within the grace period after its end (EXPIRED,
     * FREE). Returns whether it expired now.
     */
    @Transactional
    public boolean expireUnrenewed(UUID subscriptionId, Instant graceEndedBefore) {
        Optional<SubscriptionRow> found = repository.lock(subscriptionId);
        if (found.isEmpty()) {
            return false;
        }
        SubscriptionRow row = found.get();
        if (!row.status().entitling()
                || row.currentPeriodEnd() == null
                || row.currentPeriodEnd().isAfter(graceEndedBefore)) {
            return false;
        }
        end(row, SubscriptionStatus.EXPIRED, null, null, "NOT_RENEWED");
        return true;
    }

    /** Records that the job asked the fake provider for a renewal. */
    @Transactional
    public void recordRenewalRequested(UUID subscriptionId, Instant periodEnd) {
        record(
                subscriptionId,
                "RENEWAL_REQUESTED",
                null,
                null,
                Map.of("periodEnd", periodEnd.toString()));
    }

    // ---------------------------------------------------------------------------------------
    // Admin (ADMIN, SUPER_ADMIN)
    // ---------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public PageResponse<SubscriptionRow> page(
            @Nullable SubscriptionStatus status,
            @Nullable String planCode,
            @Nullable UUID userId,
            int page,
            int size) {
        @Nullable String code = planCode == null ? null : planCode.trim().toUpperCase(Locale.ROOT);
        return PageResponse.of(
                repository.page(status, code, userId, page, size),
                page,
                size,
                repository.count(status, code, userId));
    }

    @Transactional(readOnly = true)
    public SubscriptionDetail detail(UUID id) {
        SubscriptionRow row = require(id);
        return new SubscriptionDetail(row, repository.events(id), webhooks.ofSubscription(id));
    }

    /** Cancels a member's subscription (audited {@code subscription.cancel}). */
    @Transactional
    public SubscriptionDetail adminCancel(
            AuthenticatedUser actor, UUID id, boolean immediately, @Nullable String reason) {
        SubscriptionRow current = require(id);
        repository.lockAccount(current.userId());
        SubscriptionRow row = repository.lock(id).orElseThrow();
        if (!row.status().live()) {
            throw ApiException.conflict("The subscription has already ended")
                    .withProperty("currentStatus", row.status().name());
        }
        cancelRow(row, !immediately, actor.userId(), "ADMIN");
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("subscriptionId", id.toString());
        details.put("userId", row.userId().toString());
        details.put("plan", row.planCode());
        details.put("immediately", immediately);
        if (reason != null && !reason.isBlank()) {
            details.put("reasonGiven", true);
        }
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                ACTION_ADMIN_CANCEL,
                TARGET_SUBSCRIPTION,
                id.toString(),
                details);
        return detail(id);
    }

    // ---------------------------------------------------------------------------------------
    // Account data
    // ---------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<SubscriptionRow> history(UUID userId) {
        return repository.ofUser(userId);
    }

    /** Deletion requested: no further renewals (the plan stays until the period end). */
    @Transactional
    public void stopRenewals(UUID userId) {
        repository.lockAccount(userId);
        repository
                .lockLive(userId)
                .ifPresent(
                        row -> {
                            if (row.status() == SubscriptionStatus.PENDING) {
                                end(row, SubscriptionStatus.CANCELLED, null, null, "DELETION");
                            } else if (!row.cancelAtPeriodEnd()) {
                                cancelRow(row, true, null, "DELETION");
                            }
                        });
    }

    /** Purge: the live subscription ends at once (the account row is anonymised to FREE). */
    @Transactional
    public void endForPurge(UUID userId) {
        repository.lockAccount(userId);
        repository
                .lockLive(userId)
                .ifPresent(
                        row -> {
                            if (row.providerRef() != null) {
                                cancelQuietly(row.providerRef(), false);
                            }
                            end(row, SubscriptionStatus.CANCELLED, null, null, "DELETION");
                        });
    }

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

    private SubscriptionRow cancelRow(
            SubscriptionRow row, boolean atPeriodEnd, @Nullable UUID actorId, String trigger) {
        if (row.status() == SubscriptionStatus.PENDING) {
            end(row, SubscriptionStatus.CANCELLED, null, actorId, trigger);
            return require(row.id());
        }
        if (atPeriodEnd && row.cancelAtPeriodEnd()) {
            return row;
        }
        if (row.providerRef() != null) {
            try {
                provider.cancel(row.providerRef(), atPeriodEnd);
            } catch (BillingProviderException e) {
                log.warn("Billing cancellation of {} failed: {}", row.id(), e.getMessage());
                throw new ApiException(
                        ErrorCode.SERVICE_UNAVAILABLE,
                        "The billing provider is not available; please try again later");
            }
        }
        if (atPeriodEnd) {
            Instant now = now();
            repository.requestCancel(row.id(), now);
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("trigger", trigger);
            if (row.currentPeriodEnd() != null) {
                details.put("endsAt", row.currentPeriodEnd().toString());
            }
            record(row.id(), "CANCEL_REQUESTED", null, actorId, details);
            publish(row, "CANCEL_REQUESTED", row.status(), now);
        } else {
            end(row, SubscriptionStatus.CANCELLED, null, actorId, trigger);
        }
        return require(row.id());
    }

    private void end(
            SubscriptionRow row,
            SubscriptionStatus status,
            @Nullable String providerEventId,
            @Nullable UUID actorId,
            String trigger) {
        Instant now = now();
        repository.end(row.id(), status, now);
        if (row.status().entitling()) {
            accounts.applyPlan(row.userId(), PlanCodes.FREE, false);
        }
        record(row.id(), status.name(), providerEventId, actorId, Map.of("trigger", trigger));
        publish(row, status.name(), status, now);
        log.info("Subscription {} {} ({})", row.id(), status, trigger);
    }

    private void cancelQuietly(String subscriptionRef, boolean atPeriodEnd) {
        try {
            provider.cancel(subscriptionRef, atPeriodEnd);
        } catch (BillingProviderException e) {
            log.warn("Billing cancellation at the provider failed: {}", e.getMessage());
        }
    }

    private void requireProvider(@Nullable String providerId) {
        if (providerId == null || providerId.isBlank()) {
            return;
        }
        String normalised = providerId.trim().toLowerCase(Locale.ROOT);
        if (STORE_PROVIDERS.contains(normalised)) {
            throw invalid(
                    "provider",
                    "store purchases are validated through POST /me/subscription/mobile-receipt");
        }
        if (!normalised.equals(provider.providerId())) {
            throw invalid("provider", "must be " + provider.providerId());
        }
    }

    private void record(
            UUID subscriptionId,
            String event,
            @Nullable String providerEventId,
            @Nullable UUID actorId,
            Map<String, ?> details) {
        repository.addEvent(
                subscriptionId,
                event,
                providerEventId,
                actorId,
                jsonMapper.writeValueAsString(details),
                now());
    }

    private void publish(
            SubscriptionRow row, String event, SubscriptionStatus status, Instant now) {
        events.publishEvent(
                new SubscriptionChanged(
                        row.id(), row.userId(), row.planCode(), event, status.name(), now));
    }

    private SubscriptionRow require(UUID id) {
        return repository
                .find(id)
                .orElseThrow(() -> ApiException.notFound("Subscription not found"));
    }

    /** One calendar month after {@code start} (UTC). */
    static Instant oneMonth(Instant start) {
        return start.atZone(ZoneOffset.UTC).plusMonths(1).toInstant();
    }

    private static String truncate(@Nullable String code) {
        if (code == null) {
            return "unknown";
        }
        return code.length() <= 100 ? code : code.substring(0, 100);
    }

    private static ApiException invalid(String field, String message) {
        return ApiException.validation(
                "Validation failed", List.of(new ProblemFieldError(field, message)));
    }

    private Instant now() {
        return timeProvider.now().truncatedTo(ChronoUnit.MICROS);
    }

    /** Plan price as shown (two decimals). */
    static String price(BigDecimal amount) {
        return amount.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString();
    }
}
