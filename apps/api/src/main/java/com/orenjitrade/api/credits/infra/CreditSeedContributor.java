package com.orenjitrade.api.credits.infra;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.seed.SeedContributor;
import com.orenjitrade.api.credits.domain.CreditEntryType;
import com.orenjitrade.api.credits.domain.CreditLedger;
import com.orenjitrade.api.credits.domain.CreditLedger.Append;
import com.orenjitrade.api.credits.domain.CreditRows.Redemption;
import com.orenjitrade.api.credits.domain.ReferralService;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Seeds credits (fictional, local/dev only; idempotent through the ledger's idempotency keys and
 * stable ids {@code 00000000-0000-4000-a100-...}):
 *
 * <ul>
 *   <li>collector1: 200 welcome credits (GRANT, PROMO) and the referral code {@code COLLECTOR1};
 *   <li>collector8 redeemed collector1's code (redemption {@code …a100…0001}): 50 credits for
 *       collector8, 100 for collector1 (EARN, REFERRAL);
 *   <li>premium_user: 500 promotional credits (GRANT, PROMO).
 * </ul>
 */
@Component
public class CreditSeedContributor implements SeedContributor {

    static final UUID COLLECTOR1 = UUID.fromString("00000000-0000-4000-8000-000000000001");
    static final UUID COLLECTOR8 = UUID.fromString("00000000-0000-4000-8000-000000000008");
    static final UUID PREMIUM_USER = UUID.fromString("00000000-0000-4000-8000-000000000009");
    static final UUID REDEMPTION = UUID.fromString("00000000-0000-4000-a100-000000000001");
    static final String COLLECTOR1_CODE = "COLLECTOR1";

    private final CreditLedger ledger;
    private final ReferralRepository referrals;
    private final TimeProvider timeProvider;

    public CreditSeedContributor(
            CreditLedger ledger, ReferralRepository referrals, TimeProvider timeProvider) {
        this.ledger = ledger;
        this.referrals = referrals;
        this.timeProvider = timeProvider;
    }

    @Override
    public String name() {
        return "credits";
    }

    @Override
    public int order() {
        return ORDER_INTERACTIONS + 71;
    }

    @Override
    @Transactional
    public void seed() {
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.SECONDS);
        grant(COLLECTOR1, 200, "seed:credits:collector1:welcome");
        grant(PREMIUM_USER, 500, "seed:credits:premium_user:promo");
        referrals.insertCode(COLLECTOR1, COLLECTOR1_CODE, now);
        if (referrals.redemptionOf(COLLECTOR8).isEmpty()) {
            referrals.insertRedemption(
                    new Redemption(
                            REDEMPTION, COLLECTOR1, COLLECTOR8, COLLECTOR1_CODE, 100, 50, now));
        }
        boolean seeded =
                referrals
                        .redemptionOf(COLLECTOR8)
                        .map(redemption -> redemption.id().equals(REDEMPTION))
                        .orElse(false);
        if (seeded) {
            ledger.append(referral(COLLECTOR8, 50, "referee"));
            ledger.append(referral(COLLECTOR1, 100, "referrer"));
        }
    }

    private void grant(UUID userId, int amount, String key) {
        ledger.append(
                new Append(
                        userId,
                        amount,
                        CreditEntryType.GRANT,
                        "PROMO",
                        null,
                        null,
                        key,
                        Map.of("seed", true),
                        "Fictional seed credits",
                        null));
    }

    private static Append referral(UUID userId, int amount, String role) {
        return new Append(
                userId,
                amount,
                CreditEntryType.EARN,
                ReferralService.REASON_REFERRAL,
                ReferralService.REFERENCE_REFERRAL,
                REDEMPTION.toString(),
                "referral:" + REDEMPTION + ":" + role,
                Map.of("role", role.toUpperCase(java.util.Locale.ROOT)),
                null,
                null);
    }
}
