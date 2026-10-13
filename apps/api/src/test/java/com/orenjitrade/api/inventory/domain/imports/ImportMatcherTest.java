package com.orenjitrade.api.inventory.domain.imports;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.cards.domain.CatalogCardRef;
import com.orenjitrade.api.cards.domain.CatalogPrintingRef;
import com.orenjitrade.api.cards.domain.CatalogText;
import com.orenjitrade.api.games.domain.GameSchema;
import com.orenjitrade.api.inventory.domain.imports.CollectrCsvFormat.Column;
import com.orenjitrade.api.inventory.domain.imports.ImportMatcher.Catalog;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.Test;

/**
 * How the rows of a file are matched to the catalog: a YDK passcode to its card (or to the card of
 * an alternate artwork), a Collectr row to one printing, to one card and several printings, or to
 * nothing. The catalog here is a handful of fictional cards.
 */
class ImportMatcherTest {

    private static final List<String> CONDITIONS =
            List.of(
                    "MINT",
                    "NEAR_MINT",
                    "LIGHTLY_PLAYED",
                    "MODERATELY_PLAYED",
                    "HEAVILY_PLAYED",
                    "DAMAGED");

    private final Map<String, CatalogCardRef> byPasscode = new LinkedHashMap<>();
    private final Map<String, CatalogCardRef> byArtwork = new LinkedHashMap<>();
    private final Map<String, List<CatalogCardRef>> byName = new LinkedHashMap<>();
    private final Map<String, List<CatalogPrintingRef>> byCode = new LinkedHashMap<>();
    private final Map<UUID, List<CatalogPrintingRef>> byCard = new LinkedHashMap<>();

    private Catalog catalog() {
        Map<String, GameSchema> games = new LinkedHashMap<>();
        games.put("yugioh", schema(List.of("FIRST_EDITION", "UNLIMITED", "LIMITED")));
        games.put("pokemon", schema(List.of("FIRST_EDITION", "UNLIMITED")));
        Map<String, String> keys = new LinkedHashMap<>();
        keys.put("yugioh", "yugioh");
        keys.put("yugiohtradingcardgame", "yugioh");
        keys.put("pokemon", "pokemon");
        keys.put("pokemontradingcardgame", "pokemon");
        return new Catalog(byPasscode, byArtwork, byName, byCode, byCard, games, keys);
    }

    private static GameSchema schema(List<String> editions) {
        return new GameSchema(
                CONDITIONS,
                editions,
                List.of("en", "fr", "ja"),
                List.of("NORMAL", "HOLO"),
                List.of(),
                List.of(),
                List.of());
    }

    private CatalogCardRef card(String game, String name) {
        CatalogCardRef card = new CatalogCardRef(UUID.randomUUID(), game, name);
        byName.computeIfAbsent(CatalogText.normalise(name), key -> new ArrayList<>()).add(card);
        return card;
    }

    /** Adds a printing; call in "most recent set first" order, as the catalog lists them. */
    private CatalogPrintingRef printing(
            CatalogCardRef card,
            String setCode,
            String setName,
            String number,
            @Nullable String rarity,
            String edition,
            String language,
            String finish) {
        String code = setCode + "-" + number;
        CatalogPrintingRef printing =
                new CatalogPrintingRef(
                        UUID.randomUUID(),
                        card.id(),
                        card.game(),
                        setCode,
                        setName,
                        LocalDate.of(2025, 1, 1),
                        number,
                        code,
                        rarity,
                        edition,
                        language,
                        finish);
        byCard.computeIfAbsent(card.id(), id -> new ArrayList<>()).add(printing);
        byCode.computeIfAbsent(code, key -> new ArrayList<>()).add(printing);
        return printing;
    }

