package com.orenjitrade.api.search.domain;

import com.orenjitrade.api.delisting.domain.FreshnessState;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A validated discovery request (the collector engine behind the collectors of {@code GET
 * /search}). Independent of the viewer, so its results are cacheable per {@link #cacheKey()};
 * viewer-specific rules (last active, blocks) are applied afterwards.
 *
 * @param region platform region the collectors' country belongs to (ADR 0017)
 * @param game game slug: the collector plays it or lists items of it
 * @param availability the collector lists an item offered that way
 * @param freshness best freshness of the collector's public items (ACTIVE or AGING)
 * @param tags tag slugs, any of them
 * @param printingId the collector lists this printing
 * @param cardId the collector lists a printing of this card
 * @param query name, handle or tag text (collectors who allow name search only)
 * @param limit maximum markers
 */
public record DiscoveryCriteria(
        String region,
        @Nullable String game,
        @Nullable SearchAvailability availability,
        @Nullable FreshnessState freshness,
        List<String> tags,
        @Nullable UUID printingId,
        @Nullable UUID cardId,
        @Nullable String query,
        int limit) {

    public DiscoveryCriteria {
        tags = tags.stream().sorted().distinct().toList();
    }

    /** The item filters of the request (game included). */
    public ItemFilter itemFilter() {
        return ItemFilter.discovery(printingId, cardId, game, availability);
    }

    /** Whether markers list matching items (a printing, card or availability filter is set). */
    public boolean listsMatchingItems() {
        return printingId != null || cardId != null || availability != null;
    }

    /** Names of the filters in use (analytics; no values). */
    public List<String> filterNames() {
        List<String> names = new ArrayList<>(itemFilter().names());
        if (freshness != null) {
            names.add("freshness");
        }
        if (!tags.isEmpty()) {
            names.add("tags");
        }
        if (query != null) {
            names.add("query");
        }
        return names;
    }

    /** Canonical form of every input (the Redis key is a hash of it). */
    public String cacheKey() {
        StringBuilder key = new StringBuilder("v2");
        key.append("|r=").append(region);
        key.append("|g=").append(game == null ? "" : game);
        key.append("|a=").append(availability == null ? "" : availability.name());
        key.append("|f=").append(freshness == null ? "" : freshness.name());
        key.append("|t=").append(String.join(",", tags));
        key.append("|p=").append(printingId == null ? "" : printingId);
        key.append("|k=").append(cardId == null ? "" : cardId);
        key.append("|q=").append(query == null ? "" : query.toLowerCase(Locale.ROOT));
        key.append("|l=").append(limit);
        return key.toString();
    }
}
