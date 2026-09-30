package com.orenjitrade.api.donations.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.donations.domain.DonationProvider.DonationProviderException;
import com.orenjitrade.api.donations.domain.DonationProvider.EventKind;
import com.orenjitrade.api.donations.domain.DonationRows.CurrencyTotal;
import com.orenjitrade.api.donations.domain.DonationRows.DonationRow;
import com.orenjitrade.api.donations.domain.DonationRows.DonationStatus;
import com.orenjitrade.api.donations.domain.DonationRows.DonationWebhookRow;
import com.orenjitrade.api.donations.domain.DonationRows.SupporterRow;
import com.orenjitrade.api.donations.domain.DonationRows.WebhookState;
import com.orenjitrade.api.donations.infra.DonationRepository;
import com.orenjitrade.api.donations.infra.DonationWebhookRepository;
import com.orenjitrade.api.featureflags.domain.FeatureFlagKeys;
import com.orenjitrade.api.featureflags.domain.FeatureFlagView;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import com.orenjitrade.api.profiles.domain.MemberCard;
import com.orenjitrade.api.profiles.domain.MemberDirectory;
import com.orenjitrade.api.users.domain.UserAccountService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Voluntary donations (Phase 10 contract "Donations"; feature flag {@code donations}): checkout
 * through the {@link DonationProvider}, success, failure and refunds from verified provider
 * webhooks, the opt-in public supporters list (display names only, never amounts or notes) and the
 * admin views. Donations are "voluntary support": nothing here is read by ratings, ranking, trust
 * or discovery.
 */
@Service
public class DonationService {

    public static final String ACTION_REFUND = "donation.refund";
    public static final String TARGET_DONATION = "DONATION";

    /** Web paths the provider returns to. */
    public static final String SUCCESS_PATH = "/support?donation=thanks";

    public static final String CANCEL_PATH = "/support?donation=cancelled";

    static final int MAX_SUPPORTERS = 100;

    private static final Logger log = LoggerFactory.getLogger(DonationService.class);

    private final DonationRepository repository;
    private final DonationWebhookRepository webhooks;
    private final DonationProvider provider;
    private final DonationSettings settings;
    private final FeatureFlags featureFlags;
    private final UserAccountService accounts;
    private final MemberDirectory members;
    private final AuditService auditService;
    private final TimeProvider timeProvider;

    public DonationService(
            DonationRepository repository,
            DonationWebhookRepository webhooks,
            DonationProvider provider,
            DonationSettings settings,
            FeatureFlags featureFlags,
            UserAccountService accounts,
            MemberDirectory members,
            AuditService auditService,
            TimeProvider timeProvider) {
        this.repository = repository;
        this.webhooks = webhooks;
        this.provider = provider;
        this.settings = settings;
        this.featureFlags = featureFlags;
        this.accounts = accounts;
        this.members = members;
        this.auditService = auditService;
        this.timeProvider = timeProvider;
    }

    /**
     * An opened donation checkout.
     *
     * @param donation the PENDING donation
     * @param url where the donor pays
     */
    public record CheckoutResult(DonationRow donation, String url) {}

    /**
     * A public supporter: the opted-in donor's display name and the month of their latest donation.
     *
     * @param displayName display name
     * @param month month of the latest donation (YYYY-MM)
     */
    public record Supporter(String displayName, String month) {}

    /**
     * What applying a provider event did.
     *
     * @param status PROCESSED or IGNORED
     * @param donationId the donation concerned
     * @param error reason code of an IGNORED event
     */
    public record ApplyOutcome(
            WebhookState status, @Nullable UUID donationId, @Nullable String error) {}

    /**
     * Donations with their totals (admin).
     *
     * @param page the page
     * @param totals succeeded donations per currency
     */
    public record AdminPage(PageResponse<DonationRow> page, List<CurrencyTotal> totals) {}

    /**
     * A donation with its webhooks (admin).
     *
     * @param donation the donation
     * @param webhooks linked webhooks
     */
    public record AdminDetail(DonationRow donation, List<DonationWebhookRow> webhooks) {}

    // ---------------------------------------------------------------------------------------
    // Member
    // ---------------------------------------------------------------------------------------

    /** 404 FEATURE_DISABLED unless the {@code donations} flag is on for the caller. */
    public void requireEnabled(@Nullable UUID userId) {
        featureFlags.require(FeatureFlagKeys.DONATIONS, userId);
    }