    private static CollectrCsvParser.Row row(
            String name,
            @Nullable String set,
            @Nullable String number,
            @Nullable String rarity,
            @Nullable String variant,
            @Nullable String language,
            @Nullable String condition,
            @Nullable String quantity,
            @Nullable String game) {
        return new CollectrCsvParser.Row(
                1, name, set, number, rarity, variant, language, condition, quantity, game);
    }

    private ImportDraftRow csv(CollectrCsvParser.Row row, @Nullable String defaultGame) {
        CollectrCsvParser.Sheet sheet =
                new CollectrCsvParser.Sheet(List.of(row), 0, EnumSet.of(Column.NAME), ',');
        return ImportMatcher.csv(sheet, defaultGame, catalog()).get(0);
    }

    // ---------------------------------------------------------------------------------------
    // YDK
    // ---------------------------------------------------------------------------------------

    @Test
    void aPasscodeIsItsCardAndOnlyASinglePrintingIsPreselected() {
        CatalogCardRef single = new CatalogCardRef(UUID.randomUUID(), "yugioh", "Solo Sprite");
        CatalogCardRef several = new CatalogCardRef(UUID.randomUUID(), "yugioh", "Twin Drake");
        CatalogCardRef bare = new CatalogCardRef(UUID.randomUUID(), "yugioh", "Paper Ghost");
        byPasscode.put("800000001", single);
        byPasscode.put("800000002", several);
        byPasscode.put("800000003", bare);
        CatalogPrintingRef only =
                printing(single, "AAA", "Alpha", "EN001", "Rare", "UNLIMITED", "en", "NORMAL");
        printing(several, "BBB", "Beta", "EN002", "Rare", "UNLIMITED", "en", "NORMAL");
        printing(several, "AAA", "Alpha", "EN002", "Common", "UNLIMITED", "en", "NORMAL");
        YdkParser.Deck deck =
                new YdkParser.Deck(
                        List.of(
                                new YdkParser.Entry("800000001", 3, 0, 0),
                                new YdkParser.Entry("800000002", 1, 1, 1),
                                new YdkParser.Entry("800000003", 0, 0, 2),
                                new YdkParser.Entry("899999999", 2, 0, 0)),
                        10,
                        0,
                        List.of());

        List<ImportDraftRow> rows = ImportMatcher.ydk(deck, catalog());

        assertThat(ImportMatcher.passcodes(deck))
                .containsExactly("800000001", "800000002", "800000003", "899999999");
        assertThat(rows).extracting(ImportDraftRow::position).containsExactly(0, 1, 2, 3);
        ImportDraftRow ready = rows.get(0);
        assertThat(ready.cardId()).isEqualTo(single.id());
        assertThat(ready.printingId()).isEqualTo(only.id());
        assertThat(ready.printingChoice()).isEqualTo(PrintingChoice.AUTO);
        assertThat(ready.printingCount()).isEqualTo(1);
        assertThat(ready.fileQuantity()).isEqualTo(3);
        assertThat(ready.qtyMain()).isEqualTo(3);
        assertThat(ready.condition()).as("the grade that claims least").isEqualTo("DAMAGED");
        assertThat(ready.conditionSource()).isEqualTo(ConditionSource.DEFAULT);

        ImportDraftRow toChoose = rows.get(1);
        assertThat(toChoose.cardId()).isEqualTo(several.id());
        assertThat(toChoose.printingId()).as("a deck file names no printing").isNull();
        assertThat(toChoose.printingChoice()).isNull();
        assertThat(toChoose.printingCount()).isEqualTo(2);
        assertThat(toChoose.fileQuantity()).isEqualTo(3);
        assertThat(toChoose.unmatchedReason()).isNull();

        assertThat(rows.get(2).cardId()).isNull();
        assertThat(rows.get(2).unmatchedReason()).isEqualTo(UnmatchedReason.NO_PRINTING);
        assertThat(rows.get(3).cardId()).isNull();
        assertThat(rows.get(3).unmatchedReason()).isEqualTo(UnmatchedReason.UNKNOWN_PASSCODE);
        assertThat(rows.get(3).passcode()).isEqualTo("899999999");
        assertThat(rows.get(3).condition()).isNull();
    }

