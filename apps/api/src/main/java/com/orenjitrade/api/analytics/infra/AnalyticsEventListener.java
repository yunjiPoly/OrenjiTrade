package com.orenjitrade.api.analytics.infra;

import com.orenjitrade.api.analytics.domain.ActorHasher;
import com.orenjitrade.api.analytics.domain.AnalyticsEvent;
import com.orenjitrade.api.analytics.domain.AnalyticsEventTypes;
import com.orenjitrade.api.analytics.domain.AnalyticsPublisher;
import com.orenjitrade.api.analytics.domain.AnalyticsText;
import com.orenjitrade.api.binders.events.PublicBinderViewed;
import com.orenjitrade.api.cards.events.CardViewed;
import com.orenjitrade.api.community.events.CommunityPostCreated;
import com.orenjitrade.api.messaging.events.MessageSent;
import com.orenjitrade.api.offers.events.OfferCreated;
import com.orenjitrade.api.offers.events.OfferUpdated;
import com.orenjitrade.api.payments.events.DisputeUpdated;
import com.orenjitrade.api.payments.events.PaymentUpdated;
import com.orenjitrade.api.profiles.events.CollectorProfileViewed;
import com.orenjitrade.api.ratings.events.RatingSubmitted;
import com.orenjitrade.api.reports.events.CollectorReported;
import com.orenjitrade.api.search.events.SearchPerformed;
import com.orenjitrade.api.trades.events.TradeUpdated;
import com.orenjitrade.api.wishlist.events.WishlistItemCreated;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Turns the in-process notifications of other modules into analytics events (the analytics module
 * only consumes events, ARCHITECTURE.md section 3). Plain synchronous listeners (the notifications
 * are published by read-only requests and are not stored in the event publication registry); the
 * mapping is cheap and the transport runs asynchronously. Domain events of writes (Phase 5 {@code
 * MessageSent}, {@code CommunityPostCreated}) are mapped after commit only. Nothing here may fail a
 * request.
 *
 * <p>Privacy: account ids become HMAC hashes ({@link ActorHasher}); geography is the platform
 * region and subdivision codes carried by the notification, never a city, a coordinate or a
 * distance (ADR 0017); search text is scrubbed and truncated ({@link AnalyticsText}).
 */
