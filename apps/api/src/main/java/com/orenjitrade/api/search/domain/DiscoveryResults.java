package com.orenjitrade.api.search.domain;

import com.orenjitrade.api.binders.domain.PublicBinderService.PublicBinderHit;
import com.orenjitrade.api.cards.domain.CardSummary;
import com.orenjitrade.api.cards.domain.CatalogResolution;
import com.orenjitrade.api.cards.domain.PrintingSummary;
import com.orenjitrade.api.cards.domain.SetSummary;
import com.orenjitrade.api.inventory.domain.InventoryItemView;
import com.orenjitrade.api.location.domain.SearchCentre;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Result types of the discovery and search services. */
public final class DiscoveryResults {

    private DiscoveryResults() {}

    /**
     * {@code GET /collectors/nearby}.
     *
     * @param centre the snapped centre searched around
     * @param radiusKm radius used
     * @param collectors ranked markers (at most the limit)
     * @param total matching collectors
     * @param truncated whether more collectors match than returned
     */
    public record NearbyResult(
            SearchCentre centre,
            double radiusKm,
            List<CollectorMarker> collectors,
            long total,
            boolean truncated) {}

    /**
     * {@code GET /collectors/{handle}/preview}.
     *
     * @param marker the marker
     * @param canMessage whether the viewer may start a conversation
     * @param blocked whether a block exists between viewer and collector
     */
    public record CollectorPreview(CollectorMarker marker, boolean canMessage, boolean blocked) {}

    /**
     * One row of {@code GET /search/card-holders}.
     *
     * @param collector the holder's marker
     * @param item the public item
     */
    public record CardHolder(CollectorMarker collector, InventoryItemView item) {}

    /**
     * {@code GET /search}.
     *
     * @param query the query text
     * @param cards matching cards
     * @param printings matching printings
     * @param sets matching sets
     * @param collectors matching collectors, or holders of the resolved printing/card
     * @param binders matching public binders
     * @param resolved what the query designates unambiguously
     */
    public record UnifiedSearch(
            String query,
            List<CardSummary> cards,
            List<PrintingSummary> printings,
            List<SetSummary> sets,
            List<CollectorMarker> collectors,
            List<PublicBinderHit> binders,
            @Nullable CatalogResolution resolved) {

        public long resultCount() {
            return (long) cards.size()
                    + printings.size()
                    + sets.size()
                    + collectors.size()
                    + binders.size();
        }
    }

    /**
     * One entry of {@code GET /search/suggest}.
     *
     * @param type kind of entry
     * @param id id of the card, printing, set, collector, binder or tag
     * @param label main text
     * @param sublabel secondary text
     * @param imageUrl image
     * @param game game slug
     * @param slug navigation key: collector handle, tag slug or card slug
     * @param cardId card of a PRINTING entry
     */
    public record Suggestion(
            SuggestionType type,
            UUID id,
            String label,
            @Nullable String sublabel,
            @Nullable String imageUrl,
            @Nullable String game,
            @Nullable String slug,
            @Nullable UUID cardId) {}
}
