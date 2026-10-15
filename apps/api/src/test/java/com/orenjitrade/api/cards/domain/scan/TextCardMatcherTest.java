package com.orenjitrade.api.cards.domain.scan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.orenjitrade.api.cards.domain.CatalogPrintingRef;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.games.domain.GameService;
import com.orenjitrade.api.games.domain.GameView;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Every matching rule of the camera scan (owner spec 2026-10-15, section 3.5) on an in-memory
 * catalog: exact codes, old codes, a missing dash, look-alike characters only when the catalog
 * confirms them, the name, the decisions between them, English cards only, the statuses and the
 * answer's fields, in a few grouped lookups.
 */
class TextCardMatcherTest {

    private InMemoryScanCatalog catalog;
    private TextCardMatcher matcher;

    @BeforeEach
    void matcher() {
        catalog = new InMemoryScanCatalog();
        GameService games = mock(GameService.class);
        GameView yugioh = mock(GameView.class);
        when(yugioh.id()).thenReturn(InMemoryScanCatalog.YUGIOH);
        when(yugioh.isActive()).thenReturn(true);
        when(games.find("yugioh")).thenReturn(Optional.of(yugioh));
        matcher = new TextCardMatcher(catalog, games);
    }

    private ScanMatch match(List<String> codes, List<String> names) {
        return matcher.match(new ScanQuery("yugioh", codes, names));
    }

    private UUID only(InMemoryScanCatalog.Card card, String code) {
        List<CatalogPrintingRef> refs = catalog.of(card, code);
        assertThat(refs).hasSize(1);
        return refs.get(0).id();
    }

    private static List<UUID> otherCards(ScanMatch match) {
        return match.otherMatches().stream().map(ScanMatch.OtherMatch::cardId).toList();
    }

    // ---------------------------------------------------------------------------------------
    // Exact codes
    // ---------------------------------------------------------------------------------------

    @Test
    void aCleanReadIsFoundWithEveryEnglishPrintingNewestFirstInFourLookups() {
        ScanMatch match = match(List.of("zacr-en036"), List.of("Yew Flowers & Velvet Breeze"));

        assertThat(match.status()).isEqualTo(ScanStatus.FOUND);
        assertThat(match.reason()).isNull();
        assertThat(match.card().id()).isEqualTo(catalog.yew.id());
        assertThat(match.card().name()).isEqualTo("Yew Flowers & Velvet Breeze");
        assertThat(match.card().imageUrl()).startsWith("/api/v1/public/card-images/");
        assertThat(match.printing().id()).isEqualTo(only(catalog.yew, "ZACR-EN036"));
        assertThat(match.printing().printingCode()).isEqualTo("ZACR-EN036");
        assertThat(match.printing().setName()).isEqualTo("Lantern Crisis");
        assertThat(match.printing().rarity()).isEqualTo("Secret Rare");
        assertThat(match.rarities()).isEmpty();
        // Every English printing, newest set first: never the French one.
        assertThat(match.printings())
                .extracting(ScanMatch.Printing::printingCode)
                .containsExactly("ZA01-EN008", "ZA01-EN008", "ZACR-EN036");
        // The codes one look-alike character away belong to other cards (6/5 and 6/8).
        assertThat(match.otherMatches())
                .extracting(ScanMatch.OtherMatch::cardId)
                .contains(catalog.lyra.id(), catalog.skye.id())
                .doesNotContain(catalog.yew.id(), catalog.otherGame.id());
        assertThat(match.otherMatches())
                .filteredOn(other -> other.cardId().equals(catalog.lyra.id()))
                .singleElement()
                .satisfies(
                        lyra -> {
                            assertThat(lyra.kind()).isEqualTo(ScanOtherMatchKind.CODE);
                            assertThat(lyra.printingCode()).isEqualTo("ZACR-EN038");
                            assertThat(lyra.setName()).isEqualTo("Lantern Crisis");
                            assertThat(lyra.printingId())
                                    .isEqualTo(only(catalog.lyra, "ZACR-EN038"));
                            assertThat(lyra.rarity()).isEqualTo("Super Rare");
                        });
        assertThat(match.read().codes()).containsExactly("ZACR-EN036");
        assertThat(match.read().names()).containsExactly("Yew Flowers & Velvet Breeze");
        // Grouped: one lookup of every code form and variant, one of the names, one of the
        // candidates' printings, one of their summaries.
        assertThat(catalog.calls)
                .containsEntry("printingsByCodes", 1)
                .containsEntry("cardsByNames", 1)
                .containsEntry("printingsOfCards", 1)
                .containsEntry("cards", 1);
    }

