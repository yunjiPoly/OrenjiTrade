package com.orenjitrade.api.search.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.cards.domain.PrintingSummary;
import com.orenjitrade.api.location.api.PlaceResponse;
import com.orenjitrade.api.search.domain.CollectorMarker;
import com.orenjitrade.api.search.domain.FeedFilter;
import com.orenjitrade.api.search.domain.FeedPostKind;
import com.orenjitrade.api.search.domain.FeedService.CardPreview;
import com.orenjitrade.api.search.domain.FeedService.DeckCore;
import com.orenjitrade.api.search.domain.FeedService.FeedPage;
import com.orenjitrade.api.search.domain.FeedService.FeedPost;
import com.orenjitrade.api.search.domain.FeedService.NewCards;
import com.orenjitrade.api.search.domain.FeedService.Wanted;
import com.orenjitrade.api.wishlist.api.WishlistResponses.PriceTermResponse;
import com.orenjitrade.api.wishlist.domain.PriceTerm;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Response DTOs of Home's feed ({@code GET /api/v1/feed}, stage R7). Places are a state or province
 * and a country, never a city or a coordinate (ADR 0017); pictures come through the public card
 * image path or the stored photo URLs, never a provider URL (ADR 0015); nothing is sponsored (ADR
 * 0019).
 */
public final class FeedResponses {

    private FeedResponses() {}

