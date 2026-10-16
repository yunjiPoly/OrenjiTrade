package com.orenjitrade.api.messaging.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import com.orenjitrade.api.messaging.domain.RealtimeDestinations;
import com.orenjitrade.api.messaging.infra.StompSecurityInterceptor.RealtimeAccessDeniedException;
import java.security.Principal;
import java.util.HashMap;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;

/**
 * The refusals of the STOMP inbound channel and their safe messages. RealtimeIT proves the same
 * refusals end a real session; the ERROR frame that carries the message can be lost there when the
 * server closes the socket while another frame is still being written, so the wording is pinned
 * here.
 */
class StompSecurityInterceptorTest {

    private final StompSecurityInterceptor interceptor =
            new StompSecurityInterceptor(
                    mock(RealtimeAuthenticator.class), mock(PresenceTracker.class));
    private final MessageChannel channel = mock(MessageChannel.class);
    private final Principal user = () -> UUID.randomUUID().toString();

    @ParameterizedTest
    @ValueSource(
            strings = {
                "/user/00000000-0000-0000-0000-000000000001/queue/messages",
                "/queue/messages",
                "/topic/messages",
                "/user/queue/secrets"
            })
    void subscriptionsOutsideTheCallersOwnQueuesAreRefused(String destination) {
        assertThatThrownBy(
                        () ->
                                interceptor.preSend(
                                        frame(StompCommand.SUBSCRIBE, destination), channel))
                .isInstanceOf(RealtimeAccessDeniedException.class)
                .hasMessage("Subscriptions are limited to your own /user/queue destinations");
    }

    @Test
    void everyServerDestinationCanBeSubscribedUnderUser() {
        for (String destination : RealtimeDestinations.ALL) {
            Message<?> frame =
                    frame(StompCommand.SUBSCRIBE, RealtimeDestinations.USER_PREFIX + destination);
            assertThat(interceptor.preSend(frame, channel)).isSameAs(frame);
        }
    }

    @Test
    void sendingAnywhereButTypingIsRefused() {
        assertThatThrownBy(
                        () ->
                                interceptor.preSend(
                                        frame(
                                                StompCommand.SEND,
                                                "/user/00000000-0000-0000-0000-000000000001/queue/messages"),
                                        channel))
                .isInstanceOf(RealtimeAccessDeniedException.class)
                .hasMessage("Sending to this destination is not allowed");
        Message<?> typing = frame(StompCommand.SEND, RealtimeDestinations.APP_TYPING);
        assertThat(interceptor.preSend(typing, channel)).isSameAs(typing);
    }

    private Message<byte[]> frame(StompCommand command, String destination) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(command);
        accessor.setDestination(destination);
        accessor.setUser(user);
        accessor.setSessionAttributes(new HashMap<>());
        accessor.setLeaveMutable(true);
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }
}
