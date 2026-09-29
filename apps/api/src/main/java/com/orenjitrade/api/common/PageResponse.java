package com.orenjitrade.api.common;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import org.springframework.data.domain.Page;

/**
 * Offset-paginated response envelope ({@code page}/{@code size} parameters). Used for admin lists
 * where jumping to an arbitrary page matters more than stability under concurrent inserts.
 */
@Schema(description = "Offset-paginated list")
public record PageResponse<T>(
        @Schema(description = "Items of the current page") List<T> items,
        @Schema(description = "Zero-based page index", example = "0") int page,
        @Schema(description = "Requested page size", example = "20") int size,
        @Schema(description = "Total number of items across all pages", example = "137")
                long totalItems,
        @Schema(description = "Total number of pages", example = "7") int totalPages) {

    public PageResponse {
        items = List.copyOf(items);
    }

    public static <T> PageResponse<T> of(List<T> items, int page, int size, long totalItems) {
        int totalPages = size <= 0 ? 0 : (int) Math.ceil((double) totalItems / size);
        return new PageResponse<>(items, page, size, totalItems, totalPages);
    }

    public static <T> PageResponse<T> from(Page<T> page) {
        return new PageResponse<>(
                page.getContent(),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages());
    }

    public boolean hasNext() {
        return page + 1 < totalPages;
    }
}
