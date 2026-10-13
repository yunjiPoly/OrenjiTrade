package com.orenjitrade.api.inventory.domain.imports;

import java.time.Instant;
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
        ImportResult result,
        Instant createdAt,
        Instant expiresAt,
        @Nullable Instant committedAt) {

    /** Whether a PENDING preview can no longer be used. */
    public boolean expired(Instant now) {
        return status == ImportStatus.PENDING && !expiresAt.isAfter(now);
    }
}
