package com.orenjitrade.api.inventory.domain.imports;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

import com.orenjitrade.api.inventory.domain.imports.CollectrCsvFormat.Column;
import com.orenjitrade.api.inventory.domain.imports.CollectrCsvParser.Limits;
import com.orenjitrade.api.inventory.domain.imports.CollectrCsvParser.Row;
import com.orenjitrade.api.inventory.domain.imports.CollectrCsvParser.Sheet;
import com.orenjitrade.api.inventory.domain.imports.ImportFileException.Reason;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The Collectr CSV parser: the alias table that finds the columns, the CSV reading itself (quotes,
 * line breaks, delimiters, a byte-order mark) and what is refused. Everything here is fictional.
 */
class CollectrCsvParserTest {

    private static final Limits LIMITS = new Limits(2 * 1024 * 1024, 5000);

    /** The header Collectr's export is believed to have (unconfirmed, hence the aliases). */
    private static final String BELIEVED_HEADER =
            "Portfolio Name,Category,Set,Product Name,Card Number,Rarity,Variance,Grade,"
                    + "Card Condition,Average Cost Paid,Quantity,Market Price (As of 2026-10-01),"
                    + "Price Override,Watchlist,Date Added,Notes";

    private static Sheet parse(String text) {
        return CollectrCsvParser.parse(text.getBytes(StandardCharsets.UTF_8), LIMITS);
    }

    private static ImportFileException refused(String text, Limits limits) {
        return catchThrowableOfType(
                ImportFileException.class,
                () -> CollectrCsvParser.parse(text.getBytes(StandardCharsets.UTF_8), limits));
    }

    @Test
    void findsTheColumnsOfTheBelievedHeaderAndNeverReadsAPrice() {
        Sheet sheet =
                parse(
                        BELIEVED_HEADER
                                + "\n"
                                + "Main,Yu-Gi-Oh!,Azure Dawn,Azure-Eyes Sky Dragon,AZR-EN001,Ultra"
                                + " Rare,1st Edition,Ungraded,Near Mint,31.41,2,59.26,53.58,false,"
                                + "2026-09-30,my best card\n");

        assertThat(sheet.columns())
                .containsExactlyInAnyOrder(
                        Column.NAME,
                        Column.SET,
                        Column.NUMBER,
                        Column.RARITY,
                        Column.VARIANT,
                        Column.CONDITION,
                        Column.QUANTITY,
                        Column.GAME);
        assertThat(sheet.delimiter()).isEqualTo(',');
        assertThat(sheet.rows())
                .containsExactly(
                        new Row(
                                1,
                                "Azure-Eyes Sky Dragon",
                                "Azure Dawn",
                                "AZR-EN001",
                                "Ultra Rare",
                                "1st Edition",
                                null,
                                "Near Mint",
                                "2",
                                "Yu-Gi-Oh!"));
        // Nothing of the three price columns, the portfolio, the date or the note is kept.
        assertThat(sheet.toString())
                .doesNotContain("31.41", "59.26", "53.58", "my best card", "2026-09-30", "Main");
    }

    @Test
    void theAliasesFindAColumnUnderAnyUsualTitle() {
        for (String header :
                List.of(
                        "Card Name;Set Name;Collector Number;Qty;Language;Condition;Game",
                        "name;expansion;number;count;lang;cond;tcg",
                        "PRODUCT_NAME;SET;CARD-NUMBER;QUANTITY;LANGUAGE;CARD CONDITION;CATEGORY",
                        "  Card ;Set Code; No. ;Copies;Lang;Cond.;Franchise")) {
            Sheet sheet = parse(header + "\nMirrorblade Knight;SHV;EN003;3;French;LP;Yu-Gi-Oh\n");

            assertThat(sheet.delimiter()).as(header).isEqualTo(';');
            assertThat(sheet.rows())
                    .as(header)
                    .containsExactly(
                            new Row(
                                    1,
                                    "Mirrorblade Knight",
                                    "SHV",
                                    "EN003",
                                    null,
                                    null,
                                    "French",
                                    "LP",
                                    "3",
                                    "Yu-Gi-Oh"));
        }
    }

    @Test
    void aTitleIsUsedForOneColumnAndTheMoreSpecificTitleWins() {
        // "Name" is a name column, but "Product Name" names the card better than "Name" does.
        Sheet sheet =
                parse("Name,Product Name,Set,Set Code\nPortfolio A,Ember Wyrmling,Tempest,TMP\n");

        assertThat(sheet.rows().get(0).name()).isEqualTo("Ember Wyrmling");
        assertThat(sheet.rows().get(0).set()).isEqualTo("Tempest");
        assertThat(CollectrCsvFormat.locate(List.of("Code", "Number", "Name")))
                .containsEntry(Column.NUMBER, 1)
                .containsEntry(Column.NAME, 2);
    }

