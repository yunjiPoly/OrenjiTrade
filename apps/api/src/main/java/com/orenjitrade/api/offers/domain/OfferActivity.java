package com.orenjitrade.api.offers.domain;

import com.orenjitrade.api.messaging.domain.ConversationService;
import com.orenjitrade.api.messaging.domain.OfferLink;
import com.orenjitrade.api.messaging.domain.SystemNotice;
import com.orenjitrade.api.notifications.domain.NotificationRequest;
import com.orenjitrade.api.notifications.domain.NotificationService;
import com.orenjitrade.api.notifications.domain.NotificationType;
import com.orenjitrade.api.offers.events.OfferCreated;
import com.orenjitrade.api.offers.events.OfferUpdated;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What an offer event causes after commit (Phase 8 contract): notifications (OFFER_RECEIVED,
 * OFFER_COUNTERED, OFFER_ACCEPTED to both parties, OFFER_DECLINED, OFFER_CANCELLED, OFFER_EXPIRED
 * to both parties) and a SYSTEM message with the offer link in the pair conversation (created when
 * absent). Notifications carry the offered card's name, game and picture ({@link OfferCard}).
 * Idempotent: notifications are de-duplicated per offer, event and recipient, SYSTEM messages per
 * offer and event, so a redelivered event changes nothing.
 */
@Service
public class OfferActivity {

    private final OfferService offers;
    private final NotificationService notifications;
    private final ConversationService conversations;

    public OfferActivity(
            OfferService offers,
            NotificationService notifications,
            ConversationService conversations) {
        this.offers = offers;
        this.notifications = notifications;
        this.conversations = conversations;
    }

    /** A new offer: OFFER_RECEIVED for the seller and the SYSTEM message. */
    @Transactional
    public void created(OfferCreated event) {
        Optional<OfferRow> found = offers.row(event.offerId());
        if (found.isEmpty()) {
            return;
        }
        OfferRow row = found.get();
        OfferCard card = offers.card(row);
        String summary = offers.summaryText(row, card);
        String buyerName = offers.displayName(row.buyerId());
        notify(
                row.sellerId(),
                NotificationType.OFFER_RECEIVED,
                OfferEventType.CREATED,
                row,
                card,
                buyerName,
                summary,
                false,
                null);
        post(row, card, row.buyerId(), OfferEventType.CREATED, buyerName, summary);
    }

    /** A later transition: the other party (both for acceptance and expiry) and the message. */
    @Transactional
    public void updated(OfferUpdated event) {
        Optional<OfferRow> found = offers.row(event.offerId());
        if (found.isEmpty()) {
            return;
        }
        OfferRow row = found.get();
        OfferEventType type;
        try {
            type = OfferEventType.valueOf(event.event());
        } catch (IllegalArgumentException e) {
            return;
        }
        OfferCard card = offers.card(row);
        String summary = offers.summaryText(row, card);
        @Nullable UUID actor = event.actorId();
        String actorName = offers.displayName(actor);
        @Nullable NotificationType notificationType =
                switch (type) {
                    case COUNTERED -> NotificationType.OFFER_COUNTERED;
                    case ACCEPTED -> NotificationType.OFFER_ACCEPTED;
                    case DECLINED -> NotificationType.OFFER_DECLINED;
                    case CANCELLED -> NotificationType.OFFER_CANCELLED;
                    case EXPIRED -> NotificationType.OFFER_EXPIRED;
                    case CREATED, VIEWED -> null;
                };
        if (notificationType == null) {
            return;
        }
        boolean both = type == OfferEventType.ACCEPTED || type == OfferEventType.EXPIRED;
        for (UUID recipient : List.of(row.sellerId(), row.buyerId())) {
            boolean isActor = recipient.equals(actor);
            if (isActor && !both) {
                continue;
            }
            notify(
                    recipient,
                    notificationType,
                    type,
                    row,
                    card,
                    actorName,
                    summary,
                    isActor,
                    event.tradeId());
        }
        post(row, card, actor != null ? actor : row.buyerId(), type, actorName, summary);
    }

    private void notify(
            UUID recipient,
            NotificationType notificationType,
            OfferEventType event,
            OfferRow row,
            OfferCard card,
            String actorName,
            String summary,
            boolean forActor,
            @Nullable UUID tradeId) {
        Map<String, @Nullable Object> data = new LinkedHashMap<>();
        data.put("offerId", row.id().toString());
        data.put("rootOfferId", row.rootOfferId().toString());
        data.put("status", row.status().name());
        if (row.itemId() != null) {
            data.put("itemId", row.itemId().toString());
        }
        if (tradeId != null) {
            data.put("tradeId", tradeId.toString());
        }
        card.putInto(data);
        data.put("deepLink", tradeId != null ? "/trades/" + tradeId : "/offers/" + row.id());
        notifications.notify(
                new NotificationRequest(
                        recipient,
                        notificationType,
                        OfferTexts.title(event, card.name(), forActor),
                        OfferTexts.body(event, actorName, summary, forActor),
                        data,
                        "offer:" + row.id() + ":" + event.name() + ":" + recipient));
    }

    private void post(
            OfferRow row,
            OfferCard card,
            UUID initiator,
            OfferEventType event,
            String actorName,
            String summary) {
        UUID other = initiator.equals(row.buyerId()) ? row.sellerId() : row.buyerId();
        conversations.postSystemMessage(
                new SystemNotice(
                        initiator,
                        other,
                        OfferTexts.systemMessage(event, actorName, summary),
                        new OfferLink(row.id(), row.status().name(), summary, card.imageUrl()),
                        "offer:" + row.id() + ":" + event.name()));
    }
}
