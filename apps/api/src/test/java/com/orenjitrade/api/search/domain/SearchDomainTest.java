package com.orenjitrade.api.search.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.location.domain.SearchCentre;
import com.orenjitrade.api.profiles.domain.MessagingPermission;
import com.orenjitrade.api.profiles.domain.ProfileVisibility;
import com.orenjitrade.api.profiles.domain.RatingSummary;
import com.orenjitrade.api.search.domain.DiscoveryResults.Suggestion;
import java.math.BigDecimal;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.Test;

/** Pure rules of the search module: ranking, cache keys, item filters, parsing, interleaving. */
class SearchDomainTest {

    private static MarkerRow row(
            String handle, @Nullable Integer freshness, @Nullable Double metres) {
        return new MarkerRow(
                UUID.nameUUIDFromBytes(handle.getBytes()),
                handle,
                handle,
                null,
                45.5,
                -73.5,
                "Area",
                "r1c1",
                metres,
                true,
                false,
                true,
                ProfileVisibility.MEMBERS,
                MessagingPermission.MEMBERS_WITH_PROFILE,
                true,
                null,
                List.of(),
                List.of(),
                List.of(),
                freshness,
                0,
                0,
                List.of());
    }

    @Test
    void rankingIsFreshnessThenDistanceBucketThenRatingThenDistance() {
        MarkerRow agingNear = row("aging-near", 1, 500.0);
        MarkerRow activeFar = row("active-far", 0, 9_000.0);
        MarkerRow activeNear = row("active-near", 0, 2_000.0);
        MarkerRow activeNearRated = row("active-near-rated", 0, 4_000.0);
        MarkerRow noListings = row("no-listings", null, 100.0);
        Map<UUID, RatingSummary> ratings = new HashMap<>();
        ratings.put(activeNearRated.id(), new RatingSummary(4.9, 12));
        List<MarkerRow> rows =
                new ArrayList<>(
                        List.of(noListings, agingNear, activeFar, activeNear, activeNearRated));
        rows.sort(
                MarkerRanking.comparator(
                        row -> ratings.getOrDefault(row.id(), RatingSummary.NONE)));
        assertThat(rows.stream().map(MarkerRow::handle))
                .containsExactly(
                        "active-near-rated", // same bucket (1-5 km) as active-near, better rated
                        "active-near",
                        "active-far",
                        "aging-near",
                        "no-listings");
        assertThat(MarkerRanking.bucketRank(null)).isGreaterThan(MarkerRanking.bucketRank(1e9));
    }

    @Test
    void cacheKeysAreCanonicalAndHideNothingButNeverTheRawCentre() {
        SearchCentre centre = SearchCentre.snap(45.51739, -73.58914);
        NearbyCriteria a =
                new NearbyCriteria(
                        centre,
                        10,
                        "yugioh",
                        null,
                        null,
                        List.of("trader", "collector"),
                        null,
                        null,
                        null,
                        200);
        NearbyCriteria b =
                new NearbyCriteria(
                        SearchCentre.snap(45.52, -73.59),
                        10,
                        "yugioh",
                        null,
                        null,
                        List.of("collector", "trader", "trader"),
                        null,
                        null,
                        null,
                        200);
        assertThat(a.cacheKey()).isEqualTo(b.cacheKey());
        assertThat(a.cacheKey()).doesNotContain("45.517").doesNotContain("73.589");
        NearbyCriteria other =
                new NearbyCriteria(
                        centre,
                        10,
                        "yugioh",
                        SearchAvailability.SALE,
                        null,
                        List.of(),
                        null,
                        null,
                        null,
                        200);
        assertThat(other.cacheKey()).isNotEqualTo(a.cacheKey());
        assertThat(a.filterNames()).containsExactly("game", "tags");
        assertThat(a.listsMatchingItems()).isFalse();
        assertThat(other.listsMatchingItems()).isTrue();
    }

    @Test
    void itemFiltersBuildParameterisedSql() {
        UUID printing = UUID.randomUUID();
        ItemFilter filter =
                new ItemFilter(
                        printing,
                        null,
                        null,
                        SearchAvailability.TRADE,
                        "NEAR_MINT",
                        new BigDecimal("5"),
                        new BigDecimal("20"),
                        FreshnessState.ACTIVE,
                        "UNLIMITED",
                        "en",
                        true);
        Map<String, Object> params = new HashMap<>();
        String sql = filter.sql(params);
        assertThat(sql)
                .contains("i.printing_id = :f_printingId")
                .contains("i.availability IN ('TRADE', 'TRADE_OR_SALE')")
                .contains("i.asking_price >= :f_minPrice")
                .contains("i.asking_price <= :f_maxPrice")
                .contains("i.accepts_offers")
                .doesNotContain("NEAR_MINT")
                .doesNotContain("UNLIMITED");
        assertThat(params)
                .containsEntry("f_printingId", printing)
                .containsEntry("f_condition", "NEAR_MINT")
                .containsEntry("f_freshness", "ACTIVE")
                .containsEntry("f_language", "en");
        assertThat(filter.names())
                .containsExactly(
                        "printing",
                        "availability",
                        "condition",
                        "price",
                        "freshness",
                        "edition",
                        "language",
                        "accepts_offers");
        assertThat(filter.narrowsItems()).isTrue();
        assertThat(ItemFilter.discovery(null, null, "mtg", null).narrowsItems()).isFalse();
        assertThat(SearchAvailability.ACCEPTS_OFFERS.sql()).isEqualTo("i.accepts_offers");
    }

    @Test
    void typesAndSortsParseCaseInsensitively() {
        assertThat(SearchService.parseTypes(List.of("Cards, printings", "binders")))
                .isEqualTo(EnumSet.of(SearchType.CARDS, SearchType.PRINTINGS, SearchType.BINDERS));
        assertThat(SearchService.parseTypes(List.of())).isEmpty();
        assertThatThrownBy(() -> SearchService.parseTypes(List.of("cards,decks")))
                .isInstanceOf(ApiException.class);
        assertThat(HolderSort.parse("Price")).contains(HolderSort.PRICE);
        assertThat(HolderSort.parse("rating")).isEmpty();
    }

    @Test
    void suggestionsInterleaveOnePerKind() {
        Deque<Suggestion> cards = deque("card-1", "card-2", "card-3");
        Deque<Suggestion> collectors = deque("collector-1");
        Deque<Suggestion> empty = new ArrayDeque<>();
        Deque<Suggestion> tags = deque("tag-1", "tag-2");
        List<Suggestion> merged =
                SearchService.interleave(List.of(cards, collectors, empty, tags), 5);
        assertThat(merged.stream().map(Suggestion::label))
                .containsExactly("card-1", "collector-1", "tag-1", "card-2", "tag-2");
        assertThat(SearchService.interleave(List.of(deque("a"), deque()), 10)).hasSize(1);
    }

    private static Deque<Suggestion> deque(String... labels) {
        Deque<Suggestion> deque = new ArrayDeque<>();
        for (String label : labels) {
            deque.add(
                    new Suggestion(
                            SuggestionType.CARD,
                            UUID.randomUUID(),
                            label,
                            null,
                            null,
                            null,
                            null,
                            null));
        }
        return deque;
    }
}
