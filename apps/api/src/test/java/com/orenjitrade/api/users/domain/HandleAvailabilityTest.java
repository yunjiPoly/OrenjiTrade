package com.orenjitrade.api.users.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** The answer of the welcome step's live handle check (stage R12), as the save would give it. */
class HandleAvailabilityTest {

    private static final BooleanSupplier FREE = () -> false;
    private static final BooleanSupplier HELD = () -> true;

    @Test
    void aFreeWellFormedHandleIsAvailable() {
        assertThat(HandleAvailability.of("sam_trades", "maika", FREE))
                .isEqualTo(HandleAvailability.AVAILABLE);
        assertThat(HandleAvailability.AVAILABLE.available()).isTrue();
    }

    @Test
    void aHandleAnotherAccountHoldsIsTaken() {
        assertThat(HandleAvailability.of("sam_trades", "maika", HELD))
                .isEqualTo(HandleAvailability.TAKEN);
        assertThat(HandleAvailability.TAKEN.available()).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {"admin", "support", "deleted_abc123"})
    void aReservedHandleReadsTakenWithoutALookup(String reserved) {
        AtomicInteger lookups = new AtomicInteger();
        assertThat(
                        HandleAvailability.of(
                                reserved,
                                "maika",
                                () -> {
                                    lookups.incrementAndGet();
                                    return false;
                                }))
                .isEqualTo(HandleAvailability.TAKEN);
        assertThat(lookups).hasValue(0);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "ab", "bad-handle", "UPPER", "abcdefghijklmnopqrstuvwxy"})
    void aMalformedHandleIsInvalidWithoutALookup(String malformed) {
        AtomicInteger lookups = new AtomicInteger();
        assertThat(
                        HandleAvailability.of(
                                malformed,
                                "maika",
                                () -> {
                                    lookups.incrementAndGet();
                                    return true;
                                }))
                .isEqualTo(HandleAvailability.INVALID);
        assertThat(HandleAvailability.INVALID.available()).isFalse();
        assertThat(lookups).hasValue(0);
    }

    @Test
    void theCallersOwnHandleIsCurrentEvenWhenReserved() {
        assertThat(HandleAvailability.of("maika", "maika", HELD))
                .isEqualTo(HandleAvailability.CURRENT);
        // Seed staff accounts carry reserved handles: keeping one is always allowed.
        assertThat(HandleAvailability.of("admin", "admin", FREE))
                .isEqualTo(HandleAvailability.CURRENT);
        assertThat(HandleAvailability.CURRENT.available()).isTrue();
    }

    @Test
    void theCallersOwnHandleIsNeverLookedUp() {
        AtomicInteger lookups = new AtomicInteger();
        HandleAvailability.of(
                "maika",
                "maika",
                () -> {
                    lookups.incrementAndGet();
                    return true;
                });
        assertThat(lookups).hasValue(0);
    }
}
