package com.orenjitrade.api.inventory.domain.imports;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.cards.domain.CatalogCardRef;
import com.orenjitrade.api.cards.domain.CatalogPrintingRef;
import com.orenjitrade.api.cards.domain.CatalogText;
import com.orenjitrade.api.games.domain.GameSchema;
import com.orenjitrade.api.inventory.domain.imports.CollectrCsvFormat.Column;
import com.orenjitrade.api.inventory.domain.imports.ImportMatcher.Catalog;
import com.orenjitrade.api.inventory.domain.imports.ImportMatcher.MostRecent;
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
        return printingOn(
                LocalDate.of(2025, 1, 1),
                card,
                setCode,
                setName,
                number,
                rarity,
                edition,
                language,
                finish);
    }

    /** A printing whose set was released on {@code released} ({@code null}: nobody knows when). */
    private CatalogPrintingRef printingOn(
            @Nullable LocalDate released,
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
                        released,
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
                                "4",
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
        assertThat(otherGame.fileQuantity())
                .as("what the file said, as written: its copies too")
                .isEqualTo(4);
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
        assertThat(ImportMatcher.quantity("9999")).isEqualTo(ImportMatcher.QUANTITY_MAX);
        assertThat(ImportMatcher.quantity("10000"))
                .as("more than an item holds is reported, never cut down without a word")
                .isZero();
        assertThat(ImportMatcher.quantity("999999999")).isZero();
        assertThat(ImportMatcher.quantity("99999999999999999999")).isZero();
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
        ImportDraftRow tooMany =
                csv(row("Solo Sprite", null, null, null, null, null, null, "12000", null), null);
        assertThat(tooMany.unmatchedReason()).isEqualTo(UnmatchedReason.INVALID_QUANTITY);
        assertThat(tooMany.cardId()).isNull();
    }

    @Test
    void aFinishNoneOfThePrintingsHasIsNeverDroppedSilently() {
        CatalogCardRef card = card("pokemon", "Mossback Wurm");
        CatalogPrintingRef english =
                printing(card, "KRH", "Kronhold Ruins", "078", "Rare", "UNLIMITED", "en", "NORMAL");
        CatalogPrintingRef japanese =
                printing(card, "KRH", "Kronhold Ruins", "078", "Rare", "UNLIMITED", "ja", "HOLO");
        CatalogCardRef lone = card("pokemon", "Lone Lantern");
        printing(lone, "KRH", "Kronhold Ruins", "079", "Rare", "UNLIMITED", "en", "NORMAL");

        ImportDraftRow englishHolo =
                csv(
                        row(
                                "Mossback Wurm",
                                null,
                                "078",
                                null,
                                "Holofoil",
                                "English",
                                null,
                                "2",
                                null),
                        null);
        ImportDraftRow holo =
                csv(
                        row("Mossback Wurm", null, "078", null, "Holofoil", null, null, null, null),
                        null);
        ImportDraftRow normal =
                csv(
                        row(
                                "Mossback Wurm",
                                null,
                                "078",
                                null,
                                "Normal",
                                "English",
                                null,
                                null,
                                null),
                        null);
        ImportDraftRow loneHolo =
                csv(
                        row("Lone Lantern", null, null, null, "Holofoil", null, null, null, null),
                        null);

        // The English printing is not a holo and the holo one is not English: the row fits no
        // printing, so it asks, and its copies are not written as a normal copy.
        assertThat(englishHolo.printingId()).isNull();
        assertThat(englishHolo.printingChoice()).isNull();
        assertThat(englishHolo.cardId()).isEqualTo(card.id());
        assertThat(englishHolo.unmatchedReason()).isNull();
        assertThat(englishHolo.suggestedPrintingIds())
                .as("the number fits both printings: nothing narrower to suggest")
                .isEmpty();
        assertThat(englishHolo.language()).isEqualTo("en");
        // A finish a printing has still narrows, alone or with the language.
        assertThat(holo.printingId()).isEqualTo(japanese.id());
        assertThat(normal.printingId()).isEqualTo(english.id());
        // Also for a card with one printing: "Holofoil" is not its normal copy.
        assertThat(loneHolo.printingId()).isNull();
        assertThat(loneHolo.printingCount()).isEqualTo(1);
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
    void theMostRecentPrintingIsTheOneOfTheLastSetReleasedAmongTheOnesThatFit() {
        CatalogCardRef card = card("yugioh", "Mirrorblade Knight");
        CatalogPrintingRef newest =
                printingOn(
                        LocalDate.of(2026, 3, 1),
                        card,
                        "TMP",
                        "Tempest Monarchs",
                        "EN003",
                        "Super Rare",
                        "UNLIMITED",
                        "en",
                        "NORMAL");
        CatalogPrintingRef older =
                printingOn(
                        LocalDate.of(2025, 6, 1),
                        card,
                        "SHV",
                        "Shadowvale Legacy",
                        "EN003",
                        "Super Rare",
                        "UNLIMITED",
                        "en",
                        "NORMAL");
        CatalogPrintingRef oldest =
                printingOn(
                        LocalDate.of(2024, 2, 9),
                        card,
                        "AZR",
                        "Azure Dawn",
                        "EN003",
                        "Rare",
                        "UNLIMITED",
                        "en",
                        "NORMAL");
        CatalogPrintingRef undated =
                printingOn(
                        null, card, "PRM", "Promos", "EN003", "Rare", "UNLIMITED", "en", "NORMAL");
        List<CatalogPrintingRef> printings = byCard.get(card.id());

        assertThat(ImportMatcher.mostRecent(printings, List.of()))
                .isEqualTo(new MostRecent(newest.id(), false));
        assertThat(ImportMatcher.mostRecent(printings, List.of(oldest.id(), older.id())))
                .as("among the printings the file narrowed the row to")
                .isEqualTo(new MostRecent(older.id(), false));
        assertThat(ImportMatcher.mostRecent(printings, List.of(UUID.randomUUID())))
                .as("a suggestion that left the catalog narrows nothing")
                .isEqualTo(new MostRecent(newest.id(), false));
        assertThat(ImportMatcher.mostRecent(printings, List.of(oldest.id(), undated.id())))
                .as("a set with a date is more recent than one nobody dated")
                .isEqualTo(new MostRecent(oldest.id(), false));
        assertThat(ImportMatcher.mostRecent(List.of(undated), List.of()))
                .as("the only printing")
                .isEqualTo(new MostRecent(undated.id(), false));
        assertThat(ImportMatcher.mostRecent(List.of(), List.of()).printingId()).isNull();
    }

    @Test
    void ofSeveralVersionsOfACardInItsMostRecentSetThePlainCopyIsTakenAndSaid() {
        // The everyday case: a 1st Edition and an Unlimited copy of one set. The catalog lists the
        // 1st Edition first (alphabet): taking the first would claim the dearer copy.
        CatalogCardRef card = card("yugioh", "Ember Wyrmling");
        LocalDate released = LocalDate.of(2026, 3, 1);
        CatalogPrintingRef firstEdition =
                printingOn(
                        released,
                        card,
                        "TMP",
                        "Tempest Monarchs",
                        "EN004",
                        "Rare",
                        "FIRST_EDITION",
                        "en",
                        "NORMAL");
        CatalogPrintingRef unlimited =
                printingOn(
                        released,
                        card,
                        "TMP",
                        "Tempest Monarchs",
                        "EN004",
                        "Rare",
                        "UNLIMITED",
                        "en",
                        "NORMAL");
        CatalogPrintingRef reprintOfLastYear =
                printingOn(
                        LocalDate.of(2025, 6, 1),
                        card,
                        "SHV",
                        "Shadowvale Legacy",
                        "EN004",
                        "Common",
                        "UNLIMITED",
                        "en",
                        "NORMAL");
        List<CatalogPrintingRef> printings = byCard.get(card.id());

        assertThat(ImportMatcher.mostRecent(printings, List.of()))
                .as("the date decides nothing: the Unlimited copy, marked as an assumption")
                .isEqualTo(new MostRecent(unlimited.id(), true));
        assertThat(
                        ImportMatcher.mostRecent(
                                printings, List.of(unlimited.id(), reprintOfLastYear.id())))
                .as("the file narrowed the row to one printing of that date: nothing assumed")
                .isEqualTo(new MostRecent(unlimited.id(), false));
        assertThat(ImportMatcher.mostRecent(printings, List.of(firstEdition.id(), unlimited.id())))
                .as("the file left both versions of that date")
                .isEqualTo(new MostRecent(unlimited.id(), true));
        assertThat(
                        ImportMatcher.mostRecent(
                                printings, List.of(firstEdition.id(), reprintOfLastYear.id())))
                .as("the file says 1st Edition: that copy, by its date")
                .isEqualTo(new MostRecent(firstEdition.id(), false));

        // A holo and a normal copy of one set: the normal one.
        CatalogCardRef druid = card("pokemon", "Thornwood Druid");
        printingOn(
                released,
                druid,
                "KRH",
                "Kronhold Ruins",
                "003",
                "Uncommon",
                "UNLIMITED",
                "en",
                "HOLO");
        CatalogPrintingRef normal =
                printingOn(
                        released,
                        druid,
                        "KRH",
                        "Kronhold Ruins",
                        "003",
                        "Uncommon",
                        "UNLIMITED",
                        "en",
                        "NORMAL");
        assertThat(ImportMatcher.mostRecent(byCard.get(druid.id()), List.of()))
                .isEqualTo(new MostRecent(normal.id(), true));

        // Four versions: both editions, each in both finishes. One of them is plain.
        CatalogCardRef four = card("pokemon", "Fourfold Finch");
        for (String edition : List.of("FIRST_EDITION", "UNLIMITED")) {
            printingOn(
                    released, four, "KRH", "Kronhold Ruins", "004", "Rare", edition, "en", "HOLO");
        }
        printingOn(
                released,
                four,
                "KRH",
                "Kronhold Ruins",
                "004",
                "Rare",
                "FIRST_EDITION",
                "en",
                "NORMAL");
        CatalogPrintingRef plain =
                printingOn(
                        released,
                        four,
                        "KRH",
                        "Kronhold Ruins",
                        "004",
                        "Rare",
                        "UNLIMITED",
                        "en",
                        "NORMAL");
        assertThat(ImportMatcher.mostRecent(byCard.get(four.id()), List.of()))
                .isEqualTo(new MostRecent(plain.id(), true));
    }

    @Test
    void whereNoPlainCopyDecidesTheMostRecentPrintingIsLeftToTheCollector() {
        LocalDate released = LocalDate.of(2026, 3, 1);
        MostRecent undecided = new MostRecent(null, false);

        // Two rarities of one set: neither claims less by any rule the catalog knows.
        CatalogCardRef rarities = card("yugioh", "Starlit Unicorn");
        printingOn(
                released,
                rarities,
                "TMP",
                "Tempest Monarchs",
                "EN005",
                "Super Rare",
                "UNLIMITED",
                "en",
                "NORMAL");
        printingOn(
                released,
                rarities,
                "TMP",
                "Tempest Monarchs",
                "EN005",
                "Secret Rare",
                "UNLIMITED",
                "en",
                "NORMAL");
        assertThat(ImportMatcher.mostRecent(byCard.get(rarities.id()), List.of()))
                .isEqualTo(undecided);

        // Two languages: the Unlimited copy is the French one, and nobody said French.
        CatalogCardRef languages = card("yugioh", "Azure-Eyes Sky Dragon");
        printingOn(
                released,
                languages,
                "AZR",
                "Azure Dawn",
                "EN001",
                "Ultra Rare",
                "FIRST_EDITION",
                "en",
                "NORMAL");
        printingOn(
                released,
                languages,
                "AZR",
                "Azure Dawn",
                "FR001",
                "Ultra Rare",
                "UNLIMITED",
                "fr",
                "NORMAL");
        assertThat(ImportMatcher.mostRecent(byCard.get(languages.id()), List.of()))
                .isEqualTo(undecided);

        // Two sets of one day, and two sets nobody dated.
        CatalogCardRef sets = card("yugioh", "Gravehollow Fiend");
        printingOn(released, sets, "AAA", "Alpha", "EN001", "Rare", "UNLIMITED", "en", "NORMAL");
        printingOn(released, sets, "BBB", "Beta", "EN001", "Rare", "UNLIMITED", "en", "NORMAL");
        assertThat(ImportMatcher.mostRecent(byCard.get(sets.id()), List.of())).isEqualTo(undecided);
        CatalogCardRef promo = card("yugioh", "Paper Ghost");
        printingOn(null, promo, "PRA", "Promos A", "EN001", "Rare", "UNLIMITED", "en", "NORMAL");
        printingOn(null, promo, "PRB", "Promos B", "EN001", "Rare", "UNLIMITED", "en", "NORMAL");
        assertThat(ImportMatcher.mostRecent(byCard.get(promo.id()), List.of()))
                .as("no date, no most recent printing")
                .isEqualTo(undecided);

        // A 1st Edition and a Limited copy: no plain copy among them, so none is taken.
        CatalogCardRef special = card("yugioh", "Lantern Fox Spirit");
        printingOn(
                released,
                special,
                "AZR",
                "Azure Dawn",
                "EN011",
                "Rare",
                "FIRST_EDITION",
                "en",
                "NORMAL");
        printingOn(
                released, special, "AZR", "Azure Dawn", "EN011", "Rare", "LIMITED", "en", "NORMAL");
        assertThat(ImportMatcher.mostRecent(byCard.get(special.id()), List.of()))
                .isEqualTo(undecided);
    }
}
