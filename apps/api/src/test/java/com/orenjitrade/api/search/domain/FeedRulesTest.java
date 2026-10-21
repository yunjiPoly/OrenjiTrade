package com.orenjitrade.api.search.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** The pure rules of Home's feed (stage R7): the window, the hour of a card, the note line. */
class FeedRulesTest {

    private static final Instant NOW = Instant.parse("2026-10-21T15:30:00Z");

    @Test
    void theWindowEndsThirtyDaysBackAndLeavesTheEdgeOut() {
        Instant start = FeedRules.windowStart(NOW, 30);
        assertThat(start).isEqualTo(Instant.parse("2026-09-21T15:30:00Z"));
        assertThat(FeedRules.inWindow(start, NOW, 30)).isFalse();
        assertThat(FeedRules.inWindow(start.plusSeconds(1), NOW, 30)).isTrue();
        assertThat(FeedRules.inWindow(NOW.minus(Duration.ofDays(31)), NOW, 30)).isFalse();
        assertThat(FeedRules.inWindow(NOW.minus(Duration.ofDays(29)), NOW, 30)).isTrue();
        assertThat(FeedRules.inWindow(NOW, NOW, 30)).isTrue();
        // The window is a setting: 7 days leaves out what 30 days keeps.
        assertThat(FeedRules.inWindow(NOW.minus(Duration.ofDays(8)), NOW, 7)).isFalse();
    }

    @Test
    void cardsOfTheSameClockHourShareAnHourAndTheNextHourStartsAnother() {
        long hour = FeedRules.hourOf(Instant.parse("2026-10-21T15:00:00Z"));
        assertThat(FeedRules.hourOf(Instant.parse("2026-10-21T15:59:59.999Z"))).isEqualTo(hour);
        assertThat(FeedRules.hourOf(Instant.parse("2026-10-21T15:30:00Z"))).isEqualTo(hour);
        assertThat(FeedRules.hourOf(Instant.parse("2026-10-21T16:00:00Z"))).isEqualTo(hour + 1);
        assertThat(FeedRules.hourOf(Instant.parse("2026-10-21T14:59:59Z"))).isEqualTo(hour - 1);
        assertThat(hour).isEqualTo(Instant.parse("2026-10-21T15:00:00Z").getEpochSecond() / 3600);
    }

    @Test
    void aGroupKeepsItsIdWhateverCardsItHolds() {
        UUID owner = UUID.fromString("00000000-0000-4000-8000-000000000005");
        UUID other = UUID.fromString("00000000-0000-4000-8000-000000000002");
        long hour = FeedRules.hourOf(NOW);
        assertThat(FeedRules.cardsPostId(owner, hour))
                .isEqualTo(FeedRules.cardsPostId(owner, hour));
        assertThat(FeedRules.cardsPostId(owner, hour))
                .isNotEqualTo(FeedRules.cardsPostId(owner, hour + 1))
                .isNotEqualTo(FeedRules.cardsPostId(other, hour));
        // md5('NEW_CARDS:<owner>:<hour>') read as a UUID, as PostgreSQL's md5(...)::uuid does.
        assertThat(FeedRules.cardsPostId(owner, 0))
                .hasToString("8fc57a1b-7bec-baa6-e5e5-897ea5cb7ef0");
    }

    @Test
    void theNoteLineIsTheFirstLineCutAtOneHundredTwentyCharacters() {
        assertThat(FeedRules.noteFirstLine(null)).isNull();
        assertThat(FeedRules.noteFirstLine("")).isNull();
        assertThat(FeedRules.noteFirstLine("  \n \n")).isNull();
        assertThat(FeedRules.noteFirstLine("14 cards, NM, in sleeves.\nShips tracked."))
                .isEqualTo("14 cards, NM, in sleeves.");
        assertThat(FeedRules.noteFirstLine("\n  Looking for trades.  \r\nAll NM."))
                .isEqualTo("Looking for trades.");
        String exact = "x".repeat(120);
        assertThat(FeedRules.noteFirstLine(exact)).isEqualTo(exact);
        String cut = FeedRules.noteFirstLine("y".repeat(121));
        assertThat(cut).hasSize(120).endsWith("…").startsWith("y".repeat(119));
        // Characters, not UTF-16 units: an emoji counts once and is never split.
        String emoji = "🃏".repeat(130);
        String cutEmoji = FeedRules.noteFirstLine(emoji);
        assertThat(cutEmoji.codePointCount(0, cutEmoji.length())).isEqualTo(120);
        assertThat(cutEmoji).endsWith("🃏…");
    }

    @Test
    void aPageHoldsTwentyPostsByDefaultAndFiftyAtMost() {
        assertThat(FeedRules.limit(null)).isEqualTo(20);
        assertThat(FeedRules.limit(5)).isEqualTo(5);
        assertThat(FeedRules.limit(0)).isEqualTo(1);
        assertThat(FeedRules.limit(500)).isEqualTo(50);
    }

    @Test
    void theKindFilterKeepsItsKinds() {
        assertThat(FeedFilter.parse(null)).contains(FeedFilter.ALL);
        assertThat(FeedFilter.parse(" ")).contains(FeedFilter.ALL);
        assertThat(FeedFilter.parse("deck_cores")).contains(FeedFilter.DECK_CORES);
        assertThat(FeedFilter.parse("DECK_CORE")).isEmpty();
        assertThat(FeedFilter.parse("everything")).isEmpty();
        assertThat(FeedFilter.ALL.kinds())
                .containsExactlyInAnyOrder(
                        FeedPostKind.NEW_CARDS, FeedPostKind.WANTED, FeedPostKind.DECK_CORE);
        assertThat(FeedFilter.WANTED.kinds()).containsExactly(FeedPostKind.WANTED);
        assertThat(FeedFilter.DECK_CORES.kinds()).containsExactly(FeedPostKind.DECK_CORE);
        assertThat(FeedFilter.NEW_CARDS.kinds()).containsExactly(FeedPostKind.NEW_CARDS);
    }
}
