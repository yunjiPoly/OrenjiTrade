package com.orenjitrade.api.wishlist.domain;

import com.orenjitrade.api.cards.domain.CatalogService;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.notifications.domain.NotificationCards;
import com.orenjitrade.api.notifications.domain.NotificationRequest;
import com.orenjitrade.api.notifications.domain.NotificationService;
import com.orenjitrade.api.notifications.domain.NotificationType;
import com.orenjitrade.api.notifications.domain.NotifyResult;
import com.orenjitrade.api.wishlist.events.WishlistMatched;
import com.orenjitrade.api.wishlist.infra.WishlistMatchRepository;
import com.orenjitrade.api.wishlist.infra.WishlistMatchRepository.Candidate;
import com.orenjitrade.api.wishlist.infra.WishlistRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Deterministic wishlist matching (Phase 6 contract "Matching pipeline"; never binder-to-binder,
 * never ML):
 *
 * <ul>
 *   <li>{@link #matchPublishedItem}: an inventory item became public ({@code
 *       InventoryItemPublished}) → the contract SQL finds the wishlist items it satisfies → one
 *       {@code wishlist_match} per pair (inserted with {@code ON CONFLICT DO NOTHING}, so a
 *       re-publication or a redelivered event never matches or notifies twice) → {@link
 *       NotificationService#notify} with the dedup key {@code
 *       wishlist:<wishlistItemId>:<inventoryItemId>} (preferences, quiet hours and the {@code
 *       wishlist.alerts.per_day} limit apply there); the notification carries the card's name and
 *       picture (the printing's image URL from the cards module, ADR 0015);
 *   <li>{@link #matchWishlistItem}: a wishlist item was created or edited → its matches among the
 *       current public inventory, without notifications (the collector is looking at them).
 * </ul>
 */
@Service
public class WishlistMatcher {

    private final WishlistMatchRepository matches;
    private final WishlistRepository items;
    private final NotificationService notifications;
    private final CatalogService catalog;
    private final ApplicationEventPublisher events;
    private final TimeProvider timeProvider;

    public WishlistMatcher(
            WishlistMatchRepository matches,
            WishlistRepository items,
            NotificationService notifications,
            CatalogService catalog,
            ApplicationEventPublisher events,
            TimeProvider timeProvider) {
        this.matches = matches;
        this.items = items;
        this.notifications = notifications;
        this.catalog = catalog;
        this.events = events;
        this.timeProvider = timeProvider;
    }

    /** Matches one newly public inventory item and notifies the new matches. */
    @Transactional
    public MatchRun matchPublishedItem(UUID inventoryItemId) {
        Instant now = timeProvider.now();
        List<Candidate> candidates = matches.candidatesForItem(inventoryItemId, now);
        int created = 0;
        int notified = 0;
        @Nullable Map<UUID, String> pictures = null;
        for (Candidate candidate : candidates) {
            Optional<UUID> matchId = matches.insert(candidate, now);
            if (matchId.isEmpty()) {
                continue;
            }
            created++;
            items.touchMatched(candidate.wishlistItemId(), now);
            if (pictures == null) {
                pictures = pictures(candidates);
            }
            NotifyResult result =
                    notifications.notify(
                            request(
                                    candidate,
                                    matchId.get(),
                                    pictures.get(candidate.printingId())));
            boolean delivered = result.delivered();
            if (delivered) {
                matches.markNotified(matchId.get());
                notified++;
            }
            events.publishEvent(matched(candidate, matchId.get(), delivered, now));
        }
        return new MatchRun(candidates.size(), created, notified);
    }

    /**
     * Matches one wishlist item against the current public inventory (no notifications); returns
     * the ids of the matching inventory items.
     */
    @Transactional
    public List<UUID> matchWishlistItem(UUID wishlistItemId) {
        Instant now = timeProvider.now();
        List<UUID> matching = new ArrayList<>();
        boolean gained = false;
        for (Candidate candidate : matches.candidatesForWishlistItem(wishlistItemId, now)) {
            matching.add(candidate.itemId());
            Optional<UUID> matchId = matches.insert(candidate, now);
            if (matchId.isPresent()) {
                gained = true;
                events.publishEvent(matched(candidate, matchId.get(), false, now));
            }
        }
        if (gained) {
            items.touchMatched(wishlistItemId, now);
        }
        return matching;
    }

    /** Picture URLs of the candidates' printings (one lookup per published item). */
    private Map<UUID, String> pictures(List<Candidate> candidates) {
        Set<UUID> printingIds = new LinkedHashSet<>();
        candidates.forEach(candidate -> printingIds.add(candidate.printingId()));
        return catalog.frontImageUrls(printingIds);
    }

    /**
     * The notification of a new match ("Azure-Eyes Sky Dragon AZR-EN001 was listed by @handle in
     * Quebec, Canada."), with the card's name, game and picture ({@code imageUrl} from the cards
     * module, {@code null} when the printing has none) in its data. The place is the item owner's
     * state/province and country, never a city or a distance (ADR 0017).
     */
    static NotificationRequest request(
            Candidate candidate, UUID matchId, @Nullable String imageUrl) {
        StringBuilder body = new StringBuilder(candidate.cardName());
        if (candidate.printingCode() != null) {
            body.append(' ').append(candidate.printingCode());
        }
        body.append(" was listed by @")
                .append(candidate.itemOwnerHandle())
                .append(" in ")
                .append(candidate.itemOwnerPlace().label());
        if (candidate.askingPrice() != null) {
            body.append(" for ")
                    .append(candidate.askingPrice().toPlainString())
                    .append(' ')
                    .append(candidate.currency());
        }
        body.append('.');
        Map<String, @Nullable Object> data = new LinkedHashMap<>();
        data.put("wishlistItemId", candidate.wishlistItemId().toString());
        data.put("matchId", matchId.toString());
        data.put("inventoryItemId", candidate.itemId().toString());
        data.put("collectorId", candidate.itemOwnerId().toString());
        NotificationCards.put(data, candidate.cardName(), candidate.game(), imageUrl);
        data.put("regionCode", candidate.itemOwnerPlace().regionCode());
        data.put("deepLink", "/wishlist/" + candidate.wishlistItemId());
        return new NotificationRequest(
                candidate.wisherId(),
                NotificationType.WISHLIST_MATCH,
                "Wishlist match: " + candidate.cardName(),
                body.toString(),
                data,
                "wishlist:" + candidate.wishlistItemId() + ":" + candidate.itemId());
    }

    private static WishlistMatched matched(
            Candidate candidate, UUID matchId, boolean notified, Instant now) {
        return new WishlistMatched(
                matchId,
                candidate.wishlistItemId(),
                candidate.wisherId(),
                candidate.itemId(),
                candidate.itemOwnerId(),
                candidate.game(),
                candidate.itemOwnerPlace().regionCode(),
                notified,
                now);
    }

    /**
     * Outcome of matching one published item.
     *
     * @param candidates wishlist items the item satisfies
     * @param created new matches
     * @param notified new matches with a notification
     */
    public record MatchRun(int candidates, int created, int notified) {}
}
