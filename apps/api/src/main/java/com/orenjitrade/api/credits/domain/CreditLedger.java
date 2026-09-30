package com.orenjitrade.api.credits.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.billing.domain.EntitlementSource;
import com.orenjitrade.api.billing.domain.EntitlementView;
import com.orenjitrade.api.billing.domain.Entitlements;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.CursorPage;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeCursor;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.credits.domain.CreditRows.CreditEntry;
import com.orenjitrade.api.credits.domain.CreditRows.CreditProduct;
import com.orenjitrade.api.credits.infra.CreditBalanceCache;
import com.orenjitrade.api.credits.infra.CreditLedgerRepository;
import com.orenjitrade.api.featureflags.domain.FeatureFlagKeys;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import com.orenjitrade.api.users.domain.UserAccountService;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The OriEnji credit ledger (Phase 10 contract "OriEnji credits"): non-cash, non-transferable,
 * non-withdrawable. Entries are appended only (the database refuses UPDATE and DELETE); the balance
 * is {@code SUM(amount)}, read through {@link CreditBalanceCache}; every entry carries a unique
 * idempotency key (a retried action returns the original entry). Entries of one account are
 * appended under a transaction-scoped advisory lock, so the running {@code balance_after} never
 * goes below 0 (409 INSUFFICIENT_CREDITS).
 *
 * <p>Spending ({@link #spend}) unlocks a {@link CreditProduct}: a time-boxed {@code
 * CREDIT_PURCHASE} entitlement through the billing module's {@link Entitlements} (stacked after an
 * active one of the same key). Admin grants and adjustments are audited ({@code credits.grant}).
 */
@Service
public class CreditLedger {

    public static final String ACTION_GRANT = "credits.grant";
    public static final String REASON_FEATURE_UNLOCK = "FEATURE_UNLOCK";
    public static final String REFERENCE_ENTITLEMENT = "ENTITLEMENT";

    /** Largest absolute amount of one admin grant or adjustment. */
    public static final int MAX_ADMIN_AMOUNT = 100_000;

    private final CreditLedgerRepository repository;
    private final CreditBalanceCache cache;
    private final CreditProducts products;
    private final Entitlements entitlements;
    private final UserAccountService accounts;
    private final FeatureFlags featureFlags;
    private final AuditService auditService;
    private final TimeProvider timeProvider;
    private final JsonMapper jsonMapper;

    public CreditLedger(
            CreditLedgerRepository repository,
            CreditBalanceCache cache,
            CreditProducts products,
            Entitlements entitlements,
            UserAccountService accounts,
            FeatureFlags featureFlags,
            AuditService auditService,
            TimeProvider timeProvider,
            JsonMapper jsonMapper) {
        this.repository = repository;
        this.cache = cache;
        this.products = products;
        this.entitlements = entitlements;
        this.accounts = accounts;
        this.featureFlags = featureFlags;
        this.auditService = auditService;
        this.timeProvider = timeProvider;
        this.jsonMapper = jsonMapper;
    }

    /**
     * An entry to append.
     *
     * @param userId the account
     * @param amount signed credits (never 0)
     * @param type entry type (its sign rule is checked by the database)
     * @param reason reason code
     * @param referenceType what the entry refers to
     * @param referenceId id of that reference
     * @param idempotencyKey unique business key
     * @param details structured details (never personal data or text of other members)
     * @param note admin note
     * @param createdBy admin or member who caused it
     */
    public record Append(
            UUID userId,
            int amount,
            CreditEntryType type,
            String reason,
            @Nullable String referenceType,
            @Nullable String referenceId,
            String idempotencyKey,
            Map<String, ?> details,
            @Nullable String note,
            @Nullable UUID createdBy) {}

    /**
     * An appended (or replayed) entry.
     *
     * @param entry the entry
     * @param duplicate the idempotency key was already used (nothing new was written)
     */
    public record Appended(CreditEntry entry, boolean duplicate) {}

    /**
     * What a spend unlocked.
     *
     * @param entry the SPEND entry
     * @param balance balance after the spend
     * @param product the product bought
     * @param entitlementId the granted entitlement
     * @param featureKey its key
     * @param value its value
     * @param expiresAt its end
     * @param duplicate the idempotency key was already used (the original result is returned)
     */
    public record SpendResult(
            CreditEntry entry,
            long balance,
            String product,
            UUID entitlementId,
            String featureKey,
            @Nullable String value,
            Instant expiresAt,
            boolean duplicate) {}

