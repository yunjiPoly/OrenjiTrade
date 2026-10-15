package com.orenjitrade.api.inventory.domain;

import com.orenjitrade.api.binders.domain.BinderService;
import com.orenjitrade.api.binders.domain.BinderView;
import com.orenjitrade.api.cards.domain.CatalogService;
import com.orenjitrade.api.cards.domain.PrintingSummary;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository.DeleteState;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository.LockedItem;
import java.time.Instant;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * What a chat and a sale need from the inventory (stage R4 of the phone redesign, "Messages and
 * Mark as sold"; owner spec 2026-10-14, section 12 "Messaging and sales"): the card a chat is about
 * ({@link #chatCards}), Mark as sold ({@link #sellCopies}, {@link #sellDeckCore}) and its undo
 * ({@link #unsellCopies}, {@link #unsellDeckCore}).
 *
 * <p>Selling writes inventory items and binders, so every write here follows the lock rule of
 * docs/database/schema.md, "Locks of binders and inventory items": {@link BinderService#lockOwners}
 * first, then the binder rows, then the item rows, each in ascending id and {@code FOR NO KEY
 * UPDATE}. A sale lowers the copies; at 0 the card leaves the inventory as an owner's delete does
 * (soft delete, restorable with its photos for {@link InventoryService#RESTORE_WINDOW}), so the
 * undo puts back exactly what was there: copies, binder, visibility, price, note and photos. A deck
 * core is marked sold ({@code binder.sold_at}) and its cards leave with it the same way.
 */
@Service
public class InventorySales {

    private static final Logger log = LoggerFactory.getLogger(InventorySales.class);

    private final InventoryItemRepository items;
    private final InventoryService inventory;
    private final BinderService binders;
    private final ListingReconciler reconciler;
    private final TimeProvider timeProvider;

    public InventorySales(
            InventoryItemRepository items,
            InventoryService inventory,
            BinderService binders,
            ListingReconciler reconciler,
            TimeProvider timeProvider) {
        this.items = items;
        this.inventory = inventory;
        this.binders = binders;
        this.reconciler = reconciler;
        this.timeProvider = timeProvider;
    }

    // ---------------------------------------------------------------------------------------
    // The card a chat is about
    // ---------------------------------------------------------------------------------------

    /**
     * Items as the subjects of chats, whatever their state (unknown ids and items purged with their
     * account are absent): the card, its code, rarity and picture, the price as typed, the copies,
     * whether it is still in the inventory and whether buyers can find it on its own now.
     */
    @Transactional(readOnly = true)
    public Map<UUID, ChatCard> chatCards(Collection<UUID> itemIds) {
        if (itemIds.isEmpty()) {
            return Map.of();
        }
        List<UUID> ids = List.copyOf(new LinkedHashSet<>(itemIds));
        Set<UUID> deleted = items.deletedAmong(ids);
        Map<UUID, ChatCard> result = new LinkedHashMap<>();
        for (InventoryItemView view : inventory.views(items.findByIds(ids, timeProvider.now()))) {
            ItemRow row = view.row();
            PrintingSummary printing = view.printing();
            boolean live = !deleted.contains(row.id());
            result.put(
                    row.id(),
                    new ChatCard(
                            row.id(),
                            row.ownerId(),
                            row.cardId(),
                            row.printingId(),
                            row.cardName(),
                            printing.printingCode(),
                            printing.rarity(),
                            row.game(),
                            CatalogService.frontImage(printing),
                            row.askingPriceText(),
                            row.quantity(),
                            live,
                            live && row.effectivePublic()));
        }
        return result;
    }

    /**
     * Holds an item {@code FOR KEY SHARE} before a chat names it as its subject (the lock of the
     * foreign key check, taken first so that a binder delete or an account purge holding the item
     * never waits for the chat's row in turn); joins the caller's transaction.
     *
     * @return whether the item exists (live or deleted)
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public boolean lockForReference(UUID itemId) {
        return items.lockKeyShare(itemId);
    }

    // ---------------------------------------------------------------------------------------
    // Mark as sold
    // ---------------------------------------------------------------------------------------

    /**
     * Sells {@code quantity} copies of the owner's card: the copies leave the inventory; at 0 the
     * card leaves it too, restorable with its photos for {@link InventoryService#RESTORE_WINDOW} so
     * the sale can be undone. Joins the caller's transaction (the sale row and its message are
     * written with it).
     *
     * @throws ApiException {@code 409 NOTHING_LEFT_TO_SELL} when the card is no longer in the
     *     inventory; {@code 400} when {@code quantity} is below 1 or above the copies held
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public CopiesSold sellCopies(UUID ownerId, UUID itemId, int quantity) {
        LockedItem locked = lockItem(ownerId, itemId);
        int held =
                items.lockQuantity(ownerId, itemId)
                        .orElseThrow(() -> nothingLeft("This card has no copy left to sell"));
        if (quantity < 1 || quantity > held) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(
                            new ProblemFieldError(
                                    "quantity",
                                    held == 1
                                            ? "You have 1 copy of this card"
                                            : "You have " + held + " copies of this card")));
        }
        Instant now = timeProvider.now();
        int left = held - quantity;
        if (left == 0) {
            items.softDelete(itemId, now.plus(InventoryService.RESTORE_WINDOW), now);
        } else {
            items.decrementQuantity(itemId, quantity, now);
        }
        reconciler.items(List.of(itemId));
        log.info("Card sold owner={} item={} sold={} left={}", ownerId, itemId, quantity, left);
        return new CopiesSold(itemId, locked.binderId(), quantity, left, left == 0);
    }

    /**
     * The undo of a card's sale: a card the sale took out of the inventory comes back exactly as it
     * was while its window is open; copies left after the sale get the sold ones back (an item the
     * owner deleted since keeps them for its own restore). Never refused by {@code
     * inventory.items.max}: the copies were in the inventory minutes ago. Joins the caller's
     * transaction.
     *
     * @param removed the sale took the card's last copy
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public Undo unsellCopies(UUID ownerId, UUID itemId, int quantity, boolean removed) {
        // The lock order of the restore of a deleted item: the owner, the binder it still names,
        // then the item.
        binders.lockOwners(List.of(ownerId));
        Optional<Optional<UUID>> binderOf = items.binderOfAnyState(ownerId, itemId);
        if (binderOf.isEmpty()) {
            return Undo.GONE;
        }
        binderOf.get().ifPresent(id -> binders.lockInOrder(ownerId, List.of(id)));
        Optional<DeleteState> state = items.lockDeleteState(ownerId, itemId);
        if (state.isEmpty()) {
            return Undo.GONE;
        }
        Instant now = timeProvider.now();
        if (removed) {
            DeleteState deleteState = state.get();
            if (deleteState.deletedAt() == null) {
                // Its owner restored it from the inventory already.
                return Undo.ALREADY_BACK;
            }
            if (deleteState.restorableUntil() == null
                    || !deleteState.restorableUntil().isAfter(now)) {
                // Its binder was deleted since (the window ended with it), or the window passed.
                return Undo.GONE;
            }
            items.restore(itemId, now);
            if (deleteState.binderId() != null) {
                reconciler.binders(List.of(deleteState.binderId()));
            }
        } else {
            items.addCopiesBack(itemId, quantity, now);
        }
        reconciler.items(List.of(itemId));
        log.info("Card sale undone owner={} item={}", ownerId, itemId);
        return Undo.RESTORED;
    }

    /**
     * Sells the owner's deck core: it is marked sold ({@code sold_at}: it leaves Search and every
     * public list) and the cards in it leave the inventory with it, restorable for {@link
     * InventoryService#RESTORE_WINDOW} (spec section 16, default 6). Joins the caller's
     * transaction.
     *
     * @throws ApiException {@code 409 NOTHING_LEFT_TO_SELL} when the binder is gone, is not a deck
     *     core or is already sold
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public DeckCoreSold sellDeckCore(UUID ownerId, UUID binderId) {
        binders.lockOwners(List.of(ownerId));
        if (binders.lockInOrder(ownerId, List.of(binderId)).isEmpty()) {
            throw nothingLeft("This deck core is no longer for sale");
        }
        BinderView binder = binders.requireOwned(ownerId, binderId);
        if (!binder.sellsAsCore() || binder.soldAt() != null) {
            throw nothingLeft(
                    binder.soldAt() != null
                            ? "This deck core is already sold"
                            : "This binder is not a deck core");
        }
        Instant now = timeProvider.now();
        binders.markSold(binderId, now);
        List<UUID> removed =
                items.softDeleteInBinderRestorable(
                        ownerId, binderId, now.plus(InventoryService.RESTORE_WINDOW), now);
        reconciler.binders(List.of(binderId));
        log.info("Deck core sold owner={} binder={} cards={}", ownerId, binderId, removed.size());
        return new DeckCoreSold(binderId, removed);
    }

    /**
     * The undo of a deck core's sale: unsold again, and the cards the sale took come back into it
     * (those whose window is still open and that are still in it). Joins the caller's transaction.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public Undo unsellDeckCore(UUID ownerId, UUID binderId, Collection<UUID> itemIds) {
        binders.lockOwners(List.of(ownerId));
        if (binders.lockInOrder(ownerId, List.of(binderId)).isEmpty()) {
            return Undo.GONE;
        }
        Instant now = timeProvider.now();
        binders.clearSold(binderId, now);
        List<UUID> back = items.restoreInBinder(ownerId, binderId, itemIds, now);
        reconciler.binders(List.of(binderId));
        Set<UUID> missing = new HashSet<>(itemIds);
        back.forEach(missing::remove);
        if (!missing.isEmpty()) {
            log.info("Deck core sale undone without {} card(s) restored elsewhere", missing.size());
        }
        log.info(
                "Deck core sale undone owner={} binder={} cards={}",
                ownerId,
                binderId,
                back.size());
        return Undo.RESTORED;
    }

    private LockedItem lockItem(UUID ownerId, UUID itemId) {
        // The lock order of every item write: the owner, the binder of the item, then the item.
        binders.lockOwners(List.of(ownerId));
        binders.lockInOrder(ownerId, new HashSet<>(items.binderIdsOf(ownerId, List.of(itemId))));
        return items.lockAll(ownerId, List.of(itemId)).stream()
                .findFirst()
                .orElseThrow(() -> nothingLeft("This card is no longer in your inventory"));
    }

    private static ApiException nothingLeft(String message) {
        return new ApiException(ErrorCode.NOTHING_LEFT_TO_SELL, message);
    }

    /**
     * Outcome of {@link #sellCopies}.
     *
     * @param itemId the card
     * @param binderId its binder, {@code null} when unfiled
     * @param sold copies sold
     * @param remaining copies left
     * @param removed the last copy left: the card left the inventory
     */
    public record CopiesSold(
            UUID itemId, @Nullable UUID binderId, int sold, int remaining, boolean removed) {}

    /**
     * Outcome of {@link #sellDeckCore}.
     *
     * @param binderId the deck core
     * @param removedItemIds the cards that left the inventory with it
     */
    public record DeckCoreSold(UUID binderId, List<UUID> removedItemIds) {}

    /** Outcome of an undo. */
    public enum Undo {
        /** What the sale took is back. */
        RESTORED,
        /** The card was already back (its owner restored it from the inventory). */
        ALREADY_BACK,
        /** It cannot come back: its binder was deleted since, or the account purged it. */
        GONE
    }
}
