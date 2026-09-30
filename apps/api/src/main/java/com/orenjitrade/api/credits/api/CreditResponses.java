package com.orenjitrade.api.credits.api;

import com.orenjitrade.api.common.CursorPage;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.credits.domain.CreditEntryType;
import com.orenjitrade.api.credits.domain.CreditLedger.SpendResult;
import com.orenjitrade.api.credits.domain.CreditRows.CreditEntry;
import com.orenjitrade.api.credits.domain.CreditRows.CreditProduct;
import com.orenjitrade.api.credits.domain.CreditSettings;
import com.orenjitrade.api.credits.domain.ReferralService.RedeemResult;
import com.orenjitrade.api.credits.domain.ReferralService.ReferralView;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Response bodies of the credits routes (Phase 10). */
public final class CreditResponses {

    private CreditResponses() {}

    /**
     * A ledger entry as its owner sees it (no admin note).
     *
     * @param id entry id
     * @param amount signed credits
     * @param balanceAfter balance after the entry
     * @param type entry type
     * @param reason reason code
     * @param product credit product of a spend
     * @param expiresAt end of the entitlement a spend unlocked
     * @param createdAt when
     */
    @Schema(name = "CreditEntry", description = "A credit ledger entry")
    public record CreditEntryResponse(
            UUID id,
            @Schema(example = "-50") int amount,
            @Schema(example = "150") int balanceAfter,
            CreditEntryType type,
            @Schema(example = "FEATURE_UNLOCK") String reason,
            @Schema(example = "premium_search_day") @Nullable String product,
            @Nullable Instant expiresAt,
            Instant createdAt) {

        static CreditEntryResponse from(CreditEntry entry, JsonMapper jsonMapper) {
            JsonNode details = jsonMapper.readTree(entry.detailsJson());
            @Nullable String product =
                    details.path("product").isString() ? details.path("product").asString() : null;
            @Nullable Instant expiresAt =
                    details.path("expiresAt").isString()
                            ? Instant.parse(details.path("expiresAt").asString())
                            : null;
            return new CreditEntryResponse(
                    entry.id(),
                    entry.amount(),
                    entry.balanceAfter(),
                    entry.type(),
                    entry.reason(),
                    product,
                    expiresAt,
                    entry.createdAt());
        }
    }

    /**
     * A credit product.
     *
     * @param key product key ({@code featureKey} of a spend)
     * @param name display name
     * @param description display text
     * @param featureKey entitlement unlocked
     * @param featureValue its value
     * @param cost price in credits
     * @param durationHours validity
     * @param active whether it can be bought
     */
    @Schema(name = "CreditProduct", description = "What credits unlock")
    public record CreditProductResponse(
            @Schema(example = "premium_search_day") String key,
            String name,
            String description,
            @Schema(example = "filters.advanced") String featureKey,
            @Schema(example = "true") @Nullable String featureValue,
            @Schema(example = "50") int cost,
            @Schema(example = "24") int durationHours,
            boolean active) {

        static CreditProductResponse from(CreditProduct product) {
            return new CreditProductResponse(
                    product.key(),
                    product.name(),
                    product.description(),
                    product.featureKey(),
                    product.featureValue(),
                    product.cost(),
                    product.durationHours(),
                    product.active());
        }
    }

    /**
     * {@code GET /me/credits}.
     *
     * @param balance current balance
     * @param entries ledger entries, newest first
     * @param products what credits can unlock (active products)
     * @param withdrawable always false: credits are non-cash
     * @param transferable always false: credits cannot be sent to another account
     */
    @Schema(name = "MyCredits", description = "The caller's credits (non-cash)")
    public record MyCreditsResponse(
            @Schema(example = "150") long balance,
            CursorPage<CreditEntryResponse> entries,
            List<CreditProductResponse> products,
            boolean withdrawable,
            boolean transferable) {}

    /**
     * The entitlement a spend unlocked.
     *
     * @param id entitlement id
     * @param featureKey feature or limit key
     * @param value override value
     * @param expiresAt end of validity
     */
    @Schema(name = "CreditUnlock", description = "The entitlement a spend unlocked")
    public record UnlockResponse(
            UUID id,
            @Schema(example = "filters.advanced") String featureKey,
            @Nullable String value,
            Instant expiresAt) {}

