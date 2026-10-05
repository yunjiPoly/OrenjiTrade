package com.orenjitrade.api.messaging.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.orenjitrade.api.messaging.domain.RealtimeDestinations;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.connection.DefaultMessage;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import tools.jackson.databind.json.JsonMapper;

/**
 * The realtime fan-out channel prefix ({@code orenji.realtime.channel-prefix}): the default keeps
 * the historical {@code rt:user:<id>} channels, a second stack on the same Redis server (the local
 * E2E API) publishes and listens on its own channels only, and the prefix can never carry pattern
 * characters.
 */
class RealtimeChannelPrefixTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String DESTINATION = RealtimeDestinations.ALL.get(0);

    @Test
    void defaultsToTheHistoricalChannels() {
        RealtimeProperties defaults =
                new RealtimeProperties(RealtimeProperties.DEFAULT_CHANNEL_PREFIX);
        UUID user = UUID.randomUUID();
        assertThat(defaults.channelOf(user)).isEqualTo("rt:user:" + user);
        assertThat(defaults.pattern()).isEqualTo("rt:user:*");
    }

    @Test
    void publishesOnTheConfiguredChannel() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        ObjectProvider<SimpMessagingTemplate> local = mock(ObjectProvider.class);
        RedisRealtimePublisher publisher =
                new RedisRealtimePublisher(
                        redis, JSON, local, new RealtimeProperties("e2e-web:rt:user:"));
        UUID user = UUID.randomUUID();

        publisher.publish(user, DESTINATION, Map.of("hello", "world"));

        verify(redis).convertAndSend(eq("e2e-web:rt:user:" + user), anyString());
    }

    @Test
    void forwardsOnlyItsOwnChannels() {
        SimpMessagingTemplate template = mock(SimpMessagingTemplate.class);
        RealtimeRedisListener listener =
                new RealtimeRedisListener(template, JSON, "e2e-web:rt:user:");
        UUID user = UUID.randomUUID();
        byte[] body =
                ("{\"destination\":\"" + DESTINATION + "\",\"payload\":{\"n\":1}}")
                        .getBytes(StandardCharsets.UTF_8);

        // A push of the developer API (default prefix) is not for this stack.
        listener.onMessage(
                new DefaultMessage(("rt:user:" + user).getBytes(StandardCharsets.UTF_8), body),
                null);
        verify(template, never()).convertAndSendToUser(anyString(), anyString(), any());

        listener.onMessage(
                new DefaultMessage(
                        ("e2e-web:rt:user:" + user).getBytes(StandardCharsets.UTF_8), body),
                null);
        verify(template).convertAndSendToUser(eq(user.toString()), eq(DESTINATION), any());
    }

    @Test
    void refusesPatternCharactersAndBlankPrefixes() {
        for (String invalid : new String[] {"", " ", "rt:*", "rt:user:?", "rt user:", "rt:[a]:"}) {
            assertThatThrownBy(() -> new RealtimeProperties(invalid))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("orenji.realtime.channel-prefix");
        }
    }
}