    /** One page of the feed. */
    @Schema(
            name = "FeedPage",
            description =
                    "What became public in the region for the game in the last `windowDays` days,"
                            + " newest first")
    public record FeedPageResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "americas-north") String region,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "yugioh") String game,
            @Schema(requiredMode = RequiredMode.REQUIRED) FeedFilter kind,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            example = "30",
                            description =
                                    "The window (a server setting): nothing older than this many"
                                            + " days is ever returned")
                    int windowDays,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<FeedPostResponse> items,
            @Schema(
                            nullable = true,
                            description =
                                    "Cursor of the next page; null after the last one (the end"
                                            + " of the window)")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String nextCursor,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean hasMore,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "The game has a post of any kind in the window (for the"
                                            + " caller), whatever `kind` is; always true after the"
                                            + " first page")
                    boolean gameHasPosts,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "The region has a post of any kind in the window in any game;"
                                            + " false: the whole region is quiet")
                    boolean regionHasPosts) {

        static FeedPageResponse from(FeedPage page) {
            return new FeedPageResponse(
                    page.region(),
                    page.game(),
                    page.kind(),
                    page.windowDays(),
                    page.posts().stream().map(FeedPostResponse::from).toList(),
                    page.nextCursor(),
                    page.nextCursor() != null,
                    page.gameHasPosts(),
                    page.regionHasPosts());
        }
    }

    /** A post. */
    @Schema(
            name = "FeedPost",
            description =
                    "A post of Home's feed: exactly one of newCards, wanted and deckCore is set,"
                            + " by kind")
    public record FeedPostResponse(
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Stable across pages and refreshes")
                    UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) FeedPostKind kind,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "When it became public (the newest card of a NEW_CARDS post)")
                    Instant at,
            @Schema(requiredMode = RequiredMode.REQUIRED) FeedCollectorResponse collector,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "The collector's state or province and country")
                    PlaceResponse place,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable FeedNewCardsResponse newCards,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable FeedWishResponse wanted,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable FeedDeckCoreResponse deckCore) {

        static FeedPostResponse from(FeedPost post) {
            CollectorMarker collector = post.collector();
            return new FeedPostResponse(
                    post.id(),
                    post.kind(),
                    post.at(),
                    new FeedCollectorResponse(
                            collector.id(),
                            collector.handle(),
                            collector.displayName(),
                            collector.avatarUrl()),
                    PlaceResponse.from(collector.place()),
                    post.newCards() == null ? null : FeedNewCardsResponse.from(post.newCards()),
                    post.wanted() == null ? null : FeedWishResponse.from(post.wanted()),
                    post.deckCore() == null ? null : FeedDeckCoreResponse.from(post.deckCore()));
        }
    }

    /** The collector of a post (the header opens their profile). */
    @Schema(name = "FeedCollector", description = "The collector of a post")
    public record FeedCollectorResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "maika") String handle,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "Maïka Tremblay")
                    String displayName,
            @Schema(nullable = true, format = "uri") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String avatarUrl) {}

    /** One collector's cards that became public within the same hour. */
    @Schema(name = "FeedNewCards", description = "One collector's new cards of one hour")
    public record FeedNewCardsResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "12") long total,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "The newest 4 at most, newest first")
                    List<FeedCardPreviewResponse> previews) {

        static FeedNewCardsResponse from(NewCards cards) {
            return new FeedNewCardsResponse(
                    cards.total(),
                    cards.previews().stream().map(FeedCardPreviewResponse::from).toList());
        }
    }

    /** A card of a new-cards post. */
    @Schema(name = "FeedCardPreview", description = "A public card of a new-cards post")
    public record FeedCardPreviewResponse(
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "The inventory item (\"Message\" pins it in the chat)")
                    UUID itemId,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID cardId,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID printingId,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "Azure-Eyes Sky Dragon")
                    String name,
            @Schema(nullable = true, example = "AZR-EN001") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String printingCode,
            @Schema(nullable = true, example = "Ultra Rare")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String rarity,
            @Schema(nullable = true, format = "uri") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String imageUrl,
            @Schema(
                            nullable = true,
                            example = "85% TCG",
                            description = "The asking price as typed; null when none")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String askingPriceText,
            @Schema(
                            nullable = true,
                            example = "45.00",
                            description =
                                    "The amount of a price set without a text (before stage R2,"
                                            + " or on the web)")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable BigDecimal askingPrice,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "CAD") String currency) {

        static FeedCardPreviewResponse from(CardPreview card) {
            return new FeedCardPreviewResponse(
                    card.itemId(),
                    card.cardId(),
                    card.printingId(),
                    card.name(),
                    card.printingCode(),
                    card.rarity(),
                    card.imageUrl(),
                    card.askingPriceText(),
                    card.askingPrice(),
                    card.currency());
        }
    }

    /** A public wish, with what the Wishlist segment writes its terms from. */
    @Schema(name = "FeedWish", description = "A public wish")
    public record FeedWishResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID wishId,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID cardId,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "Ash Blossom & Joyous Spring")
                    String name,
            @Schema(nullable = true, format = "uri") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String imageUrl,
            @Schema(nullable = true, description = "The wished printing; null = any printing")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable PrintingSummary printing,
            @Schema(nullable = true, description = "Any printing of this rarity; null = any")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String rarity,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean nearMintOnly,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable PriceTermResponse priceTerm) {

        static FeedWishResponse from(Wanted wish) {
            return new FeedWishResponse(
                    wish.wishId(),
                    wish.cardId(),
                    wish.name(),
                    wish.imageUrl(),
                    wish.printing(),
                    wish.rarity(),
                    wish.nearMintOnly(),
                    PriceTerm.parse(wish.priceTerm())
                            .map(
                                    term ->
                                            new PriceTermResponse(
                                                    term.label(), term.percent(), term.orMore()))
                            .orElse(null));
        }
    }

    /** A public deck core. */
    @Schema(name = "FeedDeckCore", description = "A public, unsold deck core")
    public record FeedDeckCoreResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID binderId,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "Yubel core") String name,
            @Schema(nullable = true, example = "Trade only")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String askingPriceText,
            @Schema(nullable = true, format = "uri", description = "The first photo")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String photoUrl,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "4") int photoCount,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "Up to 3 key card pictures, for a deck core without photos"
                                            + " (empty otherwise)")
                    List<String> previewImages,
            @Schema(
                            nullable = true,
                            description =
                                    "The first line of the public note, at most 120 characters"
                                            + " (ending with … when cut)")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String noteFirstLine) {

        static FeedDeckCoreResponse from(DeckCore core) {
            return new FeedDeckCoreResponse(
                    core.binderId(),
                    core.name(),
                    core.askingPriceText(),
                    core.photoUrl(),
                    core.photoCount(),
                    core.previewImages(),
                    core.noteFirstLine());
        }
    }
}
