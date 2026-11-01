package com.orenjitrade.api.inventory.domain.imports;

import com.orenjitrade.api.inventory.domain.imports.CollectrCsvFormat.Column;
import com.orenjitrade.api.inventory.domain.imports.ImportFileException.Reason;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.jspecify.annotations.Nullable;

/**
 * Reads a Collectr CSV export into the values the import uses, and nothing else. Pure: bytes in,
 * rows out. The columns are found through {@link CollectrCsvFormat} (the header is not confirmed);
 * a file without a card name column is refused with a message that names the column. Every column
 * no alias found is never read, so a price, a purchase date or a note of the export cannot reach
 * the preview, the database or a log.
 */
public final class CollectrCsvParser {

    static final int NAME_MAX = 150;
    static final int SET_MAX = 120;
    static final int NUMBER_MAX = 40;
    static final int RARITY_MAX = 60;
    static final int VALUE_MAX = 60;

    private CollectrCsvParser() {}

    /**
     * The limits of a CSV file.
     *
     * @param maxBytes largest file
     * @param maxRows most rows, the header not counted
     */
    public record Limits(int maxBytes, int maxRows) {}

    /**
     * One row as the file wrote it (trimmed, cut to the length the preview keeps); {@code null}
     * where the file has no such column or no value.
     *
     * @param row the row's number in the file (1 = first row under the header)
     * @param name card name
     * @param set set name or code
     * @param number collector number or printing code
     * @param rarity rarity
     * @param variant variant, finish or edition wording
     * @param language language
     * @param condition condition
     * @param quantity quantity as written
     * @param game game ("category")
     */
    public record Row(
            int row,
            String name,
            @Nullable String set,
            @Nullable String number,
            @Nullable String rarity,
            @Nullable String variant,
            @Nullable String language,
            @Nullable String condition,
            @Nullable String quantity,
            @Nullable String game) {}

    /**
     * A parsed file.
     *
     * @param rows the rows that name a card, in file order
     * @param blankRows rows without a card name (left out)
     * @param columns the columns the header has
     * @param delimiter the delimiter the file uses
     */
    public record Sheet(List<Row> rows, int blankRows, Set<Column> columns, char delimiter) {

        public Sheet {
            rows = List.copyOf(rows);
            columns = Set.copyOf(columns);
        }
    }

    /**
     * Parses a CSV export.
     *
     * @throws ImportFileException when the file is too large, not text, empty, cannot be read as
     *     CSV, has too many rows, lacks a needed column or lists no card
     */
    public static Sheet parse(byte[] bytes, Limits limits) {
        String text = ImportText.decode(bytes, limits.maxBytes());
        char delimiter = CsvReader.detectDelimiter(text);
        List<List<String>> records = CsvReader.read(text, delimiter, limits.maxRows() + 1);
        if (records.isEmpty()) {
            throw new ImportFileException(Reason.EMPTY_FILE, "The file is empty");
        }
        Map<Column, Integer> columns = CollectrCsvFormat.locate(records.get(0));
        List<String> missing = new ArrayList<>();
        StringBuilder wanted = new StringBuilder();
        for (Column required : CollectrCsvFormat.REQUIRED) {
            if (!columns.containsKey(required)) {
                missing.add(required.label());
                wanted.append(wanted.length() == 0 ? "" : "; ")
                        .append("the ")
                        .append(required.label())
                        .append(" (a column titled ")
                        .append(String.join(", ", CollectrCsvFormat.knownTitles(required)))
                        .append(")");
            }
        }
        if (!missing.isEmpty()) {
            throw new ImportFileException(
                    Reason.MISSING_COLUMNS,
                    "The first line of the file must title its columns, and this one has no"
                            + " column for "
                            + wanted,
                    null,
                    missing);
        }
        List<Row> rows = new ArrayList<>();
        int blank = 0;
        for (int index = 1; index < records.size(); index++) {
            List<String> record = records.get(index);
            @Nullable String name = value(record, columns.get(Column.NAME), NAME_MAX);
            if (name == null) {
                blank++;
                continue;
            }
            rows.add(
                    new Row(
                            index,
                            name,
                            value(record, columns.get(Column.SET), SET_MAX),
                            value(record, columns.get(Column.NUMBER), NUMBER_MAX),
                            value(record, columns.get(Column.RARITY), RARITY_MAX),
                            value(record, columns.get(Column.VARIANT), VALUE_MAX),
                            value(record, columns.get(Column.LANGUAGE), VALUE_MAX),
                            value(record, columns.get(Column.CONDITION), VALUE_MAX),
                            value(record, columns.get(Column.QUANTITY), VALUE_MAX),
                            value(record, columns.get(Column.GAME), VALUE_MAX)));
        }
        if (rows.isEmpty()) {
            throw new ImportFileException(
                    Reason.NO_CARDS, "The file lists no card: every row under its titles is empty");
        }
        return new Sheet(
                rows,
                blank,
                columns.isEmpty() ? EnumSet.noneOf(Column.class) : EnumSet.copyOf(columns.keySet()),
                delimiter);
    }

    /** The trimmed value of a column, cut to {@code max}; {@code null} when absent or blank. */
    private static @Nullable String value(List<String> record, @Nullable Integer index, int max) {
        if (index == null || index >= record.size()) {
            return null;
        }
        String value = record.get(index).strip().replaceAll("\\s+", " ");
        if (value.isEmpty()) {
            return null;
        }
        if (value.length() <= max) {
            return value;
        }
        // Never half of a surrogate pair: the database refuses a lone surrogate.
        int end = Character.isHighSurrogate(value.charAt(max - 1)) ? max - 1 : max;
        return value.substring(0, end).strip();
    }
}
