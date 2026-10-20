package com.orenjitrade.api.search;

import static com.orenjitrade.api.inventory.InventoryTestSupport.privacy;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * {@code GET /search/collectors}: the "Collectors" section of the phone's card search (stage R5,
 * owner spec 2026-10-14, section 8): discoverable collectors of the region who allow name search,
 * by handle or display name, at most {@code limit} (3 by default), never the caller nor a collector
 * blocked with them (left out before the limit), each with a state or province and a country, never
 * a city. Also the collectors section of {@code GET /search}, which now leaves blocked collectors
 * out in SQL too (the hardening list).
 */
class CollectorsByNameIT extends AbstractSearchIT {

    private JsonNode byName(@Nullable String uid, String query) {
        return callJson(HttpMethod.GET, "/api/v1/search/collectors?" + query, uid, null, 200);
    }

    private static List<String> names(JsonNode array) {
        List<String> handles = new ArrayList<>();
        array.forEach(hit -> handles.add(hit.path("handle").asString()));
        return handles;
    }

    @Test
    void collectorsOfTheRegionByNameAtMostThreeWithTheirPlaceOnly() {
        String word = token();
        Collector one = collector("name-one", "CA", "CA-ON");
        profile(one, "Ann " + word + " One", List.of("yugioh"));
        Collector two = collector("name-two", "US", "US-NY");
        profile(two, word + " Two", List.of("yugioh"));
        Collector three = collector("name-three", "CA", "CA-QC");
        profile(three, "Zed " + word, List.of("yugioh"));
        Collector four = collector("name-four", "MX", "MX-JAL");
        profile(four, "Four " + word, List.of("yugioh"));
        setLocation(four.uid(), "MX", "MX-JAL", "Guadalajara");
        // Never listed: another region, not discoverable, not searchable by name.
        Collector european = collector("name-eu", "FR", "FR-IDF");
        profile(european, word + " Europe", List.of("yugioh"));
        Collector hidden = collector("name-hidden", "CA", "CA-QC", false, "PUBLIC");
        profile(hidden, word + " Hidden", List.of("yugioh"));
        Collector unsearchable = collector("name-unsearch", "CA", "CA-QC");
        profile(unsearchable, word + " Unsearchable", List.of("yugioh"));
        Map<String, Object> noNameSearch = privacy(true, "MEMBERS");
        noNameSearch.put("searchDiscoverable", false);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                unsearchable.uid(),
                noNameSearch,
                200);

        JsonNode hits = byName(null, "region=americas-north&q=" + word + "&limit=10");
        assertThat(names(hits))
                .containsExactlyInAnyOrder(
                        one.handle(), two.handle(), three.handle(), four.handle());
        assertThat(byName(null, "region=americas-north&q=" + word)).hasSize(3);
        assertThat(names(byName(null, "region=europe&q=" + word)))
                .containsExactly(european.handle());

        JsonNode mexican = null;
        for (JsonNode hit : hits) {
            assertThat(hit.has("city")).isFalse();
            assertThat(hit.path("place").has("city")).isFalse();
            assertThat(hit.path("place").path("countryName").asString()).isNotBlank();
            if (four.handle().equals(hit.path("handle").asString())) {
                mexican = hit;
            }
        }
        assertThat(mexican).isNotNull();
        assertThat(mexican.toString()).doesNotContain("Guadalajara");
        assertThat(mexican.path("place").path("subdivisionCode").asString()).isEqualTo("MX-JAL");

        // By handle, with or without "@"; a handle that starts with the text first.
        assertThat(names(byName(null, "region=americas-north&q=@" + one.handle())))
                .startsWith(one.handle());
    }

    @Test
    void neverTheCallerNorABlockedCollectorWhoseRowGoesToTheNextOne() {
        String word = token();
        Collector viewer = collector("name-viewer", "CA", "CA-QC");
        profile(viewer, word + " Viewer", List.of("yugioh"));
        List<Collector> others = new ArrayList<>();
        for (int index = 0; index < 4; index++) {
            Collector other = collector("name-b" + index, "CA", "CA-QC");
            profile(other, word + " B" + index, List.of("yugioh"));
            others.add(other);
        }
        String query = "region=americas-north&q=" + word;
        List<String> before = names(byName(viewer.uid(), query));
        assertThat(before).hasSize(3).doesNotContain(viewer.handle());

        // The viewer blocks the first one: the fourth takes the place (before the limit).
        Collector first =
                others.stream().filter(o -> o.handle().equals(before.get(0))).findFirst().get();
        callJson(
                HttpMethod.POST, "/api/v1/users/" + first.id() + "/block", viewer.uid(), null, 200);
        List<String> blocking = names(byName(viewer.uid(), query));
        assertThat(blocking).hasSize(3).doesNotContain(first.handle());

        // The other direction.
        Collector second =
                others.stream().filter(o -> o.handle().equals(blocking.get(0))).findFirst().get();
        callJson(
                HttpMethod.POST,
                "/api/v1/users/" + viewer.id() + "/block",
                second.uid(),
                null,
                200);
        List<String> blocked = names(byName(viewer.uid(), query + "&limit=10"));
        assertThat(blocked).hasSize(2).doesNotContain(first.handle(), second.handle());

        // The unified search's collectors section leaves them out in SQL too: a full section.
        JsonNode unified =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/search?types=collectors&limit=2&" + query,
                        viewer.uid(),
                        null,
                        200);
        List<String> section = new ArrayList<>();
        unified.path("collectors").forEach(m -> section.add(m.path("handle").asString()));
        assertThat(section).hasSize(2).doesNotContain(first.handle(), second.handle());

        // Signed out, everybody is there.
        assertThat(byName(null, query + "&limit=10")).hasSize(5);
    }

    @Test
    void validation() {
        callJson(HttpMethod.GET, "/api/v1/search/collectors?q=", null, null, 400);
        callJson(HttpMethod.GET, "/api/v1/search/collectors?q=ab&limit=11", null, null, 400);
        callJson(HttpMethod.GET, "/api/v1/search/collectors?q=ab&limit=0", null, null, 400);
        callJson(HttpMethod.GET, "/api/v1/search/collectors?q=ab&region=atlantis", null, null, 400);
    }
}
