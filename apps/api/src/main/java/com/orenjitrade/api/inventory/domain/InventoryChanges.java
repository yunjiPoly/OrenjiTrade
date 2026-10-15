package com.orenjitrade.api.inventory.domain;

import com.orenjitrade.api.binders.domain.ListingVisibility;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Owner input and queries of the inventory (validated by {@link InventoryService}). */
public final class InventoryChanges {

    private InventoryChanges() {}

    /**
     * A new item; {@code null} means the documented default.
     *
     * @param printingId printing (required)
     * @param quantity 1 by default
     * @param condition NEAR_MINT by default (must be one of the game's conditions)
     * @param language the printing's language by default
     * @param edition the printing's edition by default
     * @param finish the printing's finish by default
     * @param askingPrice no price by default
     * @param currency CAD by default
     * @param availability COLLECTION_ONLY by default
     * @param acceptsOffers false by default
     * @param notes private notes
     * @param publicNotes public notes
     * @param visibility PUBLIC inside a binder (the binder decides), PRIVATE otherwise
     * @param publicUntil end of a TEMPORARILY_PUBLIC publication
     * @param binderId binder (the caller's)
     * @param askingPriceText the asking price as typed (stage R2); a plain amount also gives {@code
     *     askingPrice}, which must then be absent
     * @param conditionStated {@code false}: the condition is not stated ({@code condition} must be
     *     absent); {@code null} or {@code true}: {@code condition} or its default
     */
    public record NewItem(
            UUID printingId,
            @Nullable Integer quantity,
            @Nullable String condition,
            @Nullable String language,
            @Nullable String edition,
            @Nullable String finish,
            @Nullable BigDecimal askingPrice,
            @Nullable String currency,
            @Nullable Availability availability,
            @Nullable Boolean acceptsOffers,
            @Nullable String notes,
            @Nullable String publicNotes,
            @Nullable ListingVisibility visibility,
            @Nullable Instant publicUntil,
            @Nullable UUID binderId,
            @Nullable String askingPriceText,
            @Nullable Boolean conditionStated) {

        /** A new item without the stage R2 fields (the asking price text, a stated condition). */
        public NewItem(
                UUID printingId,
                @Nullable Integer quantity,
                @Nullable String condition,
                @Nullable String language,
                @Nullable String edition,
                @Nullable String finish,
                @Nullable BigDecimal askingPrice,
                @Nullable String currency,
                @Nullable Availability availability,
                @Nullable Boolean acceptsOffers,
                @Nullable String notes,
                @Nullable String publicNotes,
                @Nullable ListingVisibility visibility,
                @Nullable Instant publicUntil,
                @Nullable UUID binderId) {
            this(
                    printingId,
                    quantity,
                    condition,
                    language,
                    edition,
                    finish,
                    askingPrice,
                    currency,
                    availability,
                    acceptsOffers,
                    notes,
                    publicNotes,
                    visibility,
                    publicUntil,
                    binderId,
                    null,
                    null);
        }
    }

    /**
     * A partial update: a field is changed only when {@link #has(String)} says it was sent;
     * nullable fields ({@code askingPrice}, {@code askingPriceText}, {@code publicUntil}, {@code
     * binderId}, {@code notes}, {@code publicNotes}) may then be cleared. {@code confirm} (stage
     * R2, "Save changes" on the phone) also confirms the item, as {@code POST .../confirm} does.
     */
    public record ItemPatch(
            java.util.Set<String> present,
            @Nullable UUID printingId,
            @Nullable Integer quantity,
            @Nullable String condition,
            @Nullable String language,
            @Nullable String edition,
            @Nullable String finish,
            @Nullable BigDecimal askingPrice,
            @Nullable String currency,
            @Nullable Availability availability,
            @Nullable Boolean acceptsOffers,
            @Nullable String notes,
            @Nullable String publicNotes,
            @Nullable ListingVisibility visibility,
            @Nullable Instant publicUntil,
            @Nullable UUID binderId,
            @Nullable String askingPriceText,
            boolean confirm) {

        public ItemPatch {
            present = java.util.Set.copyOf(present);
        }

        /** A patch without the stage R2 fields. */
        public ItemPatch(
                java.util.Set<String> present,
                @Nullable UUID printingId,
                @Nullable Integer quantity,
                @Nullable String condition,
                @Nullable String language,
                @Nullable String edition,
                @Nullable String finish,
                @Nullable BigDecimal askingPrice,
                @Nullable String currency,
                @Nullable Availability availability,
                @Nullable Boolean acceptsOffers,
                @Nullable String notes,
                @Nullable String publicNotes,
                @Nullable ListingVisibility visibility,
                @Nullable Instant publicUntil,
                @Nullable UUID binderId) {
            this(
                    present,
                    printingId,
                    quantity,
                    condition,
                    language,
                    edition,
                    finish,
                    askingPrice,
                    currency,
                    availability,
                    acceptsOffers,
                    notes,
                    publicNotes,
                    visibility,
                    publicUntil,
                    binderId,
                    null,
                    false);
        }

        public boolean has(String field) {
            return present.contains(field);
        }
    }

