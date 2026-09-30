package com.orenjitrade.api.ads.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.ads.domain.AdEnums.PricingModel;
import com.orenjitrade.api.ads.domain.AdPacing.Budget;
import com.orenjitrade.api.ads.domain.AdPacing.Decision;
import com.orenjitrade.api.ads.domain.AdPacing.Delivery;
import java.math.BigDecimal;
import java.time.Instant;
import org.junit.jupiter.api.Test;

/** Budget pacing: total budget, daily budget, even spreading and intraday pacing. */
class AdPacingTest {

    static final Instant MORNING = Instant.parse("2026-09-30T06:00:00Z");
    static final Instant EVENING = Instant.parse("2026-09-30T22:00:00Z");

    @Test
    void spendFollowsThePricingModel() {
        assertThat(AdPacing.spend(PricingModel.CPM, new BigDecimal("4.00"), 250, 9))
                .isEqualByComparingTo("1.00");
        assertThat(AdPacing.spend(PricingModel.CPC, new BigDecimal("0.40"), 250, 3))
                .isEqualByComparingTo("1.20");
        assertThat(AdPacing.spend(PricingModel.FLAT, BigDecimal.ZERO, 250, 3))
                .isEqualByComparingTo("0");
    }

    @Test
    void anExhaustedTotalBudgetStopsTheCampaign() {
        Budget budget =
                new Budget(
                        PricingModel.CPC,
                        new BigDecimal("0.40"),
                        new BigDecimal("0.50"),
                        null,
                        null);
        assertThat(AdPacing.decide(budget, new Delivery(10, 0, 10, 0), EVENING).eligible())
                .isTrue();
        assertThat(AdPacing.decide(budget, new Delivery(10, 1, 10, 1), EVENING).eligible())
                .isFalse();
    }

    @Test
    void theDailyBudgetIsPacedThroughTheDay() {
        // 10.00 per day at 4.00 CPM = 2500 impressions per day.
        Budget budget =
                new Budget(
                        PricingModel.CPM,
                        new BigDecimal("4.00"),
                        new BigDecimal("1000.00"),
                        new BigDecimal("10.00"),
                        null);
        // At 06:00 a quarter of the day (2.50) plus a 10 % allowance (1.00) may be spent.
        Decision early = AdPacing.decide(budget, new Delivery(500, 0, 500, 0), MORNING);
        assertThat(early.eligible()).isTrue();
        assertThat(early.pace()).isLessThan(1);
        assertThat(AdPacing.decide(budget, new Delivery(900, 0, 900, 0), MORNING).eligible())
                .as("ahead of schedule in the morning")
                .isFalse();
        assertThat(AdPacing.decide(budget, new Delivery(2000, 0, 900, 0), EVENING).eligible())
                .as("the same spend is fine in the evening")
                .isTrue();
        assertThat(AdPacing.decide(budget, new Delivery(5000, 0, 2500, 0), EVENING).eligible())
                .as("the daily budget is spent")
                .isFalse();
    }

    @Test
    void withoutADailyBudgetTheRemainderIsSpreadUntilTheEnd() {
        // 100.00 left over 10 days -> 10.00 per day.
        Budget budget =
                new Budget(
                        PricingModel.CPC,
                        new BigDecimal("1.00"),
                        new BigDecimal("100.00"),
                        null,
                        Instant.parse("2026-10-10T00:00:00Z"));
        assertThat(AdPacing.decide(budget, new Delivery(0, 9, 0, 9), EVENING).eligible()).isTrue();
        assertThat(AdPacing.decide(budget, new Delivery(0, 10, 0, 10), EVENING).eligible())
                .isFalse();
        Decision behind = AdPacing.decide(budget, new Delivery(0, 1, 0, 1), EVENING);
        Decision ahead = AdPacing.decide(budget, new Delivery(0, 8, 0, 8), EVENING);
        assertThat(behind.pace()).isLessThan(ahead.pace());
    }

    @Test
    void flatCampaignsAreNotSpendPaced() {
        Budget budget = new Budget(PricingModel.FLAT, BigDecimal.ZERO, BigDecimal.ZERO, null, null);
        assertThat(
                        AdPacing.decide(budget, new Delivery(1_000_000, 50_000, 900, 9), MORNING)
                                .eligible())
                .isTrue();
    }
}
