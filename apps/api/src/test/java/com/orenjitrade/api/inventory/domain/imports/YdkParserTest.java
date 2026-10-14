package com.orenjitrade.api.inventory.domain.imports;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

import com.orenjitrade.api.inventory.domain.imports.ImportFileException.Reason;
import com.orenjitrade.api.inventory.domain.imports.YdkParser.Deck;
import com.orenjitrade.api.inventory.domain.imports.YdkParser.Entry;
import com.orenjitrade.api.inventory.domain.imports.YdkParser.Limits;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

/** The YDK deck file parser: sections, copies, comments, line ends, and what it refuses. */
class YdkParserTest {

    private static final Limits LIMITS = new Limits(100 * 1024, 500);

    private static Deck parse(String text) {
        return YdkParser.parse(text.getBytes(StandardCharsets.UTF_8), LIMITS);
    }

    private static ImportFileException refused(byte[] bytes, Limits limits) {
        return catchThrowableOfType(
                ImportFileException.class, () -> YdkParser.parse(bytes, limits));
    }

    @Test
    void readsTheThreeSectionsAndCountsRepeatedPasscodes() {
        Deck deck =
                parse(
                        """
                        #created by a fictional player
                        #main
                        800000001
                        800000001
                        800000002
                        800000001
                        #extra
                        800000003
                        800000003
                        !side
                        800000002
                        800000004
                        """);

        assertThat(deck.entries())
                .containsExactly(
                        new Entry("800000001", 3, 0, 0),
                        new Entry("800000002", 1, 0, 1),
                        new Entry("800000003", 0, 2, 0),
                        new Entry("800000004", 0, 0, 1));
        assertThat(deck.entries().get(1).total()).isEqualTo(2);
        assertThat(deck.lines()).isEqualTo(12);
        assertThat(deck.ignoredLines()).isZero();
        assertThat(deck.ignoredLineNumbers()).isEmpty();
    }

    @Test
    void commentsAndBlankLinesMeanNothing() {
        Deck deck =
                parse(
                        "#created by someone\n\n#main\n# a note about the deck\n800000001\n\n   \n"
                                + "#extra\n#another note\n!side\n");

        assertThat(deck.entries()).containsExactly(new Entry("800000001", 1, 0, 0));
        assertThat(deck.ignoredLines()).isZero();
    }

    @Test
    void acceptsWindowsLineEndsAByteOrderMarkAndOldMacLineEnds() {
        byte[] bom = {(byte) 0xef, (byte) 0xbb, (byte) 0xbf};
        byte[] text =
                "#main\r\n800000001\r\n800000001\r\n!side\r\n800000002\r\n"
                        .getBytes(StandardCharsets.UTF_8);
        byte[] file = new byte[bom.length + text.length];
        System.arraycopy(bom, 0, file, 0, bom.length);
        System.arraycopy(text, 0, file, bom.length, text.length);

        Deck deck = YdkParser.parse(file, LIMITS);

        assertThat(deck.entries())
                .containsExactly(new Entry("800000001", 2, 0, 0), new Entry("800000002", 0, 0, 1));
        assertThat(deck.lines()).isEqualTo(5);
        assertThat(parse("#main\r800000001\r#extra\r800000002").entries())
                .containsExactly(new Entry("800000001", 1, 0, 0), new Entry("800000002", 0, 1, 0));
    }

    @Test
    void isLenientAboutMarkersLeadingZerosAndAPasscodeBeforeTheFirstMarker() {
        Deck deck = parse("00012345\n#MAIN  \n  12345  \n#Extra\n0000000007\n!SIDE\n12345\n");

        assertThat(deck.entries())
                .containsExactly(new Entry("12345", 2, 0, 1), new Entry("7", 0, 1, 0));
    }

    @Test
    void aLineThatIsNoPasscodeIsCountedAndNeverStopsTheRest() {
        Deck deck =
                parse(
                        """
                        #main
                        800000001
                        not a passcode
                        800 000 002
                        !sideboard
                        12345678901
                        0
                        -5
                        800000003
                        """);

        assertThat(deck.entries())
                .containsExactly(new Entry("800000001", 1, 0, 0), new Entry("800000003", 1, 0, 0));
        assertThat(deck.ignoredLines()).isEqualTo(6);
        assertThat(deck.ignoredLineNumbers()).containsExactly(3, 4, 5, 6, 7, 8);
    }

