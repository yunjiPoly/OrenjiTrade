package com.orenjitrade.api;

import com.orenjitrade.api.users.domain.DeletionParticipant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

/**
 * A deletion participant that reports {@code OPEN_DISPUTE} for the accounts a test registers in
 * {@link #BLOCKED}, standing in for the payments/trades modules that do not exist yet. Imported by
 * {@link AbstractIntegrationTest} so every context has the same bean set.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestDeletionConfiguration {

    /** Accounts whose deletion is blocked by an open dispute. */
    public static final Set<UUID> BLOCKED = ConcurrentHashMap.newKeySet();

    public static final String BLOCKER = "OPEN_DISPUTE";

    @Bean
    DeletionParticipant testBlockingDeletionParticipant() {
        return new DeletionParticipant() {
            @Override
            public String name() {
                return "test-blockers";
            }

            @Override
            public List<String> blockers(UUID userId) {
                return BLOCKED.contains(userId) ? List.of(BLOCKER) : List.of();
            }

            @Override
            public void purge(UUID userId) {
                BLOCKED.remove(userId);
            }
        };
    }
}