    @Test
    void thePasscodeOfAnAlternateArtworkIsTheCardOfThatArtwork() {
        CatalogCardRef card = new CatalogCardRef(UUID.randomUUID(), "yugioh", "Twin Drake");
        byPasscode.put("800000002", card);
        byArtwork.put("800000092", card);
        CatalogPrintingRef only =
                printing(card, "BBB", "Beta", "EN002", "Rare", "UNLIMITED", "en", "NORMAL");
        YdkParser.Deck deck =
                new YdkParser.Deck(
                        List.of(
                                new YdkParser.Entry("800000092", 2, 0, 0),
                                new YdkParser.Entry("800000002", 1, 0, 0)),
                        4,
                        0,
                        List.of());

        List<ImportDraftRow> rows = ImportMatcher.ydk(deck, catalog());

        assertThat(rows).extracting(ImportDraftRow::cardId).containsExactly(card.id(), card.id());
        assertThat(rows)
                .extracting(ImportDraftRow::printingId)
                .containsExactly(only.id(), only.id());
        assertThat(rows.get(0).passcode()).isEqualTo("800000092");
    }

    // ---------------------------------------------------------------------------------------
    // Collectr CSV
    // ---------------------------------------------------------------------------------------

    @Test
    void aRowThatFitsExactlyOnePrintingIsPreselected() {
        CatalogCardRef card = card("yugioh", "Mirrorblade Knight");
        printing(
                card,
                "TMP",
                "Tempest Monarchs",
                "EN003",
                "Super Rare",
                "UNLIMITED",
                "en",
                "NORMAL");
        CatalogPrintingRef wanted =
                printing(
                        card,
                        "SHV",
                        "Shadowvale Legacy",
                        "EN003",
                        "Super Rare",
                        "UNLIMITED",
                        "en",
                        "NORMAL");
        printing(
                card,
                "SHV",
                "Shadowvale Legacy",
                "EN003",
                "Secret Rare",
                "UNLIMITED",
                "en",
                "NORMAL");

        ImportDraftRow row =
                csv(
                        row(
                                "mirrorblade knight",
                                "Shadowvale Legacy",
                                "EN003",
                                "super rare",
                                null,
                                "English",
                                "Lightly Played",
                                "2",
                                "Yu-Gi-Oh!"),
                        null);

        assertThat(row.cardId()).isEqualTo(card.id());
        assertThat(row.game()).isEqualTo("yugioh");
        assertThat(row.printingId()).isEqualTo(wanted.id());
        assertThat(row.printingChoice()).isEqualTo(PrintingChoice.AUTO);
        assertThat(row.printingCount()).isEqualTo(3);
        assertThat(row.suggestedPrintingIds()).isEmpty();
        assertThat(row.fileQuantity()).isEqualTo(2);
        assertThat(row.condition()).isEqualTo("LIGHTLY_PLAYED");
        assertThat(row.conditionSource()).isEqualTo(ConditionSource.FILE);
        assertThat(row.language()).isEqualTo("en");
        assertThat(row.sourceName()).isEqualTo("mirrorblade knight");
        assertThat(row.sourceSet()).isEqualTo("Shadowvale Legacy");
        assertThat(row.qtyMain()).isNull();
    }