    @Test
    void withoutANameTheCodeDecidesAndAnotherGameNeverCompetes() {
        ScanMatch match = match(List.of("ZACR-EN036"), List.of());
        assertThat(match.status()).isEqualTo(ScanStatus.FOUND);
        assertThat(match.card().id()).isEqualTo(catalog.yew.id());
        assertThat(catalog.calls).doesNotContainKey("cardsByNames");
        assertThat(otherCards(match)).doesNotContain(catalog.otherGame.id());
    }

    @Test
    void aCodeInSeveralRaritiesAsksForTheRarity() {
        ScanMatch match = match(List.of("ZA01-EN075"), List.of("Inkshade Interference"));

        assertThat(match.status()).isEqualTo(ScanStatus.PICK_RARITY);
        assertThat(match.card().id()).isEqualTo(catalog.interference.id());
        assertThat(match.printing()).isNull();
        assertThat(match.rarities()).hasSize(7);
        assertThat(match.rarities())
                .extracting(ScanMatch.Printing::rarity)
                .containsExactlyInAnyOrder(InMemoryScanCatalog.ZA01_RARITIES);
        assertThat(match.rarities())
                .extracting(ScanMatch.Printing::printingCode)
                .containsOnly("ZA01-EN075");
        assertThat(match.printings()).hasSize(8);
        assertThat(match.printings().get(7).printingCode()).isEqualTo("ZLOD-EN077");
    }

    @Test
    void oldCodesAreFoundInTheirOtherForm() {
        ScanMatch northAmerican = match(List.of("ZOB-005"), List.of());
        assertThat(northAmerican.status()).isEqualTo(ScanStatus.FOUND);
        assertThat(northAmerican.printing().printingCode()).isEqualTo("ZOB-EN005");

        ScanMatch europe = match(List.of("ZOB-E005"), List.of());
        assertThat(europe.status()).isEqualTo(ScanStatus.FOUND);
        assertThat(europe.card().id()).isEqualTo(catalog.darkMoonseer.id());

        ScanMatch withRegion = match(List.of("ZOB-EN001"), List.of("Pale-Moon Frost Dragon"));
        assertThat(withRegion.status()).isEqualTo(ScanStatus.FOUND);
        assertThat(withRegion.printing().printingCode()).isEqualTo("ZOB-001");
    }

    @Test
    void aMissingDashIsTriedAtEachPlace() {
        ScanMatch match = match(List.of("ZOB005"), List.of());
        assertThat(match.status()).isEqualTo(ScanStatus.FOUND);
        assertThat(match.card().id()).isEqualTo(catalog.darkMoonseer.id());
        assertThat(match.read().codes()).containsExactly("ZOB005");

        assertThat(match(List.of("ZACR EN036"), List.of()).card().id()).isEqualTo(catalog.yew.id());
    }

    // ---------------------------------------------------------------------------------------
    // Look-alikes
    // ---------------------------------------------------------------------------------------

