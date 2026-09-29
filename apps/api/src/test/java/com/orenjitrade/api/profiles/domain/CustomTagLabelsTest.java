package com.orenjitrade.api.profiles.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** Custom tag label rules and slugs. */
class CustomTagLabelsTest {

    @Test
    void normalisesWhitespace() {
        assertThat(CustomTagLabels.normalise("  Cube   drafter ")).isEqualTo("Cube drafter");
    }

    @Test
    void slugsAreAccentFreeLowerCaseAndDashed() {
        assertThat(CustomTagLabels.slugOf("Cube Drafter")).isEqualTo("cube-drafter");
        assertThat(CustomTagLabels.slugOf("Pokémon TCG")).isEqualTo("pokemon-tcg");
        assertThat(CustomTagLabels.slugOf("Trades & Sales")).isEqualTo("trades-sales");
        assertThat(CustomTagLabels.slugOf("--Retro--")).isEqualTo("retro");
    }

    @Test
    void validatesLengthAndCharacters() {
        assertThat(CustomTagLabels.problem("Cube drafter")).isEmpty();
        assertThat(CustomTagLabels.problem("Échanges")).isEmpty();
        assertThat(CustomTagLabels.problem("A")).isPresent();
        assertThat(CustomTagLabels.problem("x".repeat(25))).isPresent();
        assertThat(CustomTagLabels.problem("<script>")).isPresent();
        assertThat(CustomTagLabels.problem("-dash first")).isPresent();
    }
}