    @Test
    void aRowThatFitsOneCardAndSeveralPrintingsAsksAndSuggestsTheOnesThatFit() {
        CatalogCardRef card = card("yugioh", "Mirrorblade Knight");
        printing(
                card,
                "TMP",
                "Tempest Monarchs",
                "EN003",
                "Super Rare",
                "UNLIMITED",
                "en",
                "NORMAL");
        CatalogPrintingRef first =
                printing(
                        card,
                        "SHV",
                        "Shadowvale Legacy",
                        "EN003",
                        "Super Rare",
                        "UNLIMITED",
                        "en",
                        "NORMAL");
        CatalogPrintingRef second =
                printing(
                        card,
                        "SHV",
                        "Shadowvale Legacy",
                        "EN003",
                        "Secret Rare",
                        "UNLIMITED",
                        "en",
                        "NORMAL");

        ImportDraftRow bySet =
                csv(
                        row("Mirrorblade Knight", "shv", null, null, null, null, null, null, null),
                        null);
        ImportDraftRow byNameOnly =
                csv(
                        row("Mirrorblade Knight", null, null, null, null, null, null, null, null),
                        null);

        assertThat(bySet.printingId()).isNull();
        assertThat(bySet.unmatchedReason()).isNull();
        assertThat(bySet.suggestedPrintingIds()).containsExactly(first.id(), second.id());
        assertThat(bySet.fileQuantity()).as("no quantity column: one copy").isEqualTo(1);
        assertThat(bySet.condition()).isEqualTo("DAMAGED");
        assertThat(bySet.conditionSource()).isEqualTo(ConditionSource.DEFAULT);
        assertThat(byNameOnly.printingId()).isNull();
        assertThat(byNameOnly.suggestedPrintingIds())
                .as("nothing narrows: every printing of the card is a candidate")
                .isEmpty();
        assertThat(byNameOnly.printingCount()).isEqualTo(3);
    }

    @Test
    void aRowThatContradictsTheCatalogIsNeverPreselected() {
        CatalogCardRef card = card("yugioh", "Solo Sprite");
        printing(card, "AAA", "Alpha", "EN001", "Rare", "UNLIMITED", "en", "NORMAL");

        ImportDraftRow agreeing =
                csv(row("Solo Sprite", null, null, null, null, null, null, null, null), null);
        ImportDraftRow otherSet =
                csv(row("Solo Sprite", "Omega", "EN001", null, null, null, null, null, null), null);

        assertThat(agreeing.printingId()).as("one printing and nothing against it").isNotNull();
        assertThat(otherSet.cardId()).isEqualTo(card.id());
        assertThat(otherSet.printingId())
                .as("the file names a set the catalog does not have for this card")
                .isNull();
        assertThat(otherSet.suggestedPrintingIds()).isEmpty();
        assertThat(otherSet.printingCount()).isEqualTo(1);
    }

    @Test
    void theNumberIsReadAsACollectorNumberOrAsAPrintingCode() {
        CatalogCardRef card = card("pokemon", "Emberfang Fox");
        CatalogPrintingRef wanted =
                printing(card, "SVX", "Scarlet Vortex", "045", "Rare", "UNLIMITED", "en", "HOLO");
        printing(card, "SVX", "Scarlet Vortex", "145", "Ultra Rare", "UNLIMITED", "en", "HOLO");

        for (String number :
                List.of("045", "45", "#045", "045/165", "45/165", "SVX-045", "svx 045")) {
            ImportDraftRow row =
                    csv(
                            row("Emberfang Fox", null, number, null, null, null, null, null, null),
                            null);
            assertThat(row.printingId()).as(number).isEqualTo(wanted.id());
        }
        assertThat(ImportMatcher.numberKey("EN001")).isEqualTo("en001");
        assertThat(ImportMatcher.numberKey("000")).isEqualTo("0");
        assertThat(ImportMatcher.printingCode("azr-en001")).contains("AZR-EN001");
        assertThat(ImportMatcher.printingCode("45/165")).isEmpty();
    }

