package com.orenjitrade.api.wishlist.domain;

import com.orenjitrade.api.cards.domain.CatalogService;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.notifications.domain.NotificationCards;
import com.orenjitrade.api.notifications.domain.NotificationRequest;
import com.orenjitrade.api.notifications.domain.NotificationService;
import com.orenjitrade.api.notifications.domain.NotificationType;
import com.orenjitrade.api.notifications.domain.NotifyResult;
import com.orenjitrade.api.wishlist.infra.WishlistAlertRepository;
import com.orenjitrade.api.wishlist.infra.WishlistAlertRepository.Candidate;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Wishlist alerts (stage S2, replacing the matches feature): when an inventory item becomes public
 * ({@code InventoryItemPublished}), every collector of the same platform region with a fitting wish
 * gets one {@link NotificationType#WISHLIST_ALERT} ("Azure-Eyes Sky Dragon AZR-EN001 Ultra Rare was
 * just listed by @handle in Quebec, Canada.") that opens the card page with the wish's selection.
 * Nothing is stored about the pairing except the sent-alert key ({@code wishlist_alert_sent}): one
 * item alerts one collector at most once, whichever of their wishes it fits and however often it is
 * republished. Collectors without a location get no alerts (the region rule needs one); the on/off
 * switch, quiet hours and the {@code wishlist.alerts.per_day} plan limit apply in {@link
 * NotificationService#notify}. The place is the item owner's state/province and country, never a
 * city or a distance (ADR 0017).
 */
@Service
public class WishlistAlerts {

    private final WishlistAlertRepository repository;
    private final NotificationService notifications;
    private final CatalogService catalog;
    private final TimeProvider timeProvider;

    public WishlistAlerts(
            WishlistAlertRepository repository,
            NotificationService notifications,
            CatalogService catalog,
            TimeProvider timeProvider) {
        this.repository = repository;
        this.notifications = notifications;
        this.catalog = catalog;
        this.timeProvider = timeProvider;
    }

    /** Alerts the collectors whose wishes one newly public item fits. */
    @Transactional
    public AlertRun alertForPublishedItem(UUID inventoryItemId) {
        Instant now = timeProvider.now();
        List<Candidate> candidates = repository.candidatesForItem(inventoryItemId, now);
        int sent = 0;
        int delivered = 0;
        @Nullable String imageUrl = null;
        boolean imageLoaded = false;
        for (Candidate candidate : candidates) {
            if (!repository.markSent(candidate.wisherId(), candidate.itemId(), now)) {
                continue;
            }
            sent++;
            if (!imageLoaded) {
                imageUrl =
                        catalog.frontImageUrls(Set.of(candidate.printingId()))
                                .get(candidate.printingId());
                imageLoaded = true;
            }
            NotifyResult result = notifications.notify(request(candidate, imageUrl));
            if (result.delivered()) {
                delivered++;
            }
        }
        return new AlertRun(candidates.size(), sent, delivered);
    }

    /**
     * "Azure-Eyes Sky Dragon AZR-EN001 Ultra Rare was just listed by @handle in Quebec, Canada."
     */
    static String body(Candidate candidate) {
        StringBuilder body = new StringBuilder(candidate.cardName());
        if (candidate.printingCode() != null && !candidate.printingCode().isBlank()) {
            body.append(' ').append(candidate.printingCode());
        }
        if (candidate.itemRarity() != null && !candidate.itemRarity().isBlank()) {
            body.append(' ').append(candidate.itemRarity());
        }
        return body.append(" was just listed by @")
                .append(candidate.itemOwnerHandle())
                .append(" in ")
                .append(candidate.itemOwnerPlace().label())
                .append('.')
                .toString();
    }

    /** The {@code ?printing=} value of an "any printing" wish: an explicit "no printing picked". */
    static final String ANY_PRINTING = "any";

    /**
     * The card page with the wish's selection, always said explicitly: {@code
     * /cards/<cardId>?printing=<id>} for a one-printing wish, {@code ?rarity=<rarity>} for a rarity
     * wish, {@code ?printing=any} for an "any printing" wish. The card page then shows that
     * selection and never a printing nobody chose (a bare {@code /cards/<cardId>} would leave the
     * choice to the page).
     */
    static String deepLink(Candidate candidate) {
        StringBuilder link = new StringBuilder("/cards/").append(candidate.wishCardId());
        if (candidate.wishPrintingId() != null) {
            link.append("?printing=").append(candidate.wishPrintingId());
        } else if (candidate.wishRarity() != null) {
            link.append("?rarity=")
                    .append(
                            URLEncoder.encode(candidate.wishRarity(), StandardCharsets.UTF_8)
                                    .replace("+", "%20"));
        } else {
            link.append("?printing=").append(ANY_PRINTING);
        }
        return link.toString();
    }

    static NotificationRequest request(Candidate candidate, @Nullable String imageUrl) {
        Map<String, @Nullable Object> data = new LinkedHashMap<>();
        data.put("wishlistItemId", candidate.wishlistItemId().toString());
        data.put("inventoryItemId", candidate.itemId().toString());
        data.put("cardId", candidate.wishCardId().toString());
        if (candidate.wishPrintingId() != null) {
            data.put("printingId", candidate.wishPrintingId().toString());
        }
        if (candidate.wishRarity() != null) {
            data.put("rarity", candidate.wishRarity());
        }
        data.put("collectorId", candidate.itemOwnerId().toString());
        NotificationCards.put(data, candidate.cardName(), candidate.game(), imageUrl);
        data.put("regionCode", candidate.itemOwnerPlace().regionCode());
        data.put("deepLink", deepLink(candidate));
        return new NotificationRequest(
                candidate.wisherId(),
                NotificationType.WISHLIST_ALERT,
                "Wishlist alert: " + candidate.cardName(),
                body(candidate),
                data,
                "wishlist-alert:" + candidate.wisherId() + ":" + candidate.itemId());
    }

    /**
     * Outcome of alerting about one published item.
     *
     * @param candidates collectors whose wishes the item fits
     * @param sent alerts newly decided (sent-alert keys created)
     * @param delivered alerts stored as notifications (not switched off, not over the daily limit)
     */
    public record AlertRun(int candidates, int sent, int delivered) {}
}
