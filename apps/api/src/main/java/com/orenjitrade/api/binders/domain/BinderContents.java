package com.orenjitrade.api.binders.domain;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Extension point implemented by the inventory module: what the binders module needs to know or do
 * about the items of a binder. Every callback runs inside the caller's transaction.
 */
public interface BinderContents {

    /**
     * Item statistics per binder (binders without items are absent).
     *
     * @param publicOnly games and cover taken from effectively public items only (public views)
     */
    Map<UUID, Stats> statsOf(Collection<UUID> binderIds, boolean publicOnly);

    /** The owner confirmed (or published) the binder: confirm every item in it. */
    void confirmItems(UUID ownerId, UUID binderId, Instant now);

    /**
     * The visibility, freshness or owner-facing state of these binders changed: re-evaluate the
     * effective visibility of their items (and emit the item publication events).
     */
    void afterBinderChange(UUID ownerId, Collection<UUID> binderIds);

    /**
     * The binder is about to be deleted: soft-delete its items ({@code deleteItems}) or unfile
     * them. Unfiled items keep their own visibility only when {@code keepVisibility} (the binder
     * was published without an end date); otherwise they become PRIVATE, so deleting a binder never
     * exposes a card that was not already public.
     */
    void releaseItems(
            UUID ownerId, UUID binderId, boolean deleteItems, boolean keepVisibility, Instant now);

    /**
     * Item statistics of one binder.
     *
     * @param itemCount non-deleted items
     * @param publicItemCount effectively public items
     * @param games game slugs of the counted items (public ones for public views), sorted
     * @param coverImageUrl image of the first (public) item: its first photo, else its printing
     *     image
     */
    record Stats(
            long itemCount,
            long publicItemCount,
            List<String> games,
            @Nullable String coverImageUrl) {

        public static final Stats EMPTY = new Stats(0, 0, List.of(), null);
    }
}
