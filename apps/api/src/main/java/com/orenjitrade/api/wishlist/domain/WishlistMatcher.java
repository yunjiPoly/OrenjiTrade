package com.orenjitrade.api.wishlist.domain;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.location.domain.DistanceBucket;
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
import java.util.List;
import java.util.Map;
import java.util.Optional;
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
 *       wishlist.alerts.per_day} limit apply there);
 *   <li>{@link #matchWishlistItem}: a wishlist item was created or edited → its matches among the
 *       current public inventory, without notifications (the collector is looking at them).
 * </ul>
 */
@Service
public class WishlistMatcher {

    private final WishlistMatchRepository matches;
    private final WishlistRepository items;
    private final NotificationService notifications;
    private final ApplicationEventPublisher events;
    private final TimeProvider timeProvider;

    public WishlistMatcher(
            WishlistMatchRepository matches,
            WishlistRepository items,
            NotificationService notifications,
            ApplicationEventPublisher events,
            TimeProvider timeProvider) {
        this.matches = matches;
        this.items = items;
        this.notifications = notifications;
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
        for (Candidate candidate : candidates) {
            DistanceBucket bucket = DistanceBucket.ofKm(candidate.distanceMetres() / 1000.0);
            Optional<UUID> matchId = matches.insert(candidate, bucket, now);
            if (matchId.isEmpty()) {
                continue;
            }
            created++;
            items.touchMatched(candidate.wishlistItemId(), now);
            NotifyResult result = notifications.notify(request(candidate, matchId.get(), bucket));
            boolean delivered = result.delivered();
            if (delivered) {
                matches.markNotified(matchId.get());
                notified++;
            }
            events.publishEvent(matched(candidate, matchId.get(), bucket, delivered, now));
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
            DistanceBucket bucket = DistanceBucket.ofKm(candidate.distanceMetres() / 1000.0);
            Optional<UUID> matchId = matches.insert(candidate, bucket, now);
            if (matchId.isPresent()) {
                gained = true;
                events.publishEvent(matched(candidate, matchId.get(), bucket, false, now));
            }
        }
        if (gained) {
            items.touchMatched(wishlistItemId, now);
        }
        return matching;
    }

    /** The notification of a new match ("Azure-Eyes Sky Dragon AZR-EN001 was listed ~4 km..."). */
    static NotificationRequest request(Candidate candidate, UUID matchId, DistanceBucket bucket) {
        StringBuilder body = new StringBuilder(candidate.cardName());
        if (candidate.printingCode() != null) {
            body.append(' ').append(candidate.printingCode());
        }
        body.append(" was listed ").append(WishlistRules.distanceText(bucket));
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
        data.put("game", candidate.game());
        data.put("distanceBucket", bucket.name());
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
            Candidate candidate,
            UUID matchId,
            DistanceBucket bucket,
            boolean notified,
            Instant now) {
        return new WishlistMatched(
                matchId,
                candidate.wishlistItemId(),
                candidate.wisherId(),
                candidate.itemId(),
                candidate.itemOwnerId(),
                candidate.game(),
                bucket.name(),
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
