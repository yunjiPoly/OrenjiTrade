package com.orenjitrade.api.messaging.infra;

import tools.jackson.databind.JsonNode;

/**
 * What travels on the Redis channel {@code rt:user:{userId}}: the user-relative destination (e.g.
 * {@code /queue/messages}) and the JSON payload as the REST API renders it.
 */
public record RealtimeEnvelope(String destination, JsonNode payload) {}
