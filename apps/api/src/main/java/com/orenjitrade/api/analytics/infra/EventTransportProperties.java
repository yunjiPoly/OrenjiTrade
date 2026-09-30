package com.orenjitrade.api.analytics.infra;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code orenji.events.*} as far as analytics is concerned ({@code EVENTS_TRANSPORT}).
 *
 * @param transport {@code local} (default: analytics events are written to the application log) or
 *     {@code pubsub} (cloud: Pub/Sub topic {@code analytics-events} feeding BigQuery)
 * @param pubsub Pub/Sub settings, used only with {@code pubsub}
 */
@ConfigurationProperties(prefix = "orenji.events")
public record EventTransportProperties(
        @DefaultValue("local") String transport, @DefaultValue PubSub pubsub) {

    public static final String LOCAL = "local";
    public static final String PUBSUB = "pubsub";

    /**
     * Pub/Sub settings.
     *
     * @param emulatorHost {@code host:port} of a Pub/Sub emulator (no credentials); empty in the
     *     cloud
     * @param topicDomainEvents topic of externalised domain events
     * @param topicAnalytics topic of analytics events
     */
    public record PubSub(
            @DefaultValue("") String emulatorHost,
            @DefaultValue("domain-events") String topicDomainEvents,
            @DefaultValue("analytics-events") String topicAnalytics) {}
}
