package com.orenjitrade.api.search;

import static com.orenjitrade.api.inventory.InventoryTestSupport.binder;
import static com.orenjitrade.api.inventory.InventoryTestSupport.gameId;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.inventory.InventoryTestSupport.IsolatedCard;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * "Who has this card" (stage R5, owner spec 2026-10-14, section 8): {@code GET
 * /search/card-holders?sort=province&excludeDeckCoreItems=true} groups the holders by state or
 * province (the viewer's own first, then the other ones of the viewer's country, then the rest of
 * the region by country and province name; the freshest listing first inside a group), pages and
 * counts after the region, discoverability, visibility, block and own-item rules, and filters by
 * printing. Places only, never a distance (ADR 0017).
 */
class WhoHasThisCardIT extends AbstractSearchIT {

    private static final String REGION = "americas-north";

    private UUID printingId;
    private UUID frenchPrintingId;
    private UUID cardId;
    private Collector viewer;
    private Collector qcNewHolder;
    private Collector bcHolder;
    private String qcNew;
    private String qcOld;
    private String bc;
    private String on;
    private String mx;
    private String california;
    private String newYork;

    @BeforeEach
    void holders() {
        IsolatedCard card = isolatedPrinting("pkm-p001a");
        printingId = card.printingId();
        frenchPrintingId = siblingPrinting(card, "pkm-p001b", "fr");
        cardId = card.cardId();

        viewer = collector("who-viewer", "CA", "CA-QC");
        qcOld = publicItem(collector("who-qc-old", "CA", "CA-QC"), printingId, Map.of());
        freshness(qcOld, "AGING", 20);
        qcNewHolder = collector("who-qc-new", "CA", "CA-QC");
        qcNew = publicItem(qcNewHolder, frenchPrintingId, Map.of());
        on = publicItem(collector("who-on", "CA", "CA-ON"), printingId, Map.of());
        bcHolder = collector("who-bc", "CA", "CA-BC");
        bc = publicItem(bcHolder, printingId, Map.of());
        newYork = publicItem(collector("who-ny", "US", "US-NY"), printingId, Map.of());
        california = publicItem(collector("who-ca", "US", "US-CA"), printingId, Map.of());
        mx = publicItem(collector("who-mx", "MX", "MX-JAL"), printingId, Map.of());

        // Never rows: another region, a collector who is not discoverable, a private copy and a
        // stale copy.
        publicItem(collector("who-eu", "FR", "FR-IDF"), printingId, Map.of());
        publicItem(collector("who-hidden", "CA", "CA-QC", false, "PUBLIC"), printingId, Map.of());
        Collector privateHolder = collector("who-private", "CA", "CA-QC");
        callJson(
                HttpMethod.POST,
                "/api/v1/inventory/items",
                privateHolder.uid(),
                item(printingId),
                201);
        freshness(
                publicItem(collector("who-stale", "CA", "CA-QC"), printingId, Map.of()),
                "STALE",
                35);
    }

    private JsonNode page(@Nullable String uid, String query) {
        return callJson(
                HttpMethod.GET,
                "/api/v1/search/card-holders?region="
                        + REGION
                        + "&sort=province&excludeDeckCoreItems=true&"
                        + query,
                uid,
                null,
                200);
    }

    private static List<String> itemIds(JsonNode page) {
        List<String> ids = new ArrayList<>();
        page.path("items").forEach(row -> ids.add(row.path("item").path("id").asString()));
        return ids;
    }

    private static List<String> provinces(JsonNode page) {
        List<String> codes = new ArrayList<>();
        page.path("items")
                .forEach(
                        row ->
                                codes.add(
                                        row.path("collector")
                                                .path("place")
                                                .path("subdivisionCode")
                                                .asString()));
        return codes;
    }

    @Test
    void theViewersProvinceFirstThenTheirCountryThenTheRestOfTheRegion() {
        // The viewer's own copy is never one of the rows.
        String own = publicItem(viewer, printingId, Map.of());
        JsonNode all = page(viewer.uid(), "cardId=" + cardId);
        assertThat(itemIds(all)).doesNotContain(own);
        assertThat(itemIds(all))
                .as("Quebec (newest first), Canada by name, then Mexico, then the United States")
                .containsExactly(qcNew, qcOld, bc, on, mx, california, newYork);
        assertThat(provinces(all))
                .containsExactly("CA-QC", "CA-QC", "CA-BC", "CA-ON", "MX-JAL", "US-CA", "US-NY");
        assertThat(all.path("totalItems").asLong()).isEqualTo(7);

        // Pages keep the order and the count.
        JsonNode first = page(viewer.uid(), "cardId=" + cardId + "&size=3&page=0");
        JsonNode second = page(viewer.uid(), "cardId=" + cardId + "&size=3&page=1");
        JsonNode third = page(viewer.uid(), "cardId=" + cardId + "&size=3&page=2");
        List<String> paged = new ArrayList<>(itemIds(first));
        paged.addAll(itemIds(second));
        paged.addAll(itemIds(third));
        assertThat(paged).containsExactly(qcNew, qcOld, bc, on, mx, california, newYork);
        assertThat(first.path("totalPages").asInt()).isEqualTo(3);

        // "Any printing ▾": one printing.
        assertThat(itemIds(page(viewer.uid(), "printingId=" + frenchPrintingId)))
                .containsExactly(qcNew);
        assertThat(itemIds(page(viewer.uid(), "printingId=" + printingId)))
                .containsExactly(qcOld, bc, on, mx, california, newYork);
    }