    /**
     * Opens a donation checkout: 404 FEATURE_DISABLED while {@code donations} is off; 400 for
     * amounts outside {@code donations.min_amount}..{@code max_amount} or other currencies.
     */
    @Transactional
    public CheckoutResult checkout(
            AuthenticatedUser caller,
            BigDecimal amount,
            String currency,
            @Nullable String message,
            boolean publicThanks) {
        UUID userId = caller.userId();
        requireEnabled(userId);
        accounts.requireActive(userId);
        DonationSettings.Values values = settings.current();
        BigDecimal cleanAmount = amount.setScale(2, RoundingMode.HALF_UP);
        String code = currency.trim().toUpperCase(Locale.ROOT);
        List<ProblemFieldError> errors = new ArrayList<>();
        if (amount.scale() > 2 && amount.stripTrailingZeros().scale() > 2) {
            errors.add(new ProblemFieldError("amount", "at most two decimals"));
        }
        if (cleanAmount.compareTo(values.minAmount()) < 0
                || cleanAmount.compareTo(values.maxAmount()) > 0) {
            errors.add(
                    new ProblemFieldError(
                            "amount",
                            "must be between "
                                    + values.minAmount().toPlainString()
                                    + " and "
                                    + values.maxAmount().toPlainString()));
        }
        if (!values.currencies().contains(code)) {
            errors.add(
                    new ProblemFieldError(
                            "currency",
                            "must be one of " + String.join(", ", values.currencies())));
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        @Nullable String note = message == null || message.isBlank() ? null : message.trim();
        UUID id = UUID.randomUUID();
        Instant now = now();
        repository.insertPending(
                id, userId, cleanAmount, code, provider.providerId(), note, publicThanks, now);
        DonationProvider.Checkout checkout;
        try {
            checkout =
                    provider.startCheckout(
                            new DonationProvider.CheckoutRequest(
                                    id, userId, cleanAmount, code, SUCCESS_PATH, CANCEL_PATH));
        } catch (DonationProviderException e) {
            log.warn("Donation checkout {} failed: {}", id, e.getMessage());
            throw new ApiException(
                    ErrorCode.SERVICE_UNAVAILABLE,
                    "The payment provider is not available; please try again later");
        }
        repository.setCheckout(id, checkout.checkoutRef(), checkout.url(), now);
        return new CheckoutResult(repository.find(id).orElseThrow(), checkout.url());
    }

    /** The donor's own checkout (404 for anybody else). */
    @Transactional(readOnly = true)
    public DonationRow checkoutOf(UUID userId, String providerId, String ref) {
        return repository
                .findByRef(providerId, ref)
                .filter(row -> userId.equals(row.userId()))
                .orElseThrow(() -> ApiException.notFound("Checkout not found"));
    }

    /** The caller's donations, newest first. */
    @Transactional(readOnly = true)
    public List<DonationRow> mine(UUID userId) {
        requireEnabled(userId);
        return repository.ofUser(userId);
    }

    /**
     * Opted-in supporters, most recent first (display names only; accounts that are not active are
     * left out). 404 FEATURE_DISABLED while {@code donations} is off for everybody.
     */
    @Transactional(readOnly = true)
    public List<Supporter> supporters(int limit) {
        if (!featureFlags.isEnabled(FeatureFlagKeys.DONATIONS)) {
            throw FeatureFlags.disabled(FeatureFlagKeys.DONATIONS);
        }
        List<SupporterRow> rows = repository.supporters(Math.min(limit, MAX_SUPPORTERS));
        Map<UUID, MemberCard> cards =
                members.cards(rows.stream().map(SupporterRow::userId).toList());
        Instant now = timeProvider.now();
        List<Supporter> result = new ArrayList<>();
        for (SupporterRow row : rows) {
            MemberCard card = cards.get(row.userId());
            if (card == null || !card.activeAt(now)) {
                continue;
            }
            result.add(
                    new Supporter(
                            card.displayName(),
                            YearMonth.from(row.lastSucceededAt().atZone(ZoneOffset.UTC))
                                    .toString()));
        }
        return result;
    }

    // ---------------------------------------------------------------------------------------
    // Provider events
    // ---------------------------------------------------------------------------------------

    /** Applies a verified provider event; idempotent (replays are IGNORED). */
    @Transactional
    public ApplyOutcome apply(
            String providerId,
            EventKind kind,
            @Nullable String checkoutRef,
            @Nullable String failureCode) {
        if (kind == EventKind.OTHER) {
            return new ApplyOutcome(WebhookState.IGNORED, null, "UNHANDLED_TYPE");
        }
        if (checkoutRef == null) {
            return new ApplyOutcome(WebhookState.IGNORED, null, "MISSING_REFERENCE");
        }
        Optional<DonationRow> found = repository.lockByRef(providerId, checkoutRef);
        if (found.isEmpty()) {
            return new ApplyOutcome(WebhookState.IGNORED, null, "UNKNOWN_DONATION");
        }
        DonationRow row = found.get();
        Instant now = now();
        switch (kind) {
            case SUCCEEDED -> {
                if (row.status() != DonationStatus.PENDING) {
                    return new ApplyOutcome(WebhookState.IGNORED, row.id(), "NOT_PENDING");
                }
                repository.markSucceeded(row.id(), now);
            }
            case FAILED -> {
                if (row.status() != DonationStatus.PENDING) {
                    return new ApplyOutcome(WebhookState.IGNORED, row.id(), "NOT_PENDING");
                }
                repository.markFailed(row.id(), truncate(failureCode), now);
            }
            case REFUNDED -> {
                if (row.status() != DonationStatus.SUCCEEDED) {
                    return new ApplyOutcome(WebhookState.IGNORED, row.id(), "NOT_SUCCEEDED");
                }
                repository.markRefunded(row.id(), now);
            }
            default -> {
                return new ApplyOutcome(WebhookState.IGNORED, row.id(), "UNHANDLED_TYPE");
            }
        }
        log.info("Donation {} {}", row.id(), kind);
        return new ApplyOutcome(WebhookState.PROCESSED, row.id(), null);
    }

    // ---------------------------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public AdminPage page(@Nullable DonationStatus status, int page, int size) {
        return new AdminPage(
                PageResponse.of(
                        repository.page(status, page, size), page, size, repository.count(status)),
                repository.totals());
    }

