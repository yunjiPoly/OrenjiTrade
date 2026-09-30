package com.orenjitrade.api.ads.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.ads.domain.AdEnums.PlacementKey;
import com.orenjitrade.api.ads.domain.AdEnums.TargetingKind;
import com.orenjitrade.api.ads.domain.Targeting.Rule;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.Test;

/** Targeting rules: AND across kinds, OR within a kind, public values only. */
class TargetingTest {

    static AdContext context(
            @Nullable String game,
            Set<String> interests,
            @Nullable String cell,
            @Nullable String label,
            Set<String> tags,
            String plan) {
        return new AdContext(
                PlacementKey.MAP_PANEL,
                game,
                interests,
                cell,
                label,
                tags,
                plan,
                null,
                Instant.parse("2026-09-30T12:00:00Z"));
    }

    @Test
    void kindsCombineWithAndValuesWithOr() {
        List<Rule> rules =
                List.of(
                        new Rule(TargetingKind.GAME, "pokemon"),
                        new Rule(TargetingKind.GAME, "yugioh"),
                        new Rule(TargetingKind.PLAN, "FREE"));
        assertThat(
                        Targeting.matches(
                                rules, context("yugioh", Set.of(), null, null, Set.of(), "FREE")))
                .isTrue();
        assertThat(Targeting.matches(rules, context("mtg", Set.of(), null, null, Set.of(), "FREE")))
                .isFalse();
        assertThat(
                        Targeting.matches(
                                rules,
                                context("pokemon", Set.of(), null, null, Set.of(), "PREMIUM")))
                .isFalse();
        assertThat(
                        Targeting.matches(
                                List.of(),
                                context(null, Set.of(), null, null, Set.of(), "ANONYMOUS")))
                .as("no rules targets everybody")
                .isTrue();
    }

    @Test
    void interestGamesApplyWhenNoGameIsRequested() {
        List<Rule> rules = List.of(new Rule(TargetingKind.GAME, "pokemon"));
        assertThat(
                        Targeting.matches(
                                rules,
                                context(
                                        null,
                                        Set.of("pokemon", "mtg"),
                                        null,
                                        null,
                                        Set.of(),
                                        "FREE")))
                .isTrue();
        assertThat(
                        Targeting.matches(
                                rules,
                                context("mtg", Set.of("pokemon"), null, null, Set.of(), "FREE")))
                .as("the requested game wins over interests")
                .isFalse();
    }

    @Test
    void regionLabelsMatchWholeLabelsPartsAndTrailingWordsIgnoringAccents() {
        assertThat(Targeting.labelMatches("Plateau-Mont-Royal, Montréal", "Montréal")).isTrue();
        assertThat(Targeting.labelMatches("Plateau-Mont-Royal, Montréal", "montreal")).isTrue();
        assertThat(
                        Targeting.labelMatches(
                                "Plateau-Mont-Royal, Montréal", "Plateau-Mont-Royal, Montréal"))
                .isTrue();
        assertThat(Targeting.labelMatches("Downtown Montréal", "Montréal")).isTrue();
        assertThat(Targeting.labelMatches("Near Laval", "Laval")).isTrue();
        assertThat(Targeting.labelMatches("Mile End, Montréal", "End")).isFalse();
        assertThat(Targeting.labelMatches("Westmount", "Montréal")).isFalse();
        assertThat(Targeting.labelMatches(null, "Montréal")).isFalse();
        assertThat(Targeting.acceptableRegionLabel("Montréal")).isTrue();
        assertThat(Targeting.acceptableRegionLabel("45.522, -73.581")).isFalse();
    }

    @Test
    void cellsTagsAndPlansCompareExactly() {
        AdContext context =
                context(null, Set.of(), "r5058c-5438", null, Set.of("sealed", "trader"), "PREMIUM");
        assertThat(
                        Targeting.matches(
                                List.of(new Rule(TargetingKind.GEO_CELL, "r5058c-5438")), context))
                .isTrue();
        assertThat(
                        Targeting.matches(
                                List.of(new Rule(TargetingKind.GEO_CELL, "r5058c-5439")), context))
                .isFalse();
        assertThat(Targeting.matches(List.of(new Rule(TargetingKind.TAG, "sealed")), context))
                .isTrue();
        assertThat(Targeting.matches(List.of(new Rule(TargetingKind.PLAN, "premium")), context))
                .isTrue();
        assertThat(Targeting.GEO_CELL.matcher("r5058c-5438").matches()).isTrue();
        assertThat(Targeting.GEO_CELL.matcher("45.5,-73.5").matches()).isFalse();
    }
}
