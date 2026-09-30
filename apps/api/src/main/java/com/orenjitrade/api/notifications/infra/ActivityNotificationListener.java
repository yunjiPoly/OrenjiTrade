package com.orenjitrade.api.notifications.infra;

import com.orenjitrade.api.binders.events.BinderFreshnessChanged;
import com.orenjitrade.api.binders.events.BinderFreshnessWarning;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.inventory.events.InventoryListingsHidden;
import com.orenjitrade.api.messaging.events.MessageRead;
import com.orenjitrade.api.messaging.events.MessageSent;
import com.orenjitrade.api.notifications.domain.ActivityNotifications;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * Consumes the domain events of the messaging, binders and inventory modules (Spring Modulith
 * registry, after commit, own transaction, retried after a crash) and hands them to {@link
 * ActivityNotifications}. Idempotent through the notifications' dedup keys.
 */
@Component
public class ActivityNotificationListener {

    private final ActivityNotifications activity;

    public ActivityNotificationListener(ActivityNotifications activity) {
        this.activity = activity;
    }

    @ApplicationModuleListener
    void on(MessageSent event) {
        activity.messageSent(
                event.messageId(),
                event.conversationId(),
                event.senderId(),
                event.recipientId(),
                event.kind(),
                event.occurredAt());
    }

    @ApplicationModuleListener
    void on(MessageRead event) {
        activity.conversationRead(event.readerId(), event.conversationId());
    }

    @ApplicationModuleListener
    void on(BinderFreshnessWarning event) {
        activity.freshnessWarning(
                event.ownerId(),
                event.binderId(),
                event.itemCount(),
                event.hidesAt(),
                event.warnedAt());
    }

    @ApplicationModuleListener
    void on(BinderFreshnessChanged event) {
        if (event.state() == FreshnessState.HIDDEN
                && event.previousState() != FreshnessState.HIDDEN) {
            activity.binderHidden(event.ownerId(), event.binderId(), event.changedAt());
        }
    }

    @ApplicationModuleListener
    void on(InventoryListingsHidden event) {
        activity.itemsHidden(
                event.ownerId(), event.binderId(), event.itemCount(), event.hiddenAt());
    }
}