    @Test
    void aViewerElsewhereOrWithoutAPlaceSeesTheRegionByCountryAndProvince() {
        Collector texan = collector("who-tx", "US", "US-TX");
        JsonNode texas = page(texan.uid(), "cardId=" + cardId);
        assertThat(itemIds(texas))
                .as("no holder in Texas: the other states of the US first %s", provinces(texas))
                .containsExactly(california, newYork, bc, on, qcNew, qcOld, mx);

        String placeless = uniqueUid("who-placeless");
        provisionCompliantWithoutLocation(placeless);
        assertThat(itemIds(page(placeless, "cardId=" + cardId)))
                .containsExactly(bc, on, qcNew, qcOld, mx, california, newYork);
        assertThat(itemIds(page(null, "cardId=" + cardId)))
                .as("signed out")
                .containsExactly(bc, on, qcNew, qcOld, mx, california, newYork);
    }

    @Test
    void blockedHoldersLeaveTheGroupsAndTheCountBothWays() {
        callJson(
                HttpMethod.POST,
                "/api/v1/users/" + bcHolder.id() + "/block",
                viewer.uid(),
                null,
                200);
        callJson(
                HttpMethod.POST,
                "/api/v1/users/" + viewer.id() + "/block",
                qcNewHolder.uid(),
                null,
                200);

        JsonNode blocked = page(viewer.uid(), "cardId=" + cardId);
        assertThat(itemIds(blocked)).containsExactly(qcOld, on, mx, california, newYork);
        assertThat(blocked.path("totalItems").asLong()).isEqualTo(5);
        JsonNode firstOfTwo = page(viewer.uid(), "cardId=" + cardId + "&size=3&page=0");
        assertThat(itemIds(firstOfTwo)).containsExactly(qcOld, on, mx);
        assertThat(firstOfTwo.path("totalPages").asInt()).isEqualTo(2);
    }

    @Test
    void theCardsOfADeckCoreSellWithItAndShowAsTheCore() {
        Collector seller = collector("who-core", "CA", "CA-ON");
        var core = binder("Who core " + token(), "PUBLIC", gameId(testUsers, "pokemon"));
        core.put("sellsAsCore", true);
        core.put("askingPriceText", "$95");
        String coreId =
                callJson(HttpMethod.POST, "/api/v1/binders", seller.uid(), core, 201)
                        .path("id")
                        .asString();
        var filed = item(printingId);
        filed.put("binderId", coreId);
        filed.put("visibility", "PUBLIC");
        String inCore =
                callJson(HttpMethod.POST, "/api/v1/inventory/items", seller.uid(), filed, 201)
                        .path("id")
                        .asString();

        assertThat(itemIds(page(viewer.uid(), "cardId=" + cardId))).doesNotContain(inCore);
        JsonNode cores =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/search/deck-cores?region=" + REGION + "&cardId=" + cardId,
                        viewer.uid(),
                        null,
                        200);
        List<String> coreIds = new ArrayList<>();
        cores.forEach(node -> coreIds.add(node.path("id").asString()));
        assertThat(coreIds).containsExactly(coreId);
        assertThat(cores.get(0).path("owner").path("place").path("subdivisionCode").asString())
                .isEqualTo("CA-ON");
    }

    @Test
    void aRarityKeepsTheHoldersOfTheCardsPrintingsInThatRarity() {
        // A wish of any printing in one rarity opens the card page on that rarity (stage R5 review,
        // F3): the French printing is the only Secret Rare one, so only its holder is left, and
        // the count follows.
        testUsers.update(
                "UPDATE card_printing SET rarity = 'Secret Rare' WHERE id = ?", frenchPrintingId);
        JsonNode secret =
                get(
                        viewer.uid(),
                        200,
                        "/api/v1/search/card-holders?region={region}&sort=province"
                                + "&excludeDeckCoreItems=true&cardId={card}&rarity={rarity}",
                        REGION,
                        cardId,
                        "Secret Rare");
        assertThat(itemIds(secret)).containsExactly(qcNew);
        assertThat(secret.path("totalItems").asInt()).isEqualTo(1);
        // A rarity none of its printings has: nobody.
        JsonNode none =
                get(
                        viewer.uid(),
                        200,
                        "/api/v1/search/card-holders?region={region}&cardId={card}&rarity={rarity}",
                        REGION,
                        cardId,
                        "Mythic");
        assertThat(itemIds(none)).isEmpty();
        assertThat(none.path("totalItems").asInt()).isZero();
        // A blank one is no filter.
        JsonNode blank =
                get(
                        viewer.uid(),
                        200,
                        "/api/v1/search/card-holders?region={region}&sort=province"
                                + "&excludeDeckCoreItems=true&cardId={card}&rarity={rarity}",
                        REGION,
                        cardId,
                        " ");
        assertThat(itemIds(blank)).isEqualTo(itemIds(page(viewer.uid(), "cardId=" + cardId)));
    }

    @Test
    void anUnknownSortIsRejected() {
        JsonNode problem =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/search/card-holders?cardId=" + cardId + "&sort=distance",
                        null,
                        null,
                        400);
        assertThat(problem.toString()).contains("must be freshness, price or province");
    }
}
