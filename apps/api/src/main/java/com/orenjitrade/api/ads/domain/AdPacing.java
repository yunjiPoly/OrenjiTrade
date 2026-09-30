package com.orenjitrade.api.ads.domain;

import com.orenjitrade.api.ads.domain.AdEnums.PricingModel;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.jspecify.annotations.Nullable;

/**
 * Budget pacing of internal campaigns (pure). Spend is derived from delivery counters: CPM = bid ×
 * impressions / 1000, CPC = bid × clicks, FLAT = no spend pacing (the flat fee is the budget).
 *
 * <ul>
 *   <li>Total budget: a campaign serves while the remaining budget covers the next unit (one
 *       impression for CPM, one click for CPC).
 *   <li>Daily budget: {@code budget_daily}, or the remaining budget at the start of the UTC day
 *       spread evenly over the days left until {@code end_at} (no end: the remaining budget).
 *   <li>Intraday pacing: by a given time of day at most {@code daily × elapsed fraction +
 *       allowance} may be spent (allowance: {@value #ALLOWANCE_PERCENT} % of the daily budget, at
 *       least one unit), so delivery spreads over the day instead of burning out in the morning.
 * </ul>
 *
 * The decision's {@code pace} (spent today / allowed so far) ranks campaigns that are behind
 * schedule first.
 */
public final class AdPacing {

    public static final int ALLOWANCE_PERCENT = 10;

    private static final BigDecimal THOUSAND = BigDecimal.valueOf(1000);

    private AdPacing() {}

    /**
     * Budget settings of a campaign.
     *
     * @param pricing pricing model
     * @param bid CPM or CPC price
     * @param budgetTotal total budget
     * @param budgetDaily daily budget, {@code null} for even pacing
     * @param endAt end of the campaign, {@code null} for open-ended
     */
    public record Budget(
            PricingModel pricing,
            BigDecimal bid,
            BigDecimal budgetTotal,
            @Nullable BigDecimal budgetDaily,
            @Nullable Instant endAt) {}

    /**
     * Delivery counters of a campaign.
     *
     * @param totalImpressions impressions ever
     * @param totalClicks clicks ever
     * @param todayImpressions impressions of the current UTC day
     * @param todayClicks clicks of the current UTC day
     */
    public record Delivery(
            long totalImpressions, long totalClicks, long todayImpressions, long todayClicks) {}

    /**
     * A pacing decision.
     *
     * @param eligible whether the campaign may serve now
     * @param pace spent today / allowed so far (lower = further behind schedule)
     */
    public record Decision(boolean eligible, double pace) {}

    /** Spend of {@code impressions} and {@code clicks} under a pricing model. */
    public static BigDecimal spend(
            PricingModel pricing, BigDecimal bid, long impressions, long clicks) {
        return switch (pricing) {
            case CPM ->
                    bid.multiply(BigDecimal.valueOf(impressions))
                            .divide(THOUSAND, 6, RoundingMode.HALF_UP);
            case CPC -> bid.multiply(BigDecimal.valueOf(clicks));
            case FLAT -> BigDecimal.ZERO;
        };
    }

    /** Whether the campaign may serve at {@code now}. */
    public static Decision decide(Budget budget, Delivery delivery, Instant now) {
        if (budget.pricing() == PricingModel.FLAT) {
            return new Decision(true, 0);
        }
        BigDecimal unit =
                budget.pricing() == PricingModel.CPM
                        ? budget.bid().divide(THOUSAND, 6, RoundingMode.HALF_UP)
                        : budget.bid();
        BigDecimal spentTotal =
                spend(
                        budget.pricing(),
                        budget.bid(),
                        delivery.totalImpressions(),
                        delivery.totalClicks());
        BigDecimal spentToday =
                spend(
                        budget.pricing(),
                        budget.bid(),
                        delivery.todayImpressions(),
                        delivery.todayClicks());
        if (budget.budgetTotal().subtract(spentTotal).compareTo(unit) < 0) {
            return new Decision(false, 1);
        }
        Instant dayStart = now.truncatedTo(ChronoUnit.DAYS);
        BigDecimal remainingAtDayStart =
                budget.budgetTotal().subtract(spentTotal.subtract(spentToday));
        BigDecimal daily;
        if (budget.budgetDaily() != null) {
            daily = budget.budgetDaily().min(remainingAtDayStart);
        } else if (budget.endAt() != null && budget.endAt().isAfter(dayStart)) {
            long hours = Duration.between(dayStart, budget.endAt()).toHours();
            long days = Math.max(1, (hours + 23) / 24);
            daily = remainingAtDayStart.divide(BigDecimal.valueOf(days), 6, RoundingMode.HALF_UP);
        } else {
            daily = remainingAtDayStart;
        }
        if (spentToday.add(unit).compareTo(daily) > 0) {
            return new Decision(false, 1);
        }
        double fraction = Duration.between(dayStart, now).toSeconds() / 86_400d;
        BigDecimal allowance =
                daily.multiply(BigDecimal.valueOf(ALLOWANCE_PERCENT))
                        .divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP)
                        .max(unit);
        BigDecimal allowedSoFar =
                daily.multiply(BigDecimal.valueOf(fraction)).add(allowance).min(daily);
        if (spentToday.add(unit).compareTo(allowedSoFar) > 0) {
            return new Decision(false, 1);
        }
        double pace =
                allowedSoFar.signum() == 0
                        ? 0
                        : spentToday.divide(allowedSoFar, 6, RoundingMode.HALF_UP).doubleValue();
        return new Decision(true, pace);
    }
}
