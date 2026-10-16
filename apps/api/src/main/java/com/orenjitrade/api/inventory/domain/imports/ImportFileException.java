package com.orenjitrade.api.inventory.domain.imports;

import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * An uploaded import file was refused. The message is written for the collector and never carries
 * anything read from the file (the content of an import file is never logged, and messages reach
 * the log): only our own limits, column names and line numbers.
 */
public class ImportFileException extends RuntimeException {

    /** Why a file was refused. */
    public enum Reason {
        /** More bytes than the limit of its source. */
        TOO_LARGE,
        /** Not a UTF-8 text file (binary content, another encoding). */
        NOT_TEXT,
        /** No content at all. */
        EMPTY_FILE,
        /** A YDK file with more lines than the limit. */
        TOO_MANY_LINES,
        /** A CSV file with more rows than the limit. */
        TOO_MANY_ROWS,
        /** A CSV file without the columns the import needs. */
        MISSING_COLUMNS,
        /** A CSV file whose quoting cannot be read. */
        MALFORMED,
        /** A readable file that lists no card. */
        NO_CARDS
    }

    private final Reason reason;
    private final @Nullable Integer limit;
    private final List<String> missingColumns;

    public ImportFileException(Reason reason, String message) {
        this(reason, message, null, List.of());
    }

    public ImportFileException(Reason reason, String message, @Nullable Integer limit) {
        this(reason, message, limit, List.of());
    }

    public ImportFileException(
            Reason reason, String message, @Nullable Integer limit, List<String> missingColumns) {
        super(message);
        this.reason = reason;
        this.limit = limit;
        this.missingColumns = List.copyOf(missingColumns);
    }

    public Reason reason() {
        return reason;
    }

    /** The limit that was passed (bytes, lines or rows), when the reason is a limit. */
    public @Nullable Integer limit() {
        return limit;
    }

    /** The needed columns that were not found ({@link Reason#MISSING_COLUMNS}). */
    public List<String> missingColumns() {
        return missingColumns;
    }
}
