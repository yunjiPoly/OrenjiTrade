package com.orenjitrade.api.search;

import static com.orenjitrade.api.inventory.InventoryTestSupport.binder;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.games.domain.GameService;
import com.orenjitrade.api.inventory.InventoryTestSupport.IsolatedCard;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * {@code game=} on every discovery endpoint the phone calls (stage G of the phone redesign, one
 * game at a time): the map's counts, the binders and deck cores of a state and of the region, card
 * holders and their count, the deck cores of a card, the collectors found by name. The game only
 * narrows: without it every endpoint answers as before (the paused web), nothing of another game
 * leaks through a count or a list, and an unknown game is a 400. The binders live in Wyoming, a
 * state no other test uses (the regions are shared by the whole suite).
 */
class SearchGameIT extends AbstractSearchIT {

    private static final String STATE = "US-WY";

    @Autowired private GameService gameService;

    @BeforeEach
    void freshGames() {
        gameService.invalidate();
    }

    private String gameId(String slug) {
        return testUsers
                .query("SELECT id FROM game WHERE slug = ?", slug)
                .get(0)
                .get("id")
                .toString();
    }

    /** A public binder of {@code game} named {@code name}, with one public card when given. */
    private String publicBinder(
            Collector owner, String game, String name, @Nullable UUID card, boolean deckCore) {
        Map<String, Object> body = binder(name, "PUBLIC");
        body.put("gameId", gameId(game));
        if (deckCore) {
            body.put("sellsAsCore", true);
            body.put("askingPriceText", "$90");
        }
        String binderId =
                callJson(HttpMethod.POST, "/api/v1/binders", owner.uid(), body, 201)
                        .path("id")
                        .asString();
        if (card != null) {
            Map<String, Object> itemBody = item(card);
            itemBody.put("binderId", binderId);
            itemBody.put("visibility", "PUBLIC");
            callJson(HttpMethod.POST, "/api/v1/inventory/items", owner.uid(), itemBody, 201);
        }
        return binderId;
    }

    /** {binderCount, deckCoreCount} of the state, {0, 0} when it is absent. */
    private long[] counts(@Nullable String uid, @Nullable String game) {
        JsonNode counts =
                game == null
                        ? get(uid, 200, "/api/v1/regions/americas-north/binder-counts")
                        : get(
                                uid,
                                200,
                                "/api/v1/regions/americas-north/binder-counts?game={game}",
                                game);
        for (JsonNode entry : counts.path("subdivisions")) {
            if (STATE.equals(entry.path("code").asString())) {
                return new long[] {
                    entry.path("binderCount").asLong(), entry.path("deckCoreCount").asLong()
                };
            }
        }
        return new long[] {0, 0};
    }

    private static List<String> ids(JsonNode page) {
        List<String> ids = new ArrayList<>();
        page.path("items").forEach(node -> ids.add(node.path("id").asString()));
        return ids;
    }

    @Test
    void theMapAndTheBinderListsCountAndListTheBrowsedGameOnly() {
        long[] before = counts(null, null);
        long[] beforePokemon = counts(null, "pokemon");
        long[] beforeYugioh = counts(null, "yugioh");
        String word = token();
        Collector owner = collector("game-map", "US", STATE);
        String yugioh =
                publicBinder(owner, "yugioh", word + " duels", printing("ygo-p001a"), false);
        String pokemon =
                publicBinder(owner, "pokemon", word + " holos", printing("pkm-p002a"), false);
        String pokemonCore = publicBinder(owner, "pokemon", word + " core", null, true);

        // Without game=: every game, as before.
        assertThat(counts(null, null)).containsExactly(before[0] + 3, before[1] + 1);
        assertThat(counts(null, "pokemon"))
                .containsExactly(beforePokemon[0] + 2, beforePokemon[1] + 1);
        assertThat(counts(null, "yugioh")).containsExactly(beforeYugioh[0] + 1, beforeYugioh[1]);
        // A signed-in viewer's counts (computed live) agree.
        String viewer = uniqueUid("game-map-viewer");
        provisionCompliant(viewer);
        assertThat(counts(viewer, "pokemon"))
                .containsExactly(beforePokemon[0] + 2, beforePokemon[1] + 1);
        get(null, 400, "/api/v1/regions/americas-north/binder-counts?game=chess");

        // The binders of the state, and of the whole region by text.
        String stateList = "/api/v1/regions/americas-north/subdivisions/" + STATE + "/binders";
        assertThat(ids(get(viewer, 200, stateList + "?q={q}", word)))
                .containsExactlyInAnyOrder(yugioh, pokemon, pokemonCore);
        assertThat(ids(get(viewer, 200, stateList + "?q={q}&game=yugioh", word)))
                .containsExactly(yugioh);
        assertThat(ids(get(viewer, 200, stateList + "?q={q}&game=pokemon", word)))
                .containsExactlyInAnyOrder(pokemon, pokemonCore);
        assertThat(ids(get(viewer, 200, stateList + "?q={q}&game=pokemon&deckCore=true", word)))
                .containsExactly(pokemonCore);
        assertThat(ids(get(viewer, 200, stateList + "?q={q}&game=mtg", word))).isEmpty();
        String regionList = "/api/v1/regions/americas-north/binders";
        assertThat(ids(get(null, 200, regionList + "?q={q}&game=yugioh", word)))
                .containsExactly(yugioh);
        assertThat(ids(get(null, 200, regionList + "?q={q}", word))).hasSize(3);
        get(null, 400, regionList + "?game=chess");
        get(null, 400, stateList + "?game=chess");
    }

