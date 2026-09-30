package com.orenjitrade.api.search.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.orenjitrade.api.binders.api.PublicBinderResponses.PublicBinderSummaryResponse;
import com.orenjitrade.api.cards.domain.CardSummary;
import com.orenjitrade.api.cards.domain.CatalogResolution;
import com.orenjitrade.api.cards.domain.PrintingSummary;
import com.orenjitrade.api.cards.domain.SetSummary;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.inventory.api.InventoryResponses.PublicInventoryItemResponse;
import com.orenjitrade.api.inventory.domain.Availability;
import com.orenjitrade.api.location.domain.DistanceBucket;
import com.orenjitrade.api.location.domain.PublicPoint;
import com.orenjitrade.api.location.domain.SearchCentre;
import com.orenjitrade.api.profiles.api.CollectorProfileResponse.CollectorRating;
import com.orenjitrade.api.profiles.domain.CollectorProfileView.LastActiveBucket;
import com.orenjitrade.api.profiles.domain.CollectorProfileView.OnlineStatus;
import com.orenjitrade.api.profiles.domain.RatingSummary;
import com.orenjitrade.api.search.domain.CollectorMarker;
import com.orenjitrade.api.search.domain.DiscoveryResults.CardHolder;
import com.orenjitrade.api.search.domain.DiscoveryResults.CollectorPreview;
import com.orenjitrade.api.search.domain.DiscoveryResults.NearbyResult;
import com.orenjitrade.api.search.domain.DiscoveryResults.Suggestion;
import com.orenjitrade.api.search.domain.DiscoveryResults.UnifiedSearch;
import com.orenjitrade.api.search.domain.MatchingItem;
import com.orenjitrade.api.search.domain.SuggestionType;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Response DTOs of map discovery and search (Phase 4 contract). Geography is only ever the derived
 * public point (3 decimals), the snapped search centre (2 decimals), a region label and a distance
 * bucket (ADR 0004); never a trading-area centre, never raw distances.
 */
public final class SearchResponses {

    private SearchResponses() {}

