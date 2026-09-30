package com.orenjitrade.api.notifications.domain;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.messaging.domain.RealtimeDestinations;
import com.orenjitrade.api.messaging.domain.RealtimePublisher;
import com.orenjitrade.api.notifications.domain.ChannelPlan.DeliveryState;
import com.orenjitrade.api.notifications.domain.EmailProvider.EmailMessage;
import com.orenjitrade.api.notifications.domain.PushProvider.PushMessage;
import com.orenjitrade.api.notifications.domain.PushProvider.PushResult;
import com.orenjitrade.api.notifications.events.NotificationCreated;
import com.orenjitrade.api.notifications.infra.NotificationRepository;
import com.orenjitrade.api.notifications.infra.NotificationRepository.Row;
import com.orenjitrade.api.users.domain.UserAccountService;
import com.orenjitrade.api.users.domain.UserAccountSnapshot;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * Fans a stored notification out after commit ({@link NotificationCreated}, Spring Modulith
 * registry: retried after a crash): the in-app realtime queue {@code /user/queue/notifications}
 * (through the messaging module's {@link RealtimePublisher}), push through the configured {@link
 * PushProvider} to the recipient's valid device tokens (tokens the provider rejects are
 * invalidated), email through the {@link EmailProvider} to a verified address. Idempotent: only
 * channels still {@code PENDING} in {@code channel_state} are delivered, and the final state (SENT
 * | FAILED | SKIPPED with a reason) is written back.
 */
@Component
public class NotificationDispatcher {

    private static final Logger log = LoggerFactory.getLogger(NotificationDispatcher.class);

    private final NotificationRepository repository;
    private final NotificationService notifications;
    private final PushTokenService pushTokens;
    private final PushProvider pushProvider;
    private final EmailProvider emailProvider;
    private final RealtimePublisher realtime;
    private final UserAccountService accounts;
    private final TimeProvider timeProvider;

    public NotificationDispatcher(
            NotificationRepository repository,
            NotificationService notifications,
            PushTokenService pushTokens,
            PushProvider pushProvider,
            EmailProvider emailProvider,
            RealtimePublisher realtime,
            UserAccountService accounts,
            TimeProvider timeProvider) {
        this.repository = repository;
        this.notifications = notifications;
        this.pushTokens = pushTokens;
        this.pushProvider = pushProvider;
        this.emailProvider = emailProvider;
        this.realtime = realtime;
        this.accounts = accounts;
        this.timeProvider = timeProvider;
    }

    @ApplicationModuleListener
    void on(NotificationCreated event) {
        dispatch(event);
    }

    /** Delivers the pending channels of one notification (see the class comment). */
    public void dispatch(NotificationCreated event) {
        Optional<Row> found = repository.find(event.notificationId());
        if (found.isEmpty()) {
            return;
        }
        Row row = found.get();
        Map<String, Object> state = new LinkedHashMap<>(notifications.parse(row.channelState()));
        if (!state.containsKey("realtime")) {
            // Not a row created by NotificationService (or already dispatched by an old version).
            return;
        }
        NotificationView view = notifications.view(row);
        boolean changed = false;

        if (pending(state, "realtime")) {
            realtime.publish(row.userId(), RealtimeDestinations.NOTIFICATIONS, view);
            state.put("realtime", DeliveryState.SENT.name());
            changed = true;
        }
        if (pending(state, "push")) {
            deliverPush(row, view, state);
            changed = true;
        }
        if (pending(state, "email")) {
            deliverEmail(row, view, state);
            changed = true;
        }
        if (changed) {
            state.put("dispatchedAt", timeProvider.now().toString());
            repository.updateChannelState(row.id(), writeState(state));
        }
    }

    private void deliverPush(Row row, NotificationView view, Map<String, Object> state) {
        List<String> tokens = pushTokens.activeTokens(row.userId());
        if (tokens.isEmpty()) {
            state.put("push", DeliveryState.SKIPPED.name());
            state.put("pushReason", ChannelPlan.REASON_NO_TOKENS);
            return;
        }
        Map<String, String> data = new LinkedHashMap<>();
        data.put("notificationId", row.id().toString());
        data.put("type", view.type().name());
        Object deepLink = view.data().get("deepLink");
        if (deepLink != null) {
            data.put("deepLink", deepLink.toString());
        }
        PushResult result;
        try {
            result =
                    pushProvider.send(
                            new PushMessage(
                                    row.id(),
                                    row.userId(),
                                    view.type(),
                                    view.title(),
                                    view.body(),
                                    data),
                            tokens);
        } catch (RuntimeException e) {
            log.warn("Push provider {} failed: {}", pushProvider.name(), e.getMessage());
            result = new PushResult(0, tokens.size(), List.of());
        }
        if (!result.invalidTokens().isEmpty()) {
            pushTokens.invalidate(result.invalidTokens());
        }
        state.put(
                "push",
                result.delivered() > 0 ? DeliveryState.SENT.name() : DeliveryState.FAILED.name());
        state.put("pushProvider", pushProvider.name());
        state.put("pushDelivered", result.delivered());
        state.put("pushFailed", result.failed());
        state.remove("pushReason");
    }

    private void deliverEmail(Row row, NotificationView view, Map<String, Object> state) {
        @Nullable String address =
                accounts.findSnapshot(row.userId())
                        .filter(UserAccountSnapshot::emailVerified)
                        .map(UserAccountSnapshot::email)
                        .orElse(null);
        if (address == null || address.isBlank()) {
            state.put("email", DeliveryState.SKIPPED.name());
            state.put("emailReason", ChannelPlan.REASON_NO_EMAIL);
            return;
        }
        boolean sent;
        try {
            sent =
                    emailProvider.send(
                            new EmailMessage(
                                    row.id(),
                                    view.type(),
                                    address,
                                    view.title(),
                                    view.body()
                                            + "\n\nManage your notifications in OrenjiTrade"
                                            + " settings."));
        } catch (RuntimeException e) {
            log.warn("Email provider {} failed: {}", emailProvider.name(), e.getMessage());
            sent = false;
        }
        state.put("email", sent ? DeliveryState.SENT.name() : DeliveryState.FAILED.name());
        state.put("emailProvider", emailProvider.name());
        state.remove("emailReason");
    }

    private static boolean pending(Map<String, Object> state, String channel) {
        return DeliveryState.PENDING.name().equals(state.get(channel));
    }

    private String writeState(Map<String, Object> state) {
        return notifications.json(state);
    }
}