    @Test
    void readsQuotedFieldsWithCommasLineBreaksAndQuotes() {
        Sheet sheet =
                parse(
                        "Product Name,Set,Quantity\r\n"
                                + "\"Monarch's Tempest Decree, Revised\",\"Gilded Labyrinth\r\nof"
                                + " Mirrors\",2\r\n"
                                + "\"The \"\"Lantern\"\" Fox\",Azure Dawn,\"1\"\r\n");

        assertThat(sheet.rows())
                .extracting(Row::name, Row::set, Row::quantity)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(
                                "Monarch's Tempest Decree, Revised",
                                "Gilded Labyrinth of Mirrors",
                                "2"),
                        org.assertj.core.groups.Tuple.tuple(
                                "The \"Lantern\" Fox", "Azure Dawn", "1"));
    }

    @Test
    void acceptsAByteOrderMarkAndTabsAsDelimiter() {
        byte[] bom = {(byte) 0xef, (byte) 0xbb, (byte) 0xbf};
        byte[] text =
                "Product Name\tSet\tQuantity\nStarlit Unicorn\tGilded, Labyrinth\t4\n"
                        .getBytes(StandardCharsets.UTF_8);
        byte[] file = new byte[bom.length + text.length];
        System.arraycopy(bom, 0, file, 0, bom.length);
        System.arraycopy(text, 0, file, bom.length, text.length);

        Sheet sheet = CollectrCsvParser.parse(file, LIMITS);

        assertThat(sheet.delimiter()).isEqualTo('\t');
        assertThat(sheet.columns()).contains(Column.NAME, Column.SET, Column.QUANTITY);
        assertThat(sheet.rows())
                .containsExactly(
                        new Row(
                                1,
                                "Starlit Unicorn",
                                "Gilded, Labyrinth",
                                null,
                                null,
                                null,
                                null,
                                null,
                                "4",
                                null));
    }

    @Test
    void aFileWithoutACardNameColumnIsRefusedWithAMessageThatNamesIt() {
        ImportFileException refusal =
                refused("Set,Card Number,Quantity,Market Price\nAzure Dawn,EN001,2,9.99\n", LIMITS);

        assertThat(refusal.reason()).isEqualTo(Reason.MISSING_COLUMNS);
        assertThat(refusal.missingColumns()).containsExactly("card name");
        assertThat(refusal.getMessage())
                .contains("card name", "Product Name", "Card Name")
                .doesNotContain("Azure Dawn", "9.99", "Market Price");
        // A file that is no table at all has no such column either.
        assertThat(refused("just some words\nand more words\n", LIMITS).reason())
                .isEqualTo(Reason.MISSING_COLUMNS);
    }

    @Test
    void columnsNobodyAskedForAreIgnoredAndShortRowsAreRead() {
        Sheet sheet =
                parse(
                        "Favourite Colour,Product Name,Shoe Size,Quantity,Unknown\n"
                                + "orange,Tidecaller Mermaid,44,2,x\n"
                                + "blue,Thunderwing Roc\n");

        assertThat(sheet.columns()).containsExactlyInAnyOrder(Column.NAME, Column.QUANTITY);
        assertThat(sheet.rows())
                .extracting(Row::row, Row::name, Row::quantity)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(1, "Tidecaller Mermaid", "2"),
                        org.assertj.core.groups.Tuple.tuple(2, "Thunderwing Roc", null));
        assertThat(sheet.toString()).doesNotContain("orange", "44");
    }

    @Test
    void blankLinesAndRowsWithoutANameAreLeftOut() {
        Sheet sheet =
                parse(
                        "Product Name,Quantity\n\nGravehollow Fiend,1\n,5\n   ,\n\r\nStarlit"
                                + " Unicorn,2\n");

        assertThat(sheet.rows())
                .extracting(Row::name)
                .containsExactly("Gravehollow Fiend", "Starlit Unicorn");
        assertThat(sheet.blankRows()).isEqualTo(1);
    }

    @Test
    void valuesAreTrimmedAndCutToWhatThePreviewKeeps() {
        String longName = "A".repeat(149) + "😀" + "B".repeat(40);

        Sheet sheet = parse("Product Name,Set\n\"  " + longName + "  \",  Azure   Dawn \n");

        Row row = sheet.rows().get(0);
        assertThat(row.name()).hasSize(149).doesNotContain("B");
        assertThat(row.set()).isEqualTo("Azure Dawn");
    }

    @Test
    void refusesMoreRowsThanTheLimit() {
        String header = "Product Name,Quantity\n";
        String three = "One,1\nTwo,1\nThree,1\n";

        assertThat(
                        CollectrCsvParser.parse(
                                        (header + three).getBytes(StandardCharsets.UTF_8),
                                        new Limits(4096, 3))
                                .rows())
                .hasSize(3);
        ImportFileException refusal = refused(header + three + "Four,1\n", new Limits(4096, 3));
        assertThat(refusal.reason()).isEqualTo(Reason.TOO_MANY_ROWS);
        assertThat(refusal.limit()).isEqualTo(3);
        assertThat(refusal.getMessage()).contains("3 rows").doesNotContain("Four");
    }

    @Test
    void refusesWhatIsNotAReadableTextTable() {
        assertThat(refused("Product Name,Set\n\"never closed,Azure Dawn\n", LIMITS).reason())
                .isEqualTo(Reason.MALFORMED);
        assertThat(refused("", LIMITS).reason()).isEqualTo(Reason.EMPTY_FILE);
        assertThat(refused("Product Name,Quantity\n", LIMITS).reason()).isEqualTo(Reason.NO_CARDS);
        assertThat(refused("Product Name,Quantity\n,3\n", LIMITS).reason())
                .isEqualTo(Reason.NO_CARDS);
        assertThat(refused("Product Name\nOne\n", new Limits(5, 10)).reason())
                .isEqualTo(Reason.TOO_LARGE);
        ImportFileException binary =
                catchThrowableOfType(
                        ImportFileException.class,
                        () ->
                                CollectrCsvParser.parse(
                                        new byte[] {'P', 'K', 3, 4, 20, 0, 0, 0, 8, 0}, LIMITS));
        assertThat(binary.reason())
                .as("a spreadsheet file renamed .csv")
                .isEqualTo(Reason.NOT_TEXT);
    }

    @Test
    void theValueTablesReadTheUsualSpellings() {
        assertThat(CollectrCsvFormat.condition("Near Mint")).contains("NEAR_MINT");
        assertThat(CollectrCsvFormat.condition("nm")).contains("NEAR_MINT");
        assertThat(CollectrCsvFormat.condition("Lightly Played")).contains("LIGHTLY_PLAYED");
        assertThat(CollectrCsvFormat.condition("MP")).contains("MODERATELY_PLAYED");
        assertThat(CollectrCsvFormat.condition("Heavily-Played")).contains("HEAVILY_PLAYED");
        assertThat(CollectrCsvFormat.condition("Damaged")).contains("DAMAGED");
        assertThat(CollectrCsvFormat.condition("Ungraded")).isEmpty();
        assertThat(CollectrCsvFormat.condition(null)).isEmpty();

        assertThat(CollectrCsvFormat.language("English")).contains("en");
        assertThat(CollectrCsvFormat.language("Français")).contains("fr");
        assertThat(CollectrCsvFormat.language("JP")).contains("ja");
        assertThat(CollectrCsvFormat.language("Klingon")).isEmpty();

        assertThat(CollectrCsvFormat.edition("1st Edition")).contains("FIRST_EDITION");
        assertThat(CollectrCsvFormat.edition("1st Edition Holofoil")).contains("FIRST_EDITION");
        assertThat(CollectrCsvFormat.edition("Unlimited")).contains("UNLIMITED");
        assertThat(CollectrCsvFormat.edition("Limited Edition")).contains("LIMITED");
        assertThat(CollectrCsvFormat.edition("Holofoil")).isEmpty();

        assertThat(CollectrCsvFormat.finish("Reverse Holofoil")).contains("REVERSE_HOLO");
        assertThat(CollectrCsvFormat.finish("Holofoil")).contains("HOLO");
        assertThat(CollectrCsvFormat.finish("Foil")).contains("FOIL");
        assertThat(CollectrCsvFormat.finish("Non-Foil")).contains("NORMAL");
        assertThat(CollectrCsvFormat.finish("1st Edition")).isEmpty();

        assertThat(CollectrCsvFormat.game("Yu-Gi-Oh!")).contains("yugioh");
        assertThat(CollectrCsvFormat.game("Pokémon")).contains("pokemon");
        assertThat(CollectrCsvFormat.game("Magic: The Gathering")).contains("mtg");
        assertThat(CollectrCsvFormat.game("Baseball Cards")).isEmpty();
    }
}
