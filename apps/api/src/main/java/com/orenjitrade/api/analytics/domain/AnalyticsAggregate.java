package com.orenjitrade.api.analytics.domain;

import java.time.LocalDate;
import java.util.List;

/**
 * Local aggregate of analytics events (Phase 7 admin "Analytics"): one counter per UTC day and
 * event type, fed by {@link AnalyticsPublisher} for every published event whatever the transport.
 * Counts only; the cloud reads BigQuery instead.
 */
public interface AnalyticsAggregate {

    /** Counts one event (called off the request thread; may throw, the publisher logs it). */
    void record(AnalyticsEvent event);

    /** Counters of the days in {@code [from, to]}, oldest day first. */
    List<DailyCount> between(LocalDate from, LocalDate to);

    /**
     * One counter.
     *
     * @param day UTC day
     * @param eventType event type
     * @param count events of that type that day
     */
    record DailyCount(LocalDate day, String eventType, long count) {}
}
