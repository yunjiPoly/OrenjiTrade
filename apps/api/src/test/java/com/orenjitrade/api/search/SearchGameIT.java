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

    /**
     * A public binder of {@code game} named {@code name}, with one public card when given; made
     * without a game, as the paused web makes them, when {@code game} is {@code null}.
     */
    private String publicBinder(
            Collector owner,
            @Nullable String game,
            String name,
            @Nullable UUID card,
            boolean deckCore) {
        Map<String, Object> body = binder(name, "PUBLIC");
        if (game != null) {
            body.put("gameId", gameId(game));
        }
        if (deckCore) {
            body.put("sellsAsCore", true);
            body.put("askingPriceText", "$90");
        }
        String binderId =
                callJson(HttpMethod.POST, "/api/v1/binders", owner.uid(), body, 201)
                        .path("id")
                        .asString();
        if (card != null) {
            file(owner, binderId, card, "PUBLIC");
        }
        return binderId;
    }

    /** Files a card of {@code printing} with {@code visibility} in the binder. */
    private void file(Collector owner, String binderId, UUID printing, String visibility) {
        Map<String, Object> itemBody = item(printing);
        itemBody.put("binderId", binderId);
        itemBody.put("visibility", visibility);
        callJson(HttpMethod.POST, "/api/v1/inventory/items", owner.uid(), itemBody, 201);
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

    /**
     * A binder the paused web made without a game takes its first card's game and refuses no card,
     * so it can hold the cards of two games. Then no game counts or lists it, its other game's card
     * names find it under no game and, as a deck core, it is no game's deck core of a card (review
     * fix 1, P1): its other cards would show as the browsed game's. Without {@code game=} it shows
     * as before, and one holding the cards of one game shows under that game.
     */
    @Test
    void aBinderMadeWithoutAGameShowsUnderNoGameOnceItHoldsTwoGames() {
        String word = token();
        Collector owner = collector("game-follow", "US", STATE);
        String viewer = uniqueUid("game-follow-viewer");
        provisionCompliant(viewer);
        long[] before = counts(viewer, null);
        long[] beforePokemon = counts(viewer, "pokemon");
        long[] beforeYugioh = counts(viewer, "yugioh");
        long[] anonymousPokemon = counts(null, "pokemon");
        long[] anonymousYugioh = counts(null, "yugioh");

        // A private Pokémon card first (the binder takes Pokémon), then a public Yu-Gi-Oh! card.
        IsolatedCard keyCard = isolatedPrinting("ygo-p001a");
        String mixed = publicBinder(owner, null, word + " follow", null, false);
        file(owner, mixed, printing("pkm-p002a"), "PRIVATE");
        file(owner, mixed, keyCard.printingId(), "PUBLIC");
        // A deck core: a Pokémon card, then a Yu-Gi-Oh! key card.
        String mixedCore = publicBinder(owner, null, word + " core", null, true);
        file(owner, mixedCore, printing("pkm-p002a"), "PUBLIC");
        file(owner, mixedCore, keyCard.printingId(), "PRIVATE");
        // Pokémon cards only.
        String pokemonOnly =
                publicBinder(owner, null, word + " holos", printing("pkm-p002a"), false);
        assertThat(gameOf(mixed)).isEqualTo("pokemon");
        assertThat(gameOf(mixedCore)).isEqualTo("pokemon");

        assertThat(counts(viewer, null)).containsExactly(before[0] + 3, before[1] + 1);
        assertThat(counts(viewer, "pokemon"))
                .containsExactly(beforePokemon[0] + 1, beforePokemon[1]);
        assertThat(counts(viewer, "yugioh")).containsExactly(beforeYugioh[0], beforeYugioh[1]);
        assertThat(counts(null, "pokemon"))
                .containsExactly(anonymousPokemon[0] + 1, anonymousPokemon[1]);
        assertThat(counts(null, "yugioh")).containsExactly(anonymousYugioh[0], anonymousYugioh[1]);

        String stateList = "/api/v1/regions/americas-north/subdivisions/" + STATE + "/binders";
        String regionList = "/api/v1/regions/americas-north/binders";
        String cores = "/api/v1/search/deck-cores?cardId={id}&region=americas-north";
        for (String uid : java.util.Arrays.asList(null, viewer)) {
            assertThat(ids(get(uid, 200, stateList + "?q={q}", word)))
                    .containsExactlyInAnyOrder(mixed, mixedCore, pokemonOnly);
            assertThat(ids(get(uid, 200, stateList + "?q={q}&game=pokemon", word)))
                    .containsExactly(pokemonOnly);
            assertThat(ids(get(uid, 200, stateList + "?q={q}&game=yugioh", word))).isEmpty();
            assertThat(ids(get(uid, 200, regionList + "?q={q}&game=pokemon", word)))
                    .containsExactly(pokemonOnly);
            assertThat(ids(get(uid, 200, regionList + "?game=pokemon&limit=50")))
                    .doesNotContain(mixed, mixedCore);
            // The deck core's Yu-Gi-Oh! key card finds it without a game only.
            assertThat(ids(get(uid, 200, regionList + "?q={q}", keyCard.name())))
                    .containsExactly(mixedCore);
            assertThat(ids(get(uid, 200, regionList + "?q={q}&game=pokemon", keyCard.name())))
                    .isEmpty();
            assertThat(ids(get(uid, 200, regionList + "?q={q}&game=yugioh", keyCard.name())))
                    .isEmpty();
        }
        assertThat(coreIds(get(viewer, 200, cores, keyCard.cardId()))).containsExactly(mixedCore);
        assertThat(get(viewer, 200, cores + "&game=pokemon", keyCard.cardId())).isEmpty();
        assertThat(get(viewer, 200, cores + "&game=yugioh", keyCard.cardId())).isEmpty();
    }

    /**
     * A block, either way, keeps the other collector out of the browsed game's counts and lists:
     * binders and deck cores of a state and of the region, the map's counts, the deck cores and
     * holders of a card and the collectors found by name ({@code DiscoverySql.notBlocked} before
     * the limit and in the count, review fix 1, P2).
     */
    @Test
    void blockedCollectorsStayOutOfTheBrowsedGameEitherWay() {
        String word = token();
        Collector owner = collector("game-block", "US", STATE);
        profile(owner, word + " Owner", List.of("pokemon"));
        IsolatedCard card = isolatedPrinting("pkm-p002a");
        String binder = publicBinder(owner, "pokemon", word + " holos", card.printingId(), false);
        String core = publicBinder(owner, "pokemon", word + " core", card.printingId(), true);
        String watcher = uniqueUid("game-block-watcher");
        provisionCompliant(watcher);
        String blocker = uniqueUid("game-block-blocker");
        provisionCompliant(blocker);
        callJson(HttpMethod.POST, "/api/v1/users/" + owner.id() + "/block", blocker, null, 200);
        String blocked = uniqueUid("game-block-blocked");
        provisionCompliant(blocked);
        callJson(
                HttpMethod.POST,
                "/api/v1/users/" + provisionedId(blocked) + "/block",
                owner.uid(),
                null,
                200);

        String stateList =
                "/api/v1/regions/americas-north/subdivisions/" + STATE + "/binders?game=pokemon";
        String regionList = "/api/v1/regions/americas-north/binders?game=pokemon";
        String cores = "/api/v1/search/deck-cores?cardId={id}&region=americas-north&game=pokemon";
        String holders =
                "/api/v1/search/card-holders?cardId={id}&region=americas-north&game=pokemon";
        String collectors =
                "/api/v1/search/collectors?q={q}&region=americas-north&limit=10&game=pokemon";
        long[] seen = counts(watcher, "pokemon");
        assertThat(ids(get(watcher, 200, stateList + "&q={q}", word)))
                .containsExactlyInAnyOrder(binder, core);
        assertThat(ids(get(watcher, 200, regionList + "&q={q}", word)))
                .containsExactlyInAnyOrder(binder, core);
        assertThat(coreIds(get(watcher, 200, cores, card.cardId()))).containsExactly(core);
        assertThat(get(watcher, 200, holders, card.cardId()).path("totalItems").asLong())
                .isEqualTo(2);
        assertThat(handlesOf(get(watcher, 200, collectors, word))).containsExactly(owner.handle());

        for (String viewer : List.of(blocker, blocked)) {
            assertThat(counts(viewer, "pokemon"))
                    .as("the owner's binder and deck core leave the count")
                    .containsExactly(seen[0] - 2, seen[1] - 1);
            assertThat(ids(get(viewer, 200, stateList + "&q={q}", word))).isEmpty();
            assertThat(ids(get(viewer, 200, stateList + "&limit=50"))).doesNotContain(binder, core);
            assertThat(ids(get(viewer, 200, regionList + "&q={q}", word))).isEmpty();
            assertThat(ids(get(viewer, 200, stateList + "&deckCore=true&q={q}", word))).isEmpty();
            assertThat(get(viewer, 200, cores, card.cardId())).isEmpty();
            JsonNode holderPage = get(viewer, 200, holders, card.cardId());
            assertThat(holderPage.path("totalItems").asLong()).isZero();
            assertThat(holderPage.path("items")).isEmpty();
            assertThat(handlesOf(get(viewer, 200, collectors, word))).isEmpty();
        }
    }

    /** Ids of a deck-core answer (an array of binders). */
    private static List<String> coreIds(JsonNode cores) {
        List<String> ids = new ArrayList<>();
        cores.forEach(node -> ids.add(node.path("id").asString()));
        return ids;
    }

    private String provisionedId(String uid) {
        return me(uid).path("id").asString();
    }

    private String gameOf(String binderId) {
        return testUsers
                .query(
                        "SELECT g.slug FROM binder b JOIN game g ON g.id = b.game_id WHERE b.id ="
                                + " ?",
                        UUID.fromString(binderId))
                .get(0)
                .get("slug")
                .toString();
    }

    private static List<String> handlesOf(JsonNode collectors) {
        List<String> handles = new ArrayList<>();
        collectors.forEach(node -> handles.add(node.path("handle").asString()));
        return handles;
    }
}
