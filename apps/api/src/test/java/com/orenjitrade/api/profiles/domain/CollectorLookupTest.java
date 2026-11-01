package com.orenjitrade.api.profiles.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.profiles.infra.CollectorHandleRepository;
import com.orenjitrade.api.users.domain.UserAccountService;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * Review fix 1 (P9, F9): a handle the lookup misses (unknown, hidden, or a collector who blocked
 * the viewer: one query decides all three) ends there, with nothing else read, so a block costs
 * what an unknown handle costs.
 */
class CollectorLookupTest {

    private static final Instant NOW = Instant.parse("2026-10-28T12:00:00Z");

    private final CollectorHandleRepository handles = mock(CollectorHandleRepository.class);
    private final UserAccountService accounts = mock(UserAccountService.class);
    private final CollectorLookup lookup =
            new CollectorLookup(handles, accounts, TimeProvider.fixed(NOW));

    @Test
    void aMissReadsNothingElse() {
        UUID viewer = UUID.randomUUID();
        when(handles.visibleId(any(), any(), any())).thenReturn(Optional.empty());

        assertThat(lookup.visibleByHandle(viewer, "  Collector_One ")).isEmpty();

        verify(handles).visibleId(eq("collector_one"), eq(viewer), eq(NOW));
        verifyNoInteractions(accounts);
    }
}
