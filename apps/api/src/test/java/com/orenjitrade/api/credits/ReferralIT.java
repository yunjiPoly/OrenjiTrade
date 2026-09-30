package com.orenjitrade.api.credits;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.billing.AbstractPhase10IT;
import com.orenjitrade.api.credits.domain.CreditSettings;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Phase 10 referrals: every account gets a stable code; a new account redeems another account's
 * code once and both earn credits; self-redemption, repeated redemption, old accounts and the
 * per-code cap are refused with a reason; unknown codes are 404; settings are data.
 */
class ReferralIT extends AbstractPhase10IT {

    @Autowired private CreditSettings settings;

    @Test
    void aNewAccountRedeemsAnotherAccountsCodeOnceAndBothEarnCredits() {
        Member referrer = member("ref-owner");
        JsonNode mine = referral(referrer);
        String code = mine.path("code").asString();
        assertThat(code).matches("[A-Z0-9]{8}");
        assertThat(mine.path("redemptions").asInt()).isZero();
        assertThat(mine.path("referrerReward").asInt()).isEqualTo(100);
        assertThat(mine.path("refereeReward").asInt()).isEqualTo(50);
        assertThat(mine.path("canRedeem").asBoolean()).isTrue();
        assertThat(referral(referrer).path("code").asString()).as("stable").isEqualTo(code);

        Member referee = member("ref-new");
        String typed = code.substring(0, 4).toLowerCase() + "-" + code.substring(4);
        JsonNode redeemed = redeem(referee, typed, 200);
        assertThat(redeemed.path("reward").asInt()).isEqualTo(50);
        assertThat(redeemed.path("referrerReward").asInt()).isEqualTo(100);
        assertThat(redeemed.path("balance").asLong()).isEqualTo(50);
        assertThat(balance(referrer)).isEqualTo(100);
        assertThat(balance(referee)).isEqualTo(50);
        assertThat(referral(referrer).path("redemptions").asInt()).isEqualTo(1);
        JsonNode after = referral(referee);
        assertThat(after.path("redeemed").asBoolean()).isTrue();
        assertThat(after.path("canRedeem").asBoolean()).isFalse();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM credit_ledger_entry WHERE reason ="
                                        + " 'REFERRAL' AND reference_id = ?",
                                redeemed.path("redemptionId").asString()))
                .isEqualTo(2);

        assertThat(redeem(referee, code, 409).path("reason").asString())
                .isEqualTo("ALREADY_REDEEMED");
        JsonNode self = redeem(referrer, code, 409);
        assertThat(errorCode(self)).isEqualTo("REFERRAL_NOT_ALLOWED");
        assertThat(self.path("reason").asString()).isEqualTo("SELF");
        redeem(referee, "ZZZZZZZZ", 404);
        redeem(referee, "not a code!", 404);
        callJson(HttpMethod.POST, "/api/v1/me/referrals/redeem", referee.uid(), Map.of(), 400);
        callJson(HttpMethod.GET, "/api/v1/me/referrals", null, null, 401);

        // Only new accounts may redeem.
        Member old = member("ref-old");
        testUsers.update(
                "UPDATE user_account SET created_at = now() - interval '40 days' WHERE id = ?",
                old.id());
        assertThat(redeem(old, code, 409).path("reason").asString()).isEqualTo("ACCOUNT_TOO_OLD");
        assertThat(referral(old).path("canRedeem").asBoolean()).isFalse();
    }

    @Test
    void theRedemptionCapAndRewardsAreSettingsEditedBySuperAdmins() {
        String superAdmin = staff("ref-super", Role.SUPER_ADMIN);
        String admin = staff("ref-admin", Role.ADMIN);
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/credits/settings",
                admin,
                Map.of("maxPerReferrer", 1),
                403);
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/credits/settings",
                superAdmin,
                Map.of("refereeReward", -1),
                400);
        try {
            JsonNode updated =
                    callJson(
                            HttpMethod.PUT,
                            "/api/v1/admin/credits/settings",
                            superAdmin,
                            Map.of("maxPerReferrer", 1, "refereeReward", 0),
                            200);
            assertThat(updated.path("maxPerReferrer").asInt()).isEqualTo(1);
            assertThat(
                            callJson(
                                            HttpMethod.GET,
                                            "/api/v1/admin/credits/settings",
                                            admin,
                                            null,
                                            200)
                                    .path("refereeReward")
                                    .asInt())
                    .isZero();

            Member referrer = member("ref-cap-owner");
            String code = referral(referrer).path("code").asString();
            JsonNode first = redeem(member("ref-cap-1"), code, 200);
            assertThat(first.path("reward").asInt()).isZero();
            assertThat(first.path("balance").asLong()).isZero();
            assertThat(balance(referrer)).isEqualTo(100);
            assertThat(redeem(member("ref-cap-2"), code, 409).path("reason").asString())
                    .isEqualTo("REFERRER_LIMIT");
            assertThat(
                            testUsers.count(
                                    "SELECT count(*) FROM audit_log WHERE action ="
                                            + " 'credits.settings.update'"))
                    .isPositive();
        } finally {
            testUsers.update(
                    "UPDATE platform_settings SET value = '50' WHERE key IN"
                            + " ('credits.referral_max_per_referrer',"
                            + " 'credits.referral_referee_reward')");
            settings.invalidate();
        }
    }

    private JsonNode referral(Member member) {
        return callJson(HttpMethod.GET, "/api/v1/me/referrals", member.uid(), null, 200);
    }

    private JsonNode redeem(Member member, String code, int expectedStatus) {
        return callJson(
                HttpMethod.POST,
                "/api/v1/me/referrals/redeem",
                member.uid(),
                Map.of("code", code),
                expectedStatus);
    }

    private long balance(Member member) {
        return callJson(HttpMethod.GET, "/api/v1/me/credits", member.uid(), null, 200)
                .path("balance")
                .asLong();
    }
}
