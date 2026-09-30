package com.orenjitrade.api.payments;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.Role;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Phase 9 hourly auto-release: a shipped trade whose dispute window ended without a dispute is
 * treated as received (payout released, COMPLETED); a disputed one and one still inside its window
 * are left alone (the latter's buyer is reminded once, 48 h before); nothing happens while
 * payments.auto_release_enabled is off; every run is a job_run.
 */
class AutoReleaseJobIT extends AbstractPaymentsIT {

    @Test
    void releasesOnlyAfterTheWindowAndNeverWhileDisputed() {
        Collector seller = member("ar-seller");
        Collector buyer = member("ar-buyer");
        Collector other = member("ar-other");
        String superAdmin = staff("ar-super", Role.SUPER_ADMIN);

        String due = protectedTrade(seller, buyer, "50.00");
        paid(seller, buyer, due);
        ship(seller, due, 200);
        String disputed = protectedTrade(seller, other, "20.00");
        paid(seller, other, disputed);
        ship(seller, disputed, 200);
        openDispute(other, disputed, "NOT_RECEIVED", 201);
        String soon = protectedTrade(seller, other, "12.00");
        paid(seller, other, soon);
        ship(seller, soon, 200);
        for (String tradeId : new String[] {due, disputed}) {
            testUsers.update(
                    "UPDATE payment SET dispute_window_ends_at = now() - interval '1 hour' WHERE"
                            + " trade_id = ?::uuid",
                    tradeId);
        }
        testUsers.update(
                "UPDATE payment SET dispute_window_ends_at = now() + interval '24 hours' WHERE"
                        + " trade_id = ?::uuid",
                soon);

        // Switched off: nothing happens.
        try {
            callJson(
                    HttpMethod.PUT,
                    "/api/v1/admin/payments/settings",
                    superAdmin,
                    Map.of("autoReleaseEnabled", false),
                    200);
            JsonNode off = runAutoRelease();
            assertThat(off.path("enabled").asBoolean()).isFalse();
            assertThat(off.path("released").asInt()).isZero();
            assertThat(trade(buyer, due, 200).path("status").asString()).isEqualTo("SHIPPED");
        } finally {
            callJson(
                    HttpMethod.PUT,
                    "/api/v1/admin/payments/settings",
                    superAdmin,
                    Map.of("autoReleaseEnabled", true),
                    200);
        }

        JsonNode run = runAutoRelease();
        assertThat(run.path("enabled").asBoolean()).isTrue();
        assertThat(run.path("released").asInt()).isGreaterThanOrEqualTo(1);
        assertThat(run.path("reminded").asInt()).isGreaterThanOrEqualTo(1);

        JsonNode released = trade(buyer, due, 200);
        assertThat(released.path("status").asString()).isEqualTo("COMPLETED");
        assertThat(released.path("payment").path("status").asString()).isEqualTo("PAID_OUT");
        assertThat(released.path("payment").path("payoutAmount").decimalValue())
                .isEqualByComparingTo("47.50");
        JsonNode automatic = entry(released, "RECEIPT_CONFIRMED");
        assertThat(automatic.path("details").path("automatic").asBoolean()).isTrue();
        assertThat(automatic.path("actorRole").isNull()).isTrue();
        assertThat(paymentEvents(due)).contains("PAYOUT_RELEASED");

        JsonNode held = trade(other, disputed, 200);
        assertThat(held.path("status").asString()).isEqualTo("DISPUTED");
        assertThat(held.path("payment").path("status").asString()).isEqualTo("SECURED");
        assertThat(held.path("payment").path("payoutFrozen").asBoolean()).isTrue();

        JsonNode waiting = trade(other, soon, 200);
        assertThat(waiting.path("status").asString()).isEqualTo("SHIPPED");
        JsonNode reminder = awaitNotificationEvent(other, "PAYMENT_UPDATE", "RELEASE_REMINDER");
        assertThat(reminder.path("title").asString()).startsWith("Confirm receipt of");
        assertThat(paymentEvents(soon)).containsOnlyOnce("RELEASE_REMINDER");

        // Idempotent: a second run reminds nobody again and releases nothing of these trades.
        runAutoRelease();
        assertThat(paymentEvents(soon)).containsOnlyOnce("RELEASE_REMINDER");
        assertThat(paymentEvents(due)).containsOnlyOnce("PAYOUT_RELEASED");
        assertThat(trade(other, disputed, 200).path("status").asString()).isEqualTo("DISPUTED");
        assertThat(testUsers.jobRuns("payments-auto-release")).hasSizeGreaterThanOrEqualTo(3);
        assertThat(testUsers.jobRuns("payments-auto-release").get(0).get("status"))
                .isEqualTo("SUCCEEDED");
    }
}
