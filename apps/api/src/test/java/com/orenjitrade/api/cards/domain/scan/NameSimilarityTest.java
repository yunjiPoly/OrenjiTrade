package com.orenjitrade.api.cards.domain.scan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import org.junit.jupiter.api.Test;

/** The name score: equal names, pg_trgm's similarity, a read cut short. */
class NameSimilarityTest {

    @Test
    void theSimilarityIsPgTrgmsOwn() {
        // The pg_trgm documentation's example: similarity('word', 'two words') = 0.36363637.
        assertThat(NameSimilarity.similarity("word", "two words"))
                .isCloseTo(4.0 / 11, within(1e-9));
        assertThat(NameSimilarity.similarity("abc", "abc")).isEqualTo(1);
        assertThat(NameSimilarity.similarity("", "abc")).isZero();
        assertThat(NameSimilarity.trigrams("ab")).containsExactlyInAnyOrder("  a", " ab", "ab ");
    }

    @Test
    void equalNamesScoreOneWhateverTheCaseAccentsAndSpaces() {
        assertThat(
                        NameSimilarity.score(
                                "YEW FLOWERS  & Velvet Breeze", "Yew Flowers & Velvet Breeze"))
                .isEqualTo(1);
        assertThat(NameSimilarity.score("Chevalier Epee-Miroir", "Chevalier Épée-Miroir"))
                .isEqualTo(1);
        assertThat(NameSimilarity.score("  ", "Yew Flowers & Velvet Breeze")).isZero();
    }

    @Test
    void aMisreadNameStaysCloseAndAnotherCardDoesNot() {
        assertThat(
                        NameSimilarity.score(
                                "Yew Fl0wers & Velvet Breeze", "Yew Flowers & Velvet Breeze"))
                .isGreaterThan(ScanRules.CLOSE);
        assertThat(NameSimilarity.score("Fable Tide - Lyru", "Fable Tide - Lyra"))
                .isGreaterThan(ScanRules.CLOSE);
        assertThat(NameSimilarity.score("Inkshade Interference", "Yew Flowers & Velvet Breeze"))
                .isLessThan(ScanRules.SHOWN);
    }

    @Test
    void aReadCutShortScoresTheShareOfTheNameItHolds() {
        double cut = NameSimilarity.score("Yew Flowers & Velvet", "Yew Flowers & Velvet Breeze");
        assertThat(cut).isGreaterThanOrEqualTo(20.0 / 27);
        assertThat(NameSimilarity.score("Ye", "Yew Flowers & Velvet Breeze"))
                .as("too short to be the start of a name")
                .isLessThan(ScanRules.CLOSE);
    }
}
