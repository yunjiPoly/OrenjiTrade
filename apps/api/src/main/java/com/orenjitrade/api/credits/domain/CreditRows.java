package com.orenjitrade.api.credits.domain;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Rows of the credit tables (V091), read by the credits module only. */
public final class CreditRows {

    private CreditRows() {}

    /**
     * A ledger entry.
     *
     * @param id entry id
     * @param userId the account
     * @param amount signed amount of credits
     * @param balanceAfter running balance after the entry
     * @param type entry type
     * @param reason reason code (REFERRAL, PROMO, REWARD, FEATURE_UNLOCK, ADMIN, ...)
     * @param referenceType what the entry refers to (ENTITLEMENT, REFERRAL, ...)
     * @param referenceId id of that reference
     * @param idempotencyKey unique business key
     * @param detailsJson structured details as JSON text
     * @param note admin note (admin views only)
     * @param createdBy admin or member who caused it, {@code null} for the platform
     * @param createdAt when
     */
    public record CreditEntry(
            UUID id,
            UUID userId,
            int amount,
            int balanceAfter,
            CreditEntryType type,
            String reason,
            @Nullable String referenceType,
            @Nullable String referenceId,
            String idempotencyKey,
            String detailsJson,
            @Nullable String note,
            @Nullable UUID createdBy,
            Instant createdAt) {}

    /**
     * What credits unlock ({@code credit_product}).
     *
     * @param key product key (the {@code featureKey} of {@code POST /me/credits/spend})
     * @param name display name
     * @param description display text
     * @param featureKey entitlement key granted (a plan feature or limit)
     * @param featureValue entitlement value ({@code true}, a number or {@code unlimited})
     * @param cost price in credits
     * @param durationHours validity of the entitlement
     * @param active whether members can spend on it
     * @param sortOrder display order
     * @param updatedBy last admin editor
     * @param updatedAt last change
     */
    public record CreditProduct(
            String key,
            String name,
            String description,
            String featureKey,
            @Nullable String featureValue,
            int cost,
            int durationHours,
            boolean active,
            int sortOrder,
            @Nullable UUID updatedBy,
            Instant updatedAt) {}

    /**
     * The derived balance of an account with its latest running balance (reconciliation).
     *
     * @param userId the account
     * @param balance {@code SUM(amount)}
     * @param latestBalanceAfter {@code balance_after} of the latest entry
     */
    public record BalanceCheck(UUID userId, long balance, long latestBalanceAfter) {}

    /**
     * A referral redemption.
     *
     * @param id redemption id
     * @param referrerId owner of the code
     * @param refereeId account that redeemed it
     * @param code the code
     * @param referrerReward credits earned by the referrer
     * @param refereeReward credits earned by the referee
     * @param createdAt when
     */
    public record Redemption(
            UUID id,
            UUID referrerId,
            UUID refereeId,
            String code,
            int referrerReward,
            int refereeReward,
            Instant createdAt) {}
}
