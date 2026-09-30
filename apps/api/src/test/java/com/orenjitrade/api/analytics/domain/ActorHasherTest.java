package com.orenjitrade.api.analytics.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Pseudonymous actor hashes. */
class ActorHasherTest {

    private static final UUID ALICE = UUID.fromString("00000000-0000-4000-8000-000000000001");
    private static final UUID BOB = UUID.fromString("00000000-0000-4000-8000-000000000002");

    @Test
    void stableHexPerAccountAndSalt() {
        ActorHasher hasher = new ActorHasher("salt-one");
        String alice = hasher.hash(ALICE);
        assertThat(alice).matches("[0-9a-f]{32}").isEqualTo(hasher.hash(ALICE));
        assertThat(alice).isNotEqualTo(hasher.hash(BOB));
        assertThat(alice).doesNotContain(ALICE.toString().replace("-", ""));
        assertThat(new ActorHasher("salt-two").hash(ALICE)).isNotEqualTo(alice);
        assertThat(hasher.hash(null)).isNull();
    }

    @Test
    void blankSaltIsRefused() {
        assertThatThrownBy(() -> new ActorHasher(" ")).isInstanceOf(IllegalArgumentException.class);
    }
}