    @Transactional(readOnly = true)
    public AdminDetail detail(UUID id) {
        DonationRow row =
                repository.find(id).orElseThrow(() -> ApiException.notFound("Donation not found"));
        return new AdminDetail(row, webhooks.ofDonation(id));
    }

    /** Refunds a succeeded donation ({@code SUPER_ADMIN}, audited {@code donation.refund}). */
    @Transactional
    public AdminDetail refund(AuthenticatedUser actor, UUID id) {
        if (!actor.hasRole(Role.SUPER_ADMIN)) {
            throw ApiException.forbidden("Only a SUPER_ADMIN can refund donations");
        }
        DonationRow row =
                repository.lock(id).orElseThrow(() -> ApiException.notFound("Donation not found"));
        if (row.status() != DonationStatus.SUCCEEDED || row.providerRef() == null) {
            throw ApiException.conflict("Only succeeded donations can be refunded")
                    .withProperty("currentStatus", row.status().name());
        }
        DonationProvider.Refund refund;
        try {
            refund =
                    provider.refund(
                            row.providerRef(),
                            row.amount(),
                            row.currency(),
                            "refund:donation:" + id);
        } catch (DonationProviderException e) {
            throw new ApiException(
                    ErrorCode.SERVICE_UNAVAILABLE,
                    "The payment provider is not available; please try again later");
        }
        if (refund.succeeded()) {
            repository.markRefunded(id, now());
        }
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("amount", row.amount().toPlainString());
        details.put("currency", row.currency());
        details.put("confirmed", refund.succeeded());
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                ACTION_REFUND,
                TARGET_DONATION,
                id.toString(),
                details);
        return detail(id);
    }

    // ---------------------------------------------------------------------------------------
    // Account data
    // ---------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<DonationRow> history(UUID userId) {
        return repository.ofUser(userId);
    }

    /** Purge: notes and public thanks are erased; the financial rows stay. */
    @Transactional
    public void purge(UUID userId) {
        repository.anonymise(userId, now());
    }

    private static String truncate(@Nullable String code) {
        if (code == null) {
            return "failed";
        }
        return code.length() <= 100 ? code : code.substring(0, 100);
    }

    /** Whether the flag is on for at least part of the members (webhooks, fake routes). */
    public boolean activeForAnyone() {
        return featureFlags.all().stream()
                .filter(flag -> flag.key().equals(FeatureFlagKeys.DONATIONS))
                .findFirst()
                .map(DonationService::active)
                .orElse(false);
    }

    private static boolean active(FeatureFlagView flag) {
        return flag.enabled() && flag.rolloutPercent() > 0;
    }

    private Instant now() {
        return timeProvider.now().truncatedTo(ChronoUnit.MICROS);
    }
}
