package com.orenjitrade.api.messaging.infra;

import com.orenjitrade.api.messaging.domain.RealtimeDestinations;
import com.orenjitrade.api.messaging.domain.RealtimePublisher;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * Cross-instance realtime fan-out (Phase 5 contract): publishes {@code {destination, payload}} to
 * the Redis channel {@code rt:user:{userId}}; every instance ({@link RealtimeRedisListener})
 * forwards it to its local sessions of that account. When Redis is unavailable the payload is
 * delivered to the sessions of this instance only. Never throws.
 */
@Component
public class RedisRealtimePublisher implements RealtimePublisher {

    public static final String CHANNEL_PREFIX = "rt:user:";

    private static final Logger log = LoggerFactory.getLogger(RedisRealtimePublisher.class);

    private final StringRedisTemplate redis;
    private final JsonMapper jsonMapper;
    private final ObjectProvider<SimpMessagingTemplate> localTemplate;

    public RedisRealtimePublisher(
            StringRedisTemplate redis,
            JsonMapper jsonMapper,
            ObjectProvider<SimpMessagingTemplate> localTemplate) {
        this.redis = redis;
        this.jsonMapper = jsonMapper;
        this.localTemplate = localTemplate;
    }

    @Override
    public void publish(UUID userId, String destination, Object payload) {
        if (!RealtimeDestinations.ALL.contains(destination)) {
            log.warn("Refusing realtime publication to unknown destination {}", destination);
            return;
        }
        RealtimeEnvelope envelope;
        try {
            envelope = new RealtimeEnvelope(destination, jsonMapper.valueToTree(payload));
        } catch (RuntimeException e) {
            log.warn("Realtime payload for {} not serialisable: {}", destination, e.getMessage());
            return;
        }
        try {
            redis.convertAndSend(CHANNEL_PREFIX + userId, jsonMapper.writeValueAsString(envelope));
        } catch (DataAccessException e) {
            log.warn(
                    "Redis unavailable for realtime fan-out, delivering locally: {}",
                    e.getMessage());
            @Nullable SimpMessagingTemplate template = localTemplate.getIfAvailable();
            if (template != null) {
                try {
                    template.convertAndSendToUser(
                            userId.toString(), destination, envelope.payload());
                } catch (RuntimeException local) {
                    log.warn("Local realtime delivery failed: {}", local.getMessage());
                }
            }
        } catch (RuntimeException e) {
            log.warn("Realtime publication failed: {}", e.getMessage());
        }
    }
}
