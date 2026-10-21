package com.orenjitrade.api.deals.domain;

import com.orenjitrade.api.binders.domain.BinderService;
import com.orenjitrade.api.binders.domain.ChatDeckCore;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.deals.infra.SaleRepository;
import com.orenjitrade.api.deals.infra.SaleRepository.SaleRow;
import com.orenjitrade.api.inventory.domain.ChatCard;
import com.orenjitrade.api.inventory.domain.InventorySales;
import com.orenjitrade.api.inventory.domain.InventorySales.CopiesSold;
import com.orenjitrade.api.inventory.domain.InventorySales.DeckCoreSold;
import com.orenjitrade.api.inventory.domain.InventorySales.Undo;
import com.orenjitrade.api.messaging.domain.ConversationService;
import com.orenjitrade.api.messaging.domain.ConversationService.ChatForSale;
import com.orenjitrade.api.messaging.domain.SaleNotice;
import com.orenjitrade.api.messaging.domain.SubjectKind;
import com.orenjitrade.api.messaging.domain.SystemNotice;
import com.orenjitrade.api.notifications.domain.NotificationCards;
import com.orenjitrade.api.notifications.domain.NotificationRequest;
import com.orenjitrade.api.notifications.domain.NotificationService;
import com.orenjitrade.api.notifications.domain.NotificationType;
import com.orenjitrade.api.profiles.domain.MemberCard;
import com.orenjitrade.api.profiles.domain.MemberDirectory;
import com.orenjitrade.api.ratings.domain.InteractionKind;
import com.orenjitrade.api.ratings.domain.InteractionService;
import com.orenjitrade.api.ratings.domain.InteractionService.Removal;
import com.orenjitrade.api.ratings.domain.InteractionSubjectType;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The deals module's service interface (stage R4, "Mark as sold"; owner spec 2026-10-14, sections
 * 10 and 12 "Messaging and sales"; ADR 0018, part 2).
 *
 * <p>{@link #markSold}: the seller of the chat's card or deck core (its subject must be theirs: 403
 * otherwise) marks it sold to the other collector, with the copies sold and an optional tracking
 * number. In one transaction: the copies leave the inventory ({@link InventorySales}: the owner
 * lock first, then the binder, then the item, as every inventory write), the {@code sale} row, a
 * {@code SALE} interaction (both can rate at once), the SYSTEM message both sides read in their own
 * words (key {@code sale:<id>:SOLD}) and the buyer's in-app notification. Two sales of the last
 * copy at once: the second waits for the owner lock and finds nothing left (409).
 *
 * <p>{@link #undo}: the seller only, within {@link SaleRules#UNDO_WINDOW} and while nobody rated
 * the sale; it puts back exactly what the sale took, removes the interaction, withdraws the message
 * and the buyer's notification.
 *
 * <p>Tracking numbers stay between the two collectors: never logged, never in analytics or events.
 */
@Service
public class SaleService {

    private static final Logger log = LoggerFactory.getLogger(SaleService.class);

    private final SaleRepository sales;
    private final ConversationService conversations;
    private final InventorySales inventorySales;
    private final BinderService binders;
    private final InteractionService interactions;
    private final NotificationService notifications;
    private final MemberDirectory members;
    private final TimeProvider timeProvider;

    public SaleService(
            SaleRepository sales,
            ConversationService conversations,
            InventorySales inventorySales,
            BinderService binders,
            InteractionService interactions,
            NotificationService notifications,
            MemberDirectory members,
            TimeProvider timeProvider) {
        this.sales = sales;
        this.conversations = conversations;
        this.inventorySales = inventorySales;
        this.binders = binders;
        this.interactions = interactions;
        this.notifications = notifications;
        this.members = members;
        this.timeProvider = timeProvider;
    }

    /** {@code POST /conversations/{id}/sales} of a client that names no subject (the web). */
    @Transactional
    public SaleView markSold(
            UUID me,
            UUID conversationId,
            @Nullable Integer quantityRaw,
            @Nullable String trackingRaw) {
        return markSold(me, conversationId, quantityRaw, trackingRaw, null, null);
    }

    /**
     * {@code POST /conversations/{id}/sales}. {@code 404} for non-participants and chats hidden by
     * a block; {@code 409 CONFLICT} for a chat without a card or deck core; {@code 409
     * SUBJECT_CHANGED} when the card ({@code expectedItemId}) or deck core ({@code
     * expectedBinderId}) the seller's chat shows is no longer the chat's subject (the other
     * collector pinned another one since); {@code 403 FORBIDDEN} when the subject is not the
     * caller's; {@code 403 MESSAGING_BLOCKED} when the buyer can no longer take part; {@code 400}
     * for copies below 1 or above those held (a deck core sells as one), a malformed tracking
     * number and both expected subjects at once; {@code 409 NOTHING_LEFT_TO_SELL} when no copy is
     * left.
     *
     * <p>What is sold is the subject read here, which equals the expected one when it is given: a
     * pin that lands while the sale runs changes the chat for later, never what this sale takes.
     */
    @Transactional
    public SaleView markSold(
            UUID me,
            UUID conversationId,
            @Nullable Integer quantityRaw,
            @Nullable String trackingRaw,
            @Nullable UUID expectedItemId,
            @Nullable UUID expectedBinderId) {
        int quantity = quantityRaw == null ? 1 : quantityRaw;
        @Nullable String tracking = SaleRules.tracking(trackingRaw);
        if (expectedItemId != null && expectedBinderId != null) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(
                            new ProblemFieldError(
                                    "subjectBinderId", "Name a card or a deck core, not both")));
        }
        ChatForSale chat = conversations.chatForSale(me, conversationId);
        boolean expected = expectedItemId != null || expectedBinderId != null;
        if (expected
                && !(java.util.Objects.equals(expectedItemId, chat.subjectItemId())
                        && java.util.Objects.equals(expectedBinderId, chat.subjectBinderId()))) {
            // Checked before the copies: the card shown may have more copies than the chat's
            // current subject (a deck core sells as one).
            throw new ApiException(
                    ErrorCode.SUBJECT_CHANGED,
                    "What this chat is about changed: check it before you mark it sold");
        }
        if (chat.subjectItemId() == null && chat.subjectBinderId() == null) {
            throw new ApiException(
                    ErrorCode.CONFLICT, "This chat is not about a card or a deck core yet");
        }
        boolean deckCore = chat.subjectBinderId() != null;
        List<ProblemFieldError> errors = SaleRules.validate(quantity, tracking, deckCore);
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        UUID buyerId = chat.otherId();
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        Map<UUID, MemberCard> parties = members.cards(List.of(me, buyerId));
        @Nullable MemberCard seller = parties.get(me);
        @Nullable MemberCard buyer = parties.get(buyerId);
        if (seller == null || buyer == null || !buyer.activeAt(now)) {
            throw new ApiException(
                    ErrorCode.MESSAGING_BLOCKED, "This collector cannot take part in a sale now");
        }

        UUID saleId = UUID.randomUUID();
        SaleRow row;
        @Nullable Integer remaining = null;
        @Nullable ChatCard soldCard = null;
        if (chat.subjectItemId() != null) {
            UUID itemId = chat.subjectItemId();
            @Nullable ChatCard card = inventorySales.chatCards(List.of(itemId)).get(itemId);
            if (card == null) {
                throw new ApiException(
                        ErrorCode.NOTHING_LEFT_TO_SELL, "This card is no longer in an inventory");
            }
            requireSeller(me, card.ownerId());
            soldCard = card;
            CopiesSold sold = inventorySales.sellCopies(me, itemId, quantity);
            remaining = sold.remaining();
            row =
                    new SaleRow(
                            saleId,
                            conversationId,
                            me,
                            buyerId,
                            SubjectKind.CARD.name(),
                            itemId,
                            null,
                            card.name(),
                            sold.sold(),
                            tracking,
                            sold.removed(),
                            List.of(),
                            now,
                            null);
        } else {
            UUID binderId = java.util.Objects.requireNonNull(chat.subjectBinderId());
            @Nullable ChatDeckCore core = binders.chatDeckCores(List.of(binderId)).get(binderId);
            if (core == null) {
                throw new ApiException(
                        ErrorCode.NOTHING_LEFT_TO_SELL, "This deck core is no longer for sale");
            }
            requireSeller(me, core.ownerId());
            DeckCoreSold sold = inventorySales.sellDeckCore(me, binderId);
            row =
                    new SaleRow(
                            saleId,
                            conversationId,
                            me,
                            buyerId,
                            SubjectKind.DECK_CORE.name(),
                            null,
                            binderId,
                            core.name(),
                            1,
                            tracking,
                            true,
                            sold.removedItemIds(),
                            now,
                            null);
        }
        sales.insert(row);
        interactions.record(
                InteractionKind.SALE, me, buyerId, InteractionSubjectType.SALE, saleId, now);
        conversations.postSystemMessage(
                new SystemNotice(
                        me,
                        buyerId,
                        SaleRules.messageBody(seller.handle(), row.name(), buyer.handle()),
                        null,
                        systemKey(saleId),
                        notice(row, false),
                        true));
        Map<String, @Nullable Object> data = new LinkedHashMap<>();
        data.put("conversationId", conversationId.toString());
        data.put("saleId", saleId.toString());
        data.put("sellerHandle", seller.handle());
        // Stage R9: the phone's row "{seller} marked {name} as sold to you", the card's picture
        // and whether a tracking number came with it (never the number itself).
        data.put("itemName", row.name());
        data.put("saleKind", row.kind());
        data.put("hasTracking", tracking != null);
        if (soldCard != null) {
            NotificationCards.put(
                    data,
                    soldCard.name(),
                    soldCard.game(),
                    NotificationCards.storable(soldCard.imageUrl()));
        }
        data.put("deepLink", "/messages/" + conversationId);
        notifications.notify(
                new NotificationRequest(
                        buyerId,
                        NotificationType.SALE_RECORDED,
                        SaleRules.notificationTitle(seller.handle(), row.name()),
                        "Open the chat to see the details and rate each other.",
                        data,
                        systemKey(saleId)));
        log.info("Sale {} recorded kind={} quantity={}", saleId, row.kind(), row.quantity());
        return view(row, remaining);
    }

    /**
     * {@code POST /sales/{id}/undo}. {@code 404} for anyone but its two collectors; {@code 403} for
     * the buyer; {@code 409 SALE_UNDO_CLOSED} after {@link SaleRules#UNDO_WINDOW} or when what it
     * took cannot come back (its binder was deleted since); {@code 409 SALE_ALREADY_RATED} once one
     * of them rated it. A repeated undo answers the undone sale.
     */
    @Transactional
    public SaleView undo(UUID me, UUID saleId) {
        SaleRow found =
                sales.find(saleId)
                        .filter(row -> row.sellerId().equals(me) || row.buyerId().equals(me))
                        .orElseThrow(() -> ApiException.notFound("Sale not found"));
        if (!found.sellerId().equals(me)) {
            throw new ApiException(ErrorCode.FORBIDDEN, "Only the seller can undo this sale");
        }
        if (found.undoneAt() != null) {
            return view(found, null);
        }
        requireUndoable(found, timeProvider.now());
        // The lock rule of every inventory write: the seller's owner lock before any row.
        binders.lockOwners(List.of(me));
        SaleRow sale =
                sales.lock(saleId).orElseThrow(() -> ApiException.notFound("Sale not found"));
        if (sale.undoneAt() != null) {
            return view(sale, null);
        }
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        requireUndoable(sale, now);
        if (interactions.removeIfUnrated(InteractionKind.SALE, saleId) == Removal.RATED) {
            throw new ApiException(
                    ErrorCode.SALE_ALREADY_RATED,
                    "This sale was already rated, so it can no longer be undone");
        }
        Undo undone;
        if (SubjectKind.CARD.name().equals(sale.kind())) {
            if (sale.itemId() == null) {
                undone = Undo.GONE;
            } else {
                // A later sale of the card may have taken its last copies since (F4).
                java.util.Optional<SaleRow> later =
                        sale.itemRemoved()
                                ? java.util.Optional.empty()
                                : sales.lockLaterRemoval(sale.itemId(), sale.createdAt(), saleId);
                undone =
                        inventorySales.unsellCopies(
                                me,
                                sale.itemId(),
                                sale.quantity(),
                                sale.itemRemoved(),
                                later.isPresent());
                if (undone == Undo.RESTORED_BEFORE_LATER_SALE) {
                    sales.keepItem(later.orElseThrow().id());
                }
            }
        } else {
            undone =
                    sale.binderId() == null
                            ? Undo.GONE
                            : inventorySales.unsellDeckCore(
                                    me, sale.binderId(), sale.removedItemIds());
        }
        if (undone == Undo.GONE) {
            throw new ApiException(
                            ErrorCode.SALE_UNDO_CLOSED,
                            "This sale can no longer be undone: what it took cannot come back")
                    .withProperty("undoableUntil", SaleRules.undoableUntil(sale.createdAt()));
        }
        sales.markUndone(saleId, now);
        conversations.withdrawSystemMessage(systemKey(saleId));
        notifications.withdraw(systemKey(saleId));
        log.info("Sale {} undone", saleId);
        return view(
                sales.find(saleId).orElseThrow(() -> new IllegalStateException("Sale vanished")),
                null);
    }

    /**
     * The conversations among {@code subjects} that sold their current subject: a sale not undone,
     * of that card or deck core, made at or after it was pinned (the messaging module's {@code
     * ChatSaleStatus}).
     */
    @Transactional(readOnly = true)
    public java.util.Set<UUID> soldSubjects(
            java.util.Collection<com.orenjitrade.api.messaging.domain.ChatSaleStatus.Subject>
                    subjects) {
        java.util.Set<UUID> sold = new java.util.HashSet<>();
        if (subjects.isEmpty()) {
            return sold;
        }
        Map<UUID, List<SaleRow>> byConversation = new LinkedHashMap<>();
        for (SaleRow row :
                sales.liveIn(
                        subjects.stream()
                                .map(
                                        com.orenjitrade.api.messaging.domain.ChatSaleStatus.Subject
                                                ::conversationId)
                                .toList())) {
            byConversation
                    .computeIfAbsent(row.conversationId(), id -> new java.util.ArrayList<>())
                    .add(row);
        }
        for (var subject : subjects) {
            for (SaleRow row : byConversation.getOrDefault(subject.conversationId(), List.of())) {
                boolean same =
                        (subject.itemId() != null && subject.itemId().equals(row.itemId()))
                                || (subject.binderId() != null
                                        && subject.binderId().equals(row.binderId()));
                boolean since =
                        subject.setAt() == null || !row.createdAt().isBefore(subject.setAt());
                if (same && since) {
                    sold.add(subject.conversationId());
                }
            }
        }
        return sold;
    }

    /**
     * Export section {@code deals}: the account's sales, sold and bought (their own data: the other
     * collector appears by id only).
     */
    @Transactional(readOnly = true)
    public List<Map<String, @Nullable Object>> export(UUID userId) {
        List<Map<String, @Nullable Object>> result = new java.util.ArrayList<>();
        for (SaleRow row : sales.of(userId)) {
            Map<String, @Nullable Object> entry = new LinkedHashMap<>();
            entry.put("id", row.id());
            entry.put("role", row.sellerId().equals(userId) ? "SELLER" : "BUYER");
            entry.put("conversationId", row.conversationId());
            entry.put(
                    "otherCollectorId",
                    row.sellerId().equals(userId) ? row.buyerId() : row.sellerId());
            entry.put("kind", row.kind());
            entry.put("name", row.name());
            entry.put("quantity", row.quantity());
            entry.put("trackingNumber", row.trackingNumber());
            entry.put("createdAt", row.createdAt());
            entry.put("undoneAt", row.undoneAt());
            result.add(entry);
        }
        return result;
    }

    /** Account purge: the account's sales go (the other collector keeps the chat's message). */
    @Transactional
    public int purge(UUID userId) {
        return sales.deleteOf(userId);
    }

    private static void requireSeller(UUID me, UUID ownerId) {
        if (!ownerId.equals(me)) {
            throw new ApiException(
                    ErrorCode.FORBIDDEN,
                    "Only the seller marks it sold: what this chat is about is not yours");
        }
    }

    private static void requireUndoable(SaleRow sale, Instant now) {
        if (!SaleRules.undoable(sale.createdAt(), now)) {
            throw new ApiException(
                            ErrorCode.SALE_UNDO_CLOSED,
                            "A sale can be undone for "
                                    + SaleRules.UNDO_WINDOW.toMinutes()
                                    + " minutes only")
                    .withProperty("undoableUntil", SaleRules.undoableUntil(sale.createdAt()));
        }
    }

    /** The de-duplication key of a sale's SYSTEM message and of the buyer's notification. */
    static String systemKey(UUID saleId) {
        return "sale:" + saleId + ":SOLD";
    }

    private static SaleNotice notice(SaleRow row, boolean undone) {
        return new SaleNotice(
                row.id(),
                row.sellerId(),
                row.buyerId(),
                SubjectKind.valueOf(row.kind()),
                row.name(),
                row.quantity(),
                row.trackingNumber(),
                undone);
    }

    static SaleView view(SaleRow row, @Nullable Integer remaining) {
        return new SaleView(
                row.id(),
                row.conversationId(),
                SubjectKind.valueOf(row.kind()),
                row.itemId(),
                row.binderId(),
                row.sellerId(),
                row.buyerId(),
                row.name(),
                row.quantity(),
                row.trackingNumber(),
                remaining,
                row.itemRemoved(),
                row.createdAt(),
                SaleRules.undoableUntil(row.createdAt()),
                row.undoneAt());
    }
}
