package com.orenjitrade.api.trades.domain;

import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.CursorPage;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeCursor;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.featureflags.domain.FeatureFlagKeys;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import com.orenjitrade.api.inventory.domain.InventoryService;
import com.orenjitrade.api.inventory.domain.InventoryService.TransferLine;
import com.orenjitrade.api.inventory.domain.InventoryService.TransferResult;
import com.orenjitrade.api.offers.domain.AcceptedOffer;
import com.orenjitrade.api.offers.domain.OfferCard;
import com.orenjitrade.api.offers.domain.OfferRole;
import com.orenjitrade.api.offers.domain.OfferRules;
import com.orenjitrade.api.offers.domain.OfferService;
import com.orenjitrade.api.offers.domain.OfferTerms.TradeLine;
import com.orenjitrade.api.offers.domain.OfferViews;
import com.orenjitrade.api.ratings.domain.InteractionKind;
import com.orenjitrade.api.ratings.domain.InteractionService;
import com.orenjitrade.api.ratings.domain.InteractionSubjectType;
import com.orenjitrade.api.trades.domain.TradeRules.NextAction;
import com.orenjitrade.api.trades.domain.TradeViews.Detail;
import com.orenjitrade.api.trades.domain.TradeViews.Summary;
import com.orenjitrade.api.trades.domain.TradeViews.TimelineEntry;
import com.orenjitrade.api.trades.events.TradeUpdated;
import com.orenjitrade.api.trades.infra.TradeEventRepository;
import com.orenjitrade.api.trades.infra.TradeRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * The trades module's service interface (Phase 8 contract "Trades"): trades opened by accepted
 * offers (the offers module's {@code AcceptedOfferHandler}), the list and the trade page with its
 * next action, in-person meetups, completion by both parties (inventory quantities transferred
 * through {@link InventoryService#reserveAndTransfer}, interaction TRADE recorded for rating
 * eligibility) and cancellation before any payment. Only the two parties see a trade (404 for
 * anybody else). Every change appends a {@code trade_event} and publishes {@link TradeUpdated} in
 * the transaction. Phase 9: the payments module moves protected trades through PAID, SHIPPED,
 * RECEIVED / DISPUTED to COMPLETED or CANCELLED with {@link #advance}, {@link #completeProtected}
 * and {@link #cancelProtected}, and fills the trade page through the {@link TradeProtection}
 * extension point.
 */
@Service
public class TradeService {

    public static final int DEFAULT_LIMIT = 20;
    public static final int MAX_LIMIT = 50;
    static final String NOT_FOUND = "Trade not found";

    private static final Logger log = LoggerFactory.getLogger(TradeService.class);

    private final TradeRepository trades;
    private final TradeEventRepository timeline;
    private final OfferService offers;
    private final InventoryService inventory;
    private final InteractionService interactions;
    private final FeatureFlags featureFlags;
    private final ApplicationEventPublisher events;
    private final TimeProvider timeProvider;
    private final JsonMapper jsonMapper;
    private final ObjectProvider<TradeProtection> protection;

    public TradeService(
            TradeRepository trades,
            TradeEventRepository timeline,
            OfferService offers,
            InventoryService inventory,
            InteractionService interactions,
            FeatureFlags featureFlags,
            ApplicationEventPublisher events,
            TimeProvider timeProvider,
            JsonMapper jsonMapper,
            ObjectProvider<TradeProtection> protection) {
        this.trades = trades;
        this.timeline = timeline;
        this.offers = offers;
        this.inventory = inventory;
        this.interactions = interactions;
        this.featureFlags = featureFlags;
        this.events = events;
        this.timeProvider = timeProvider;
        this.jsonMapper = jsonMapper;
        this.protection = protection;
    }

    // ---------------------------------------------------------------------------------------
    // Opening (offers module's AcceptedOfferHandler)
    // ---------------------------------------------------------------------------------------

    /**
     * Opens the trade of an accepted proposal inside the acceptance transaction: AWAITING_PAYMENT
     * when the buyer asked for payment protection, the offer has a cash part and the
     * protectedPayments flag is on for the buyer, AGREED otherwise. {@code 409 ITEM_UNAVAILABLE}
     * when every copy of the card is already promised in open trades.
     */
    @Transactional
    public UUID open(AcceptedOffer offer) {
        trades.lockItem(offer.itemId());
        int promised = trades.countOpenForItem(offer.itemId());
        if (promised >= offer.itemQuantity()) {
            throw new ApiException(
                    ErrorCode.ITEM_UNAVAILABLE,
                    "Every copy of this card is already promised in another trade");
        }
        boolean protection =
                offer.protectionRequested()
                        && offer.kind().hasCash()
                        && featureFlags.isEnabled(
                                FeatureFlagKeys.PROTECTED_PAYMENTS, offer.buyerId());
        TradeStatus status = protection ? TradeStatus.AWAITING_PAYMENT : TradeStatus.AGREED;
        Instant now = offer.acceptedAt();
        UUID id = UUID.randomUUID();
        trades.insert(
                id,
                offer.offerId(),
                offer.itemId(),
                offer.sellerId(),
                offer.buyerId(),
                offer.kind(),
                offer.cashAmount(),
                offer.currency(),
                status,
                protection,
                now);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("offerId", offer.offerId().toString());
        details.put("status", status.name());
        details.put("protectionEnabled", protection);
        record(id, offer.acceptedBy(), TradeEventType.CREATED, details, now);
        TradeRow row = requireRow(id);
        publish(row, TradeEventType.CREATED, offer.acceptedBy(), now);
        log.info("Trade {} opened from offer {} ({})", id, offer.offerId(), status);
        return id;
    }

    /** The trades of accepted proposals, by proposal id. */
    @Transactional(readOnly = true)
    public Map<UUID, UUID> tradeIdsByOffer(Collection<UUID> offerIds) {
        return trades.idsByOffer(offerIds);
    }

    // ---------------------------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------------------------

    /** {@code GET /trades}: the caller's trades, most recent activity first. */
    @Transactional(readOnly = true)
    public CursorPage<Summary> list(
            UUID me,
            @Nullable OfferRole role,
            Collection<TradeStatus> statuses,
            @Nullable String cursor,
            int limit) {
        List<TradeRow> rows = trades.page(me, role, statuses, TimeCursor.decode(cursor), limit + 1);
        boolean hasMore = rows.size() > limit;
        List<TradeRow> slice = hasMore ? rows.subList(0, limit) : rows;
        Map<UUID, OfferViews.Summary> summaries =
                offers.summaries(me, slice.stream().map(TradeRow::offerId).toList());
        List<Summary> items = new ArrayList<>();
        for (TradeRow row : slice) {
            OfferViews.@Nullable Summary offer = summaries.get(row.offerId());
            OfferRole viewerRole = requireRole(row, me);
            if (offer == null) {
                continue;
            }
            items.add(new Summary(row, offer, viewerRole, nextAction(row, viewerRole)));
        }
        if (!hasMore) {
            return CursorPage.last(items);
        }
        TradeRow last = slice.get(slice.size() - 1);
        return CursorPage.of(items, new TimeCursor(last.updatedAt(), last.id()).encode());
    }

    /** {@code GET /trades/{id}}: parties only (404 otherwise). */
    @Transactional(readOnly = true)
    public Detail get(UUID me, UUID tradeId) {
        TradeRow row =
                trades.find(tradeId)
                        .filter(candidate -> candidate.involves(me))
                        .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        return detail(me, row);
    }

    // ---------------------------------------------------------------------------------------
    // Operations
    // ---------------------------------------------------------------------------------------

    /**
     * {@code POST /trades/{id}/meetup}: the caller marks the trade as an in-person meetup; once
     * both parties marked it, {@code meetup} is on and payment protection is dropped
     * (AWAITING_PAYMENT back to AGREED). Idempotent per party.
     */
    @Transactional
    public Detail markMeetup(UUID me, UUID tradeId) {
        TradeRow row = lockParty(me, tradeId);
        OfferRole role = requireRole(row, me);
        if (!TradeRules.canMarkMeetup(row.status())) {
            throw invalidState(row, "marked as a meetup");
        }
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        if (!trades.markMeetup(row.id(), role, now)) {
            return detail(me, row);
        }
        TradeRow marked = requireRow(row.id());
        if (marked.markedMeetup(OfferRole.BUYER) && marked.markedMeetup(OfferRole.SELLER)) {
            boolean dropsProtection = marked.protectionEnabled();
            trades.agreeMeetup(row.id(), now);
            record(row.id(), me, TradeEventType.MEETUP_AGREED, Map.of(), now);
            if (dropsProtection) {
                record(
                        row.id(),
                        me,
                        TradeEventType.PROTECTION_REMOVED,
                        Map.of("previousStatus", marked.status().name()),
                        now);
            }
            TradeRow agreed = requireRow(row.id());
            publish(agreed, TradeEventType.MEETUP_AGREED, me, now);
            return detail(me, agreed);
        }
        record(row.id(), me, TradeEventType.MEETUP_PROPOSED, Map.of("role", role.name()), now);
        publish(marked, TradeEventType.MEETUP_PROPOSED, me, now);
        return detail(me, marked);
    }

    /**
     * {@code POST /trades/{id}/complete}: the caller confirms the exchange (AGREED trades only);
     * once both parties confirmed the trade is COMPLETED, the inventory quantities move (the
     * seller's card −1, the buyer's trade cards −quantity) and the TRADE interaction is recorded.
     * Idempotent per party.
     */
    @Transactional
    public Detail complete(UUID me, UUID tradeId) {
        TradeRow row = lockParty(me, tradeId);
        OfferRole role = requireRole(row, me);
        if (!TradeRules.canComplete(row.status())) {
            throw invalidState(
                    row,
                    row.protectionEnabled() && row.status().isOpen()
                            ? "completed before the buyer confirms receipt of a protected payment"
                            : "completed");
        }
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        if (!trades.confirm(row.id(), role, now)) {
            return detail(me, row);
        }
        record(row.id(), me, TradeEventType.COMPLETION_CONFIRMED, Map.of("role", role.name()), now);
        TradeRow confirmed = requireRow(row.id());
        if (!(confirmed.confirmed(OfferRole.BUYER) && confirmed.confirmed(OfferRole.SELLER))) {
            publish(confirmed, TradeEventType.COMPLETION_CONFIRMED, me, now);
            return detail(me, confirmed);
        }
        return detail(me, finish(row, me, now));
    }

    /**
     * Completes a trade: the seller's card (-1) and the buyer's trade cards (-quantity) move
     * through {@link InventoryService#reserveAndTransfer}, the TRADE interaction is recorded,
     * COMPLETED is appended and published.
     */
    private TradeRow finish(TradeRow row, @Nullable UUID actor, Instant now) {
        List<TransferLine> lines = new ArrayList<>();
        List<OfferRole> owners = new ArrayList<>();
        if (row.itemId() != null) {
            lines.add(new TransferLine(row.itemId(), row.sellerId(), 1));
            owners.add(OfferRole.SELLER);
        }
        for (TradeLine line : offers.tradeLines(row.offerId())) {
            lines.add(new TransferLine(line.inventoryItemId(), row.buyerId(), line.quantity()));
            owners.add(OfferRole.BUYER);
        }
        List<TransferResult> results = inventory.reserveAndTransfer(lines);
        trades.complete(row.id(), now);
        interactions.record(
                InteractionKind.TRADE,
                row.buyerId(),
                row.sellerId(),
                InteractionSubjectType.TRADE,
                row.id(),
                now);
        List<Map<String, Object>> transfers = new ArrayList<>();
        for (int index = 0; index < results.size(); index++) {
            TransferResult result = results.get(index);
            Map<String, Object> transfer = new LinkedHashMap<>();
            transfer.put("itemId", result.itemId().toString());
            transfer.put("from", owners.get(index).name());
            transfer.put("requested", result.requested());
            transfer.put("transferred", result.transferred());
            transfer.put("remaining", result.remaining());
            transfer.put("removed", result.removed());
            transfers.add(transfer);
        }
        record(row.id(), actor, TradeEventType.COMPLETED, Map.of("transfers", transfers), now);
        TradeRow completed = requireRow(row.id());
        publish(completed, TradeEventType.COMPLETED, actor, now);
        log.info("Trade {} completed", row.id());
        return completed;
    }

    /** {@code POST /trades/{id}/cancel}: either party, before any payment. */
    @Transactional
    public Detail cancel(UUID me, UUID tradeId, @Nullable String rawReason) {
        @Nullable String reason = OfferRules.text(rawReason);
        if (reason != null && reason.length() > OfferRules.REASON_MAX) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(new ProblemFieldError("reason", "must be at most 500 characters")));
        }
        TradeRow row = lockParty(me, tradeId);
        if (!TradeRules.canCancel(row.status())) {
            throw invalidState(row, "cancelled");
        }
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        trades.cancel(row.id(), me, reason, now);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("previousStatus", row.status().name());
        if (reason != null) {
            details.put("reason", reason);
        }
        record(row.id(), me, TradeEventType.CANCELLED, details, now);
        TradeRow cancelled = requireRow(row.id());
        publish(cancelled, TradeEventType.CANCELLED, me, now);
        log.info("Trade {} cancelled", row.id());
        return detail(me, cancelled);
    }

    // ---------------------------------------------------------------------------------------
    // Payment protection (Phase 9; called by the payments module)
    // ---------------------------------------------------------------------------------------

    /**
     * Locks a trade for a payment step (the payments module checks parties and roles itself). Lock
     * order: the trade row first, then the payment row.
     */
    @Transactional
    public Optional<TradeRow> lockForPayment(UUID tradeId) {
        return trades.lock(tradeId);
    }

    /**
     * Moves a protected trade from one of {@code expected} to {@code next}, appends {@code event}
     * and publishes {@link TradeUpdated}; {@code 409 INVALID_STATE_TRANSITION} (extension {@code
     * currentStatus}) when the trade is not protected or in another status.
     *
     * @param action what the caller tried, for the error message ("shipped", ...)
     */
    @Transactional
    public TradeRow advance(
            UUID tradeId,
            Set<TradeStatus> expected,
            TradeStatus next,
            @Nullable UUID actorId,
            TradeEventType event,
            Map<String, ?> details,
            Instant at,
            String action) {
        TradeRow row = trades.lock(tradeId).orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        if (!row.protectionEnabled() || !expected.contains(row.status())) {
            throw invalidState(row, action);
        }
        trades.setStatus(tradeId, next, at);
        record(tradeId, actorId, event, details, at);
        TradeRow moved = requireRow(tradeId);
        publish(moved, event, actorId, at);
        log.info("Trade {} {} -> {} ({})", tradeId, row.status(), next, event);
        return moved;
    }

    /** Appends a Phase 9 timeline entry without a status change and publishes it. */
    @Transactional
    public void recordProtectedEvent(
            UUID tradeId,
            @Nullable UUID actorId,
            TradeEventType event,
            Map<String, ?> details,
            Instant at) {
        record(tradeId, actorId, event, details, at);
        publish(requireRow(tradeId), event, actorId, at);
    }

    /**
     * Completes a protected trade once its payout was released (RECEIVED, or DISPUTED resolved for
     * the seller or with a split): inventory transfer, TRADE interaction, COMPLETED.
     */
    @Transactional
    public TradeRow completeProtected(UUID tradeId, @Nullable UUID actorId, Instant at) {
        TradeRow row = trades.lock(tradeId).orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        if (!row.protectionEnabled()
                || (row.status() != TradeStatus.RECEIVED && row.status() != TradeStatus.DISPUTED)) {
            throw invalidState(row, "completed");
        }
        return finish(row, actorId, at);
    }

    /**
     * Cancels a protected trade whose payment was refunded in full (PAID, SHIPPED or DISPUTED); the
     * platform is the cancelling party and {@code reason} a platform text.
     */
    @Transactional
    public TradeRow cancelProtected(
            UUID tradeId, @Nullable UUID actorId, String reason, Instant at) {
        TradeRow row = trades.lock(tradeId).orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        if (!row.protectionEnabled() || !row.status().isOpen()) {
            throw invalidState(row, "cancelled");
        }
        trades.cancelByPlatform(tradeId, reason, at);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("previousStatus", row.status().name());
        details.put("reason", reason);
        details.put("byPlatform", true);
        record(tradeId, actorId, TradeEventType.CANCELLED, details, at);
        TradeRow cancelled = requireRow(tradeId);
        publish(cancelled, TradeEventType.CANCELLED, actorId, at);
        log.info("Protected trade {} cancelled after a refund", tradeId);
        return cancelled;
    }

    /** Trades by id (admin lists of the payments module). */
    @Transactional(readOnly = true)
    public Map<UUID, TradeRow> rows(Collection<UUID> tradeIds) {
        return trades.findAll(tradeIds);
    }

    /** A trade's timeline, oldest first (admin dispute console of the payments module). */
    @Transactional(readOnly = true)
    public List<TimelineEntry> timelineOf(UUID tradeId) {
        TradeRow row = requireRow(tradeId);
        List<TimelineEntry> entries = new ArrayList<>();
        for (TradeEventRow event : timeline.byTrade(tradeId)) {
            entries.add(
                    new TimelineEntry(
                            event,
                            event.actorId() == null ? null : row.roleOf(event.actorId()),
                            details(event.detailsJson())));
        }
        return entries;
    }

    /** The terms of a trade as text ("40.00 CAD for Azure-Eyes Sky Dragon"). */
    @Transactional(readOnly = true)
    public String summaryText(TradeRow row) {
        return offers.row(row.offerId()).map(offers::summaryText).orElse("a trade");
    }

    /** The card name of a trade (live item or the offer's snapshot). */
    @Transactional(readOnly = true)
    public String cardName(TradeRow row) {
        return card(row).name();
    }

    /** The card of a trade with its picture (live item or the offer's snapshot). */
    @Transactional(readOnly = true)
    public OfferCard card(TradeRow row) {
        return offers.row(row.offerId()).map(offers::card).orElse(OfferCard.UNKNOWN);
    }

    // ---------------------------------------------------------------------------------------
    // Account data
    // ---------------------------------------------------------------------------------------

    /** Deletion blockers: open trades ({@code OPEN_TRADE}). */
    @Transactional(readOnly = true)
    public List<String> blockers(UUID userId) {
        return trades.countOpenOf(userId) > 0 ? List.of("OPEN_TRADE") : List.of();
    }

    /** Account purge: erases the account's cancel reasons (the trades stay for the other party). */
    @Transactional
    public void purge(UUID userId) {
        trades.eraseCancelReasonsOf(userId);
        timeline.eraseReasonsOf(userId);
    }

    /** Export section: the account's trades. */
    @Transactional(readOnly = true)
    public List<Map<String, @Nullable Object>> export(UUID userId) {
        List<Map<String, @Nullable Object>> result = new ArrayList<>();
        for (TradeRow row : trades.ofUser(userId, 1000)) {
            Map<String, @Nullable Object> entry = new LinkedHashMap<>();
            entry.put("id", row.id());
            entry.put("offerId", row.offerId());
            entry.put("role", requireRole(row, userId).name());
            entry.put("kind", row.kind().name());
            entry.put("cashAmount", row.cashAmount());
            entry.put("currency", row.currency());
            entry.put("status", row.status().name());
            entry.put("meetup", row.meetup());
            entry.put("createdAt", row.createdAt());
            entry.put("completedAt", row.completedAt());
            entry.put("cancelledAt", row.cancelledAt());
            entry.put("cancelReason", userId.equals(row.cancelledBy()) ? row.cancelReason() : null);
            result.add(entry);
        }
        return result;
    }

    /** A stored trade (notifications after commit). */
    @Transactional(readOnly = true)
    public java.util.Optional<TradeRow> row(UUID tradeId) {
        return trades.find(tradeId);
    }

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

    private Detail detail(UUID me, TradeRow row) {
        OfferRole viewerRole = requireRole(row, me);
        OfferViews.Detail offer =
                offers.find(me, row.offerId())
                        .orElseThrow(
                                () ->
                                        new IllegalStateException(
                                                "Offer of trade " + row.id() + " not found"));
        List<TimelineEntry> entries = new ArrayList<>();
        for (TradeEventRow event : timeline.byTrade(row.id())) {
            entries.add(
                    new TimelineEntry(
                            event,
                            event.actorId() == null ? null : row.roleOf(event.actorId()),
                            details(event.detailsJson())));
        }
        TradeProtection.@Nullable State state =
                protection
                        .getIfAvailable(() -> TradeProtection.NONE)
                        .statesOf(List.of(row.id()), timeProvider.now())
                        .get(row.id());
        return new Detail(
                row,
                offer,
                viewerRole,
                nextAction(row, viewerRole),
                TradeRules.operations(
                        row.status(),
                        viewerRole,
                        row.markedMeetup(viewerRole),
                        row.confirmed(viewerRole),
                        state != null && state.disputeOpenable()),
                entries,
                state);
    }

    static NextAction nextAction(TradeRow row, OfferRole viewer) {
        return TradeRules.nextAction(
                row.status(),
                row.confirmed(OfferRole.BUYER),
                row.confirmed(OfferRole.SELLER),
                viewer);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> details(String json) {
        try {
            return jsonMapper.readValue(json, LinkedHashMap.class);
        } catch (RuntimeException e) {
            return Map.of();
        }
    }

    private void record(
            UUID tradeId,
            @Nullable UUID actorId,
            TradeEventType event,
            Map<String, ?> details,
            Instant at) {
        timeline.insert(tradeId, actorId, event.name(), jsonMapper.writeValueAsString(details), at);
    }

    private void publish(TradeRow row, TradeEventType event, @Nullable UUID actorId, Instant at) {
        events.publishEvent(
                new TradeUpdated(
                        row.id(),
                        row.offerId(),
                        event.name(),
                        row.status().name(),
                        row.kind().name(),
                        actorId,
                        row.sellerId(),
                        row.buyerId(),
                        row.protectionEnabled(),
                        row.meetup(),
                        at));
    }

    private TradeRow lockParty(UUID me, UUID tradeId) {
        return trades.lock(tradeId)
                .filter(row -> row.involves(me))
                .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
    }

    private TradeRow requireRow(UUID id) {
        return trades.find(id)
                .orElseThrow(() -> new IllegalStateException("Trade vanished: " + id));
    }

    private static OfferRole requireRole(TradeRow row, UUID userId) {
        @Nullable OfferRole role = row.roleOf(userId);
        if (role == null) {
            throw ApiException.notFound(NOT_FOUND);
        }
        return role;
    }

    private static ApiException invalidState(TradeRow row, String action) {
        return new ApiException(
                        ErrorCode.INVALID_STATE_TRANSITION,
                        "This trade is "
                                + row.status().name().toLowerCase(Locale.ROOT).replace('_', ' ')
                                + " and cannot be "
                                + action)
                .withProperty("currentStatus", row.status().name());
    }
}