    @Test
    void lookAlikeCharactersCountWhenTheCatalogConfirmsThemInOneLookup() {
        ScanMatch match = match(List.of("ZAO1-ENO75"), List.of());

        assertThat(match.status()).isEqualTo(ScanStatus.PICK_RARITY);
        assertThat(match.card().id()).isEqualTo(catalog.interference.id());
        assertThat(match.rarities()).hasSize(7);
        assertThat(catalog.calls).containsEntry("printingsByCodes", 1);
        assertThat(catalog.codeLookups.get(0)).contains("ZA01-EN075").hasSizeGreaterThan(10);

        ScanMatch withName = match(List.of("ZACR-EN03G"), List.of("Yew Flowers & Velvet Breeze"));
        assertThat(withName.status()).isEqualTo(ScanStatus.FOUND);
        assertThat(withName.printing().printingCode()).isEqualTo("ZACR-EN036");

        // G/6, and the only variant the catalog has: accepted without a name.
        ScanMatch alone = match(List.of("ZACR-EN03G"), List.of());
        assertThat(alone.status()).isEqualTo(ScanStatus.FOUND);
        assertThat(alone.card().id()).isEqualTo(catalog.yew.id());
    }

    @Test
    void withoutANameALookAlikeCountsOnlyWhenItIsTheOnlyOne() {
        // ZD5-EN001: S/5 gives ZDS-EN001, D/0 gives Z05-EN001, both in the catalog.
        ScanMatch match = match(List.of("ZD5-EN001"), List.of());

        assertThat(match.status()).isEqualTo(ScanStatus.NOT_FOUND);
        assertThat(match.reason()).isEqualTo(ScanNotFoundReason.AMBIGUOUS);
        assertThat(match.card()).isNull();
        assertThat(match.printings()).isEmpty();
        assertThat(otherCards(match))
                .containsExactlyInAnyOrder(catalog.swordDancer.id(), catalog.shadowOracle.id());
        assertThat(match.otherMatches())
                .allSatisfy(other -> assertThat(other.kind()).isEqualTo(ScanOtherMatchKind.CODE));

        // The name chooses between them.
        ScanMatch named = match(List.of("ZD5-EN001"), List.of("Shadow Oracle"));
        assertThat(named.status()).isEqualTo(ScanStatus.FOUND);
        assertThat(named.printing().printingCode()).isEqualTo("Z05-EN001");
        assertThat(otherCards(named)).contains(catalog.swordDancer.id());
    }

    @Test
    void theWiderLookAlikesAreShownButNeverAcceptedAlone() {
        // ZACR-EN033 is no code; 3/8 points to Lyra, which is only shown.
        ScanMatch match = match(List.of("ZACR-EN033"), List.of());

        assertThat(match.status()).isEqualTo(ScanStatus.NOT_FOUND);
        assertThat(match.reason()).isEqualTo(ScanNotFoundReason.NO_MATCH);
        assertThat(otherCards(match)).contains(catalog.lyra.id());
        assertThat(match.otherMatches())
                .allSatisfy(other -> assertThat(other.kind()).isEqualTo(ScanOtherMatchKind.CODE));
    }

    // ---------------------------------------------------------------------------------------
    // The name
    // ---------------------------------------------------------------------------------------

    @Test
    void aNameAloneFindsTheCardAndItsPrintingOnlyWhenItHasOne() {
        ScanMatch several = match(List.of(), List.of("Inkshade Interference"));
        assertThat(several.status()).isEqualTo(ScanStatus.PICK_PRINTING);
        assertThat(several.card().id()).isEqualTo(catalog.interference.id());
        assertThat(several.printing()).isNull();
        assertThat(several.rarities()).isEmpty();
        assertThat(several.printings()).hasSize(8);
        assertThat(catalog.calls).doesNotContainKey("printingsByCodes");

        ScanMatch single = match(List.of(), List.of("Fable Tide - Lyra"));
        assertThat(single.status()).isEqualTo(ScanStatus.FOUND);
        assertThat(single.printing().printingCode()).isEqualTo("ZACR-EN038");
        assertThat(otherCards(single)).contains(catalog.skye.id());

        // A misread letter: still close, and clearly ahead of the next Fable Tide.
        assertThat(match(List.of(), List.of("Fable Tide - Lyru")).card().id())
                .isEqualTo(catalog.lyra.id());
        assertThat(match(List.of(), List.of("  yew  flowers &   velvet breeze ")).status())
                .isEqualTo(ScanStatus.PICK_PRINTING);
    }

