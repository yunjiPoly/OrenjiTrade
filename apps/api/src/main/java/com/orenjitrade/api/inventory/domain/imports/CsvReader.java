package com.orenjitrade.api.inventory.domain.imports;

import com.orenjitrade.api.inventory.domain.imports.ImportFileException.Reason;
import java.util.ArrayList;
import java.util.List;

/**
 * A small CSV reader (RFC 4180): fields separated by one delimiter, a field may be quoted with
 * double quotes, a quote inside a quoted field is doubled, and a quoted field may hold the
 * delimiter and line breaks. Records end with LF, CRLF or CR. Pure; no dependency, because the
 * import needs nothing a library would add.
 */
public final class CsvReader {

    /** The delimiters an export or a spreadsheet that saved it again can use. */
    static final char[] DELIMITERS = {',', ';', '\t', '|'};

    private CsvReader() {}

    /**
     * The delimiter of {@code text}: the candidate that separates the most fields of the first
     * record (the header), the comma when none does. A spreadsheet in a locale whose decimal sign
     * is the comma saves CSV files with semicolons; some tools use tabs.
     */
    public static char detectDelimiter(String text) {
        int start = 0;
        while (start < text.length() && Character.isWhitespace(text.charAt(start))) {
            start++;
        }
        char best = ',';
        int bestCount = 0;
        for (char candidate : DELIMITERS) {
            int count = 0;
            boolean quoted = false;
            for (int index = start; index < text.length(); index++) {
                char c = text.charAt(index);
                if (c == '"') {
                    quoted = !quoted;
                } else if (!quoted && (c == '\n' || c == '\r')) {
                    break;
                } else if (!quoted && c == candidate) {
                    count++;
                }
            }
            if (count > bestCount) {
                best = candidate;
                bestCount = count;
            }
        }
        return best;
    }

    /**
     * The records of {@code text}; records without any content (blank lines) are left out.
     *
     * @param maxRecords most records to read, the header included
     * @throws ImportFileException {@link Reason#TOO_MANY_ROWS} beyond {@code maxRecords}, {@link
     *     Reason#MALFORMED} when a quoted field never ends
     */
    public static List<List<String>> read(String text, char delimiter, int maxRecords) {
        List<List<String>> records = new ArrayList<>();
        List<String> record = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean quoted = false;
        boolean wasQuoted = false;
        int length = text.length();
        for (int index = 0; index < length; index++) {
            char c = text.charAt(index);
            if (quoted) {
                if (c == '"') {
                    if (index + 1 < length && text.charAt(index + 1) == '"') {
                        field.append('"');
                        index++;
                    } else {
                        quoted = false;
                    }
                } else {
                    field.append(c);
                }
            } else if (c == '"' && field.length() == 0 && !wasQuoted) {
                quoted = true;
                wasQuoted = true;
            } else if (c == delimiter) {
                record.add(field.toString());
                field.setLength(0);
                wasQuoted = false;
            } else if (c == '\n' || c == '\r') {
                if (c == '\r' && index + 1 < length && text.charAt(index + 1) == '\n') {
                    index++;
                }
                record.add(field.toString());
                field.setLength(0);
                wasQuoted = false;
                add(records, record, maxRecords);
                record = new ArrayList<>();
            } else {
                field.append(c);
            }
        }
        if (quoted) {
            throw new ImportFileException(
                    Reason.MALFORMED, "The file cannot be read as CSV: a quoted field never ends");
        }
        record.add(field.toString());
        add(records, record, maxRecords);
        return records;
    }

    private static void add(List<List<String>> records, List<String> record, int maxRecords) {
        boolean blank = record.stream().allMatch(String::isBlank);
        if (blank) {
            return;
        }
        if (records.size() >= maxRecords) {
            throw new ImportFileException(
                    Reason.TOO_MANY_ROWS,
                    "The file has more than " + (maxRecords - 1) + " rows",
                    maxRecords - 1);
        }
        records.add(record);
    }
}
