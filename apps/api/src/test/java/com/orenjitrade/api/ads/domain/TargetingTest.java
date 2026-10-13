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

/** Targeting rules: AND across kinds, OR within a kind, public codes only (ADR 0017). */
class TargetingTest {

    static AdContext context(
            @Nullable String game,
            Set<String> interests,
            @Nullable String region,
            @Nullable String country,
            @Nullable String subdivision,
            Set<String> tags,
            String plan) {
        return new AdContext(
                PlacementKey.MAP_PANEL,
                game,
                interests,
                region,
                country,
                subdivision,
                tags,
                plan,
                null,
                Instant.parse("2026-09-30T12:00:00Z"));
    }

    static AdContext anywhere(@Nullable String game, Set<String> interests, String plan) {
        return context(game, interests, null, null, null, Set.of(), plan);
    }

    @Test
    void kindsCombineWithAndValuesWithOr() {
        List<Rule> rules =
                List.of(
                        new Rule(TargetingKind.GAME, "pokemon"),
                        new Rule(TargetingKind.GAME, "yugioh"),
                        new Rule(TargetingKind.PLAN, "FREE"));
        assertThat(Targeting.matches(rules, anywhere("yugioh", Set.of(), "FREE"))).isTrue();
        assertThat(Targeting.matches(rules, anywhere("mtg", Set.of(), "FREE"))).isFalse();
        assertThat(Targeting.matches(rules, anywhere("pokemon", Set.of(), "PREMIUM"))).isFalse();
        assertThat(Targeting.matches(List.of(), anywhere(null, Set.of(), "ANONYMOUS")))
                .as("no rules targets everybody")
                .isTrue();
    }

    @Test
    void interestGamesApplyWhenNoGameIsRequested() {
        List<Rule> rules = List.of(new Rule(TargetingKind.GAME, "pokemon"));
        assertThat(Targeting.matches(rules, anywhere(null, Set.of("pokemon", "mtg"), "FREE")))
                .isTrue();
        assertThat(Targeting.matches(rules, anywhere("mtg", Set.of("pokemon"), "FREE")))
                .as("the requested game wins over interests")
                .isFalse();
    }

    @Test
    void regionsCountriesAndSubdivisionsCompareCodes() {
        AdContext quebec =
                context(null, Set.of(), "americas-north", "CA", "CA-QC", Set.of(), "FREE");
        assertThat(
                        Targeting.matches(
                                List.of(new Rule(TargetingKind.REGION, "americas-north")), quebec))
                .isTrue();
        assertThat(Targeting.matches(List.of(new Rule(TargetingKind.REGION, "europe")), quebec))
                .isFalse();
        assertThat(Targeting.matches(List.of(new Rule(TargetingKind.COUNTRY, "ca")), quebec))
                .isTrue();
        assertThat(
                        Targeting.matches(
                                List.of(
                                        new Rule(TargetingKind.SUBDIVISION, "CA-ON"),
                                        new Rule(TargetingKind.SUBDIVISION, "CA-QC")),
                                quebec))
                .isTrue();
        assertThat(
                        Targeting.matches(
                                List.of(
                                        new Rule(TargetingKind.REGION, "americas-north"),
                                        new Rule(TargetingKind.SUBDIVISION, "CA-ON")),
                                quebec))
                .as("AND across kinds")
                .isFalse();
        AdContext signedOut = context(null, Set.of(), "europe", null, null, Set.of(), "ANONYMOUS");
        assertThat(Targeting.matches(List.of(new Rule(TargetingKind.COUNTRY, "FR")), signedOut))
                .as("no country known: a country rule never matches")
                .isFalse();
        assertThat(Targeting.REGION_CODE.matcher("americas-north").matches()).isTrue();
        assertThat(Targeting.COUNTRY_CODE.matcher("CA").matches()).isTrue();
        assertThat(Targeting.SUBDIVISION_CODE.matcher("CA-QC").matches()).isTrue();
        assertThat(Targeting.SUBDIVISION_CODE.matcher("PR").matches()).isTrue();
        assertThat(Targeting.SUBDIVISION_CODE.matcher("45.5,-73.5").matches()).isFalse();
        assertThat(Targeting.REGION_CODE.matcher("Montréal").matches()).isFalse();
    }

    @Test
    void tagsAndPlansCompareExactly() {
        AdContext context =
                context(null, Set.of(), null, null, null, Set.of("sealed", "trader"), "PREMIUM");
        assertThat(Targeting.matches(List.of(new Rule(TargetingKind.TAG, "sealed")), context))
                .isTrue();
        assertThat(Targeting.matches(List.of(new Rule(TargetingKind.TAG, "vintage")), context))
                .isFalse();
        assertThat(Targeting.matches(List.of(new Rule(TargetingKind.PLAN, "premium")), context))
                .isTrue();
    }
}
