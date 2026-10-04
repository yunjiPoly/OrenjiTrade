package com.orenjitrade.api.messaging.infra;

import com.orenjitrade.api.messaging.domain.RealtimeDestinations;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import tools.jackson.databind.json.JsonMapper;

/**
 * Forwards the realtime envelopes of {@code rt:user:*} (the configured {@link
 * RealtimeProperties#channelPrefix()}) to the STOMP sessions of this instance ({@code
 * /user/{userId}/queue/...} through the user destination resolver: only that account's sessions
 * receive them). Unknown destinations and malformed envelopes are dropped.
 */
public class RealtimeRedisListener implements MessageListener {

    private static final Logger log = LoggerFactory.getLogger(RealtimeRedisListener.class);

    private final SimpMessagingTemplate template;
    private final JsonMapper jsonMapper;
    private final String channelPrefix;

    public RealtimeRedisListener(
            SimpMessagingTemplate template, JsonMapper jsonMapper, String channelPrefix) {
        this.template = template;
        this.jsonMapper = jsonMapper;
        this.channelPrefix = channelPrefix;
    }

    @Override
    public void onMessage(Message message, byte @Nullable [] pattern) {
        String channel = new String(message.getChannel(), StandardCharsets.UTF_8);
        if (!channel.startsWith(channelPrefix)) {
            return;
        }
        String user = channel.substring(channelPrefix.length());
        try {
            UUID.fromString(user);
            RealtimeEnvelope envelope =
                    jsonMapper.readValue(message.getBody(), RealtimeEnvelope.class);
            if (!RealtimeDestinations.ALL.contains(envelope.destination())) {
                return;
            }
            template.convertAndSendToUser(user, envelope.destination(), envelope.payload());
        } catch (RuntimeException e) {
            log.warn("Dropping realtime envelope on {}: {}", channel, e.getMessage());
        }
    }
}
