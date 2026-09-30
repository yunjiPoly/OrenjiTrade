package com.orenjitrade.api.analytics.domain;

import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Publishes analytics events through the configured {@link AnalyticsTransport} on the application
 * executor, so a slow or failing transport never delays or fails the request that produced the
 * event. Failures are logged with the event id and type only (never the payload). When a local
 * {@link AnalyticsAggregate} is configured every event is also counted there (Phase 7 admin
 * analytics summary), independently of the transport's success.
 */
public class AnalyticsPublisher {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsPublisher.class);

    private final AnalyticsTransport transport;
    private final Executor executor;
    private final ActorHasher actorHasher;
    private final @Nullable AnalyticsAggregate aggregate;

    public AnalyticsPublisher(
            AnalyticsTransport transport, Executor executor, ActorHasher actorHasher) {
        this(transport, executor, actorHasher, null);
    }

    public AnalyticsPublisher(
            AnalyticsTransport transport,
            Executor executor,
            ActorHasher actorHasher,
            @Nullable AnalyticsAggregate aggregate) {
        this.transport = transport;
        this.executor = executor;
        this.actorHasher = actorHasher;
        this.aggregate = aggregate;
    }

    /** The pseudonymiser of account ids used for {@code actor_hash} and target hashes. */
    public ActorHasher actorHasher() {
        return actorHasher;
    }

    /** Name of the active transport ({@code log} or {@code pubsub}). */
    public String transportName() {
        return transport.name();
    }

    /** Hands the event to the transport asynchronously; never throws. */
    public void publish(AnalyticsEvent event) {
        try {
            executor.execute(() -> send(event));
        } catch (RejectedExecutionException e) {
            log.warn(
                    "Analytics event {} ({}) dropped: executor unavailable",
                    event.eventId(),
                    event.type());
        }
    }

    private void send(AnalyticsEvent event) {
        if (aggregate != null) {
            try {
                aggregate.record(event);
            } catch (RuntimeException e) {
                log.warn(
                        "Analytics event {} ({}) not counted locally: {}",
                        event.eventId(),
                        event.type(),
                        e.getClass().getSimpleName());
            }
        }
        try {
            transport.send(event);
        } catch (RuntimeException e) {
            log.warn(
                    "Analytics event {} ({}) not delivered through {}: {}",
                    event.eventId(),
                    event.type(),
                    transport.name(),
                    e.getClass().getSimpleName());
        }
    }
}