    @Test
    void languageEditionAndFinishNarrowWhenAPrintingHasThemAndBelongToTheCopyOtherwise() {
        CatalogCardRef card = card("yugioh", "Azure-Eyes Sky Dragon");
        CatalogPrintingRef english =
                printing(
                        card,
                        "AZR",
                        "Azure Dawn",
                        "EN001",
                        "Ultra Rare",
                        "FIRST_EDITION",
                        "en",
                        "NORMAL");
        CatalogPrintingRef french =
                printing(
                        card,
                        "AZR",
                        "Azure Dawn",
                        "FR001",
                        "Ultra Rare",
                        "UNLIMITED",
                        "fr",
                        "NORMAL");

        ImportDraftRow inFrench =
                csv(
                        row(
                                "Azure-Eyes Sky Dragon",
                                "AZR",
                                null,
                                null,
                                null,
                                "French",
                                null,
                                null,
                                null),
                        null);
        ImportDraftRow firstEdition =
                csv(
                        row(
                                "Azure-Eyes Sky Dragon",
                                "AZR",
                                null,
                                null,
                                "1st Edition",
                                null,
                                null,
                                null,
                                null),
                        null);
        ImportDraftRow japaneseLimited =
                csv(
                        row(
                                "Azure-Eyes Sky Dragon",
                                "AZR",
                                "EN001",
                                null,
                                "Limited Edition",
                                "Japanese",
                                null,
                                null,
                                null),
                        null);

        assertThat(inFrench.printingId()).isEqualTo(french.id());
        assertThat(inFrench.language()).isEqualTo("fr");
        assertThat(firstEdition.printingId()).isEqualTo(english.id());
        assertThat(firstEdition.edition()).isEqualTo("FIRST_EDITION");
        // No printing is Japanese or a limited edition: the number decides the printing, and the
        // copy keeps what the file says about itself.
        assertThat(japaneseLimited.printingId()).isEqualTo(english.id());
        assertThat(japaneseLimited.language()).isEqualTo("ja");
        assertThat(japaneseLimited.edition()).isEqualTo("LIMITED");
    }

    @Test
    void anEditionTheGameDoesNotHaveIsNotKept() {
        CatalogCardRef card = card("pokemon", "Emberfang Fox");
        printing(card, "SVX", "Scarlet Vortex", "045", "Rare", "UNLIMITED", "en", "HOLO");

        ImportDraftRow row =
                csv(
                        row(
                                "Emberfang Fox",
                                null,
                                null,
                                null,
                                "Limited Edition Holofoil",
                                null,
                                null,
                                null,
                                null),
                        null);

        assertThat(row.edition()).as("pokemon has no LIMITED edition").isNull();
        assertThat(row.printingId()).isNotNull();
    }

    @Test
    void theGameOfARowTellsTwoCardsOfTheSameNameApart() {
        CatalogCardRef ygo = card("yugioh", "Storm Herald");
        CatalogCardRef pkm = card("pokemon", "Storm Herald");
        printing(ygo, "TMP", "Tempest Monarchs", "EN050", "Rare", "UNLIMITED", "en", "NORMAL");
        printing(pkm, "SVX", "Scarlet Vortex", "050", "Rare", "UNLIMITED", "en", "NORMAL");

        assertThat(
                        csv(
                                        row(
                                                "Storm Herald",
                                                null,
                                                null,
                                                null,
                                                null,
                                                null,
                                                null,
                                                null,
                                                "Pokemon"),
                                        null)
                                .cardId())
                .isEqualTo(pkm.id());
        assertThat(
                        csv(
                                        row(
                                                "Storm Herald",
                                                null,
                                                null,
                                                null,
                                                null,
                                                null,
                                                null,
                                                null,
                                                "Yu-Gi-Oh! Trading Card Game"),
                                        null)
                                .cardId())
                .isEqualTo(ygo.id());
        assertThat(
                        csv(
                                        row(
                                                "Storm Herald",
                                                null,
                                                null,
                                                null,
                                                null,
                                                null,
                                                null,
                                                null,
                                                null),
                                        "yugioh")
                                .cardId())
                .as("the game chosen for the whole file")
                .isEqualTo(ygo.id());
        assertThat(
                        csv(
                                        row(
                                                "Storm Herald",
                                                "Scarlet Vortex",
                                                null,
                                                null,
                                                null,
                                                null,
                                                null,
                                                null,
                                                null),
                                        null)
                                .cardId())
                .as("the set says which of the two")
                .isEqualTo(pkm.id());

        ImportDraftRow ambiguous =
                csv(row("Storm Herald", null, null, null, null, null, null, null, null), null);
        assertThat(ambiguous.cardId()).isNull();
        assertThat(ambiguous.unmatchedReason()).isEqualTo(UnmatchedReason.AMBIGUOUS_CARD);
    }

