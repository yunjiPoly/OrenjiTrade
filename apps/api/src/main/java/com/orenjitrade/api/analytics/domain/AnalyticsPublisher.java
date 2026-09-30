package com.orenjitrade.api.analytics.domain;

import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Publishes analytics events through the configured {@link AnalyticsTransport} on the application
 * executor, so a slow or failing transport never delays or fails the request that produced the
 * event. Failures are logged with the event id and type only (never the payload).
 */
public class AnalyticsPublisher {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsPublisher.class);

    private final AnalyticsTransport transport;
    private final Executor executor;
    private final ActorHasher actorHasher;

    public AnalyticsPublisher(
            AnalyticsTransport transport, Executor executor, ActorHasher actorHasher) {
        this.transport = transport;
        this.executor = executor;
        this.actorHasher = actorHasher;
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