    // ---------------------------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------------------------

    /** The balance of an account ({@code SUM(amount)}, cached). */
    public long balance(UUID userId) {
        OptionalLong cached = cache.get(userId);
        if (cached.isPresent()) {
            return cached.getAsLong();
        }
        long balance = repository.sum(userId);
        cache.put(userId, balance);
        return balance;
    }

    /** The balance summed from the ledger inside the current transaction (never cached). */
    @Transactional(readOnly = true)
    public long balanceNow(UUID userId) {
        return repository.sum(userId);
    }

    /** One slice of an account's entries, newest first. */
    @Transactional(readOnly = true)
    public CursorPage<CreditEntry> entries(UUID userId, @Nullable String cursor, int limit) {
        List<CreditEntry> rows = repository.slice(userId, TimeCursor.decode(cursor), limit + 1);
        if (rows.size() <= limit) {
            return CursorPage.last(rows);
        }
        List<CreditEntry> page = rows.subList(0, limit);
        CreditEntry last = page.get(page.size() - 1);
        return CursorPage.of(page, new TimeCursor(last.createdAt(), last.id()).encode());
    }

    /** 404 FEATURE_DISABLED unless the {@code credits} flag is on for the account. */
    public void requireEnabled(UUID userId) {
        featureFlags.require(FeatureFlagKeys.CREDITS, userId);
    }

    // ---------------------------------------------------------------------------------------
    // Writes
    // ---------------------------------------------------------------------------------------

    /**
     * Appends an entry (joins the caller's transaction). A known idempotency key returns the
     * original entry ({@code duplicate}); 409 INSUFFICIENT_CREDITS when the balance would drop
     * below 0.
     */
    @Transactional
    public Appended append(Append command) {
        repository.lockAccount(command.userId());
        Optional<CreditEntry> existing = repository.findByIdempotencyKey(command.idempotencyKey());
        if (existing.isPresent()) {
            if (!existing.get().userId().equals(command.userId())) {
                throw ApiException.conflict("This idempotency key was already used");
            }
            return new Appended(existing.get(), true);
        }
        long balance = repository.sum(command.userId());
        return new Appended(insert(command, balance), false);
    }

    /** Serialises ledger writes of an account for the current transaction. */
    @Transactional
    public void lockAccount(UUID userId) {
        repository.lockAccount(userId);
    }

    /**
     * Spends credits on a product (idempotent per {@code clientKey} and account): 404
     * FEATURE_DISABLED while {@code credits} is off, 400 for unknown or inactive products, 409
     * INSUFFICIENT_CREDITS without enough credits, 409 CONFLICT when the key was used for another
     * product.
     */
    @Transactional
    public SpendResult spend(AuthenticatedUser caller, String productKey, String clientKey) {
        UUID userId = caller.userId();
        requireEnabled(userId);
        accounts.requireActive(userId);
        String key = "spend:" + userId + ":" + clientKey.trim();
        repository.lockAccount(userId);
        Optional<CreditEntry> existing = repository.findByIdempotencyKey(key);
        if (existing.isPresent()) {
            return replay(existing.get(), productKey.trim(), userId);
        }
        CreditProduct product =
                products.find(productKey.trim())
                        .filter(CreditProduct::active)
                        .orElseThrow(
                                () ->
                                        ApiException.validation(
                                                "Validation failed",
                                                List.of(
                                                        new ProblemFieldError(
                                                                "featureKey",
                                                                "unknown or unavailable credit"
                                                                        + " product"))));
        long balance = repository.sum(userId);
        if (balance < product.cost()) {
            throw insufficient(balance, product.cost());
        }
        Instant now = now();
        Instant start =
                entitlements
                        .latestActiveExpiry(
                                userId, product.featureKey(), EntitlementSource.CREDIT_PURCHASE)
                        .filter(expiry -> expiry.isAfter(now))
                        .orElse(now);
        Instant expiresAt = start.plus(Duration.ofHours(product.durationHours()));
        EntitlementView entitlement =
                entitlements.grantBySystem(
                        userId,
                        product.featureKey(),
                        product.featureValue(),
                        EntitlementSource.CREDIT_PURCHASE,
                        expiresAt,
                        "Credits: " + product.key());
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("product", product.key());
        details.put("entitlementId", entitlement.id().toString());
        details.put("featureKey", entitlement.featureKey());
        if (entitlement.value() != null) {
            details.put("value", entitlement.value());
        }
        details.put("expiresAt", expiresAt.toString());
        CreditEntry entry =
                insert(
                        new Append(
                                userId,
                                -product.cost(),
                                CreditEntryType.SPEND,
                                REASON_FEATURE_UNLOCK,
                                REFERENCE_ENTITLEMENT,
                                entitlement.id().toString(),
                                key,
                                details,
                                null,
                                userId),
                        balance);
        return new SpendResult(
                entry,
                entry.balanceAfter(),
                product.key(),
                entitlement.id(),
                entitlement.featureKey(),
                entitlement.value(),
                expiresAt,
                false);
    }

