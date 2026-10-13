package com.orenjitrade.api.inventory.domain.imports;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * An import preview ({@code inventory_import}).
 *
 * @param id the import
 * @param ownerId its collector
 * @param source where the file came from
 * @param status where the import stands
 * @param includeMain YDK: the main deck counts
 * @param includeExtra YDK: the extra deck counts
 * @param includeSide YDK: the side deck counts
 * @param ignoredLines lines of the file that were no card
 * @param revision raised by every edit
 * @param totalChunks chunks the commit writes; {@code null} until it starts
 * @param chunksDone chunks written
 * @param chunkNewItems the new items each chunk was planned to create when the commit started
 *     (element 0 = chunk 1): the room the commit reserves under {@code inventory.items.max} until
 *     the chunk is written; {@code null} when no limit applied then (or before the commit)
 * @param result counts of the commit so far
 * @param createdAt upload time
 * @param expiresAt until when the preview (or its result) is kept
 * @param committedAt when the last chunk was written
 */
public record ImportRecord(
        UUID id,
        UUID ownerId,
        ImportSource source,
        ImportStatus status,
        boolean includeMain,
        boolean includeExtra,
        boolean includeSide,
        int ignoredLines,
        long revision,
        @Nullable Integer totalChunks,
        int chunksDone,
        @Nullable List<Integer> chunkNewItems,
        ImportResult result,
        Instant createdAt,
        Instant expiresAt,
        @Nullable Instant committedAt) {

    public ImportRecord {
        chunkNewItems = chunkNewItems == null ? null : List.copyOf(chunkNewItems);
    }

    /**
     * The new items {@code chunk} (from 1) was planned to create; {@code null} when the commit
     * reserved nothing.
     */
    public @Nullable Integer plannedNewItems(int chunk) {
        List<Integer> planned = chunkNewItems;
        return planned == null || chunk < 1 || chunk > planned.size()
                ? null
                : planned.get(chunk - 1);
    }

    /** Whether a PENDING preview can no longer be used. */
    public boolean expired(Instant now) {
        return status == ImportStatus.PENDING && !expiresAt.isAfter(now);
    }
}