    @Test
    void anAmbiguousNameFindsNothingAndListsTheCandidates() {
        ScanMatch match = match(List.of(), List.of("Fable Tide"));

        assertThat(match.status()).isEqualTo(ScanStatus.NOT_FOUND);
        assertThat(match.reason()).isEqualTo(ScanNotFoundReason.AMBIGUOUS);
        assertThat(otherCards(match))
                .containsExactlyInAnyOrder(catalog.lyra.id(), catalog.skye.id());
        assertThat(match.otherMatches())
                .allSatisfy(other -> assertThat(other.kind()).isEqualTo(ScanOtherMatchKind.NAME));
    }

    @Test
    void whenTheNameClearlyPointsToAnotherCardTheNameWins() {
        // The code read is Lyra's, the name Yew Flowers's: Yew Flowers's printing one look-alike
        // character (6/8) from the read code.
        ScanMatch match = match(List.of("ZACR-EN038"), List.of("Yew Flowers & Velvet Breeze"));

        assertThat(match.status()).isEqualTo(ScanStatus.FOUND);
        assertThat(match.card().id()).isEqualTo(catalog.yew.id());
        assertThat(match.printing().printingCode()).isEqualTo("ZACR-EN036");
        assertThat(match.otherMatches().get(0).cardId()).isEqualTo(catalog.lyra.id());
        assertThat(match.otherMatches().get(0).kind()).isEqualTo(ScanOtherMatchKind.CODE);

        // No printing of the named card is near the code: the card is known, not its printing.
        ScanMatch far = match(List.of("ZOB-EN005"), List.of("Inkshade Interference"));
        assertThat(far.status()).isEqualTo(ScanStatus.PICK_PRINTING);
        assertThat(far.card().id()).isEqualTo(catalog.interference.id());
        assertThat(otherCards(far)).contains(catalog.darkMoonseer.id());
    }

    @Test
    void aNameCloseToNoCardCountsAsNoName() {
        ScanMatch match = match(List.of("ZACR-EN038"), List.of("xqzv wvvt"));
        assertThat(match.status()).isEqualTo(ScanStatus.FOUND);
        assertThat(match.card().id()).isEqualTo(catalog.lyra.id());
    }

    @Test
    void aCodeAndAnAmbiguousNameThatDisagreeFindNothing() {
        ScanMatch match = match(List.of("ZACR-EN036"), List.of("Fable Tide"));
        assertThat(match.status()).isEqualTo(ScanStatus.NOT_FOUND);
        assertThat(match.reason()).isEqualTo(ScanNotFoundReason.AMBIGUOUS);
        assertThat(otherCards(match).get(0)).isEqualTo(catalog.yew.id());
        assertThat(otherCards(match)).contains(catalog.lyra.id(), catalog.skye.id());
    }

    @Test
    void twoCodesTheFirstDecidesWithoutANameAndTheNameChoosesOtherwise() {
        ScanMatch first = match(List.of("ZACR-EN038", "ZACR-EN036"), List.of());
        assertThat(first.card().id()).isEqualTo(catalog.lyra.id());
        assertThat(otherCards(first)).contains(catalog.yew.id());

        ScanMatch named =
                match(List.of("ZACR-EN038", "ZACR-EN036"), List.of("Yew Flowers & Velvet Breeze"));
        assertThat(named.status()).isEqualTo(ScanStatus.FOUND);
        assertThat(named.printing().printingCode()).isEqualTo("ZACR-EN036");
        assertThat(catalog.calls).containsEntry("printingsByCodes", 2);
    }

    // ---------------------------------------------------------------------------------------
    // English only, nothing read, another game
    // ---------------------------------------------------------------------------------------

