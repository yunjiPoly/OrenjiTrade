package com.orenjitrade.api.common;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * Cursor-paginated response envelope ({@code cursor}/{@code limit} parameters). Used for feeds,
 * messages and notifications where new rows arrive continuously. The cursor is opaque to clients.
 */
@Schema(description = "Cursor-paginated list")
public record CursorPage<T>(
        @Schema(description = "Items of the current slice") List<T> items,
        @Schema(
                        description =
                                "Opaque cursor to pass as the cursor parameter for the next slice;"
                                        + " absent when there is no more data",
                        nullable = true)
                @Nullable String nextCursor,
        @Schema(description = "Whether another slice exists") boolean hasMore) {

    public CursorPage {
        items = List.copyOf(items);
    }

    /** A slice followed by more data reachable with {@code nextCursor}. */
    public static <T> CursorPage<T> of(List<T> items, @Nullable String nextCursor) {
        return new CursorPage<>(items, nextCursor, nextCursor != null);
    }

    /** The final slice. */
    public static <T> CursorPage<T> last(List<T> items) {
        return new CursorPage<>(items, null, false);
    }
}