    /** Bulk actions of {@code POST /inventory/items/bulk}. */
    public enum BulkAction {
        SET_VISIBILITY,
        MOVE_TO_BINDER,
        SET_AVAILABILITY,
        CONFIRM,
        DELETE
    }

    /**
     * A bulk request.
     *
     * @param itemIds items (the caller's; others are skipped as NOT_FOUND)
     * @param action what to do
     * @param visibility SET_VISIBILITY target
     * @param publicUntil SET_VISIBILITY end of a temporary publication
     * @param binderId MOVE_TO_BINDER target ({@code null} = unfiled)
     * @param availability SET_AVAILABILITY target
     */
    public record BulkRequest(
            List<UUID> itemIds,
            BulkAction action,
            @Nullable ListingVisibility visibility,
            @Nullable Instant publicUntil,
            @Nullable UUID binderId,
            @Nullable Availability availability) {}

    /** Why a bulk request skipped an item. */
    public enum SkipReason {
        /** Unknown, deleted or not the caller's item. */
        NOT_FOUND,
        /** Already in the requested state. */
        UNCHANGED
    }

    /**
     * An item skipped by a bulk request.
     *
     * @param itemId the item
     * @param reason why
     */
    public record Skipped(UUID itemId, SkipReason reason) {}

    /**
     * Outcome of a bulk request.
     *
     * @param updated items changed
     * @param skipped items left alone, with the reason
     */
    public record BulkResult(int updated, List<Skipped> skipped) {}

    /**
     * What makes two copies one inventory item for an import: the printing, the condition, the
     * edition and the language (owner spec 2026-10-08, section 6).
     *
     * @param printingId printing
     * @param condition condition code
     * @param edition edition code of the copy
     * @param language language of the copy
     */
    public record MergeKey(UUID printingId, String condition, String edition, String language) {}

    /**
     * One line of an import, validated and normalised by the caller: the copies to add to the
     * owner's equal item, or a new PRIVATE unfiled item when there is none.
     *
     * @param printingId printing (of an ACTIVE game)
     * @param condition condition code of the game
     * @param language language of the copy
     * @param edition edition of the copy
     * @param finish finish (the printing's)
     * @param quantity copies, 1-9999
     */
    public record ImportLine(
            UUID printingId,
            String condition,
            String language,
            String edition,
            String finish,
            int quantity) {

        public MergeKey key() {
            return new MergeKey(printingId, condition, edition, language);
        }
    }

    /**
     * What a chunk of an import wrote.
     *
     * @param created new items
     * @param merged existing items whose quantity was raised
     * @param copies copies added (fewer than asked when an item reached 9 999)
     * @param notAdded copies asked for and not added because their item reached 9 999
     */
    public record ImportOutcome(int created, int merged, int copies, int notAdded) {}

    /**
     * The copies an owner holds in the items equal to some lines of an import.
     *
     * @param privateCopies in private items: an import adds its copies to such an item
     * @param shownCopies in items the owner shows (visibility other than PRIVATE): an import never
     *     raises those, its copies become a private item of their own
     */
    public record OwnedCopies(
            Map<MergeKey, Integer> privateCopies, Map<MergeKey, Integer> shownCopies) {}

    /** Sort keys of the owner's inventory list. */
    public enum SortKey {
        UPDATED,
        NAME,
        PRICE,
        /** Creation, newest first by default: "Recently added" on the phone (stage R2). */
        CREATED
    }

    /**
     * Filters of the owner's inventory list.
     *
     * @param query card name, printing code or set code/name
     * @param game game slug
     * @param binderId only this binder
     * @param unfiled only items without a binder
     * @param visibility only this visibility
     * @param markedPublic only the items set to public: PUBLIC or TEMPORARILY_PUBLIC (the phone's
     *     "Public" filter, review fix 1 of stage R2)
     * @param availability only this availability
     * @param condition only this condition
     * @param freshness only this freshness
     * @param sort sort key
     * @param descending sort direction
     * @param page zero-based page
     * @param size page size
     */
    public record OwnerQuery(
            @Nullable String query,
            @Nullable String game,
            @Nullable UUID binderId,
            boolean unfiled,
            @Nullable ListingVisibility visibility,
            boolean markedPublic,
            @Nullable Availability availability,
            @Nullable String condition,
            @Nullable FreshnessState freshness,
            SortKey sort,
            boolean descending,
            int page,
            int size) {}

    /**
     * Filters of public item lists.
     *
     * @param query card name, printing code or set code/name
     * @param game game slug
     * @param availability only this availability
     * @param page zero-based page
     * @param size page size
     */
    public record PublicQuery(
            @Nullable String query,
            @Nullable String game,
            @Nullable Availability availability,
            int page,
            int size) {}
}