    @Test
    void aRowThatFitsNothingIsReportedWithItsReason() {
        CatalogCardRef card = card("yugioh", "Solo Sprite");
        printing(card, "AAA", "Alpha", "EN001", "Rare", "UNLIMITED", "en", "NORMAL");
        card("yugioh", "Paper Ghost");

        ImportDraftRow unknown =
                csv(
                        row(
                                "Nobody Knows Me",
                                "Alpha",
                                "EN099",
                                "Rare",
                                null,
                                null,
                                "NM",
                                "3",
                                null),
                        null);
        ImportDraftRow otherGame =
                csv(
                        row(
                                "Solo Sprite",
                                null,
                                null,
                                null,
                                null,
                                null,
                                null,
                                null,
                                "Baseball Cards"),
                        null);
        ImportDraftRow wrongGame =
                csv(row("Solo Sprite", null, null, null, null, null, null, null, "Pokemon"), null);
        ImportDraftRow noPrinting =
                csv(row("Paper Ghost", null, null, null, null, null, null, null, null), null);

        assertThat(unknown.unmatchedReason()).isEqualTo(UnmatchedReason.UNKNOWN_CARD);
        assertThat(unknown.cardId()).isNull();
        assertThat(unknown.sourceName()).isEqualTo("Nobody Knows Me");
        assertThat(unknown.sourceNumber()).isEqualTo("EN099");
        assertThat(unknown.fileQuantity()).isEqualTo(3);
        assertThat(unknown.condition()).isNull();
        assertThat(otherGame.unmatchedReason()).isEqualTo(UnmatchedReason.UNKNOWN_GAME);
        assertThat(wrongGame.unmatchedReason()).isEqualTo(UnmatchedReason.UNKNOWN_CARD);
        assertThat(noPrinting.unmatchedReason()).isEqualTo(UnmatchedReason.NO_PRINTING);
    }

    @Test
    void aNameWithARemarkOrAPrintingCodeStillFindsItsCard() {
        CatalogCardRef card = card("yugioh", "Chevalier Épée-Miroir");
        CatalogPrintingRef printing =
                printing(
                        card,
                        "SHV",
                        "Shadowvale Legacy",
                        "EN023",
                        "Ultimate Rare",
                        "UNLIMITED",
                        "en",
                        "NORMAL");

        assertThat(
                        csv(
                                        row(
                                                "chevalier epee-miroir",
                                                null,
                                                null,
                                                null,
                                                null,
                                                null,
                                                null,
                                                null,
                                                null),
                                        null)
                                .cardId())
                .as("accents and case do not matter")
                .isEqualTo(card.id());
        assertThat(
                        csv(
                                        row(
                                                "Chevalier Épée-Miroir (Alternate Art)",
                                                null,
                                                null,
                                                null,
                                                null,
                                                null,
                                                null,
                                                null,
                                                null),
                                        null)
                                .cardId())
                .isEqualTo(card.id());
        ImportDraftRow byCode =
                csv(
                        row(
                                "Mirror Sword Knight",
                                null,
                                "SHV-EN023",
                                null,
                                null,
                                null,
                                null,
                                null,
                                null),
                        null);
        assertThat(byCode.cardId())
                .as("spelled differently, found by its code")
                .isEqualTo(card.id());
        assertThat(byCode.printingId()).isEqualTo(printing.id());
        assertThat(ImportMatcher.nameKeys("Solo Sprite (Alt) [Promo]"))
                .containsExactly("solo sprite (alt) [promo]", "solo sprite (alt)");
    }

