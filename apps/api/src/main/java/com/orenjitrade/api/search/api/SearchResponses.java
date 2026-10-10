package com.orenjitrade.api.search.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.binders.api.PublicBinderResponses.PublicBinderSummaryResponse;
import com.orenjitrade.api.cards.domain.CardSummary;
import com.orenjitrade.api.cards.domain.CatalogResolution;
import com.orenjitrade.api.cards.domain.PrintingSummary;
import com.orenjitrade.api.cards.domain.SetSummary;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.inventory.api.InventoryResponses.PublicInventoryItemResponse;
import com.orenjitrade.api.inventory.domain.Availability;
import com.orenjitrade.api.location.api.PlaceResponse;
import com.orenjitrade.api.profiles.api.CollectorProfileResponse.CollectorRating;
import com.orenjitrade.api.profiles.domain.CollectorProfileView.LastActiveBucket;
import com.orenjitrade.api.profiles.domain.CollectorProfileView.OnlineStatus;
import com.orenjitrade.api.profiles.domain.RatingSummary;
import com.orenjitrade.api.search.domain.CollectorMarker;
import com.orenjitrade.api.search.domain.DiscoveryResults.CardHolder;
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
 * Response DTOs of search (Phase 4 contract). Geography is only ever a collector's state/province
 * and country ({@link PlaceResponse}, ADR 0017): never a city, a coordinate or a distance.
 */
public final class SearchResponses {

    private SearchResponses() {}

    /** A discoverable collector in search results. */
    @Schema(
            name = "CollectorMarker",
            description =
                    "A discoverable collector with their state/province and country (never a city,"
                            + " a coordinate or a distance)")
    public record CollectorMarkerResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "maika") String handle,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "Maïka Tremblay")
                    String displayName,
            @Schema(nullable = true, format = "uri") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String avatarUrl,
            @Schema(requiredMode = RequiredMode.REQUIRED) PlaceResponse place,
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
                                    "Best freshness of the public listings (ACTIVE or AGING in"
                                            + " search); null without public listings")
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

        /** Response form of a marker. */
        public static CollectorMarkerResponse from(CollectorMarker marker) {
            return new CollectorMarkerResponse(
                    marker.id(),
                    marker.handle(),
                    marker.displayName(),
                    marker.avatarUrl(),
                    PlaceResponse.from(marker.place()),
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
                            example = "americas-north",
                            description =
                                    "Platform region the collectors and binders were searched in")
                    String region,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "Holders of the resolved printing/card in the region (with"
                                            + " matchingItems), otherwise collectors of the region"
                                            + " matching the text")
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
                    search.region(),
                    search.collectors().stream().map(CollectorMarkerResponse::from).toList(),
                    search.binders().stream()
                            .map(hit -> PublicBinderSummaryResponse.from(hit, now))
                            .toList(),
                    SearchResolutionResponse.from(search.resolved()));
        }
    }

    /** One holder of a card. */
    @Schema(name = "CardHolderResult", description = "A collector of the region holding the card")
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
