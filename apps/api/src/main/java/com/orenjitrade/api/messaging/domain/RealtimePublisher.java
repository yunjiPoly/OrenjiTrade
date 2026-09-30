package com.orenjitrade.api.messaging.domain;

import java.util.UUID;

/**
 * Pushes a payload to every open realtime session of an account, on whichever API instance it is
 * connected (Redis channel {@code rt:user:{userId}}, every instance forwards to its local
 * sessions). Best effort: never throws; clients re-sync over REST.
 */
public interface RealtimePublisher {

    /**
     * @param userId recipient account
     * @param destination one of {@link RealtimeDestinations#ALL}
     * @param payload JSON-serialisable payload
     */
    void publish(UUID userId, String destination, Object payload);
}
