package com.orenjitrade.api.messaging.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.messaging.domain.RealtimeDestinations;
import com.orenjitrade.api.messaging.infra.StompSecurityInterceptor.RealtimeAccessDeniedException;
import com.orenjitrade.api.profiles.domain.MemberCard;
import com.orenjitrade.api.profiles.domain.MemberDirectory;
import com.orenjitrade.api.profiles.domain.PrivacySettingsView;
import java.security.Principal;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.BeforeEach;
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

    private static final Instant NOW = Instant.parse("2026-10-28T12:00:00Z");

    private final UUID userId = UUID.randomUUID();
    private final MemberDirectory members = mock(MemberDirectory.class);
    private final PresenceTracker presence = mock(PresenceTracker.class);
    private final StompSecurityInterceptor interceptor =
            new StompSecurityInterceptor(
                    mock(RealtimeAuthenticator.class), presence, members, TimeProvider.fixed(NOW));
    private final MessageChannel channel = mock(MessageChannel.class);
    private final Principal user = userId::toString;

    @BeforeEach
    void anActiveAccount() {
        account(AccountStatus.ACTIVE, null);
    }

    private void account(AccountStatus status, @Nullable Instant suspendedUntil) {
        when(members.card(userId))
                .thenReturn(
                        Optional.of(
                                new MemberCard(
                                        userId,
                                        "rt_unit",
                                        "Unit",
                                        null,
                                        status,
                                        suspendedUntil,
                                        PrivacySettingsView.DEFAULTS,
                                        true)));
    }

    /**
     * Owner decision of 2026-10-28, review fix 1: a session opened before its account was
     * suspended, banned or deleted is refused at its next presence check (an instance that did not
     * see the event), whatever the frame; an expired suspension passes.
     */
    @Test
    void aSessionWhoseAccountMayNoLongerConnectIsRefusedAtItsNextFrame() {
        Message<?> typing = frame(StompCommand.SEND, RealtimeDestinations.APP_TYPING);
        assertThat(interceptor.preSend(typing, channel)).isSameAs(typing);
        verify(presence).refresh(userId);

        for (Runnable state :
                List.<Runnable>of(
                        () -> account(AccountStatus.SUSPENDED, NOW.plusSeconds(3600)),
                        () -> account(AccountStatus.SUSPENDED, null),
                        () -> account(AccountStatus.DELETION_REQUESTED, null),
                        () -> account(AccountStatus.DELETED, null),
                        () -> when(members.card(userId)).thenReturn(Optional.empty()))) {
            state.run();
            for (Message<?> frame :
                    List.of(
                            frame(StompCommand.SEND, RealtimeDestinations.APP_TYPING),
                            frame(
                                    StompCommand.SUBSCRIBE,
                                    RealtimeDestinations.USER_PREFIX
                                            + RealtimeDestinations.ALL.iterator().next()))) {
                assertThatThrownBy(() -> interceptor.preSend(frame, channel))
                        .isInstanceOf(RealtimeAccessDeniedException.class)
                        .hasMessage("This account cannot connect");
            }
        }
        verify(presence, times(1)).refresh(userId);

        account(AccountStatus.SUSPENDED, NOW.minusSeconds(60));
        assertThat(interceptor.preSend(typing, channel)).isSameAs(typing);
    }

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