    /**
     * {@code POST /me/credits/spend}.
     *
     * @param entry the SPEND entry
     * @param balance balance after the spend
     * @param entitlement what it unlocked
     * @param duplicate the idempotency key was already used (nothing was spent again)
     */
    @Schema(name = "CreditSpend", description = "Result of a credit spend")
    public record SpendResponse(
            CreditEntryResponse entry,
            long balance,
            UnlockResponse entitlement,
            boolean duplicate) {

        static SpendResponse from(SpendResult result, JsonMapper jsonMapper) {
            return new SpendResponse(
                    CreditEntryResponse.from(result.entry(), jsonMapper),
                    result.balance(),
                    new UnlockResponse(
                            result.entitlementId(),
                            result.featureKey(),
                            result.value(),
                            result.expiresAt()),
                    result.duplicate());
        }
    }

    /** {@code GET /me/referrals}. */
    @Schema(name = "MyReferral", description = "The caller's referral code and rewards")
    public record ReferralResponse(
            @Schema(example = "K7M2PQ9X") String code,
            int redemptions,
            int referrerReward,
            int refereeReward,
            boolean redeemed,
            boolean canRedeem,
            Instant redeemBefore) {

        static ReferralResponse from(ReferralView view) {
            return new ReferralResponse(
                    view.code(),
                    view.redemptions(),
                    view.referrerReward(),
                    view.refereeReward(),
                    view.redeemed(),
                    view.canRedeem(),
                    view.redeemBefore());
        }
    }

    /** {@code POST /me/referrals/redeem}. */
    @Schema(name = "ReferralRedemption", description = "A redeemed referral code")
    public record RedeemResponse(UUID redemptionId, int reward, int referrerReward, long balance) {

        static RedeemResponse from(RedeemResult result) {
            return new RedeemResponse(
                    result.redemptionId(),
                    result.reward(),
                    result.referrerReward(),
                    result.balance());
        }
    }

    /** A ledger entry in the admin console (with the admin note). */
    @Schema(name = "AdminCreditEntry", description = "A credit ledger entry (admin view)")
    public record AdminCreditEntry(
            UUID id,
            UUID userId,
            int amount,
            int balanceAfter,
            CreditEntryType type,
            String reason,
            @Nullable String referenceType,
            @Nullable String referenceId,
            JsonNode details,
            @Nullable String note,
            @Nullable UUID createdBy,
            Instant createdAt) {

        static AdminCreditEntry from(CreditEntry entry, JsonMapper jsonMapper) {
            return new AdminCreditEntry(
                    entry.id(),
                    entry.userId(),
                    entry.amount(),
                    entry.balanceAfter(),
                    entry.type(),
                    entry.reason(),
                    entry.referenceType(),
                    entry.referenceId(),
                    jsonMapper.readTree(entry.detailsJson()),
                    entry.note(),
                    entry.createdBy(),
                    entry.createdAt());
        }
    }

    /**
     * {@code GET /admin/credits/ledger}.
     *
     * @param userId the account filter
     * @param balance its balance (with the account filter)
     * @param entries entries, newest first
     */
    @Schema(name = "AdminCreditLedger", description = "Credit ledger entries (admin view)")
    public record AdminLedgerResponse(
            @Nullable UUID userId,
            @Nullable Long balance,
            PageResponse<AdminCreditEntry> entries) {}

    /** {@code GET/PUT /admin/credits/settings}. */
    @Schema(name = "CreditSettings", description = "Referral rewards and limits (credits.*)")
    public record SettingsResponse(
            int referrerReward,
            int refereeReward,
            int maxAccountAgeDays,
            int maxPerReferrer,
            @Nullable UUID updatedBy,
            @Nullable Instant updatedAt) {

        static SettingsResponse from(CreditSettings.Values values) {
            return new SettingsResponse(
                    values.referrerReward(),
                    values.refereeReward(),
                    values.maxAccountAgeDays(),
                    values.maxPerReferrer(),
                    values.updatedBy(),
                    values.updatedAt());
        }
    }

    /** {@code POST /internal/jobs/credits-reconcile}. */
    @Schema(name = "CreditsReconcileJobResult")
    public record ReconcileJobResponse(
            @Schema(description = "Accounts holding credits") int accounts,
            @Schema(description = "Cached balances repaired") int cacheMismatches,
            @Schema(description = "Accounts whose latest running balance differs from the sum")
                    int ledgerMismatches) {}
}
