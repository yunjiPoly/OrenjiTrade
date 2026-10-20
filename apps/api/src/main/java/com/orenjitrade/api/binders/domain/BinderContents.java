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
     * @param publicOnly public views: the cover from effectively public items only, the games from
     *     the cards buyers see (a public deck core's cards included)
     */
    Map<UUID, Stats> statsOf(Collection<UUID> binderIds, boolean publicOnly);

    /**
     * Up to {@code max} card pictures per binder (the printing images of its first items, one per
     * printing, in the order the items were added); binders without items are absent.
     *
     * @param publicOnly public views: the cards buyers see only (effectively public items, and
     *     every live card of a public deck core)
     */
    Map<UUID, List<String>> previewImagesOf(
            Collection<UUID> binderIds, boolean publicOnly, int max);

    /**
     * The catalog picture of the first card each sold deck core's sale took out of the inventory
     * (stage R4, review fix 1, F7); binders not sold, or without such a card, are absent.
     */
    Map<UUID, String> soldDeckCorePicturesOf(Collection<UUID> binderIds);

    /**
     * The cards of each binder with their copies (every printing of a card together), most copies
     * first, then by name; at most {@code max} per binder; binders without items are absent.
     *
     * @param publicOnly public views: every live card of a public deck core, whatever the card's
     *     own visibility (its cards sell only together, owner spec 2026-10-14, section 7)
     */
    Map<UUID, List<KeyCard>> keyCardsOf(Collection<UUID> binderIds, boolean publicOnly, int max);

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
     * Whether the binder still names a deleted card that an undo can bring back into it (the
     * owner's own delete, a sale: {@code restorable_until} not yet passed). Stage G: a binder's
     * game changes only while it holds no card, and such a card would come back into a binder of
     * another game.
     */
    boolean holdsRestorableCards(UUID binderId, Instant now);

    /**
     * Item statistics of one binder.
     *
     * @param itemCount non-deleted items
     * @param publicItemCount effectively public items
     * @param games game slugs of the counted items (for public views those of the cards buyers see,
     *     a public deck core's cards included), sorted
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