    @Test
    void holdersAndDeckCoresOfACardOfAnotherGameAreNone() {
        IsolatedCard card = isolatedPrinting("pkm-p002a");
        Collector seller = collector("game-holder", "US", STATE);
        publicBinder(seller, "pokemon", token() + " singles", card.printingId(), false);
        String core = publicBinder(seller, "pokemon", token() + " core", card.printingId(), true);
        String viewer = uniqueUid("game-holder-viewer");
        provisionCompliant(viewer);

        String holders = "/api/v1/search/card-holders?cardId={id}&region=americas-north";
        JsonNode all = get(viewer, 200, holders, card.cardId());
        assertThat(all.path("totalItems").asLong()).isEqualTo(2);
        JsonNode sameGame = get(viewer, 200, holders + "&game=pokemon", card.cardId());
        assertThat(sameGame.path("totalItems").asLong()).isEqualTo(2);
        JsonNode otherGame = get(viewer, 200, holders + "&game=yugioh", card.cardId());
        assertThat(otherGame.path("totalItems").asLong()).isZero();
        assertThat(otherGame.path("items")).isEmpty();
        get(viewer, 400, holders + "&game=chess", card.cardId());

        String cores = "/api/v1/search/deck-cores?cardId={id}&region=americas-north";
        assertThat(get(viewer, 200, cores, card.cardId()).findValuesAsString("id")).contains(core);
        assertThat(
                        get(viewer, 200, cores + "&game=pokemon", card.cardId())
                                .findValuesAsString("id"))
                .contains(core);
        assertThat(get(viewer, 200, cores + "&game=yugioh", card.cardId())).isEmpty();
    }

    @Test
    void collectorsFoundByNameListOrShowTheBrowsedGame() {
        String word = token();
        Collector fan = collector("game-name-fan", "US", STATE);
        profile(fan, word + " Fan", List.of("pokemon"));
        Collector seller = collector("game-name-seller", "US", STATE);
        profile(seller, word + " Seller", List.of("mtg"));
        publicItem(seller, printing("pkm-p002a"), Map.of());
        Collector other = collector("game-name-other", "US", STATE);
        profile(other, word + " Other", List.of("yugioh"));
        String viewer = uniqueUid("game-name-viewer");
        provisionCompliant(viewer);

        String path = "/api/v1/search/collectors?q={q}&region=americas-north&limit=10";
        assertThat(handlesOf(get(viewer, 200, path, word)))
                .containsExactlyInAnyOrder(fan.handle(), seller.handle(), other.handle());
        assertThat(handlesOf(get(viewer, 200, path + "&game=pokemon", word)))
                .as("the profile game, or a public card of it")
                .containsExactlyInAnyOrder(fan.handle(), seller.handle());
        assertThat(handlesOf(get(viewer, 200, path + "&game=yugioh", word)))
                .containsExactly(other.handle());
        assertThat(handlesOf(get(viewer, 200, path + "&game=riftbound", word))).isEmpty();
        get(viewer, 400, path + "&game=chess", word);
    }

    private static List<String> handlesOf(JsonNode collectors) {
        List<String> handles = new ArrayList<>();
        collectors.forEach(node -> handles.add(node.path("handle").asString()));
        return handles;
    }
}
