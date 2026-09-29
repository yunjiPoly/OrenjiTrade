package com.orenjitrade.api.cards.infra;

import com.orenjitrade.api.cards.domain.CatalogImages;
import com.orenjitrade.api.cards.domain.CatalogText;
import com.orenjitrade.api.cards.domain.provider.CardProvider;
import com.orenjitrade.api.cards.domain.provider.ProviderCard;
import com.orenjitrade.api.cards.domain.provider.ProviderImage;
import com.orenjitrade.api.cards.domain.provider.ProviderMarketPrice;
import com.orenjitrade.api.cards.domain.provider.ProviderPrinting;
import com.orenjitrade.api.cards.domain.provider.ProviderSet;
import com.orenjitrade.api.cards.domain.provider.SyncOptions;
import com.orenjitrade.api.cards.domain.provider.SyncResult;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.jspecify.annotations.Nullable;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * Offline {@link CardProvider} serving the fictional fixtures of {@code
 * db/seed/catalog/<game>.json} (profiles {@code local}, {@code dev}, {@code test}): about four sets
 * and forty printings per game with invented names and game-specific metadata. Images are the
 * server-generated placeholders; prices are indicative CAD values dated {@link #PRICES_AS_OF} so
 * repeated imports change nothing. Change tracking does not exist, so incremental syncs return
 * everything.
 */
@Component
@Profile({"local", "dev", "test"})
public class MockCardProvider implements CardProvider {

    public static final String PROVIDER_ID = "mock";

    /** Games with a fixture file, in display order. */
    public static final List<String> GAMES = List.of("yugioh", "pokemon", "mtg", "riftbound");

    static final Instant PRICES_AS_OF = Instant.parse("2026-09-01T00:00:00Z");
    static final String CURRENCY = "CAD";

    private final Map<String, SyncResult> catalogs = new LinkedHashMap<>();

    public MockCardProvider(JsonMapper jsonMapper) {
        for (String game : GAMES) {
            String resource = "db/seed/catalog/" + game + ".json";
            try (InputStream in = new ClassPathResource(resource).getInputStream()) {
                Fixture fixture = jsonMapper.readValue(in, Fixture.class);
                catalogs.put(game, toResult(game, fixture));
            } catch (IOException e) {
                throw new UncheckedIOException("Cannot read " + resource, e);
            }
        }
    }

    @Override
    public String providerId() {
        return PROVIDER_ID;
    }

    @Override
    public Set<String> supportedGameSlugs() {
        return new LinkedHashSet<>(catalogs.keySet());
    }

    @Override
    public List<ProviderCard> searchCards(String gameSlug, String query, int limit) {
        String needle = CatalogText.normalise(query);
        return catalog(gameSlug).cards().stream()
                .filter(card -> CatalogText.normalise(card.name()).contains(needle))
                .limit(Math.max(0, limit))
                .toList();
    }

    @Override
    public Optional<ProviderCard> getCard(String gameSlug, String externalId) {
        return catalog(gameSlug).cards().stream()
                .filter(card -> card.externalId().equals(externalId))
                .findFirst();
    }

    @Override
    public List<ProviderSet> getSets(String gameSlug) {
        return catalog(gameSlug).sets();
    }

    @Override
    public List<ProviderPrinting> getCardPrintings(String gameSlug, String externalCardId) {
        return getCard(gameSlug, externalCardId).map(ProviderCard::printings).orElse(List.of());
    }

    @Override
    public List<ProviderImage> getImages(String gameSlug, String externalPrintingId) {
        return printing(gameSlug, externalPrintingId)
                .map(ProviderPrinting::images)
                .orElse(List.of());
    }

    @Override
    public Optional<ProviderMarketPrice> getMarketPrices(
            String gameSlug, String externalPrintingId) {
        return printing(gameSlug, externalPrintingId).map(ProviderPrinting::marketPrice);
    }

    @Override
    public SyncResult syncCards(String gameSlug, SyncOptions options) {
        return catalog(gameSlug);
    }

    private Optional<ProviderPrinting> printing(String gameSlug, String externalPrintingId) {
        return catalog(gameSlug).cards().stream()
                .flatMap(card -> card.printings().stream())
                .filter(printing -> printing.externalId().equals(externalPrintingId))
                .findFirst();
    }

    private SyncResult catalog(String gameSlug) {
        SyncResult result = catalogs.get(gameSlug);
        if (result == null) {
            throw new IllegalArgumentException("The mock provider has no catalog for " + gameSlug);
        }
        return result;
    }

    private static SyncResult toResult(String game, Fixture fixture) {
        List<ProviderSet> sets =
                fixture.sets().stream()
                        .map(
                                set ->
                                        new ProviderSet(
                                                set.id(),
                                                set.code(),
                                                set.name(),
                                                set.releaseDate(),
                                                set.totalCards(),
                                                set.series(),
                                                set.metadata()))
                        .toList();
        List<ProviderCard> cards =
                fixture.cards().stream()
                        .map(
                                card -> {
                                    String placeholder =
                                            CatalogImages.placeholderPath(
                                                    game, CatalogText.slug(card.name()));
                                    List<ProviderPrinting> printings =
                                            card.printings().stream()
                                                    .map(
                                                            printing ->
                                                                    toPrinting(
                                                                            card.id(),
                                                                            printing,
                                                                            placeholder))
                                                    .toList();
                                    return new ProviderCard(
                                            card.id(),
                                            card.name(),
                                            card.cardType(),
                                            card.subtype(),
                                            card.text(),
                                            card.metadata(),
                                            printings);
                                })
                        .toList();
        return new SyncResult(PROVIDER_ID, game, sets, cards);
    }

    private static ProviderPrinting toPrinting(
            String cardId, FixturePrinting printing, String placeholder) {
        return new ProviderPrinting(
                printing.id(),
                cardId,
                printing.set(),
                printing.number(),
                printing.rarity(),
                printing.edition().toUpperCase(Locale.ROOT),
                printing.language(),
                printing.finish().toUpperCase(Locale.ROOT),
                printing.code(),
                printing.metadata(),
                List.of(
                        new ProviderImage(
                                CatalogImages.KIND_FRONT,
                                placeholder,
                                CatalogImages.PLACEHOLDER_WIDTH,
                                CatalogImages.PLACEHOLDER_HEIGHT,
                                "placeholder")),
                printing.price() == null
                        ? null
                        : new ProviderMarketPrice(printing.price(), CURRENCY, PRICES_AS_OF));
    }

    /** JSON shape of a fixture file. */
    record Fixture(String game, List<FixtureSet> sets, List<FixtureCard> cards) {}

    record FixtureSet(
            String id,
            String code,
            String name,
            @Nullable LocalDate releaseDate,
            @Nullable Integer totalCards,
            @Nullable String series,
            @Nullable Map<String, Object> metadata) {}

    record FixtureCard(
            String id,
            String name,
            @Nullable String cardType,
            @Nullable String subtype,
            String text,
            @Nullable Map<String, Object> metadata,
            List<FixturePrinting> printings) {}

    record FixturePrinting(
            String id,
            String set,
            String number,
            @Nullable String code,
            @Nullable String rarity,
            String edition,
            String language,
            String finish,
            @Nullable BigDecimal price,
            @Nullable Map<String, Object> metadata) {}
}
