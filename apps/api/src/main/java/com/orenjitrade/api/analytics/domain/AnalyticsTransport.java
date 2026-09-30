package com.orenjitrade.api.analytics.domain;

/**
 * Where analytics events go (ARCHITECTURE.md section 8 "EventTransport"): a structured log line
 * locally ({@code EVENTS_TRANSPORT=local}, the default) or the Pub/Sub topic {@code
 * analytics-events} feeding BigQuery ({@code EVENTS_TRANSPORT=pubsub}, cloud only). Implementations
 * may block briefly; {@link AnalyticsPublisher} calls them off the request thread and never lets a
 * failure reach the caller.
 */
public interface AnalyticsTransport {

    /** Short name for logs ({@code log}, {@code pubsub}). */
    String name();

    /**
     * Delivers one event.
     *
     * @throws RuntimeException when the event could not be delivered (logged by the publisher)
     */
    void send(AnalyticsEvent event);
}
