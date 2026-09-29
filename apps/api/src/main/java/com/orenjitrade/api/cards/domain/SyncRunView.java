package com.orenjitrade.api.cards.domain;

import com.orenjitrade.api.cards.domain.provider.SyncMode;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A catalog import run.
 *
 * @param id run id
 * @param provider provider id
 * @param game game slug
 * @param mode FULL or INCREMENTAL
 * @param status lifecycle state
 * @param requestedBy admin who requested it ({@code null} for the local seed)
 * @param createdAt request time
 * @param startedAt start of the import
 * @param finishedAt end of the import
 * @param setsUpserted sets inserted or changed
 * @param cardsUpserted cards inserted or changed
 * @param printingsUpserted printings inserted or changed
 * @param error client-safe failure summary
 */
@Schema(name = "CatalogSyncRun", description = "Catalog import run")
public record SyncRunView(
        UUID id,
        @Schema(example = "mock") String provider,
        @Schema(example = "yugioh") String game,
        SyncMode mode,
        SyncRunStatus status,
        @Nullable UUID requestedBy,
        Instant createdAt,
        @Nullable Instant startedAt,
        @Nullable Instant finishedAt,
        int setsUpserted,
        int cardsUpserted,
        int printingsUpserted,
        @Nullable String error) {}