    /** The centre a search looked around. */
    @Schema(
            name = "SearchCentre",
            description =
                    "Centre of a geographic search, snapped to 0.01° (about 1 km): the given"
                            + " lat/lng or the caller's own trading area")
    public record SearchCentreResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "45.52") double lat,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "-73.58") double lng) {

        static SearchCentreResponse from(SearchCentre centre) {
            return new SearchCentreResponse(centre.lat(), centre.lng());
        }
    }

    /** {@code GET /collectors/nearby}. */
    @Schema(
            name = "NearbyCollectorsResponse",
            description = "Collectors on the map around a centre")
    public record NearbyCollectorsResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) SearchCentreResponse center,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            example = "10",
                            description = "Radius used (plan-capped, 0.1 km steps)")
                    double radiusKm,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<CollectorMarkerResponse> collectors,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Matching collectors")
                    long total,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Whether more collectors match than returned (`limit`)")
                    boolean truncated) {

        static NearbyCollectorsResponse from(NearbyResult result) {
            return new NearbyCollectorsResponse(
                    SearchCentreResponse.from(result.centre()),
                    result.radiusKm(),
                    result.collectors().stream().map(CollectorMarkerResponse::from).toList(),
                    result.total(),
                    result.truncated());
        }
    }

    /** A collector on the map. */
    @Schema(
            name = "CollectorMarker",
            description =
                    "A collector on the map at the derived public point (never the real location)")
    public record CollectorMarkerResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "maika") String handle,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "Maïka Tremblay")
                    String displayName,
            @Schema(nullable = true, format = "uri") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String avatarUrl,
            @Schema(requiredMode = RequiredMode.REQUIRED) PublicPoint publicPoint,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "Plateau-Mont-Royal, Montréal")
                    String publicLabel,
            @Schema(
                            nullable = true,
                            description =
                                    "Distance class from the search centre; null for signed-out"
                                            + " callers and collectors who hide distances")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable DistanceBucket distanceBucket,
            @Schema(requiredMode = RequiredMode.REQUIRED) CollectorRating rating,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "[\"trader\"]")
                    List<String> tags,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "[\"yugioh\",\"pokemon\"]")
                    List<String> games,
            @Schema(requiredMode = RequiredMode.REQUIRED) LastActiveBucket lastActiveBucket,
            @Schema(requiredMode = RequiredMode.REQUIRED) OnlineStatus onlineStatus,
            @Schema(
                            nullable = true,
                            description =
                                    "Best freshness of the public listings (ACTIVE or AGING on the"
                                            + " map); null without public listings")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable FreshnessState binderFreshness,
            @Schema(requiredMode = RequiredMode.REQUIRED) int publicBinderCount,
            @Schema(requiredMode = RequiredMode.REQUIRED) long publicItemCount,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "Public items matching hasPrintingId / hasCardId /"
                                            + " availability (empty without those filters)")
                    List<MatchingItemResponse> matchingItems) {

        /** Response form of a marker (also used by the wishlist matches, Phase 6). */
        public static CollectorMarkerResponse from(CollectorMarker marker) {
            return new CollectorMarkerResponse(
                    marker.id(),
                    marker.handle(),
                    marker.displayName(),
                    marker.avatarUrl(),
                    marker.publicPoint(),
                    marker.publicLabel(),
                    marker.distanceBucket(),
                    ratingOf(marker.rating()),
                    marker.tags(),
                    marker.games(),
                    marker.lastActiveBucket(),
                    marker.onlineStatus(),
                    marker.binderFreshness(),
                    marker.publicBinderCount(),
                    marker.publicItemCount(),
                    marker.matchingItems().stream().map(MatchingItemResponse::from).toList());
        }
    }

    /** A public item listed on a marker. */
    @Schema(name = "MatchingItem", description = "Public item matching the request's filters")
    public record MatchingItemResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID itemId,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID printingId,
            @Schema(nullable = true, example = "AZR-EN001") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String printingCode,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID cardId,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "Azure-Eyes Sky Dragon")
                    String cardName,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "yugioh") String game,
            @Schema(requiredMode = RequiredMode.REQUIRED) Availability availability,
            @Schema(nullable = true, example = "45.00") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable BigDecimal askingPrice,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "CAD") String currency,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "NEAR_MINT") String condition,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "en") String language,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "FIRST_EDITION") String edition,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean acceptsOffers,
            @Schema(requiredMode = RequiredMode.REQUIRED) FreshnessState freshness) {

        static MatchingItemResponse from(MatchingItem item) {
            return new MatchingItemResponse(
                    item.itemId(),
                    item.printingId(),
                    item.printingCode(),
                    item.cardId(),
                    item.cardName(),
                    item.game(),
                    item.availability(),
                    item.askingPrice(),
                    item.currency(),
                    item.condition(),
                    item.language(),
                    item.edition(),
                    item.acceptsOffers(),
                    item.freshness());
        }
    }

    /** {@code GET /collectors/{handle}/preview}: the marker plus messaging state. */
    @Schema(name = "CollectorPreview", description = "Map preview card of a collector")
    public record CollectorPreviewResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "maika") String handle,
            @Schema(requiredMode = RequiredMode.REQUIRED) String displayName,
            @Schema(nullable = true, format = "uri") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String avatarUrl,
            @Schema(requiredMode = RequiredMode.REQUIRED) PublicPoint publicPoint,
            @Schema(requiredMode = RequiredMode.REQUIRED) String publicLabel,
            @Schema(
                            nullable = true,
                            description =
                                    "Distance class from the given centre or the caller's trading"
                                            + " area; null for signed-out callers")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable DistanceBucket distanceBucket,
            @Schema(requiredMode = RequiredMode.REQUIRED) CollectorRating rating,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<String> tags,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<String> games,
            @Schema(requiredMode = RequiredMode.REQUIRED) LastActiveBucket lastActiveBucket,
            @Schema(requiredMode = RequiredMode.REQUIRED) OnlineStatus onlineStatus,
            @Schema(nullable = true, description = "Null without public listings")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable FreshnessState binderFreshness,
            @Schema(requiredMode = RequiredMode.REQUIRED) int publicBinderCount,
            @Schema(requiredMode = RequiredMode.REQUIRED) long publicItemCount,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Whether the caller may start a conversation")
                    boolean canMessage,
            @Schema(requiredMode = RequiredMode.REQUIRED) @JsonProperty("isBlocked")
                    boolean isBlocked) {

        static CollectorPreviewResponse from(CollectorPreview preview) {
            CollectorMarker marker = preview.marker();
            return new CollectorPreviewResponse(
                    marker.id(),
                    marker.handle(),
                    marker.displayName(),
                    marker.avatarUrl(),
                    marker.publicPoint(),
                    marker.publicLabel(),
                    marker.distanceBucket(),
                    ratingOf(marker.rating()),
                    marker.tags(),
                    marker.games(),
                    marker.lastActiveBucket(),
                    marker.onlineStatus(),
                    marker.binderFreshness(),
                    marker.publicBinderCount(),
                    marker.publicItemCount(),
                    preview.canMessage(),
                    preview.blocked());
        }
    }

    /** What the query designates unambiguously. */
    @Schema(
            name = "SearchResolution",
            description = "Printing and/or card the query resolved to (both null when ambiguous)")
    public record SearchResolutionResponse(
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID printingId,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID cardId) {

        static SearchResolutionResponse from(@Nullable CatalogResolution resolution) {
            return resolution == null
                    ? new SearchResolutionResponse(null, null)
                    : new SearchResolutionResponse(resolution.printingId(), resolution.cardId());
        }
    }

    /** {@code GET /search}. */
    @Schema(name = "UnifiedSearchResponse", description = "Unified search results")
    public record UnifiedSearchResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "blue eyes") String query,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<CardSummary> cards,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<PrintingSummary> printings,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<SetSummary> sets,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "Holders of the resolved printing/card (with matchingItems),"
                                            + " otherwise collectors matching the text")
                    List<CollectorMarkerResponse> collectors,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Public binders, each with its owner block")
                    List<PublicBinderSummaryResponse> binders,
            @Schema(requiredMode = RequiredMode.REQUIRED) SearchResolutionResponse resolved) {

        static UnifiedSearchResponse from(UnifiedSearch search, Instant now) {
            return new UnifiedSearchResponse(
                    search.query(),
                    search.cards(),
                    search.printings(),
                    search.sets(),
                    search.collectors().stream().map(CollectorMarkerResponse::from).toList(),
                    search.binders().stream()
                            .map(hit -> PublicBinderSummaryResponse.from(hit, now))
                            .toList(),
                    SearchResolutionResponse.from(search.resolved()));
        }
    }

    /** One holder of a card. */
    @Schema(name = "CardHolderResult", description = "A collector near you holding the card")
    public record CardHolderResultResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) CollectorMarkerResponse collector,
            @Schema(requiredMode = RequiredMode.REQUIRED) PublicInventoryItemResponse item) {

        static CardHolderResultResponse from(CardHolder holder, Instant now) {
            return new CardHolderResultResponse(
                    CollectorMarkerResponse.from(holder.collector()),
                    PublicInventoryItemResponse.from(holder.item(), now));
        }
    }

    /** One autocomplete entry. */
    @Schema(name = "SearchSuggestion", description = "Mixed autocomplete entry")
    public record SuggestionResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) SuggestionType type,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Id of the card, printing, set, collector, binder or tag")
                    UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) String label,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String sublabel,
            @Schema(nullable = true, format = "uri") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String imageUrl,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS) @Nullable String game,
            @Schema(
                            nullable = true,
                            description =
                                    "Navigation key: the handle of a COLLECTOR, the slug of a TAG")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String slug,
            @Schema(nullable = true, description = "Card of a PRINTING entry")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID cardId) {

        static SuggestionResponse from(Suggestion suggestion) {
            return new SuggestionResponse(
                    suggestion.type(),
                    suggestion.id(),
                    suggestion.label(),
                    suggestion.sublabel(),
                    suggestion.imageUrl(),
                    suggestion.game(),
                    suggestion.slug(),
                    suggestion.cardId());
        }
    }

    /** Ratings rounded to one decimal (no long fractions in public documents). */
    static CollectorRating ratingOf(RatingSummary rating) {
        @Nullable Double average = rating.average();
        return new CollectorRating(
                average == null
                        ? null
                        : BigDecimal.valueOf(average)
                                .setScale(1, RoundingMode.HALF_UP)
                                .doubleValue(),
                rating.count());
    }
}
