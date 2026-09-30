package com.orenjitrade.api;

import com.orenjitrade.api.binders.events.BinderFreshnessChanged;
import com.orenjitrade.api.binders.events.BinderFreshnessWarning;
import com.orenjitrade.api.binders.events.BinderPublished;
import com.orenjitrade.api.binders.events.BinderUnpublished;
import com.orenjitrade.api.community.events.CommunityPostCreated;
import com.orenjitrade.api.inventory.events.InventoryItemPublished;
import com.orenjitrade.api.inventory.events.InventoryItemUnpublished;
import com.orenjitrade.api.messaging.events.MessageRead;
import com.orenjitrade.api.messaging.events.MessageSent;
import com.orenjitrade.api.messaging.events.UserBlocked;
import com.orenjitrade.api.messaging.events.UserUnblocked;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Predicate;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Records the inventory, binder, messaging and community domain events that were committed
 * (after-commit listeners, so events of rolled-back transactions are not recorded). Imported by
 * {@link AbstractIntegrationTest} so every context has the same bean set; tests filter the recorded
 * events by their own ids.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestDomainEventsConfiguration {

    @Bean
    RecordedDomainEvents recordedDomainEvents() {
        return new RecordedDomainEvents();
    }

    /** Committed domain events, in publication order. */
    public static class RecordedDomainEvents {

        private final List<Object> events = new CopyOnWriteArrayList<>();

        @TransactionalEventListener(fallbackExecution = true)
        public void on(InventoryItemPublished event) {
            events.add(event);
        }

        @TransactionalEventListener(fallbackExecution = true)
        public void on(InventoryItemUnpublished event) {
            events.add(event);
        }

        @TransactionalEventListener(fallbackExecution = true)
        public void on(BinderPublished event) {
            events.add(event);
        }

        @TransactionalEventListener(fallbackExecution = true)
        public void on(BinderUnpublished event) {
            events.add(event);
        }

        @TransactionalEventListener(fallbackExecution = true)
        public void on(BinderFreshnessChanged event) {
            events.add(event);
        }

        @TransactionalEventListener(fallbackExecution = true)
        public void on(BinderFreshnessWarning event) {
            events.add(event);
        }

        @TransactionalEventListener(fallbackExecution = true)
        public void on(MessageSent event) {
            events.add(event);
        }

        @TransactionalEventListener(fallbackExecution = true)
        public void on(MessageRead event) {
            events.add(event);
        }

        @TransactionalEventListener(fallbackExecution = true)
        public void on(UserBlocked event) {
            events.add(event);
        }

        @TransactionalEventListener(fallbackExecution = true)
        public void on(UserUnblocked event) {
            events.add(event);
        }

        @TransactionalEventListener(fallbackExecution = true)
        public void on(CommunityPostCreated event) {
            events.add(event);
        }

        /** Recorded events of a type matching a filter. */
        public <T> List<T> of(Class<T> type, Predicate<T> filter) {
            return events.stream().filter(type::isInstance).map(type::cast).filter(filter).toList();
        }
    }
}
