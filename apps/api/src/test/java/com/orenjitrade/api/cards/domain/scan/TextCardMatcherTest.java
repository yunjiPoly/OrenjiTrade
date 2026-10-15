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
    }

    @Test
    void whenTheNameWinsOverACodeNotItsOwnACardWithOnePrintingIsStillToPick() {
        // A code the catalog does not know (a printing it lacks, a garbled read) with Lyra's name:
        // Lyra has a single printing, but the code read is not it, so its printing is to pick (one
        // tap), never "Found" unchecked.
        ScanMatch unknown = match(List.of("ZZZZ-EN999"), List.of("Fable Tide - Lyra"));
        assertThat(unknown.status()).isEqualTo(ScanStatus.PICK_PRINTING);
        assertThat(unknown.card().id()).isEqualTo(catalog.lyra.id());
        assertThat(unknown.printing()).isNull();
        assertThat(unknown.rarities()).isEmpty();
        assertThat(unknown.printings())
                .extracting(ScanMatch.Printing::printingCode)
                .containsExactly("ZACR-EN038");

        // Pale-Moon has one printing too, the code read is two look-alike cards' (no name close).
        assertThat(match(List.of("ZD5-EN001"), List.of("Pale-Moon Frost Dragon")).status())
                .isEqualTo(ScanStatus.PICK_PRINTING);

        // With no code read, the name of a card with one printing finds it.
        assertThat(match(List.of(), List.of("Fable Tide - Lyra")).status())
                .isEqualTo(ScanStatus.FOUND);
        // A code one look-alike character from its printing (6/8) is its printing.
        ScanMatch near = match(List.of("ZACR-EN036"), List.of("Fable Tide - Lyra"));
        assertThat(near.status()).isEqualTo(ScanStatus.FOUND);
        assertThat(near.printing().printingCode()).isEqualTo("ZACR-EN038");
    }

    @Test
    void aCodeReadThatIsAnotherCardsPrintingIsNotOverruledByANameWithNoPrintingAtOrNearIt() {
        // The real-card gate (2026-10-15): the name of a card lying behind the photographed one
        // won over the code read. Coral Lantern Wisp's code with Brinemoss Warden's name, whose
        // printings are neither that code nor one look-alike character from it: not found, both
        // cards the candidates, the named one first; never Brinemoss Warden's ZBM1-EN137, one
        // (non look-alike) character from the code read.
        ScanMatch wisp = match(List.of("ZBM1-EN139"), List.of("Brinemoss Warden"));
        assertThat(wisp.status()).isEqualTo(ScanStatus.NOT_FOUND);
        assertThat(wisp.reason()).isEqualTo(ScanNotFoundReason.AMBIGUOUS);
        assertThat(wisp.card()).isNull();
        assertThat(wisp.printings()).isEmpty();
        assertThat(otherCards(wisp)).startsWith(catalog.brinemoss.id(), catalog.coralWisp.id());
        assertThat(wisp.otherMatches().get(1).kind()).isEqualTo(ScanOtherMatchKind.CODE);
        assertThat(wisp.otherMatches().get(1).printingCode()).isEqualTo("ZBM1-EN139");

        // The same with the sample cards: Inkshade Interference's code with Lyra's name, Dark
        // Moonseer's with Inkshade Interference's (before, the name won: Pick printing).
        ScanMatch lyra = match(List.of("ZA01-EN075"), List.of("Fable Tide - Lyra"));
        assertThat(lyra.status()).isEqualTo(ScanStatus.NOT_FOUND);
        assertThat(lyra.reason()).isEqualTo(ScanNotFoundReason.AMBIGUOUS);
        assertThat(otherCards(lyra)).startsWith(catalog.lyra.id(), catalog.interference.id());
        ScanMatch far = match(List.of("ZOB-EN005"), List.of("Inkshade Interference"));
        assertThat(far.reason()).isEqualTo(ScanNotFoundReason.AMBIGUOUS);
        assertThat(otherCards(far))
                .startsWith(catalog.interference.id(), catalog.darkMoonseer.id());

        // A printing one look-alike character from the code read: the name still wins.
        ScanMatch yew = match(List.of("ZACR-EN038"), List.of("Yew Flowers & Velvet Breeze"));
        assertThat(yew.status()).isEqualTo(ScanStatus.FOUND);
        assertThat(yew.printing().printingCode()).isEqualTo("ZACR-EN036");
    }

    @Test
    void whenTheNameWinsWithoutACatalogCodeReadItTakesItsOnlyPrintingOneCharacterAway() {
        // The real-card gate (2026-10-15): codes read with their last digit lost, their first
        // letter lost, or a look-alike and a misread digit, the card's name read clearly. Before,
        // its printing was to pick.
        catalog.calls.clear();
        ScanMatch lost = match(List.of("ZBM1-EN13"), List.of("Brinemoss Warden"));
        assertThat(lost.status()).isEqualTo(ScanStatus.FOUND);
        assertThat(lost.card().id()).isEqualTo(catalog.brinemoss.id());
        assertThat(lost.printing().printingCode()).isEqualTo("ZBM1-EN137");
        // No lookup more than any read costs.
        assertThat(catalog.calls)
                .containsEntry("printingsByCodes", 1)
                .containsEntry("cardsByNames", 1)
                .containsEntry("printingsOfCards", 1)
                .containsEntry("cards", 1)
                .hasSize(4);

        ScanMatch first = match(List.of("AGV-EN056"), List.of("Coilglass Shrine"));
        assertThat(first.status()).isEqualTo(ScanStatus.FOUND);
        assertThat(first.printing().printingCode()).isEqualTo("ZAGV-EN056");

        // ZRAO-ENO1S: its look-alike ZRA0-EN015 is one character from ZRA0-EN013.
        ScanMatch misread = match(List.of("ZRAO-ENO1S"), List.of("Gleamscale Drake"));
        assertThat(misread.status()).isEqualTo(ScanStatus.FOUND);
        assertThat(misread.printing().printingCode()).isEqualTo("ZRA0-EN013");

        // Two printings one character away: the printing is to pick.
        ScanMatch two = match(List.of("ZRG1-EN02"), List.of("Twofold Reef Golem"));
        assertThat(two.status()).isEqualTo(ScanStatus.PICK_PRINTING);
        assertThat(two.card().id()).isEqualTo(catalog.reefGolem.id());

        // Two characters away, or a code the catalog does not know far from every printing.
        assertThat(match(List.of("ZBM-EN13"), List.of("Brinemoss Warden")).status())
                .isEqualTo(ScanStatus.PICK_PRINTING);
        assertThat(match(List.of("ZZZZ-EN999"), List.of("Brinemoss Warden")).status())
                .isEqualTo(ScanStatus.PICK_PRINTING);
        // Never when a code read is another card's printing as read: Coral Lantern Wisp's
        // ZBM1-EN139 is one character from Brinemoss Warden's ZBM1-EN137.
        ScanMatch other = match(List.of("ZBM1-EN139"), List.of("Brinemoss Warden"));
        assertThat(other.status()).isNotEqualTo(ScanStatus.FOUND);
        assertThat(other.printing()).isNull();

        assertThat(ScanRules.oneEditApart("ZBM1-EN137", "ZBM1-EN13")).isTrue();
        assertThat(ScanRules.oneEditApart("AGV-EN056", "ZAGV-EN056")).isTrue();
        assertThat(ScanRules.oneEditApart("ZRA0-EN013", "ZRA0-EN015")).isTrue();
        assertThat(ScanRules.oneEditApart("ZRA0-EN013", "ZRA0-EN013")).isFalse();
        assertThat(ScanRules.oneEditApart("ZBM1-EN137", "ZBM-EN13")).isFalse();
        assertThat(ScanRules.oneEditApart("ZBM1-EN137", "ZBM1-EN173")).isFalse();
    }

    @Test
    void aCodeCutShortAfterItsRegionTakesTheNamedCardsOnlyPrintingInThatSet() {
        // The real-card gate (2026-10-15): the code read cut after its region, the name clearly.
        catalog.calls.clear();
        ScanMatch cut = match(List.of("ZR04-EN"), List.of("Quillfeather Mage"));
        assertThat(cut.status()).isEqualTo(ScanStatus.FOUND);
        assertThat(cut.card().id()).isEqualTo(catalog.quillfeather.id());
        assertThat(cut.printing().printingCode()).isEqualTo("ZR04-EN015");
        assertThat(cut.read().codes()).containsExactly("ZR04-EN");
        assertThat(catalog.calls)
                .containsEntry("printingsByCodes", 1)
                .containsEntry("cardsByNames", 1)
                .containsEntry("printingsOfCards", 1)
                .containsEntry("cards", 1)
                .hasSize(4);
        // Look-alikes in its set part and the start of its number count.
        assertThat(match(List.of("ZRO4-ENO"), List.of("Quillfeather Mage")).printing())
                .extracting(ScanMatch.Printing::printingCode)
                .isEqualTo("ZR04-EN015");

        // Its number begun otherwise, a set without a printing of the card (the owner-reviewed
        // rule for a code none of the card's printings), or two of them in the set: to pick.
        for (List<String> codes : List.of(List.of("ZR04-EN1"), List.of("ZQ99-EN"))) {
            ScanMatch pick = match(codes, List.of("Quillfeather Mage"));
            assertThat(pick.status()).as("%s", codes).isEqualTo(ScanStatus.PICK_PRINTING);
            assertThat(pick.card().id()).isEqualTo(catalog.quillfeather.id());
        }
        assertThat(match(List.of("ZBM1-EN"), List.of("Brinemoss Warden")).status())
                .isEqualTo(ScanStatus.PICK_PRINTING);
        // With a whole code too (the phone never sends both), the codes decide as for any code
        // read: the cut one takes no printing in its set, and a whole code none of the card's
        // printings leaves its printing to pick.
        ScanMatch withWhole = match(List.of("ZR04-EN", "ZR04-EN999"), List.of("Quillfeather Mage"));
        assertThat(withWhole.status()).isEqualTo(ScanStatus.PICK_PRINTING);
        assertThat(withWhole.card().id()).isEqualTo(catalog.quillfeather.id());
        assertThat(withWhole.printing()).isNull();

        // Without a name it finds nothing.
        ScanMatch alone = match(List.of("ZR04-EN"), List.of());
        assertThat(alone.status()).isEqualTo(ScanStatus.NOT_FOUND);
        assertThat(alone.reason()).isEqualTo(ScanNotFoundReason.NO_MATCH);
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
    void aRegionOfAnotherLanguageReadWithLookAlikesIsNotFoundWhateverTheNameSays() {
        // Dark Moonseer and Pale-Moon have one printing each and their names are read clearly:
        // a German, Italian or Spanish code misread is still never their English printing.
        for (String code :
                List.of(
                        "ZOB-0E005",
                        "ZOB-OE005",
                        "ZOB-1T005",
                        "ZOB-LT005",
                        "ZOB-5P005",
                        "ZOB-5005",
                        "ZOB-1005",
                        "ZOB-6005")) {
            ScanMatch match = match(List.of(code), List.of("Dark Moonseer"));
            assertThat(match.status()).as(code).isEqualTo(ScanStatus.NOT_FOUND);
            assertThat(match.reason()).as(code).isEqualTo(ScanNotFoundReason.OTHER_LANGUAGE);
            assertThat(match.card()).isNull();
            assertThat(match.printings()).isEmpty();
            assertThat(match.otherMatches()).isEmpty();
            assertThat(match.read().codes()).containsExactly(code);
        }
        assertThat(match(List.of("ZOB-5001"), List.of("Pale-Moon Frost Dragon")).reason())
                .isEqualTo(ScanNotFoundReason.OTHER_LANGUAGE);
        // Yew Flowers has several printings: no Pick printing list of English ones either.
        ScanMatch yew = match(List.of("ZACR-0E036"), List.of("Yew Flowers & Velvet Breeze"));
        assertThat(yew.status()).isEqualTo(ScanStatus.NOT_FOUND);
        assertThat(yew.reason()).isEqualTo(ScanNotFoundReason.OTHER_LANGUAGE);
        assertThat(yew.printings()).isEmpty();
        assertThat(catalog.totalCalls()).as("nothing is looked up").isZero();
    }

    @Test
    void anotherLanguagesCodeReadWithoutItsDashOrWithASecondDashIsNotFoundWhateverTheNameSays() {
        // VR2-1: a German, Italian or old German code without its dash, its region as printed or
        // misread, or with a second dash before its number. Dark Moonseer (one printing) and Yew
        // Flowers (several) are read clearly: never their English printing, never a Pick printing
        // list of English printings.
        for (String code :
                List.of(
                        "ZOBDE005",
                        "ZOB0E005",
                        "ZOBIT005",
                        "ZOBG005",
                        "ZOB-DE-005",
                        "ZOB-0E-005",
                        "ZOB-G-005")) {
            ScanMatch match = match(List.of(code), List.of("Dark Moonseer"));
            assertThat(match.status()).as(code).isEqualTo(ScanStatus.NOT_FOUND);
            assertThat(match.reason()).as(code).isEqualTo(ScanNotFoundReason.OTHER_LANGUAGE);
            assertThat(match.card()).as(code).isNull();
            assertThat(match.printings()).as(code).isEmpty();
            assertThat(match.otherMatches()).as(code).isEmpty();
            assertThat(match.read().codes()).as(code).hasSize(1);
        }
        for (String code : List.of("ZACRDE036", "ZACR0E036", "ZACR-DE-036")) {
            ScanMatch yew = match(List.of(code), List.of("Yew Flowers & Velvet Breeze"));
            assertThat(yew.status()).as(code).isEqualTo(ScanStatus.NOT_FOUND);
            assertThat(yew.reason()).as(code).isEqualTo(ScanNotFoundReason.OTHER_LANGUAGE);
            assertThat(yew.printings()).as(code).isEmpty();
        }
        // Without a name either; and a second code read does not bring the English card back.
        assertThat(match(List.of("ZACRDE036"), List.of()).reason())
                .isEqualTo(ScanNotFoundReason.OTHER_LANGUAGE);
        assertThat(match(List.of("ZACR-EN036", "ZACRDE036"), List.of()).reason())
                .isEqualTo(ScanNotFoundReason.OTHER_LANGUAGE);
    }

    @Test
    void aReadWithoutItsDashIsEnglishWhenTheCatalogHasOneOfItsEnglishPlaces() {
        // ZMDE001: ZM-DE001 would be German, but the catalog has the old Europe print ZMD-E001.
        ScanMatch golem = match(List.of("ZMDE001"), List.of());
        assertThat(golem.status()).isEqualTo(ScanStatus.FOUND);
        assertThat(golem.card().id()).isEqualTo(catalog.europeGolem.id());
        assertThat(golem.printing().printingCode()).isEqualTo("ZMD-E001");
        assertThat(match(List.of("ZMDE001"), List.of("Old Europe Golem")).status())
                .isEqualTo(ScanStatus.FOUND);
        // W1: the catalog knows the set ZMD and no set ZM, so ZMDE0O1 is English and its
        // look-alike ZMD-E001 counts (batch B1 refused it as another language's).
        ScanMatch misread = match(List.of("ZMDE0O1"), List.of("Old Europe Golem"));
        assertThat(misread.status()).isEqualTo(ScanStatus.FOUND);
        assertThat(misread.printing().printingCode()).isEqualTo("ZMD-E001");
        // A second dash between an English region and the number is the same code.
        ScanMatch europe = match(List.of("ZOB-E-005"), List.of());
        assertThat(europe.status()).isEqualTo(ScanStatus.FOUND);
        assertThat(europe.printing().printingCode()).isEqualTo("ZOB-EN005");
        assertThat(match(List.of("ZA01-EN-075"), List.of()).status())
                .isEqualTo(ScanStatus.PICK_RARITY);
    }

    @Test
    void aReadInDoubtIsEnglishWhenTheCatalogKnowsTheSetOfAnEnglishPlaceOnly() {
        // W1: ZV10EN0O1 (dash lost, 0 read as O) is ZV10-EN0O1 or a German ZV1-DEN0O1 misread.
        // The catalog knows the set ZV10 and no set ZV1 (the Pokemon card's ZV1 is another game's):
        // English, and its look-alike counts.
        for (List<String> names : List.of(List.of("Tenfold Iron Sentry"), List.<String>of())) {
            ScanMatch sentry = match(List.of("ZV10EN0O1"), names);
            assertThat(sentry.status()).as("%s", names).isEqualTo(ScanStatus.FOUND);
            assertThat(sentry.card().id()).isEqualTo(catalog.tenfold.id());
            assertThat(sentry.printing().printingCode()).isEqualTo("ZV10-EN001");
        }
        // One more grouped lookup, the sets, and only for a read in doubt.
        assertThat(catalog.calls).containsEntry("knownSetCodes", 2);
        catalog.calls.clear();
        match(List.of("ZV10-EN0O1"), List.of("Tenfold Iron Sentry"));
        assertThat(catalog.calls).doesNotContainKey("knownSetCodes");
    }

    @Test
    void aReadInDoubtStaysAnotherLanguagesWhenTheCatalogKnowsTheSetOfItsOtherPlace() {
        // VLBDE005 style: the catalog knows ZOB (the German place ZOB-DE005's set), whatever an
        // English place's set: refused, also with a look-alike in the number.
        for (String code : List.of("ZOBDE005", "ZOBDE0O5", "ZOB0E0O5", "ZOBIT0O5")) {
            assertThat(ScanCodes.languageInDoubt(code)).as(code).isTrue();
            assertThat(match(List.of(code), List.of()).reason())
                    .as(code)
                    .isEqualTo(ScanNotFoundReason.OTHER_LANGUAGE);
        }
        // The catalog knows both ZB (the German place ZB-DEN0O1 misread) and ZBO (the English
        // ZBO-EN0O1): refused, even with the English card's name. Read as printed, it is found.
        ScanMatch both = match(List.of("ZBOEN0O1"), List.of("Twin Gate Warden"));
        assertThat(both.status()).isEqualTo(ScanStatus.NOT_FOUND);
        assertThat(both.reason()).isEqualTo(ScanNotFoundReason.OTHER_LANGUAGE);
        assertThat(both.otherMatches()).isEmpty();
        assertThat(match(List.of("ZBOEN001"), List.of()).printing().printingCode())
                .isEqualTo("ZBO-EN001");
        // Neither set known: refused.
        assertThat(match(List.of("QZX0EN0O1"), List.of()).reason())
                .isEqualTo(ScanNotFoundReason.OTHER_LANGUAGE);
    }

    @Test
    void anOldEuropeFormReadWithoutItsDashIsRefusedWhenTheCatalogKnowsTheOtherLanguagesSet() {
        // V3-2, owner 2026-10-15: ZT10E001 is ZT10-E001, never printed (its other old form
        // ZT10-EN001 is), or the German ZT1-DE001 read with its dash lost and its D as 0. The
        // catalog knows the set ZT1: refused, even with the English card's name (batch B1 found
        // ZT10-EN001 through the old form).
        for (List<String> names : List.of(List.of("Zither Tin Herald"), List.<String>of())) {
            ScanMatch herald = match(List.of("ZT10E001"), names);
            assertThat(herald.status()).as("%s", names).isEqualTo(ScanStatus.NOT_FOUND);
            assertThat(herald.reason())
                    .as("%s", names)
                    .isEqualTo(ScanNotFoundReason.OTHER_LANGUAGE);
            assertThat(herald.card()).isNull();
            assertThat(herald.otherMatches()).isEmpty();
        }
        // Its EN region read, or its dash: found.
        assertThat(match(List.of("ZT10EN001"), List.of()).printing().printingCode())
                .isEqualTo("ZT10-EN001");
        assertThat(match(List.of("ZT10-E001"), List.of()).printing().printingCode())
                .isEqualTo("ZT10-EN001");
        // The Yu-Gi-Oh! catalog knows no set ZV1 (only another game's): ZV10E001 stays English
        // through the old form ZV10-EN001 of its place ZV10-E001.
        ScanMatch sentry = match(List.of("ZV10E001"), List.of());
        assertThat(sentry.status()).isEqualTo(ScanStatus.FOUND);
        assertThat(sentry.printing().printingCode()).isEqualTo("ZV10-EN001");
        // The places as read are what settles a doubt whatever the sets, never their old form.
        assertThat(ScanCodes.englishPlaces("ZMDE001"))
                .startsWith("ZMD-E001")
                .doesNotContain("ZMD-EN001");
        assertThat(ScanCodes.englishPlaces("ZT10E001"))
                .startsWith("ZT10-E001")
                .doesNotContain("ZT10-EN001");
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
        // The passcode is never used, not even sent as a code, with a stray dash or two look-alike
        // letters.
        for (String passcode : List.of("19608153", "9955-8127", "9955812I", "I9608-153")) {
            assertThat(match(List.of(passcode), List.of()).reason())
                    .as(passcode)
                    .isEqualTo(ScanNotFoundReason.NOTHING_READ);
        }
        assertThat(catalog.totalCalls()).isZero();
        // Next to a name, it is no code that could disagree with it.
        assertThat(match(List.of("9955-8127"), List.of("Fable Tide - Lyra")).status())
                .isEqualTo(ScanStatus.FOUND);
        assertThat(catalog.codeLookups).isEmpty();

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