    /**
     * An admin grant (positive amount, GRANT) or adjustment (negative, ADJUST; never below 0).
     * Audited {@code credits.grant}; 404 for unknown accounts.
     */
    @Transactional
    public CreditEntry adminGrant(
            AuthenticatedUser actor,
            UUID userId,
            int amount,
            AdminCreditReason reason,
            @Nullable String note) {
        if (accounts.findPlanCode(userId).isEmpty()) {
            throw ApiException.notFound("Account not found");
        }
        if (amount == 0 || Math.abs(amount) > MAX_ADMIN_AMOUNT) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(
                            new ProblemFieldError(
                                    "amount",
                                    "must be non-zero and at most "
                                            + MAX_ADMIN_AMOUNT
                                            + " credits either way")));
        }
        @Nullable String cleanNote = note == null || note.isBlank() ? null : note.trim();
        Appended appended =
                append(
                        new Append(
                                userId,
                                amount,
                                amount > 0 ? CreditEntryType.GRANT : CreditEntryType.ADJUST,
                                reason.name(),
                                null,
                                null,
                                "admin:" + UUID.randomUUID(),
                                Map.of("grantedBy", "admin"),
                                cleanNote,
                                actor.userId()));
        CreditEntry entry = appended.entry();
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("entryId", entry.id().toString());
        details.put("amount", amount);
        details.put("reason", reason.name());
        details.put("balanceAfter", entry.balanceAfter());
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                ACTION_GRANT,
                AuditService.TARGET_USER,
                userId.toString(),
                details);
        return entry;
    }

    // ---------------------------------------------------------------------------------------
    // Admin reads
    // ---------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public PageResponse<CreditEntry> ledgerPage(@Nullable UUID userId, int page, int size) {
        return PageResponse.of(
                repository.page(userId, page, size), page, size, repository.count(userId));
    }

    /** Every entry of an account, oldest first (export). */
    @Transactional(readOnly = true)
    public List<CreditEntry> all(UUID userId) {
        return repository.all(userId);
    }

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

    private CreditEntry insert(Append command, long balance) {
        long after = balance + command.amount();
        if (after < 0) {
            throw insufficient(balance, -command.amount());
        }
        if (after > Integer.MAX_VALUE) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(new ProblemFieldError("amount", "the balance would overflow")));
        }
        CreditEntry entry =
                repository.insert(
                        command.userId(),
                        command.amount(),
                        (int) after,
                        command.type(),
                        command.reason(),
                        command.referenceType(),
                        command.referenceId(),
                        command.idempotencyKey(),
                        jsonMapper.writeValueAsString(command.details()),
                        command.note(),
                        command.createdBy(),
                        now());
        evictAfterCommit(command.userId());
        return entry;
    }

    private SpendResult replay(CreditEntry entry, String productKey, UUID userId) {
        JsonNode details = jsonMapper.readTree(entry.detailsJson());
        String product = details.path("product").asString("");
        if (entry.type() != CreditEntryType.SPEND || !product.equals(productKey)) {
            throw ApiException.conflict("This idempotency key was used for another spend");
        }
        @Nullable String value =
                details.path("value").isString() ? details.path("value").asString() : null;
        return new SpendResult(
                entry,
                repository.sum(userId),
                product,
                UUID.fromString(details.path("entitlementId").asString()),
                details.path("featureKey").asString(),
                value,
                Instant.parse(details.path("expiresAt").asString()),
                true);
    }

    static ApiException insufficient(long balance, long cost) {
        return new ApiException(ErrorCode.INSUFFICIENT_CREDITS, "Not enough credits")
                .withProperty("balance", balance)
                .withProperty("cost", cost);
    }

    private void evictAfterCommit(UUID userId) {
        cache.evict(userId);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            cache.evict(userId);
                        }
                    });
        }
    }

    private Instant now() {
        return timeProvider.now().truncatedTo(ChronoUnit.MICROS);
    }
}
