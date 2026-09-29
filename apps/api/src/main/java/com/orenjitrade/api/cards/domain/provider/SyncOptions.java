package com.orenjitrade.api.cards.domain.provider;

import java.time.Instant;
import org.jspecify.annotations.Nullable;

/**
 * Options of {@link CardProvider#syncCards}.
 *
 * @param mode full or incremental
 * @param since lower bound of changes for {@link SyncMode#INCREMENTAL} (last successful run)
 */
public record SyncOptions(SyncMode mode, @Nullable Instant since) {

    public static SyncOptions full() {
        return new SyncOptions(SyncMode.FULL, null);
    }
}
