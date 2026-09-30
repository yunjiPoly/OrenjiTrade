package com.orenjitrade.api.moderation.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class ModerationRulesTest {

    @Test
    void ratePatternsParseCountAndWindow() {
        UUID id = UUID.randomUUID();
        RateRule rule = RateRule.parse(id, " 30/60 ", ModerationAction.BLOCK).orElseThrow();
        assertThat(rule.id()).isEqualTo(id);
        assertThat(rule.limit()).isEqualTo(30);
        assertThat(rule.windowSeconds()).isEqualTo(60);
        assertThat(rule.windowMillis()).isEqualTo(60_000L);
        assertThat(rule.action()).isEqualTo(ModerationAction.BLOCK);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "30", "0/60", "30/0", "-1/60", "abc/60", "30/60s", "1234567/60"})
    void invalidRatePatternsAreIgnored(String pattern) {
        assertThat(RateRule.parse(UUID.randomUUID(), pattern, ModerationAction.FLAG)).isEmpty();
    }

    @Test
    void digestsIgnoreCaseAccentsAndWhitespace() {
        String digest = ModerationService.digest("Hello  Wörld\n");
        assertThat(digest).hasSize(64).matches("[0-9a-f]+");
        assertThat(ModerationService.digest("hello world")).isEqualTo(digest);
        assertThat(ModerationService.digest("hello, world")).isNotEqualTo(digest);
    }

    @Test
    void decisionsKnowWhetherTheContentIsFlagged() {
        assertThat(ModerationDecision.ALLOWED.flagged()).isFalse();
        assertThat(ModerationDecision.BLOCKED.flagged()).isFalse();
        assertThat(ModerationDecision.BLOCKED.blocked()).isTrue();
        ModerationDecision flagged =
                new ModerationDecision(
                        false,
                        List.of(new ModerationDecision.PendingFlag(FlagReason.BANNED_TERM, null)));
        assertThat(flagged.flagged()).isTrue();
    }
}