    @Test
    void theQuantityIsANumberOfCopies() {
        assertThat(ImportMatcher.quantity(null)).isEqualTo(1);
        assertThat(ImportMatcher.quantity("3")).isEqualTo(3);
        assertThat(ImportMatcher.quantity(" x4 ")).isEqualTo(4);
        assertThat(ImportMatcher.quantity("2.0")).isEqualTo(2);
        assertThat(ImportMatcher.quantity("123456")).isEqualTo(ImportMatcher.QUANTITY_MAX);
        assertThat(ImportMatcher.quantity("0")).isZero();
        assertThat(ImportMatcher.quantity("-2")).isZero();
        assertThat(ImportMatcher.quantity("2.5")).isZero();
        assertThat(ImportMatcher.quantity("many")).isZero();

        CatalogCardRef card = card("yugioh", "Solo Sprite");
        printing(card, "AAA", "Alpha", "EN001", "Rare", "UNLIMITED", "en", "NORMAL");
        ImportDraftRow row =
                csv(row("Solo Sprite", null, null, null, null, null, null, "none", null), null);
        assertThat(row.unmatchedReason()).isEqualTo(UnmatchedReason.INVALID_QUANTITY);
        assertThat(row.fileQuantity()).isZero();
    }

    @Test
    void aConditionTheGameDoesNotKnowFallsBackToTheGradeThatClaimsLeast() {
        CatalogCardRef card = card("yugioh", "Solo Sprite");
        printing(card, "AAA", "Alpha", "EN001", "Rare", "UNLIMITED", "en", "NORMAL");

        ImportDraftRow graded =
                csv(row("Solo Sprite", null, null, null, null, null, "PSA 10", null, null), null);

        assertThat(graded.condition()).isEqualTo("DAMAGED");
        assertThat(graded.conditionSource()).isEqualTo(ConditionSource.DEFAULT);
        assertThat(ImportMatcher.defaultCondition(null)).isEqualTo("NEAR_MINT");
        assertThat(
                        ImportMatcher.defaultCondition(
                                new GameSchema(
                                        List.of("GOOD", "WORN"),
                                        List.of("UNLIMITED"),
                                        List.of("en"),
                                        List.of("NORMAL"),
                                        List.of(),
                                        List.of(),
                                        List.of())))
                .isEqualTo("WORN");
    }

    @Test
    void theMostRecentPrintingIsTheFirstOfTheCatalogsOrderAmongTheOnesThatFit() {
        CatalogCardRef card = card("yugioh", "Mirrorblade Knight");
        CatalogPrintingRef newest =
                printing(
                        card,
                        "TMP",
                        "Tempest Monarchs",
                        "EN003",
                        "Super Rare",
                        "UNLIMITED",
                        "en",
                        "NORMAL");
        CatalogPrintingRef older =
                printing(
                        card,
                        "SHV",
                        "Shadowvale Legacy",
                        "EN003",
                        "Super Rare",
                        "UNLIMITED",
                        "en",
                        "NORMAL");
        CatalogPrintingRef oldest =
                printing(card, "AZR", "Azure Dawn", "EN003", "Rare", "UNLIMITED", "en", "NORMAL");
        List<CatalogPrintingRef> printings = byCard.get(card.id());

        assertThat(ImportMatcher.mostRecent(printings, List.of())).contains(newest.id());
        assertThat(ImportMatcher.mostRecent(printings, List.of(oldest.id(), older.id())))
                .as("among the printings the file narrowed the row to")
                .contains(older.id());
        assertThat(ImportMatcher.mostRecent(printings, List.of(UUID.randomUUID())))
                .as("a suggestion that left the catalog narrows nothing")
                .contains(newest.id());
        assertThat(ImportMatcher.mostRecent(List.of(), List.of())).isEmpty();
    }
}
