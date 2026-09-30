package com.orenjitrade.api.offers.domain;

import com.orenjitrade.api.billing.domain.Limits;
import com.orenjitrade.api.binders.domain.PublicBinderService;
import com.orenjitrade.api.binders.domain.PublicOwner;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.CursorPage;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeCursor;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.featureflags.domain.FeatureFlagKeys;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import com.orenjitrade.api.inventory.domain.InventoryItemView;
import com.orenjitrade.api.inventory.domain.InventoryService;
import com.orenjitrade.api.messaging.domain.OfferLink;
import com.orenjitrade.api.offers.domain.OfferStateMachine.Decision;
import com.orenjitrade.api.offers.domain.OfferTerms.TradeLine;
import com.orenjitrade.api.offers.domain.OfferViews.Detail;
import com.orenjitrade.api.offers.domain.OfferViews.HistoryEntry;
import com.orenjitrade.api.offers.domain.OfferViews.Party;
import com.orenjitrade.api.offers.domain.OfferViews.Summary;
import com.orenjitrade.api.offers.domain.OfferViews.TradeItem;
import com.orenjitrade.api.offers.events.OfferCreated;
import com.orenjitrade.api.offers.events.OfferUpdated;
import com.orenjitrade.api.offers.infra.OfferEventRepository;
import com.orenjitrade.api.offers.infra.OfferRepository;
import com.orenjitrade.api.offers.infra.OfferRepository.NewOffer;
import com.orenjitrade.api.offers.infra.OfferRepository.NewTradeItem;
import com.orenjitrade.api.profiles.domain.BlockRelationProvider;
import com.orenjitrade.api.profiles.domain.MemberCard;
import com.orenjitrade.api.profiles.domain.MemberDirectory;
import com.orenjitrade.api.profiles.domain.RatingSummary;
import com.orenjitrade.api.profiles.domain.RatingSummaryProvider;
import com.orenjitrade.api.ratings.domain.InteractionKind;
import com.orenjitrade.api.ratings.domain.InteractionService;
import com.orenjitrade.api.ratings.domain.InteractionSubjectType;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The offers module's service interface (Phase 8 contract "Endpoints"): make an offer on a public
 * card, the inbox, one offer with its history, counter / accept / decline / cancel, the hourly
 * expiry, the offer links of messages, export and deletion.
 *
 * <p>Rules: the item must be effectively public and visible to the buyer (blocks hide it: 404),
 * accept offers and fit the kind (422 OFFERS_NOT_ACCEPTED); the buyer's trade cards must be their
 * own non-deleted items; one live negotiation per buyer and item (409 OFFER_ALREADY_OPEN); new
 * offers consume {@code offers.per_day} ({@link Limits}, 429 LIMIT_REACHED). Transitions follow
 * {@link OfferStateMachine} (only the party whose turn it is; 409 NOT_YOUR_TURN /
 * INVALID_STATE_TRANSITION), the optional client version and superseded proposals give 409
 * STALE_OFFER, every transition appends an {@code offer_event} with a snapshot and publishes {@link
 * OfferCreated} / {@link OfferUpdated} in the transaction (notifications, SYSTEM messages and
 * analytics follow after commit). Acceptance opens the trade through {@link AcceptedOfferHandler}
 * and records the OFFER_ACCEPTED interaction (rating eligibility). Only the two parties ever see an
 * offer (404 for anybody else).
 */
@Service
public class OfferService {

    public static final String OFFERS_PER_DAY = "offers.per_day";
    public static final int DEFAULT_LIMIT = 20;
    public static final int MAX_LIMIT = 50;
    static final String NOT_FOUND = "Offer not found";
    static final String ITEM_NOT_FOUND = "Item not found";
    static final int EXPIRY_BATCH = 200;
    static final Duration IDEMPOTENCY_TTL = Duration.ofHours(24);
    static final String IDEMPOTENCY_PREFIX = "idem:offer:";
    static final Pattern IDEMPOTENCY_KEY = Pattern.compile("^[A-Za-z0-9_.:-]{1,100}$");

    private static final Logger log = LoggerFactory.getLogger(OfferService.class);

    private final OfferRepository offers;
    private final OfferEventRepository history;
    private final OfferSnapshots snapshots;
    private final OfferPreferencesService preferences;
    private final InventoryService inventory;
    private final PublicBinderService publicBinders;
    private final MemberDirectory members;
    private final RatingSummaryProvider ratings;
    private final ObjectProvider<BlockRelationProvider> blocks;
    private final ObjectProvider<AcceptedOfferHandler> trades;
    private final Limits limits;
    private final FeatureFlags featureFlags;
    private final InteractionService interactions;
    private final StringRedisTemplate redis;
    private final ApplicationEventPublisher events;
    private final TimeProvider timeProvider;

    public OfferService(
            OfferRepository offers,
            OfferEventRepository history,
            OfferSnapshots snapshots,
            OfferPreferencesService preferences,
            InventoryService inventory,
            PublicBinderService publicBinders,
            MemberDirectory members,
            RatingSummaryProvider ratings,
            ObjectProvider<BlockRelationProvider> blocks,
            ObjectProvider<AcceptedOfferHandler> trades,
            Limits limits,
            FeatureFlags featureFlags,
            InteractionService interactions,
            StringRedisTemplate redis,
            ApplicationEventPublisher events,
            TimeProvider timeProvider) {
        this.offers = offers;
        this.history = history;
        this.snapshots = snapshots;
        this.preferences = preferences;
        this.inventory = inventory;
        this.publicBinders = publicBinders;
        this.members = members;
        this.ratings = ratings;
        this.blocks = blocks;
        this.trades = trades;
        this.limits = limits;
        this.featureFlags = featureFlags;
        this.interactions = interactions;
        this.redis = redis;
        this.events = events;
        this.timeProvider = timeProvider;
    }

