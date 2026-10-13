package com.orenjitrade.api.inventory.domain.imports;

import com.orenjitrade.api.inventory.domain.imports.ImportFileException.Reason;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * Reads a YDK deck file (YGOPro and the simulators built on it). Pure: bytes in, cards out.
 *
 * <p>The format is a text file with one card passcode per line under three section markers: {@code
 * #main}, {@code #extra} and {@code !side}. Every other line that starts with {@code #} is a
 * comment (files begin with {@code #created by ...}). Blank lines mean nothing; lines end with LF
 * or CRLF; some tools write a byte-order mark. A passcode repeated in a section is as many copies
 * of the card, so the copies are counted per section and in total.
 *
 * <p>Lenient where it costs nothing: markers in any letter case, passcodes written with leading
 * zeros (the catalog stores them without), a passcode before the first marker (counted in the main
 * deck). A line that is none of the above is counted as ignored and never stops the rest.
 */
public final class YdkParser {

    /** A passcode: up to ten digits (real ones have eight; providers use longer ids too). */
    private static final Pattern PASSCODE = Pattern.compile("^[0-9]{1,10}$");

    private static final Pattern LINE_END = Pattern.compile("\r\n|\n|\r");

    /** How many ignored line numbers a result keeps (the count is always complete). */
    static final int IGNORED_SAMPLE = 10;

    private YdkParser() {}

    /** The sections of a deck file. */
    public enum Section {
        MAIN,
        EXTRA,
        SIDE
    }

    /**
     * The limits of a YDK file.
     *
     * @param maxBytes largest file
     * @param maxLines most lines (every line counts, comments and blank ones too)
     */
    public record Limits(int maxBytes, int maxLines) {}

    /**
     * One card of the deck.
     *
     * @param passcode the passcode without leading zeros
     * @param main copies in the main deck
     * @param extra copies in the extra deck
     * @param side copies in the side deck
     */
    public record Entry(String passcode, int main, int extra, int side) {

        public int total() {
            return main + extra + side;
        }
    }

    /**
     * A parsed deck.
     *
     * @param entries the cards in the order of their first line
     * @param lines lines of the file
     * @param ignoredLines lines that are no passcode, marker, comment or blank line
     * @param ignoredLineNumbers the first of those lines (1-based), for a message
     */
    public record Deck(
            List<Entry> entries, int lines, int ignoredLines, List<Integer> ignoredLineNumbers) {

        public Deck {
            entries = List.copyOf(entries);
            ignoredLineNumbers = List.copyOf(ignoredLineNumbers);
        }
    }

    /**
     * Parses a deck file.
     *
     * @throws ImportFileException when the file is too large, not text, empty, has too many lines
     *     or lists no card
     */
    public static Deck parse(byte[] bytes, Limits limits) {
        String text = ImportText.decode(bytes, limits.maxBytes());
        String[] lines = LINE_END.split(text, -1);
        int lineCount = lines.length;
        if (lineCount > 0 && lines[lineCount - 1].isEmpty()) {
            lineCount--; // the line break that ends the last line starts no new one
        }
        if (lineCount > limits.maxLines()) {
            throw new ImportFileException(
                    Reason.TOO_MANY_LINES,
                    "The file has more than " + limits.maxLines() + " lines",
                    limits.maxLines());
        }
        Map<String, int[]> counts = new LinkedHashMap<>();
        List<Integer> ignored = new ArrayList<>();
        int ignoredCount = 0;
        Section section = Section.MAIN;
        for (int index = 0; index < lineCount; index++) {
            String line = lines[index].strip();
            if (line.isEmpty()) {
                continue;
            }
            String marker = line.toLowerCase(Locale.ROOT);
            if (marker.equals("#main")) {
                section = Section.MAIN;
            } else if (marker.equals("#extra")) {
                section = Section.EXTRA;
            } else if (marker.equals("!side")) {
                section = Section.SIDE;
            } else if (line.charAt(0) == '#') {
                continue; // a comment
            } else {
                @Nullable String passcode = passcode(line);
                if (passcode == null) {
                    ignoredCount++;
                    if (ignored.size() < IGNORED_SAMPLE) {
                        ignored.add(index + 1);
                    }
                } else {
                    counts.computeIfAbsent(passcode, key -> new int[3])[section.ordinal()]++;
                }
            }
        }
        if (counts.isEmpty()) {
            throw new ImportFileException(
                    Reason.NO_CARDS,
                    "The file lists no card: a deck file has one card passcode per line under"
                            + " #main, #extra and !side");
        }
        List<Entry> entries = new ArrayList<>();
        counts.forEach(
                (passcode, count) ->
                        entries.add(new Entry(passcode, count[0], count[1], count[2])));
        return new Deck(entries, lineCount, ignoredCount, ignored);
    }

    /** The passcode a line holds, without leading zeros; {@code null} for anything else. */
    private static @Nullable String passcode(String line) {
        if (!PASSCODE.matcher(line).matches()) {
            return null;
        }
        int start = 0;
        while (start < line.length() && line.charAt(start) == '0') {
            start++;
        }
        return start == line.length() ? null : line.substring(start);
    }
}
