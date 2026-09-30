package com.orenjitrade.api.trades.domain;

import com.orenjitrade.api.messaging.domain.ConversationService;
import com.orenjitrade.api.messaging.domain.OfferLink;
import com.orenjitrade.api.messaging.domain.SystemNotice;
import com.orenjitrade.api.notifications.domain.NotificationRequest;
import com.orenjitrade.api.notifications.domain.NotificationService;
import com.orenjitrade.api.notifications.domain.NotificationType;
import com.orenjitrade.api.offers.domain.OfferRow;
import com.orenjitrade.api.offers.domain.OfferService;
import com.orenjitrade.api.trades.events.TradeUpdated;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What a trade change causes after commit (Phase 8): TRADE_UPDATE notifications (the other party
 * for proposals, confirmations and cancellations; both parties for an agreed meetup and the
 * completion) and SYSTEM messages in the pair conversation for completion and cancellation.
 * Idempotent through the de-duplication keys ({@code trade:<id>:<event>:<recipient>}).
 */
@Service
public class TradeActivity {

    private final TradeService trades;
    private final OfferService offers;
    private final NotificationService notifications;
    private final ConversationService conversations;

    public TradeActivity(
            TradeService trades,
            OfferService offers,
            NotificationService notifications,
            ConversationService conversations) {
        this.trades = trades;
        this.offers = offers;
        this.notifications = notifications;
        this.conversations = conversations;
    }

    @Transactional
    public void updated(TradeUpdated event) {
        TradeEventType type;
        try {
            type = TradeEventType.valueOf(event.event());
        } catch (IllegalArgumentException e) {
            return;
        }
        if (type == TradeEventType.CREATED || type == TradeEventType.PROTECTION_REMOVED) {
            return; // the offer's acceptance already notified both parties
        }
        Optional<TradeRow> trade = trades.row(event.tradeId());
        Optional<OfferRow> offer = offers.row(event.offerId());
        if (trade.isEmpty() || offer.isEmpty()) {
            return;
        }
        String cardName = offers.cardName(offer.get());
        String summary = offers.summaryText(offer.get());
        @Nullable UUID actor = event.actorId();
        String actorName = offers.displayName(actor);
        boolean both = type == TradeEventType.MEETUP_AGREED || type == TradeEventType.COMPLETED;
        for (UUID recipient : List.of(event.sellerId(), event.buyerId())) {
            boolean isActor = recipient.equals(actor);
            if (isActor && !both) {
                continue;
            }
            UUID other = recipient.equals(event.sellerId()) ? event.buyerId() : event.sellerId();
            notify(
                    recipient,
                    event,
                    type,
                    title(type, cardName),
                    body(type, actorName, offers.displayName(other), cardName));
        }
        if (type == TradeEventType.COMPLETED || type == TradeEventType.CANCELLED) {
            UUID initiator = actor != null ? actor : event.buyerId();
            UUID other = initiator.equals(event.buyerId()) ? event.sellerId() : event.buyerId();
            String text =
                    type == TradeEventType.COMPLETED
                            ? "Trade completed: " + summary + ". You can now rate each other."
                            : actorName + " cancelled the trade: " + summary + ".";
            conversations.postSystemMessage(
                    new SystemNotice(
                            initiator,
                            other,
                            text,
                            new OfferLink(offer.get().id(), offer.get().status().name(), summary),
                            "trade:" + event.tradeId() + ":" + type.name()));
        }
    }

    private void notify(
            UUID recipient, TradeUpdated event, TradeEventType type, String title, String body) {
        Map<String, @Nullable Object> data = new LinkedHashMap<>();
        data.put("tradeId", event.tradeId().toString());
        data.put("offerId", event.offerId().toString());
        data.put("event", type.name());
        data.put("status", event.status());
        data.put("deepLink", "/trades/" + event.tradeId());
        notifications.notify(
                new NotificationRequest(
                        recipient,
                        NotificationType.TRADE_UPDATE,
                        title,
                        body,
                        data,
                        "trade:" + event.tradeId() + ":" + type.name() + ":" + recipient));
    }

    static String title(TradeEventType type, String cardName) {
        return switch (type) {
            case MEETUP_PROPOSED -> "Meetup proposed for " + cardName;
            case MEETUP_AGREED -> "Meetup agreed for " + cardName;
            case COMPLETION_CONFIRMED -> "Trade confirmed by the other party";
            case COMPLETED -> "Trade completed";
            case CANCELLED -> "Trade cancelled";
            case CREATED, PROTECTION_REMOVED -> "Trade update";
        };
    }

    static String body(TradeEventType type, String actorName, String otherName, String cardName) {
        return switch (type) {
            case MEETUP_PROPOSED ->
                    actorName
                            + " wants to exchange "
                            + cardName
                            + " in person. Mark the meetup on the trade page to agree.";
            case MEETUP_AGREED ->
                    "You both agreed to meet in person for "
                            + cardName
                            + ". Confirm the trade once the cards are exchanged.";
            case COMPLETION_CONFIRMED ->
                    actorName
                            + " confirmed the exchange of "
                            + cardName
                            + ". Confirm on your side to complete the trade.";
            case COMPLETED ->
                    "The trade for "
                            + cardName
                            + " is complete. You can now rate "
                            + otherName
                            + ".";
            case CANCELLED -> actorName + " cancelled the trade for " + cardName + ".";
            case CREATED, PROTECTION_REMOVED -> cardName;
        };
    }
}