    @Test
    void aCodeOfAnotherLanguageIsNotFoundWhateverTheNameSaysAndNothingIsLookedUp() {
        ScanMatch french = match(List.of("ZACR-FR036"), List.of("Yew Flowers & Velvet Breeze"));

        assertThat(french.status()).isEqualTo(ScanStatus.NOT_FOUND);
        assertThat(french.reason()).isEqualTo(ScanNotFoundReason.OTHER_LANGUAGE);
        assertThat(french.card()).isNull();
        assertThat(french.printings()).isEmpty();
        assertThat(french.otherMatches()).as("never the English code").isEmpty();
        assertThat(french.read().codes()).containsExactly("ZACR-FR036");
        assertThat(catalog.totalCalls()).isZero();

        // A second code read does not bring the English card back either.
        assertThat(match(List.of("ZACR-EN036", "ZACR-FR036"), List.of()).status())
                .isEqualTo(ScanStatus.NOT_FOUND);
        assertThat(match(List.of("ZOB-F005"), List.of()).reason())
                .isEqualTo(ScanNotFoundReason.OTHER_LANGUAGE);
    }

    @Test
    void aFrenchPrintingInTheCatalogIsNeverMatched() {
        // The catalog knows ZACR-FR036; a read that cleans to it is refused above, and an English
        // read never reaches it as a look-alike or a printing of the card.
        ScanMatch match = match(List.of(), List.of("Yew Flowers & Velvet Breeze"));
        assertThat(match.printings())
                .extracting(ScanMatch.Printing::printingCode)
                .doesNotContain("ZACR-FR036");
        assertThat(catalog.codeLookups).isEmpty();
        ScanMatch code = match(List.of("ZACR-EN036"), List.of());
        assertThat(catalog.codeLookups.get(0)).doesNotContain("ZACR-FR036");
        assertThat(code.printings())
                .extracting(ScanMatch.Printing::printingCode)
                .doesNotContain("ZACR-FR036");
    }

    @Test
    void nothingReadOrJunkIsNotFound() {
        ScanMatch nothing = match(List.of(), List.of());
        assertThat(nothing.status()).isEqualTo(ScanStatus.NOT_FOUND);
        assertThat(nothing.reason()).isEqualTo(ScanNotFoundReason.NOTHING_READ);
        assertThat(catalog.totalCalls()).isZero();

        assertThat(match(List.of("  ", "--"), List.of(" ")).reason())
                .isEqualTo(ScanNotFoundReason.NOTHING_READ);
        assertThat(match(List.of("ATK"), List.of()).reason())
                .isEqualTo(ScanNotFoundReason.NOTHING_READ);

        ScanMatch junk = match(List.of("ATK/2500"), List.of("@@ ##"));
        assertThat(junk.status()).isEqualTo(ScanStatus.NOT_FOUND);
        assertThat(junk.reason()).isEqualTo(ScanNotFoundReason.NO_MATCH);
        assertThat(junk.otherMatches()).isEmpty();
    }

    @Test
    void anotherGameIsRefused() {
        assertThatThrownBy(() -> matcher.match(new ScanQuery("pokemon", List.of(), List.of())))
                .isInstanceOfSatisfying(
                        ApiException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_FAILED));
        assertThat(matcher.match(new ScanQuery(" YuGiOh ", List.of(), List.of())).status())
                .isEqualTo(ScanStatus.NOT_FOUND);
    }

    @Test
    void atMostSixOtherMatchesAndThreeCodesAndNames() {
        ScanMatch match =
                match(
                        List.of("ZACR-EN033", "ZACR-EN03B", "ZD5-EN001", "ZA01-EN075"),
                        List.of("Fable Tide", "Shadow", "Pale", "Dark Moonseer"));
        assertThat(match.otherMatches()).hasSizeLessThanOrEqualTo(ScanRules.MAX_OTHER_MATCHES);
        assertThat(match.read().codes()).hasSize(3);
        assertThat(match.read().names()).hasSize(3);
    }
}