    @Test
    void keepsOnlyTheFirstIgnoredLineNumbers() {
        StringBuilder text = new StringBuilder("#main\n800000001\n");
        for (int index = 0; index < 25; index++) {
            text.append("junk\n");
        }

        Deck deck = parse(text.toString());

        assertThat(deck.ignoredLines()).isEqualTo(25);
        assertThat(deck.ignoredLineNumbers()).hasSize(YdkParser.IGNORED_SAMPLE).startsWith(3, 4);
    }

    @Test
    void refusesAFileThatIsNotText() {
        byte[] png = {(byte) 0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d};
        byte[] latin1 = "#main\n800000001\n#créé par moi\n".getBytes(StandardCharsets.ISO_8859_1);
        byte[] utf16 = "#main\n800000001\n".getBytes(StandardCharsets.UTF_16);
        byte[] withNul = "#main\n8000\u000000001\n".getBytes(StandardCharsets.UTF_8);

        for (byte[] file : new byte[][] {png, latin1, utf16, withNul}) {
            ImportFileException refusal = refused(file, LIMITS);
            assertThat(refusal).isNotNull();
            assertThat(refusal.reason()).isEqualTo(Reason.NOT_TEXT);
            assertThat(refusal.getMessage()).contains("UTF-8");
        }
    }

    @Test
    void refusesAFileAboveTheSizeLimitWhateverItHolds() {
        byte[] file = "#main\n800000001\n800000002\n".getBytes(StandardCharsets.UTF_8);

        ImportFileException refusal = refused(file, new Limits(file.length - 1, 500));

        assertThat(refusal.reason()).isEqualTo(Reason.TOO_LARGE);
        assertThat(refusal.limit()).isEqualTo(file.length - 1);
        assertThat(YdkParser.parse(file, new Limits(file.length, 500)).entries()).hasSize(2);
        assertThat(refused(new byte[200 * 1024], LIMITS).reason()).isEqualTo(Reason.TOO_LARGE);
        assertThat(refused(new byte[200 * 1024], LIMITS).getMessage()).contains("100 kB");
    }

    @Test
    void refusesAFileWithMoreLinesThanTheLimit() {
        String three = "#main\n800000001\n800000002\n";

        assertThat(
                        YdkParser.parse(three.getBytes(StandardCharsets.UTF_8), new Limits(1024, 3))
                                .lines())
                .as("the line break that ends the last line starts no new one")
                .isEqualTo(3);
        ImportFileException refusal =
                refused(
                        (three + "800000003").getBytes(StandardCharsets.UTF_8),
                        new Limits(1024, 3));
        assertThat(refusal.reason()).isEqualTo(Reason.TOO_MANY_LINES);
        assertThat(refusal.limit()).isEqualTo(3);
        // Comments and blank lines count: the limit is about the file, not about the deck.
        assertThat(
                        refused(
                                        "#main\n\n\n#note\n800000001\n"
                                                .getBytes(StandardCharsets.UTF_8),
                                        new Limits(1024, 4))
                                .reason())
                .isEqualTo(Reason.TOO_MANY_LINES);
    }

    @Test
    void refusesAnEmptyFileAndAFileThatListsNoCard() {
        assertThat(refused(new byte[0], LIMITS).reason()).isEqualTo(Reason.EMPTY_FILE);
        assertThat(refused(" \n\n".getBytes(StandardCharsets.UTF_8), LIMITS).reason())
                .isEqualTo(Reason.EMPTY_FILE);
        assertThat(
                        refused(
                                        "#created by nobody\n#main\n#extra\n!side\n"
                                                .getBytes(StandardCharsets.UTF_8),
                                        LIMITS)
                                .reason())
                .isEqualTo(Reason.NO_CARDS);
    }

    @Test
    void aRefusalNeverRepeatsWhatTheFileHolds() {
        String secret = "zqsecretword";

        ImportFileException noCards =
                refused(("#main\n" + secret + "\n").getBytes(StandardCharsets.UTF_8), LIMITS);
        ImportFileException tooManyLines =
                refused(
                        ("#main\n800000001\n" + secret + "\n").getBytes(StandardCharsets.UTF_8),
                        new Limits(1024, 2));

        assertThat(noCards.getMessage()).doesNotContain(secret);
        assertThat(tooManyLines.getMessage()).doesNotContain(secret).doesNotContain("800000001");
    }
}
