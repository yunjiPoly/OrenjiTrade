package com.orenjitrade.api.search.domain;

import com.orenjitrade.api.binders.domain.BinderShowcase;
import com.orenjitrade.api.binders.domain.BinderView;
import com.orenjitrade.api.binders.domain.PublicBinderService;
import com.orenjitrade.api.binders.domain.PublicBinderService.PublicBinderHit;
import com.orenjitrade.api.cards.domain.PrintingImage;
import com.orenjitrade.api.cards.domain.PrintingSummary;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.inventory.domain.InventoryItemView;
import com.orenjitrade.api.inventory.domain.PublicInventoryService;
import com.orenjitrade.api.location.domain.RegionView;
import com.orenjitrade.api.profiles.domain.RatingSummary;
import com.orenjitrade.api.profiles.domain.ViewerContext;
import com.orenjitrade.api.search.infra.CollectorSearchRepository;
import com.orenjitrade.api.search.infra.FeedRepository;
import com.orenjitrade.api.search.infra.FeedRepository.CardGroup;
import com.orenjitrade.api.search.infra.FeedRepository.GroupKey;
import com.orenjitrade.api.search.infra.FeedRepository.PostRef;
import com.orenjitrade.api.search.infra.FeedRepository.Scope;
import com.orenjitrade.api.wishlist.domain.WishlistItemView;
import com.orenjitrade.api.wishlist.domain.WishlistService;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Home's feed ({@code GET /api/v1/feed}; stage R7 of the phone redesign, owner prompt of
 * 2026-10-19, section 5): what became public in the browsed region for the browsed game in the last
 * {@link FeedProperties#windowDays} days, newest first with a keyset cursor: new cards grouped per
 * collector and hour, public wishes, public deck cores. The SQL ({@link FeedRepository}) decides
 * what may appear; this service only adds what each post shows, through the other modules' public
 * services (pictures through the public card image path, photos through their stored URLs, places
 * as state/province and country). Nothing sponsored (ADR 0019); no city, no coordinate (ADR 0017).
 */
@Service
public class FeedService {

    private final CollectorDiscoveryService discovery;
    private final FeedRepository feed;
    private final CollectorSearchRepository collectors;
    private final MarkerAssembler assembler;
    private final PublicInventoryService publicInventoryService;
    private final WishlistService wishlistService;
    private final PublicBinderService publicBinderService;
    private final TimeProvider timeProvider;
    private final FeedProperties properties;

    public FeedService(
            CollectorDiscoveryService discovery,
            FeedRepository feed,
            CollectorSearchRepository collectors,
            MarkerAssembler assembler,
            PublicInventoryService publicInventoryService,
            WishlistService wishlistService,
            PublicBinderService publicBinderService,
            TimeProvider timeProvider,
            FeedProperties properties) {
        this.discovery = discovery;
        this.feed = feed;
        this.collectors = collectors;
        this.assembler = assembler;
        this.publicInventoryService = publicInventoryService;
        this.wishlistService = wishlistService;
        this.publicBinderService = publicBinderService;
        this.timeProvider = timeProvider;
        this.properties = properties;
    }

    /**
     * What {@code GET /feed} asks for.
     *
     * @param region platform region code; {@code null} for the caller's home region
     * @param game the browsed game's slug (required)
     * @param kind {@code ALL}, {@code NEW_CARDS}, {@code WANTED} or {@code DECK_CORES}
     * @param cursor the {@code nextCursor} of the previous page
     * @param limit posts per page ({@link FeedRules#limit})
     */
    public record FeedQuery(
            @Nullable String region,
            @Nullable String game,
            @Nullable String kind,
            @Nullable String cursor,
            @Nullable Integer limit) {}

    /** One page of the feed. */
    @Transactional(readOnly = true)
    public FeedPage page(@Nullable UUID viewerId, FeedQuery query) {
        List<ProblemFieldError> errors = new ArrayList<>();
        @Nullable String game = discovery.normaliseGame(query.game(), errors);
        if (game == null && errors.isEmpty()) {
            errors.add(new ProblemFieldError("game", "is required"));
        }
        @Nullable FeedFilter filter = FeedFilter.parse(query.kind()).orElse(null);
        if (filter == null) {
            errors.add(
                    new ProblemFieldError("kind", "must be ALL, NEW_CARDS, WANTED or DECK_CORES"));
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        @Nullable FeedCursor after = FeedCursor.decode(query.cursor());
        RegionView region = discovery.scope(viewerId, query.region());
        int limit = FeedRules.limit(query.limit());
        Instant now = timeProvider.now();
        int days = properties.windowDays();
        Scope scope =
                new Scope(
                        region.code(),
                        Objects.requireNonNull(game),
                        viewerId,
                        FeedRules.windowStart(now, days),
                        now,
                        after == null ? null : after.asOf());
        FeedFilter kinds = Objects.requireNonNull(filter);

        List<PostRef> refs = feed.page(scope, kinds.kinds(), after, limit + 1);
        boolean hasMore = refs.size() > limit;
        List<PostRef> page = hasMore ? refs.subList(0, limit) : refs;
        @Nullable String nextCursor = null;
        if (hasMore) {
            PostRef last = page.get(page.size() - 1);
            // Every later page counts the cards of the first page's time (R7 review F2).
            Instant asOf = after != null ? after.asOf() : FeedRules.asOf(now, page.get(0).at());
            nextCursor = new FeedCursor(last.at(), last.id(), asOf).encode();
        }

        // Whether the game, and the region, have anything at all in the window (the empty state
        // says which is quiet); known without a query whenever this page holds a post.
        boolean gameHasPosts;
        boolean regionHasPosts;
        if (after != null || (!page.isEmpty() && kinds == FeedFilter.ALL)) {
            gameHasPosts = true;
            regionHasPosts = true;
        } else {
            gameHasPosts = !page.isEmpty() || feed.any(scope, false);
            regionHasPosts = gameHasPosts || feed.any(scope, true);
        }

        return new FeedPage(
                region.code(),
                game,
                kinds,
                days,
                posts(viewerId, scope, page),
                nextCursor,
                gameHasPosts,
                regionHasPosts);
    }

    private List<FeedPost> posts(@Nullable UUID viewerId, Scope scope, List<PostRef> page) {
        if (page.isEmpty()) {
            return List.of();
        }
        List<GroupKey> groups = new ArrayList<>();
        List<UUID> wishIds = new ArrayList<>();
        List<UUID> binderIds = new ArrayList<>();
        Set<UUID> ownerIds = new LinkedHashSet<>();
        for (PostRef ref : page) {
            ownerIds.add(ref.ownerId());
            switch (ref.kind()) {
                case NEW_CARDS -> groups.add(new GroupKey(ref.ownerId(), hourOf(ref)));
                case WANTED -> wishIds.add(ref.id());
                case DECK_CORE -> binderIds.add(ref.id());
            }
        }

        Map<GroupKey, CardGroup> cardGroups =
                feed.cardGroups(scope, groups, FeedRules.PREVIEWS_MAX);
        List<UUID> itemIds = new ArrayList<>();
        cardGroups.values().forEach(group -> itemIds.addAll(group.itemIds()));
        Map<UUID, InventoryItemView> items = new HashMap<>();
        for (InventoryItemView item : publicInventoryService.publicItems(itemIds)) {
            items.put(item.row().id(), item);
        }
        Map<UUID, WishlistItemView> wishes = new HashMap<>();
        for (WishlistItemView wish : wishlistService.viewsOf(wishIds)) {
            wishes.put(wish.row().id(), wish);
        }
        Map<UUID, PublicBinderHit> cores = new HashMap<>();
        for (PublicBinderHit hit : publicBinderService.publicBinders(viewerId, binderIds)) {
            cores.put(hit.summary().binder().id(), hit);
        }
        Map<UUID, CollectorMarker> owners = new HashMap<>();
        ViewerContext viewer = new ViewerContext(viewerId, false, false);
        for (MarkerRow row : collectors.markersByIds(ownerIds, scope.now())) {
            owners.put(row.id(), assembler.marker(row, viewer, scope.now(), RatingSummary.NONE));
        }

        List<FeedPost> posts = new ArrayList<>();
        for (PostRef ref : page) {
            @Nullable CollectorMarker owner = owners.get(ref.ownerId());
            if (owner == null) {
                // No longer discoverable since the page's query: the post goes.
                continue;
            }
            @Nullable FeedPost post =
                    switch (ref.kind()) {
                        case NEW_CARDS -> newCards(ref, owner, cardGroups.get(groupOf(ref)), items);
                        case WANTED -> wanted(ref, owner, wishes.get(ref.id()));
                        case DECK_CORE -> deckCore(ref, owner, cores.get(ref.id()));
                    };
            if (post != null) {
                posts.add(post);
            }
        }
        return posts;
    }

    private static long hourOf(PostRef ref) {
        return ref.hour() != null ? ref.hour() : FeedRules.hourOf(ref.at());
    }

    private static GroupKey groupOf(PostRef ref) {
        return new GroupKey(ref.ownerId(), hourOf(ref));
    }

    private static @Nullable FeedPost newCards(
            PostRef ref,
            CollectorMarker owner,
            @Nullable CardGroup group,
            Map<UUID, InventoryItemView> items) {
        if (group == null) {
            return null;
        }
        List<CardPreview> previews = new ArrayList<>();
        for (UUID itemId : group.itemIds()) {
            @Nullable InventoryItemView item = items.get(itemId);
            if (item != null) {
                previews.add(preview(item));
            }
        }
        if (previews.isEmpty()) {
            return null;
        }
        long total = Math.max(group.total(), previews.size());
        return new FeedPost(
                ref.id(),
                FeedPostKind.NEW_CARDS,
                ref.at(),
                owner,
                new NewCards(total, previews),
                null,
                null);
    }

    private static CardPreview preview(InventoryItemView item) {
        PrintingSummary printing = item.printing();
        return new CardPreview(
                item.row().id(),
                item.row().cardId(),
                printing.id(),
                item.row().cardName(),
                printing.printingCode(),
                printing.rarity(),
                frontImage(printing),
                item.row().askingPriceText(),
                item.row().askingPrice(),
                item.row().currency());
    }

    private static @Nullable String frontImage(@Nullable PrintingSummary printing) {
        if (printing == null || printing.images().isEmpty()) {
            return null;
        }
        for (PrintingImage image : printing.images()) {
            if ("FRONT".equals(image.kind())) {
                return image.url();
            }
        }
        return printing.images().get(0).url();
    }

    private static @Nullable FeedPost wanted(
            PostRef ref, CollectorMarker owner, @Nullable WishlistItemView wish) {
        if (wish == null || wish.card() == null) {
            return null;
        }
        @Nullable String image = frontImage(wish.printing());
        return new FeedPost(
                ref.id(),
                FeedPostKind.WANTED,
                ref.at(),
                owner,
                null,
                new Wanted(
                        wish.row().id(),
                        wish.card().id(),
                        wish.card().name(),
                        image != null ? image : wish.card().imageUrl(),
                        wish.printing(),
                        wish.row().rarity(),
                        wish.row().nearMintOnly(),
                        wish.row().priceTerm()),
                null);
    }

    private static @Nullable FeedPost deckCore(
            PostRef ref, CollectorMarker owner, @Nullable PublicBinderHit hit) {
        if (hit == null || !hit.summary().binder().sellsAsCore()) {
            return null;
        }
        BinderView binder = hit.summary().binder();
        BinderShowcase showcase = hit.summary().showcase();
        boolean photos = !showcase.photos().isEmpty();
        return new FeedPost(
                ref.id(),
                FeedPostKind.DECK_CORE,
                ref.at(),
                owner,
                null,
                null,
                new DeckCore(
                        binder.id(),
                        binder.name(),
                        binder.askingPriceText(),
                        photos ? showcase.photos().get(0).url() : null,
                        showcase.photos().size(),
                        photos ? List.of() : showcase.previewImages(),
                        FeedRules.noteFirstLine(binder.description())));
    }

    /**
     * One page of the feed.
     *
     * @param region the platform region read
     * @param game the game read
     * @param kind the filter
     * @param windowDays the window, in days
     * @param posts the posts, newest first
     * @param nextCursor the cursor of the next page, {@code null} after the last one
     * @param gameHasPosts the game has a post of any kind in the window (the first page says it;
     *     later pages always {@code true})
     * @param regionHasPosts the region has a post of any kind and game in the window
     */
    public record FeedPage(
            String region,
            String game,
            FeedFilter kind,
            int windowDays,
            List<FeedPost> posts,
            @Nullable String nextCursor,
            boolean gameHasPosts,
            boolean regionHasPosts) {}

    /**
     * A post: exactly one of {@code newCards}, {@code wanted}, {@code deckCore} is set, by kind.
     *
     * @param id stable across pages
     * @param kind kind
     * @param at when it became public
     * @param collector who
     * @param newCards a {@code NEW_CARDS} post's cards
     * @param wanted a {@code WANTED} post's wish
     * @param deckCore a {@code DECK_CORE} post's deck core
     */
    public record FeedPost(
            UUID id,
            FeedPostKind kind,
            Instant at,
            CollectorMarker collector,
            @Nullable NewCards newCards,
            @Nullable Wanted wanted,
            @Nullable DeckCore deckCore) {}

    /**
     * One collector's cards of one hour.
     *
     * @param total how many
     * @param previews the newest {@value FeedRules#PREVIEWS_MAX} at most, newest first
     */
    public record NewCards(long total, List<CardPreview> previews) {}

    /**
     * A card of a new-cards post.
     *
     * @param itemId the inventory item (pinned in the chat by "Message")
     * @param cardId card
     * @param printingId printing
     * @param name card name
     * @param printingCode the printing's code
     * @param rarity the printing's rarity
     * @param imageUrl the card's picture (the public card image path, or the catalogue's)
     * @param askingPriceText the price as typed
     * @param askingPrice the amount of a price set before stage R2 (or on the web)
     * @param currency its currency
     */
    public record CardPreview(
            UUID itemId,
            UUID cardId,
            UUID printingId,
            String name,
            @Nullable String printingCode,
            @Nullable String rarity,
            @Nullable String imageUrl,
            @Nullable String askingPriceText,
            @Nullable BigDecimal askingPrice,
            String currency) {}

    /**
     * A public wish.
     *
     * @param wishId wish
     * @param cardId card
     * @param name card name
     * @param imageUrl the wished printing's picture, else the card's
     * @param printing the wished printing, {@code null} for any printing
     * @param rarity any printing of this rarity
     * @param nearMintOnly Near Mint only
     * @param priceTerm the price term's label
     */
    public record Wanted(
            UUID wishId,
            UUID cardId,
            String name,
            @Nullable String imageUrl,
            @Nullable PrintingSummary printing,
            @Nullable String rarity,
            boolean nearMintOnly,
            @Nullable String priceTerm) {}

    /**
     * A public deck core.
     *
     * @param binderId binder
     * @param name name
     * @param askingPriceText price as typed ("$95", "Trade only")
     * @param photoUrl the first photo
     * @param photoCount photos
     * @param previewImages up to 3 key card pictures, for a deck core without photos
     * @param noteFirstLine the first line of the public note
     */
    public record DeckCore(
            UUID binderId,
            String name,
            @Nullable String askingPriceText,
            @Nullable String photoUrl,
            int photoCount,
            List<String> previewImages,
            @Nullable String noteFirstLine) {}
}