    // ---------------------------------------------------------------------------------------
    // Create
    // ---------------------------------------------------------------------------------------

    /**
     * {@code POST /offers}: a new offer (chain root, OPEN, the seller's turn). An {@code
     * Idempotency-Key} repeats the original answer for 24 hours.
     */
    @Transactional
    public Created create(UUID me, OfferInputs.Create input, @Nullable String idempotencyKey) {
        @Nullable String key = idempotencyKey(idempotencyKey);
        if (key != null) {
            Optional<OfferRow> previous = previousFor(me, key);
            if (previous.isPresent()) {
                return new Created(detail(me, previous.get()), false);
            }
        }
        List<ProblemFieldError> errors =
                new ArrayList<>(OfferRules.validateExpiry(input.expiresInHours()));
        InventoryItemView item = visibleItem(me, input.itemId());
        UUID sellerId = item.row().ownerId();
        if (sellerId.equals(me)) {
            throw invalid("itemId", "You cannot make an offer on your own card");
        }
        OfferKind kind =
                input.kind() != null
                        ? input.kind()
                        : OfferRules.kindOf(input.cashAmount(), input.tradeItems());
        OfferTerms terms =
                new OfferTerms(
                        kind,
                        input.cashAmount(),
                        kind.hasCash()
                                ? OfferRules.currency(input.currency(), item.row().currency())
                                : null,
                        input.tradeItems(),
                        OfferRules.text(input.message()));
        errors.addAll(OfferRules.validate(terms));
        if (input.protectionRequested() && !kind.hasCash()) {
            errors.add(
                    new ProblemFieldError(
                            "protectionRequested", "Payment protection needs a cash part"));
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        Optional<String> refusal =
                OfferRules.refusal(
                        item.row().availability(),
                        item.row().acceptsOffers(),
                        kind,
                        preferences.acceptsMixed(sellerId));
        if (refusal.isPresent()) {
            throw new ApiException(ErrorCode.OFFERS_NOT_ACCEPTED, refusal.get());
        }
        Map<UUID, InventoryItemView> cards = requireOwnCards(me, terms.tradeItems());
        if (input.protectionRequested()) {
            featureFlags.require(FeatureFlagKeys.PROTECTED_PAYMENTS, me);
        }
        Optional<OfferRow> open = offers.findLive(me, item.row().id());
        if (open.isPresent()) {
            throw alreadyOpen(open.get().id());
        }
        limits.consume(me, OFFERS_PER_DAY);

        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        UUID id = UUID.randomUUID();
        boolean inserted =
                offers.insert(
                        new NewOffer(
                                id,
                                id,
                                null,
                                item.row().id(),
                                sellerId,
                                me,
                                kind,
                                OfferRules.amount(terms.cashAmount()),
                                terms.currency(),
                                OfferStatus.OPEN,
                                OfferRole.SELLER,
                                terms.message(),
                                input.protectionRequested(),
                                snapshots.item(item),
                                OfferRules.expiresAt(now, input.expiresInHours()),
                                now));
        if (!inserted) {
            throw alreadyOpen(offers.findLive(me, item.row().id()).map(OfferRow::id).orElse(null));
        }
        offers.insertTradeItems(id, tradeItems(terms.tradeItems(), cards));
        OfferRow row = requireRow(id);
        history.insert(id, id, me, OfferEventType.CREATED, snapshot(row), null, now);
        events.publishEvent(
                new OfferCreated(
                        id,
                        item.row().id(),
                        sellerId,
                        me,
                        kind.name(),
                        item.row().game(),
                        terms.message() != null,
                        input.protectionRequested(),
                        now));
        if (key != null) {
            remember(me, key, id);
        }
        log.info("Offer {} created ({})", id, kind);
        return new Created(detail(me, row), true);
    }

    /**
     * Result of {@link #create}.
     *
     * @param offer the offer as the buyer sees it
     * @param created whether this call created it (false for an idempotent repeat)
     */
    public record Created(Detail offer, boolean created) {}

    // ---------------------------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------------------------

    /**
     * {@code GET /offers}: the live proposal of each of the caller's negotiations (as buyer and/or
     * seller), most recent activity first.
     */
    @Transactional(readOnly = true)
    public CursorPage<Summary> list(
            UUID me,
            @Nullable OfferRole role,
            Collection<OfferStatus> statuses,
            @Nullable String cursor,
            int limit) {
        List<OfferRow> rows = offers.page(me, role, statuses, TimeCursor.decode(cursor), limit + 1);
        boolean hasMore = rows.size() > limit;
        List<OfferRow> slice = hasMore ? rows.subList(0, limit) : rows;
        Set<UUID> itemIds = new LinkedHashSet<>();
        Set<UUID> counterparties = new LinkedHashSet<>();
        List<UUID> accepted = new ArrayList<>();
        for (OfferRow row : slice) {
            if (row.itemId() != null) {
                itemIds.add(row.itemId());
            }
            counterparties.add(row.buyerId().equals(me) ? row.sellerId() : row.buyerId());
            if (row.status() == OfferStatus.ACCEPTED) {
                accepted.add(row.id());
            }
        }
        Map<UUID, InventoryItemView> items = inventory.itemsForParties(itemIds);
        Map<UUID, List<OfferTradeItemRow>> lines =
                offers.tradeItems(slice.stream().map(OfferRow::id).toList());
        Map<UUID, Party> parties = parties(me, counterparties);
        Map<UUID, UUID> tradeIds = tradeIds(accepted);
        List<Summary> summaries = new ArrayList<>();
        for (OfferRow row : slice) {
            OfferRole viewerRole = requireRole(row, me);
            UUID other = row.partyOf(viewerRole.other());
            @Nullable Party counterparty = parties.get(other);
            if (counterparty == null) {
                continue;
            }
            summaries.add(
                    new Summary(
                            row,
                            row.itemId() == null ? null : items.get(row.itemId()),
                            counterparty,
                            viewerRole,
                            lines.getOrDefault(row.id(), List.of()).size(),
                            OfferStateMachine.allowedActions(
                                    row.status(), row.superseded(), row.currentTurn(), viewerRole),
                            tradeIds.get(row.id())));
        }
        if (!hasMore) {
            return CursorPage.last(summaries);
        }
        OfferRow last = slice.get(slice.size() - 1);
        return CursorPage.of(summaries, new TimeCursor(last.updatedAt(), last.id()).encode());
    }

    /**
     * {@code GET /offers/{id}}: one proposal with the whole chain's history, for its two parties
     * only (404 otherwise). The first view by the party who has to answer is recorded (VIEWED).
     */
    @Transactional
    public Detail get(UUID me, UUID offerId) {
        OfferRow row =
                offers.find(offerId)
                        .filter(candidate -> candidate.involves(me))
                        .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        if (!row.superseded()
                && row.status().isPending()
                && row.partyOf(row.currentTurn()).equals(me)) {
            history.insertViewedIfAbsent(
                    row.id(), row.rootOfferId(), me, snapshot(row), timeProvider.now());
        }
        return detail(me, row);
    }

    // ---------------------------------------------------------------------------------------
    // Transitions
    // ---------------------------------------------------------------------------------------

    /**
     * {@code POST /offers/{id}/counter}: the party whose turn it is proposes other terms. The
     * answered proposal becomes COUNTERED (superseded), a new COUNTERED proposal with a fresh
     * expiry waits for the other party.
     */
    @Transactional
    public Detail counter(UUID me, UUID offerId, OfferInputs.Counter input) {
        OfferRow row = lockParty(me, offerId);
        OfferRole actor = requireRole(row, me);
        requireAllowed(row, input.version(), OfferAction.COUNTER, actor);
        requireCanTrade(me, row.partyOf(actor.other()));
        List<ProblemFieldError> errors =
                new ArrayList<>(OfferRules.validateExpiry(input.expiresInHours()));
        List<TradeLine> current = lines(row);
        @Nullable InventoryItemView item = liveTarget(row);
        if (item == null) {
            throw itemUnavailable("This card is no longer in the seller's inventory");
        }
        OfferTerms terms = counterTerms(row, current, input, item.row().currency());
        errors.addAll(OfferRules.validate(terms));
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        OfferTerms currentTerms =
                new OfferTerms(row.kind(), row.cashAmount(), row.currency(), current, null);
        if (terms.sameDealAs(currentTerms)) {
            throw invalid("cashAmount", "A counter-offer must change the cash amount or the cards");
        }
        if (actor == OfferRole.BUYER) {
            Optional<String> refusal =
                    OfferRules.kindRefusal(
                            item.row().availability(),
                            terms.kind(),
                            preferences.acceptsMixed(row.sellerId()));
            if (refusal.isPresent()) {
                throw new ApiException(ErrorCode.OFFERS_NOT_ACCEPTED, refusal.get());
            }
        }
        Map<UUID, InventoryItemView> cards = requireOwnCards(row.buyerId(), terms.tradeItems());

        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        UUID id = UUID.randomUUID();
        if (!offers.transition(row.id(), row.version(), OfferStatus.COUNTERED, id, now)) {
            throw stale(row);
        }
        boolean inserted =
                offers.insert(
                        new NewOffer(
                                id,
                                row.rootOfferId(),
                                row.id(),
                                item.row().id(),
                                row.sellerId(),
                                row.buyerId(),
                                terms.kind(),
                                OfferRules.amount(terms.cashAmount()),
                                terms.currency(),
                                OfferStatus.COUNTERED,
                                actor.other(),
                                terms.message(),
                                row.protectionRequested() && terms.kind().hasCash(),
                                snapshots.item(item),
                                OfferRules.expiresAt(now, input.expiresInHours()),
                                now));
        if (!inserted) {
            throw stale(row);
        }
        offers.insertTradeItems(id, tradeItems(terms.tradeItems(), cards));
        OfferRow created = requireRow(id);
        history.insert(
                id, row.rootOfferId(), me, OfferEventType.COUNTERED, snapshot(created), null, now);
        events.publishEvent(updated(created, row.id(), OfferEventType.COUNTERED, me, null, now));
        log.info("Offer {} countered by {} with {}", row.id(), actor, id);
        return detail(me, created);
    }

    /**
     * {@code POST /offers/{id}/accept}: the party whose turn it is accepts; opens the trade
     * (AGREED, or AWAITING_PAYMENT with payment protection) and records the OFFER_ACCEPTED
     * interaction.
     */
    @Transactional
    public Detail accept(UUID me, UUID offerId, @Nullable Integer version) {
        OfferRow row = lockParty(me, offerId);
        OfferRole actor = requireRole(row, me);
        requireAllowed(row, version, OfferAction.ACCEPT, actor);
        requireCanTrade(me, row.partyOf(actor.other()));
        @Nullable InventoryItemView item = liveTarget(row);
        if (item == null) {
            throw itemUnavailable("This card is no longer in the seller's inventory");
        }
        List<TradeLine> cards = lines(row);
        Map<UUID, InventoryItemView> held =
                inventory.liveItemsOf(
                        row.buyerId(), cards.stream().map(TradeLine::inventoryItemId).toList());
        for (TradeLine line : cards) {
            @Nullable InventoryItemView card = held.get(line.inventoryItemId());
            if (card == null || card.row().quantity() < line.quantity()) {
                throw itemUnavailable(
                        "A card offered in trade is no longer in the buyer's inventory");
            }
        }
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        if (!offers.transition(row.id(), row.version(), OfferStatus.ACCEPTED, null, now)) {
            throw stale(row);
        }
        OfferRow accepted = requireRow(row.id());
        history.insert(
                row.id(),
                row.rootOfferId(),
                me,
                OfferEventType.ACCEPTED,
                snapshot(accepted),
                null,
                now);
        AcceptedOfferHandler handler = trades.getIfAvailable();
        if (handler == null) {
            throw new IllegalStateException("No AcceptedOfferHandler (trades module) is available");
        }
        UUID tradeId =
                handler.openTrade(
                        new AcceptedOffer(
                                accepted.id(),
                                accepted.rootOfferId(),
                                item.row().id(),
                                item.row().quantity(),
                                accepted.sellerId(),
                                accepted.buyerId(),
                                accepted.kind(),
                                accepted.cashAmount(),
                                accepted.currency(),
                                accepted.protectionRequested(),
                                cards,
                                me,
                                now));
        interactions.record(
                InteractionKind.OFFER_ACCEPTED,
                accepted.buyerId(),
                accepted.sellerId(),
                InteractionSubjectType.OFFER,
                accepted.id(),
                now);
        events.publishEvent(updated(accepted, null, OfferEventType.ACCEPTED, me, tradeId, now));
        log.info("Offer {} accepted by {}, trade {}", row.id(), actor, tradeId);
        return detail(me, accepted);
    }

    /** {@code POST /offers/{id}/decline}: the party whose turn it is refuses the terms. */
    @Transactional
    public Detail decline(
            UUID me, UUID offerId, @Nullable Integer version, @Nullable String reason) {
        return close(me, offerId, version, reason, OfferAction.DECLINE);
    }

    /** {@code POST /offers/{id}/cancel}: the buyer withdraws an OPEN offer. */
    @Transactional
    public Detail cancel(
            UUID me, UUID offerId, @Nullable Integer version, @Nullable String reason) {
        return close(me, offerId, version, reason, OfferAction.CANCEL);
    }

    private Detail close(
            UUID me,
            UUID offerId,
            @Nullable Integer version,
            @Nullable String rawReason,
            OfferAction action) {
        @Nullable String reason = OfferRules.text(rawReason);
        if (reason != null && reason.length() > OfferRules.REASON_MAX) {
            throw invalid("reason", "must be at most " + OfferRules.REASON_MAX + " characters");
        }
        OfferRow row = lockParty(me, offerId);
        OfferRole actor = requireRole(row, me);
        OfferStatus next = requireAllowed(row, version, action, actor);
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        if (!offers.transition(row.id(), row.version(), next, null, now)) {
            throw stale(row);
        }
        OfferRow closed = requireRow(row.id());
        OfferEventType event =
                action == OfferAction.CANCEL ? OfferEventType.CANCELLED : OfferEventType.DECLINED;
        history.insert(row.id(), row.rootOfferId(), me, event, snapshot(closed), reason, now);
        events.publishEvent(updated(closed, null, event, me, null, now));
        log.info("Offer {} {} by {}", row.id(), event, actor);
        return detail(me, closed);
    }

    // ---------------------------------------------------------------------------------------
    // Expiry (hourly job)
    // ---------------------------------------------------------------------------------------

    /**
     * Expires one batch of live OPEN / COUNTERED proposals past {@code expires_at} (EXPIRED event,
     * {@link OfferUpdated} for the notifications); returns their ids.
     */
    @Transactional
    public List<UUID> expireDue() {
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        List<UUID> expired = new ArrayList<>();
        for (OfferRow row : offers.lockDue(now, EXPIRY_BATCH)) {
            if (!OfferStateMachine.canExpire(row.status(), row.superseded())
                    || !offers.transition(
                            row.id(), row.version(), OfferStatus.EXPIRED, null, now)) {
                continue;
            }
            OfferRow closed = requireRow(row.id());
            history.insert(
                    row.id(),
                    row.rootOfferId(),
                    null,
                    OfferEventType.EXPIRED,
                    snapshot(closed),
                    null,
                    now);
            events.publishEvent(updated(closed, null, OfferEventType.EXPIRED, null, null, now));
            expired.add(row.id());
        }
        return expired;
    }

    // ---------------------------------------------------------------------------------------
    // Other modules (trades, messaging, notifications)
    // ---------------------------------------------------------------------------------------

    /** A proposal as one of its parties sees it (trades module: the trade's offer). */
    @Transactional(readOnly = true)
    public Optional<Detail> find(UUID viewerId, UUID offerId) {
        return offers.find(offerId)
                .filter(row -> row.involves(viewerId))
                .map(row -> detail(viewerId, row));
    }

    /** Summaries of proposals for one of their parties (trades module lists), by id. */
    @Transactional(readOnly = true)
    public Map<UUID, Summary> summaries(UUID viewerId, Collection<UUID> offerIds) {
        Map<UUID, Summary> result = new LinkedHashMap<>();
        List<OfferRow> rows = new ArrayList<>();
        for (UUID id : new LinkedHashSet<>(offerIds)) {
            offers.find(id).filter(row -> row.involves(viewerId)).ifPresent(rows::add);
        }
        Set<UUID> itemIds = new LinkedHashSet<>();
        Set<UUID> counterparties = new LinkedHashSet<>();
        for (OfferRow row : rows) {
            if (row.itemId() != null) {
                itemIds.add(row.itemId());
            }
            counterparties.add(row.buyerId().equals(viewerId) ? row.sellerId() : row.buyerId());
        }
        Map<UUID, InventoryItemView> items = inventory.itemsForParties(itemIds);
        Map<UUID, List<OfferTradeItemRow>> lines =
                offers.tradeItems(rows.stream().map(OfferRow::id).toList());
        Map<UUID, Party> parties = parties(viewerId, counterparties);
        for (OfferRow row : rows) {
            OfferRole viewerRole = requireRole(row, viewerId);
            @Nullable Party counterparty = parties.get(row.partyOf(viewerRole.other()));
            if (counterparty == null) {
                continue;
            }
            result.put(
                    row.id(),
                    new Summary(
                            row,
                            row.itemId() == null ? null : items.get(row.itemId()),
                            counterparty,
                            viewerRole,
                            lines.getOrDefault(row.id(), List.of()).size(),
                            OfferStateMachine.allowedActions(
                                    row.status(), row.superseded(), row.currentTurn(), viewerRole),
                            null));
        }
        return result;
    }

    /** The buyer's cards of a proposal (trades module: the transfer on completion). */
    @Transactional(readOnly = true)
    public List<TradeLine> tradeLines(UUID offerId) {
        return offers.find(offerId).map(this::lines).orElse(List.of());
    }

    /** A stored proposal (notifications and SYSTEM messages after commit). */
    @Transactional(readOnly = true)
    public Optional<OfferRow> row(UUID offerId) {
        return offers.find(offerId);
    }

    /**
     * The summary of a proposal's terms for texts ("40.00 CAD for Azure-Eyes Sky Dragon"); the card
     * name comes from the live item or its snapshot.
     */
    @Transactional(readOnly = true)
    public String summaryText(OfferRow row) {
        int cards = offers.tradeItems(List.of(row.id())).getOrDefault(row.id(), List.of()).size();
        return OfferTexts.summary(
                row.kind(), row.cashAmount(), row.currency(), cards, cardName(row));
    }

    /** The card of a proposal (live item, else the stored snapshot). */
    @Transactional(readOnly = true)
    public String cardName(OfferRow row) {
        if (row.itemId() != null) {
            @Nullable InventoryItemView item =
                    inventory.itemsForParties(List.of(row.itemId())).get(row.itemId());
            if (item != null) {
                return item.row().cardName();
            }
        }
        return snapshots.itemCardName(offers.itemSnapshot(row.id())).orElse("a card");
    }

    /**
     * {@link OfferLink}s of messages for a party: the live proposal of each requested offer's chain
     * (offers of other collectors are absent).
     */
    @Transactional(readOnly = true)
    public Map<UUID, OfferLink> links(UUID viewerId, Collection<UUID> offerIds) {
        Map<UUID, OfferLink> result = new LinkedHashMap<>();
        for (Map.Entry<UUID, OfferRow> entry : offers.latestOfChains(offerIds).entrySet()) {
            OfferRow latest = entry.getValue();
            if (!latest.involves(viewerId)) {
                continue;
            }
            result.put(
                    entry.getKey(),
                    new OfferLink(latest.id(), latest.status().name(), summaryText(latest)));
        }
        return result;
    }

    /** Whether two accounts are the parties of an offer. */
    @Transactional(readOnly = true)
    public boolean isBetween(UUID offerId, UUID one, UUID other) {
        return offers.find(offerId)
                .map(
                        row ->
                                (row.buyerId().equals(one) && row.sellerId().equals(other))
                                        || (row.buyerId().equals(other)
                                                && row.sellerId().equals(one)))
                .orElse(false);
    }

    // ---------------------------------------------------------------------------------------
    // Account data
    // ---------------------------------------------------------------------------------------

    /**
     * Account deletion requested: the account's live negotiations are withdrawn (CANCELLED with the
     * account as actor; the other party is notified). Returns the proposals closed.
     */
    @Transactional
    public int closeForDeletion(UUID userId) {
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        int closed = 0;
        for (OfferRow row : offers.pendingOf(userId)) {
            if (!offers.transition(row.id(), row.version(), OfferStatus.CANCELLED, null, now)) {
                continue;
            }
            OfferRow cancelled = requireRow(row.id());
            history.insert(
                    row.id(),
                    row.rootOfferId(),
                    userId,
                    OfferEventType.CANCELLED,
                    snapshot(cancelled),
                    null,
                    now);
            events.publishEvent(
                    updated(cancelled, null, OfferEventType.CANCELLED, userId, null, now));
            closed++;
        }
        return closed;
    }

    /** Account purge: erases the account's notes and reasons; the rows stay for the other party. */
    @Transactional
    public void purge(UUID userId) {
        offers.eraseMessagesOf(userId);
        history.eraseReasonsOf(userId);
        history.eraseSnapshotMessagesOf(userId);
        preferences.purge(userId);
    }

    /** Export section: the account's offers (own notes only). */
    @Transactional(readOnly = true)
    public List<Map<String, @Nullable Object>> export(UUID userId) {
        List<Map<String, @Nullable Object>> result = new ArrayList<>();
        for (OfferRow row : offers.ofUser(userId, 1000)) {
            OfferRole role = requireRole(row, userId);
            Map<String, @Nullable Object> entry = new LinkedHashMap<>();
            entry.put("id", row.id());
            entry.put("rootOfferId", row.rootOfferId());
            entry.put("role", role.name());
            entry.put("itemId", row.itemId());
            entry.put("kind", row.kind().name());
            entry.put("cashAmount", row.cashAmount());
            entry.put("currency", row.currency());
            entry.put("status", row.status().name());
            entry.put("proposedBy", row.proposer().name());
            entry.put("message", row.proposer() == role ? row.message() : null);
            entry.put("createdAt", row.createdAt());
            entry.put("updatedAt", row.updatedAt());
            result.add(entry);
        }
        return result;
    }

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

    private Detail detail(UUID viewer, OfferRow row) {
        OfferRole viewerRole = requireRole(row, viewer);
        List<OfferRow> chain = offers.chain(row.rootOfferId());
        UUID latest =
                chain.stream()
                        .filter(candidate -> !candidate.superseded())
                        .map(OfferRow::id)
                        .findFirst()
                        .orElse(row.id());
        List<OfferTradeItemRow> lines =
                offers.tradeItems(List.of(row.id())).getOrDefault(row.id(), List.of());
        Set<UUID> itemIds = new LinkedHashSet<>();
        if (row.itemId() != null) {
            itemIds.add(row.itemId());
        }
        lines.forEach(
                line -> {
                    if (line.inventoryItemId() != null) {
                        itemIds.add(line.inventoryItemId());
                    }
                });
        Map<UUID, InventoryItemView> items = inventory.itemsForParties(itemIds);
        List<TradeItem> tradeItems = new ArrayList<>();
        for (OfferTradeItemRow line : lines) {
            tradeItems.add(
                    new TradeItem(
                            line.inventoryItemId(),
                            line.quantity(),
                            line.inventoryItemId() == null
                                    ? null
                                    : items.get(line.inventoryItemId())));
        }
        Map<UUID, Party> parties = parties(viewer, List.of(row.sellerId(), row.buyerId()));
        List<HistoryEntry> entries = new ArrayList<>();
        for (OfferEventRow event : history.byRoot(row.rootOfferId())) {
            entries.add(
                    new HistoryEntry(
                            event,
                            event.actorId() == null ? null : row.roleOf(event.actorId()),
                            snapshots.read(event.snapshotJson(), row)));
        }
        @Nullable UUID tradeId =
                row.status() == OfferStatus.ACCEPTED
                        ? tradeIds(List.of(row.id())).get(row.id())
                        : null;
        return new Detail(
                row,
                row.itemId() == null ? null : items.get(row.itemId()),
                tradeItems,
                requireParty(parties, row.sellerId()),
                requireParty(parties, row.buyerId()),
                viewerRole,
                OfferStateMachine.allowedActions(
                        row.status(), row.superseded(), row.currentTurn(), viewerRole),
                latest,
                entries,
                tradeId);
    }

    private Map<UUID, Party> parties(UUID viewer, Collection<UUID> accountIds) {
        Map<UUID, RatingSummary> summaries = ratings.ratingsOf(accountIds);
        Map<UUID, Party> result = new HashMap<>();
        for (UUID id : new LinkedHashSet<>(accountIds)) {
            Optional<PublicOwner> owner = publicBinders.ownerCard(viewer, id);
            owner.ifPresent(
                    card ->
                            result.put(
                                    id,
                                    new Party(
                                            card, summaries.getOrDefault(id, RatingSummary.NONE))));
        }
        return result;
    }

    private static Party requireParty(Map<UUID, Party> parties, UUID id) {
        @Nullable Party party = parties.get(id);
        if (party == null) {
            throw new IllegalStateException("Offer party " + id + " not found");
        }
        return party;
    }

    private Map<UUID, UUID> tradeIds(Collection<UUID> offerIds) {
        if (offerIds.isEmpty()) {
            return Map.of();
        }
        @Nullable AcceptedOfferHandler handler = trades.getIfAvailable();
        return handler == null ? Map.of() : handler.tradeIdsByOffer(offerIds);
    }

    /** The public item the buyer may make an offer on (404 when not visible to them). */
    private InventoryItemView visibleItem(UUID me, UUID itemId) {
        @Nullable InventoryItemView item = inventory.itemsForParties(List.of(itemId)).get(itemId);
        if (item == null || !item.row().effectivePublic()) {
            throw ApiException.notFound(ITEM_NOT_FOUND);
        }
        if (!item.row().ownerId().equals(me) && isBlocked(me, item.row().ownerId())) {
            throw ApiException.notFound(ITEM_NOT_FOUND);
        }
        return item;
    }

    /** The seller's item of a proposal while it is still in their inventory. */
    private @Nullable InventoryItemView liveTarget(OfferRow row) {
        if (row.itemId() == null) {
            return null;
        }
        return inventory.liveItemsOf(row.sellerId(), List.of(row.itemId())).get(row.itemId());
    }

    /** The buyer's own non-deleted cards with enough copies (400 otherwise). */
    private Map<UUID, InventoryItemView> requireOwnCards(UUID buyerId, List<TradeLine> lines) {
        if (lines.isEmpty()) {
            return Map.of();
        }
        Map<UUID, InventoryItemView> held =
                inventory.liveItemsOf(
                        buyerId, lines.stream().map(TradeLine::inventoryItemId).toList());
        for (TradeLine line : lines) {
            @Nullable InventoryItemView card = held.get(line.inventoryItemId());
            if (card == null) {
                throw invalid(
                        "tradeItemIds", "Only cards of the buyer's own inventory can be offered");
            }
            if (card.row().quantity() < line.quantity()) {
                throw invalid(
                        "tradeItemIds",
                        "Only "
                                + card.row().quantity()
                                + " "
                                + (card.row().quantity() == 1 ? "copy" : "copies")
                                + " of "
                                + card.row().cardName()
                                + " are in the buyer's inventory");
            }
        }
        return held;
    }

    private List<NewTradeItem> tradeItems(
            List<TradeLine> lines, Map<UUID, InventoryItemView> cards) {
        List<NewTradeItem> result = new ArrayList<>();
        for (TradeLine line : lines) {
            InventoryItemView card = cards.get(line.inventoryItemId());
            result.add(
                    new NewTradeItem(
                            line.inventoryItemId(),
                            line.quantity(),
                            card == null ? "{}" : snapshots.item(card)));
        }
        return result;
    }

    /** The terms of a counter-offer (see {@link OfferInputs.Counter}). */
    private static OfferTerms counterTerms(
            OfferRow row, List<TradeLine> current, OfferInputs.Counter input, String itemCurrency) {
        OfferKind kind;
        @Nullable BigDecimal cash;
        List<TradeLine> lines;
        if (input.kind() != null) {
            kind = input.kind();
            cash = input.cashAmount();
            lines = input.tradeItems() == null ? List.of() : input.tradeItems();
        } else {
            cash = input.cashAmount() != null ? input.cashAmount() : row.cashAmount();
            lines = input.tradeItems() != null ? input.tradeItems() : current;
            kind = OfferRules.kindOf(cash, lines);
        }
        String fallbackCurrency = row.currency() != null ? row.currency() : itemCurrency;
        return new OfferTerms(
                kind,
                kind.hasCash() ? cash : null,
                kind.hasCash() ? OfferRules.currency(input.currency(), fallbackCurrency) : null,
                kind.hasTradeItems() ? lines : List.of(),
                OfferRules.text(input.message()));
    }

    /** The live cards of a proposal (lines of purged items are dropped). */
    private List<TradeLine> lines(OfferRow row) {
        List<TradeLine> lines = new ArrayList<>();
        for (OfferTradeItemRow line :
                offers.tradeItems(List.of(row.id())).getOrDefault(row.id(), List.of())) {
            if (line.inventoryItemId() != null) {
                lines.add(new TradeLine(line.inventoryItemId(), line.quantity()));
            }
        }
        return lines;
    }

    /** The snapshot of a proposal as stored with an event. */
    private String snapshot(OfferRow row) {
        List<OfferTradeItemRow> lines =
                offers.tradeItems(List.of(row.id())).getOrDefault(row.id(), List.of());
        Set<UUID> ids = new LinkedHashSet<>();
        lines.forEach(
                line -> {
                    if (line.inventoryItemId() != null) {
                        ids.add(line.inventoryItemId());
                    }
                });
        return snapshots.write(row, lines, inventory.itemsForParties(ids));
    }

    private OfferUpdated updated(
            OfferRow row,
            @Nullable UUID previousOfferId,
            OfferEventType event,
            @Nullable UUID actorId,
            @Nullable UUID tradeId,
            Instant now) {
        int round = offers.chain(row.rootOfferId()).size();
        return new OfferUpdated(
                row.id(),
                row.rootOfferId(),
                previousOfferId,
                event.name(),
                row.status().name(),
                row.kind().name(),
                actorId,
                row.sellerId(),
                row.buyerId(),
                tradeId,
                round,
                now);
    }

    private OfferRow lockParty(UUID me, UUID offerId) {
        return offers.lock(offerId)
                .filter(row -> row.involves(me))
                .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
    }

    private OfferRow requireRow(UUID id) {
        return offers.find(id)
                .orElseThrow(() -> new IllegalStateException("Offer vanished: " + id));
    }

    private static OfferRole requireRole(OfferRow row, UUID userId) {
        @Nullable OfferRole role = row.roleOf(userId);
        if (role == null) {
            throw ApiException.notFound(NOT_FOUND);
        }
        return role;
    }

    /**
     * Applies the state machine and the optimistic version (superseded proposals and other versions
     * are stale) and returns the proposal's next status.
     */
    private OfferStatus requireAllowed(
            OfferRow row, @Nullable Integer version, OfferAction action, OfferRole actor) {
        if (row.superseded()) {
            throw stale(row);
        }
        if (version != null && version != row.version()) {
            throw new ApiException(
                            ErrorCode.STALE_OFFER,
                            "This offer changed since you opened it. Reload it and try again.")
                    .withProperty("currentVersion", row.version())
                    .withProperty("latestOfferId", row.id().toString());
        }
        Decision decision =
                OfferStateMachine.decide(row.status(), false, row.currentTurn(), actor, action);
        if (decision.allowed() && decision.next() != null) {
            return decision.next();
        }
        OfferStateMachine.Refusal refusal =
                decision.refusal() == null
                        ? OfferStateMachine.Refusal.INVALID_STATE
                        : decision.refusal();
        throw switch (refusal) {
            case SUPERSEDED -> stale(row);
            case NOT_YOUR_TURN ->
                    new ApiException(
                            ErrorCode.NOT_YOUR_TURN,
                            "The other party has to answer this offer first");
            case BUYER_ONLY -> ApiException.forbidden("Only the buyer can withdraw an offer");
            case INVALID_STATE ->
                    new ApiException(
                                    ErrorCode.INVALID_STATE_TRANSITION,
                                    "This offer is "
                                            + row.status().name().toLowerCase(Locale.ROOT)
                                            + " and cannot be "
                                            + pastTense(action))
                            .withProperty("currentStatus", row.status().name());
        };
    }

    private static String pastTense(OfferAction action) {
        return switch (action) {
            case COUNTER -> "countered";
            case ACCEPT -> "accepted";
            case DECLINE -> "declined";
            case CANCEL -> "withdrawn";
        };
    }

    private ApiException stale(OfferRow row) {
        UUID latest =
                Optional.ofNullable(offers.latestOfChains(List.of(row.id())).get(row.id()))
                        .map(OfferRow::id)
                        .orElse(row.id());
        return new ApiException(
                        ErrorCode.STALE_OFFER,
                        "This offer changed since you opened it. Reload it and try again.")
                .withProperty("latestOfferId", latest.toString());
    }

    /** 403 TRADING_BLOCKED for a block in either direction or an inactive counterparty. */
    private void requireCanTrade(UUID me, UUID other) {
        if (isBlocked(me, other)) {
            throw new ApiException(
                    ErrorCode.TRADING_BLOCKED, "You cannot trade with this collector");
        }
        boolean active =
                members.card(other).map(card -> card.activeAt(timeProvider.now())).orElse(false);
        if (!active) {
            throw new ApiException(
                    ErrorCode.TRADING_BLOCKED, "This collector cannot trade right now");
        }
    }

    private boolean isBlocked(UUID me, UUID other) {
        @Nullable BlockRelationProvider provider = blocks.getIfAvailable();
        return provider != null && provider.isBlocked(me, other);
    }

    private static ApiException alreadyOpen(@Nullable UUID offerId) {
        ApiException exception =
                new ApiException(
                        ErrorCode.OFFER_ALREADY_OPEN,
                        "You already have an open offer on this card");
        return offerId == null ? exception : exception.withProperty("offerId", offerId.toString());
    }

    private static ApiException itemUnavailable(String message) {
        return new ApiException(ErrorCode.ITEM_UNAVAILABLE, message);
    }

    private static ApiException invalid(String field, String message) {
        return ApiException.validation(
                "Validation failed", List.of(new ProblemFieldError(field, message)));
    }

    // ---------------------------------------------------------------------------------------
    // Idempotency-Key (Redis, fail-open)
    // ---------------------------------------------------------------------------------------

    private static @Nullable String idempotencyKey(@Nullable String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String key = raw.trim();
        if (!IDEMPOTENCY_KEY.matcher(key).matches()) {
            throw invalid("Idempotency-Key", "must be 1 to 100 letters, digits or . _ : -");
        }
        return key;
    }

    private Optional<OfferRow> previousFor(UUID me, String key) {
        try {
            @Nullable String stored = redis.opsForValue().get(IDEMPOTENCY_PREFIX + me + ":" + key);
            if (stored == null) {
                return Optional.empty();
            }
            return offers.find(UUID.fromString(stored)).filter(row -> row.buyerId().equals(me));
        } catch (RuntimeException e) {
            log.debug("Idempotency lookup failed: {}", e.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    private void remember(UUID me, String key, UUID offerId) {
        try {
            redis.opsForValue()
                    .set(IDEMPOTENCY_PREFIX + me + ":" + key, offerId.toString(), IDEMPOTENCY_TTL);
        } catch (RuntimeException e) {
            log.debug("Idempotency store failed: {}", e.getClass().getSimpleName());
        }
    }

    /** Display name of a member for texts (the handle as fallback). */
    @Transactional(readOnly = true)
    public String displayName(@Nullable UUID userId) {
        if (userId == null) {
            return "A collector";
        }
        return members.card(userId).map(MemberCard::displayName).orElse("A collector");
    }
}
