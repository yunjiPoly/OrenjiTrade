package com.orenjitrade.api.analytics.api;

import com.orenjitrade.api.analytics.domain.AnalyticsAggregate;
import com.orenjitrade.api.analytics.domain.AnalyticsAggregate.DailyCount;
import com.orenjitrade.api.analytics.domain.AnalyticsPublisher;
import com.orenjitrade.api.common.TimeProvider;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.http.MediaType;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /api/v1/admin/analytics/summary} (ADMIN, SUPER_ADMIN): analytics event counts per day
 * and type from the local aggregate ({@code analytics_daily_count}; the BigQuery adapter is part of
 * the deferred cloud work). Counts only: no actors, payloads or geography.
 */
@RestController
@Validated
@RequestMapping(path = "/api/v1/admin/analytics", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "admin-analytics", description = "Analytics summary (admin console)")
public class AdminAnalyticsController {

    /** The {@code source} of summaries read from {@code analytics_daily_count}. */
    public static final String LOCAL_SOURCE = "local-aggregate";

    private final AnalyticsAggregate aggregate;
    private final AnalyticsPublisher publisher;
    private final TimeProvider timeProvider;

    public AdminAnalyticsController(
            AnalyticsAggregate aggregate, AnalyticsPublisher publisher, TimeProvider timeProvider) {
        this.aggregate = aggregate;
        this.publisher = publisher;
        this.timeProvider = timeProvider;
    }

    @GetMapping("/summary")
    @Operation(
            operationId = "getAnalyticsSummary",
            summary = "Analytics event counts (ADMIN)",
            description =
                    "Totals and daily counts per event type (search_performed, collector_viewed,"
                        + " message_sent, wishlist_matched, rating_submitted, collector_reported,"
                        + " ...) for the last `days` UTC days including today, from the local"
                        + " aggregate.")
    public AnalyticsSummaryResponse summary(
            @RequestParam(defaultValue = "7") @Min(1) @Max(90) int days) {
        LocalDate to = LocalDate.ofInstant(timeProvider.now(), ZoneOffset.UTC);
        LocalDate from = to.minusDays(days - 1L);
        List<DailyCount> daily = aggregate.between(from, to);
        Map<String, Long> totals = new TreeMap<>();
        for (DailyCount count : daily) {
            totals.merge(count.eventType(), count.count(), Long::sum);
        }
        return new AnalyticsSummaryResponse(
                LOCAL_SOURCE,
                publisher.transportName(),
                from,
                to,
                totals.values().stream().mapToLong(Long::longValue).sum(),
                totals,
                daily.stream()
                        .map(
                                count ->
                                        new DailyCountResponse(
                                                count.day(), count.eventType(), count.count()))
                        .toList());
    }

    /** One counter. */
    @Schema(name = "AnalyticsDailyCount")
    public record DailyCountResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) LocalDate day,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "search_performed")
                    String eventType,
            @Schema(requiredMode = RequiredMode.REQUIRED) long count) {}

    /** {@code GET /admin/analytics/summary}. */
    @Schema(name = "AnalyticsSummary")
    public record AnalyticsSummaryResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "local-aggregate")
                    String source,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            example = "log",
                            description = "Where events are published (log or pubsub)")
                    String transport,
            @Schema(requiredMode = RequiredMode.REQUIRED) LocalDate from,
            @Schema(requiredMode = RequiredMode.REQUIRED) LocalDate to,
            @Schema(requiredMode = RequiredMode.REQUIRED) long total,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Event type to count")
                    Map<String, Long> totals,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<DailyCountResponse> daily) {}
}