@Component
public class AnalyticsEventListener {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsEventListener.class);

    private final AnalyticsPublisher publisher;
    private final boolean enabled;

    public AnalyticsEventListener(AnalyticsPublisher publisher, AnalyticsProperties properties) {
        this.publisher = publisher;
        this.enabled = properties.enabled();
    }

    @EventListener
    void on(SearchPerformed search) {
        emit(
                AnalyticsEventTypes.SEARCH_PERFORMED,
                () -> {
                    Map<String, Object> payload = new LinkedHashMap<>();
                    payload.put("surface", search.surface());
                    @Nullable String query = AnalyticsText.sanitize(search.query());
                    if (query != null) {
                        payload.put("query", query);
                    }
                    payload.put(
                            "query_length", search.query() == null ? 0 : search.query().length());
                    if (search.game() != null) {
                        payload.put("game", search.game());
                    }
                    if (!search.types().isEmpty()) {
                        payload.put("types", search.types());
                    }
                    payload.put("resolved", search.resolved());
                    payload.put("result_count", search.resultCount());
                    if (!search.filters().isEmpty()) {
                        payload.put("filters", search.filters());
                    }
                    payload.put("anonymous", search.viewerId() == null);
                    return event(
                            AnalyticsEventTypes.SEARCH_PERFORMED,
                            search.occurredAt(),
                            search.viewerId(),
                            search.regionCode(),
                            search.subdivisionCode(),
                            payload);
                });
        if (search.resultCount() == 0) {
            emit(
                    AnalyticsEventTypes.SEARCH_NO_RESULTS,
                    () -> {
                        Map<String, Object> payload = new LinkedHashMap<>();
                        payload.put("surface", search.surface());
                        @Nullable String query = AnalyticsText.sanitize(search.query());
                        if (query != null) {
                            payload.put("query", query);
                        }
                        if (search.game() != null) {
                            payload.put("game", search.game());
                        }
                        if (!search.filters().isEmpty()) {
                            payload.put("filters", search.filters());
                        }
                        payload.put("anonymous", search.viewerId() == null);
                        return event(
                                AnalyticsEventTypes.SEARCH_NO_RESULTS,
                                search.occurredAt(),
                                search.viewerId(),
                                search.regionCode(),
                                search.subdivisionCode(),
                                payload);
                    });
        }
    }

    @EventListener
    void on(CollectorProfileViewed viewed) {
        collectorViewed(
                "profile",
                viewed.viewerId(),
                viewed.collectorId(),
                viewed.regionCode(),
                viewed.subdivisionCode(),
                viewed.occurredAt());
    }

    @EventListener
    void on(PublicBinderViewed viewed) {
        emit(
                AnalyticsEventTypes.BINDER_VIEWED,
                () -> {
                    Map<String, Object> payload = new LinkedHashMap<>();
                    payload.put("binder_id", viewed.binderId());
                    payload.put("owner_hash", hash(viewed.ownerId()));
                    payload.put("anonymous", viewed.viewerId() == null);
                    return event(
                            AnalyticsEventTypes.BINDER_VIEWED,
                            viewed.occurredAt(),
                            viewed.viewerId(),
                            viewed.regionCode(),
                            viewed.subdivisionCode(),
                            payload);
                });
    }

    @EventListener
    void on(CardViewed viewed) {
        emit(
                AnalyticsEventTypes.CARD_VIEWED,
                () -> {
                    Map<String, Object> payload = new LinkedHashMap<>();
                    payload.put("card_id", viewed.cardId());
                    if (viewed.printingId() != null) {
                        payload.put("printing_id", viewed.printingId());
                    }
                    payload.put("game", viewed.game());
                    payload.put("anonymous", viewed.viewerId() == null);
                    return event(
                            AnalyticsEventTypes.CARD_VIEWED,
                            viewed.occurredAt(),
                            viewed.viewerId(),
                            null,
                            null,
                            payload);
                });
    }

    /** Committed private messages (Phase 5): the kind and the pseudonymous recipient only. */
    @TransactionalEventListener(fallbackExecution = true)
    void on(MessageSent sent) {
        emit(
                AnalyticsEventTypes.MESSAGE_SENT,
                () -> {
                    Map<String, Object> payload = new LinkedHashMap<>();
                    payload.put("kind", sent.kind());
                    payload.put("recipient_hash", hash(sent.recipientId()));
                    return event(
                            AnalyticsEventTypes.MESSAGE_SENT,
                            sent.occurredAt(),
                            sent.senderId(),
                            null,
                            null,
                            payload);
                });
    }

    /** Committed community posts (Phase 5): the channel slug only. */
    @TransactionalEventListener(fallbackExecution = true)
    void on(CommunityPostCreated created) {
        emit(
                AnalyticsEventTypes.COMMUNITY_POST_CREATED,
                () -> {
                    Map<String, Object> payload = new LinkedHashMap<>();
                    payload.put("channel", created.channelSlug());
                    return event(
                            AnalyticsEventTypes.COMMUNITY_POST_CREATED,
                            created.occurredAt(),
                            created.authorId(),
                            null,
                            null,
                            payload);
                });
    }

    /** Committed wishlist items (stage S2): game, target kind, Near Mint only, price term set. */
    @TransactionalEventListener(fallbackExecution = true)
    void on(WishlistItemCreated created) {
        emit(
                AnalyticsEventTypes.WISHLIST_ITEM_CREATED,
                () -> {
                    Map<String, Object> payload = new LinkedHashMap<>();
                    payload.put("game", created.game());
                    payload.put("target", created.target());
                    payload.put("near_mint_only", created.nearMintOnly());
                    payload.put("has_price_term", created.hasPriceTerm());
                    return event(
                            AnalyticsEventTypes.WISHLIST_ITEM_CREATED,
                            created.occurredAt(),
                            created.ownerId(),
                            null,
                            null,
                            payload);
                });
    }

    private void collectorViewed(
            String surface,
            @Nullable UUID viewerId,
            UUID collectorId,
            @Nullable String regionCode,
            @Nullable String subdivisionCode,
            Instant occurredAt) {
        emit(
                AnalyticsEventTypes.COLLECTOR_VIEWED,
                () -> {
                    Map<String, Object> payload = new LinkedHashMap<>();
                    payload.put("surface", surface);
                    payload.put("target_hash", hash(collectorId));
                    payload.put("anonymous", viewerId == null);
                    return event(
                            AnalyticsEventTypes.COLLECTOR_VIEWED,
                            occurredAt,
                            viewerId,
                            regionCode,
                            subdivisionCode,
                            payload);
                });
    }

    private AnalyticsEvent event(
            String type,
            Instant occurredAt,
            @Nullable UUID actorId,
            @Nullable String regionCode,
            @Nullable String subdivisionCode,
            Map<String, Object> payload) {
        return AnalyticsEvent.of(
                type, occurredAt, hash(actorId), regionCode, subdivisionCode, payload);
    }

    private @Nullable String hash(@Nullable UUID id) {
        return publisher.actorHasher().hash(id);
    }

    @TransactionalEventListener(fallbackExecution = true)
    void on(RatingSubmitted rating) {
        emit(
                AnalyticsEventTypes.RATING_SUBMITTED,
                () -> {
                    Map<String, Object> payload = new LinkedHashMap<>();
                    payload.put("interaction_kind", rating.interactionKind());
                    payload.put("overall", rating.overall());
                    payload.put("has_comment", rating.hasComment());
                    payload.put("edited", rating.edited());
                    payload.put("ratee_hash", hash(rating.rateeId()));
                    return event(
                            AnalyticsEventTypes.RATING_SUBMITTED,
                            rating.occurredAt(),
                            rating.raterId(),
                            null,
                            null,
                            payload);
                });
    }

    @TransactionalEventListener(fallbackExecution = true)
    void on(CollectorReported report) {
        emit(
                AnalyticsEventTypes.COLLECTOR_REPORTED,
                () -> {
                    Map<String, Object> payload = new LinkedHashMap<>();
                    payload.put("reason", report.reason());
                    payload.put("context_source", report.contextSource());
                    return event(
                            AnalyticsEventTypes.COLLECTOR_REPORTED,
                            report.occurredAt(),
                            report.reporterId(),
                            null,
                            null,
                            payload);
                });
    }

    @TransactionalEventListener(fallbackExecution = true)
    void on(OfferCreated offer) {
        emit(
                AnalyticsEventTypes.OFFER_CREATED,
                () -> {
                    Map<String, Object> payload = new LinkedHashMap<>();
                    payload.put("kind", offer.kind());
                    payload.put("game", offer.game());
                    payload.put("has_message", offer.hasMessage());
                    payload.put("protection_requested", offer.protectionRequested());
                    payload.put("seller_hash", hash(offer.sellerId()));
                    return event(
                            AnalyticsEventTypes.OFFER_CREATED,
                            offer.occurredAt(),
                            offer.buyerId(),
                            null,
                            null,
                            payload);
                });
    }

    @TransactionalEventListener(fallbackExecution = true)
    void on(OfferUpdated offer) {
        emit(
                AnalyticsEventTypes.OFFER_STATUS_CHANGED,
                () -> {
                    Map<String, Object> payload = new LinkedHashMap<>();
                    payload.put("event", offer.event());
                    payload.put("status", offer.status());
                    payload.put("kind", offer.kind());
                    payload.put("round", offer.round());
                    payload.put("by_platform", offer.actorId() == null);
                    return event(
                            AnalyticsEventTypes.OFFER_STATUS_CHANGED,
                            offer.occurredAt(),
                            offer.actorId(),
                            null,
                            null,
                            payload);
                });
    }

    @TransactionalEventListener(fallbackExecution = true)
    void on(TradeUpdated trade) {
        emit(
                AnalyticsEventTypes.TRADE_STATUS_CHANGED,
                () -> {
                    Map<String, Object> payload = new LinkedHashMap<>();
                    payload.put("event", trade.event());
                    payload.put("status", trade.status());
                    payload.put("kind", trade.kind());
                    payload.put("protection_enabled", trade.protectionEnabled());
                    payload.put("meetup", trade.meetup());
                    return event(
                            AnalyticsEventTypes.TRADE_STATUS_CHANGED,
                            trade.occurredAt(),
                            trade.actorId(),
                            null,
                            null,
                            payload);
                });
    }

    @TransactionalEventListener(fallbackExecution = true)
    void on(PaymentUpdated payment) {
        emit(
                AnalyticsEventTypes.PAYMENT_STATUS_CHANGED,
                () -> {
                    Map<String, Object> payload = new LinkedHashMap<>();
                    payload.put("event", payment.event());
                    payload.put("status", String.valueOf(payment.status()));
                    payload.put("provider", payment.provider());
                    payload.put("by_platform", payment.actorId() == null);
                    return event(
                            AnalyticsEventTypes.PAYMENT_STATUS_CHANGED,
                            payment.occurredAt(),
                            payment.actorId(),
                            null,
                            null,
                            payload);
                });
    }

    @TransactionalEventListener(fallbackExecution = true)
    void on(DisputeUpdated dispute) {
        emit(
                AnalyticsEventTypes.DISPUTE_STATUS_CHANGED,
                () -> {
                    Map<String, Object> payload = new LinkedHashMap<>();
                    payload.put("event", dispute.event());
                    payload.put("status", dispute.status());
                    payload.put("reason", dispute.reason());
                    payload.put("actor_role", String.valueOf(dispute.actorRole()));
                    return event(
                            AnalyticsEventTypes.DISPUTE_STATUS_CHANGED,
                            dispute.occurredAt(),
                            dispute.actorId(),
                            null,
                            null,
                            payload);
                });
    }

    private void emit(String type, Supplier<AnalyticsEvent> factory) {
        if (!enabled) {
            return;
        }
        try {
            publisher.publish(factory.get());
        } catch (RuntimeException e) {
            log.warn("Analytics event {} not emitted: {}", type, e.getMessage());
        }
    }
}
