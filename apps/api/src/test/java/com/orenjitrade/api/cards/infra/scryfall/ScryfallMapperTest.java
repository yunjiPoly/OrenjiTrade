package com.orenjitrade.api.cards.infra.scryfall;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.cards.domain.provider.ProviderCard;
import com.orenjitrade.api.cards.domain.provider.ProviderImage;
import com.orenjitrade.api.cards.domain.provider.ProviderPrinting;
import com.orenjitrade.api.cards.domain.provider.ProviderSet;
import com.orenjitrade.api.cards.domain.provider.SyncResult;
import com.orenjitrade.api.cards.infra.CardSourceStub;
import java.io.ByteArrayInputStream;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.MappingIterator;
import tools.jackson.databind.json.JsonMapper;

/**
 * Scryfall's "Unique Artwork" bulk file mapped against a hand-written fixture in Scryfall's format:
 * English paper cards only, one card per Oracle id, printings by set code and collector number, the
 * rarities, one image per artwork with each printing on its own artwork. Nothing is fetched.
 */
class ScryfallMapperTest {

    static final String IMAGES = CardSourceStub.SCRYFALL_IMAGE_HOST;
    static final String ARCHIVIST = "0a000000-0000-4000-8000-00000000000a";
    static final String COLOSSUS = "0b000000-0000-4000-8000-00000000000b";

    private SyncResult result;

    @BeforeEach
    void map() {
        JsonMapper mapper = JsonMapper.builder().build();
        try (MappingIterator<ScryfallDtos.Card> cards =
                mapper.readerFor(ScryfallDtos.Card.class)
                        .readValues(
                                new ByteArrayInputStream(CardSourceStub.scryfallFixture(IMAGES)))) {
            result = ScryfallMapper.map("mtg", IMAGES, "normal", cards, "20261020090312");
        }
    }

    private ProviderCard card(String oracleId) {
        return result.cards().stream()
                .filter(card -> card.externalId().equals(oracleId))
                .findFirst()
                .orElseThrow();
    }

    private ProviderCard named(String name) {
        return result.cards().stream()
                .filter(card -> card.name().equals(name))
                .findFirst()
                .orElseThrow();
    }

    @Test
    void keepsEnglishPaperCardsOnlyAndSaysWhatItLeftOut() {
        assertThat(result.providerId()).isEqualTo("scryfall");
        assertThat(result.providerVersion()).isEqualTo("20261020090312");
        assertThat(result.cards())
                .extracting(ProviderCard::name)
                .containsExactlyInAnyOrder(
                        "Zephyrine Archivist",
                        "Emberfall Colossus // Emberfall Ruins",
                        "Quiet Lantern",
                        "Mirror Lantern",
                        "Starforged Relic",
                        "Lumen Vault");
        assertThat(result.cards())
                .extracting(ProviderCard::name)
                .doesNotContain("Pixelbound Sprite", "Spirit Wisp", "Grand Vista");
        assertThat(result.warnings())
                .contains(
                        "1 non-English cards skipped (e.g. Zephyrine Archivist)",
                        "1 digital-only cards skipped (e.g. Pixelbound Sprite)",
                        "2 art series cards, tokens and emblems skipped (e.g. Zephyrine Archivist"
                                + " // Zephyrine Archivist, Spirit Wisp)",
                        "1 oversized cards skipped (e.g. Grand Vista)");
        assertThat(result.sets())
                .extracting(ProviderSet::code)
                .containsExactly("PZTK", "ZCL", "ZTK");
        ProviderSet classics =
                result.sets().stream()
                        .filter(s -> s.code().equals("ZCL"))
                        .findFirst()
                        .orElseThrow();
        assertThat(classics.name()).isEqualTo("Zephyr Classics");
        assertThat(classics.releaseDate()).isEqualTo(LocalDate.of(2026, 3, 13));
        assertThat(classics.externalId()).isEqualTo("5e000000-0000-4000-8000-0000000000a2");
        assertThat(classics.metadata()).containsEntry("setType", "masters");
    }

    @Test
    void oneCardPerOracleIdWithAPrintingPerSetAndNumber() {
        ProviderCard archivist = card(ARCHIVIST);
        assertThat(archivist.cardType()).isEqualTo("Creature");
        assertThat(archivist.subtype()).isEqualTo("Human Wizard");
        assertThat(archivist.text()).isEqualTo("When Zephyrine Archivist enters, draw a card.");
        assertThat(archivist.metadata())
                .containsEntry("manaCost", "{1}{U}")
                .containsEntry("manaValue", 2L)
                .containsEntry("colorIdentity", List.of("U"))
                .containsEntry("typeLine", "Creature — Human Wizard")
                .containsEntry("power", "1")
                .containsEntry("toughness", "3");
        // Newest non-promo printing first; the promo last.
        assertThat(archivist.printings())
                .extracting(ProviderPrinting::printingCode)
                .containsExactly("ZCL-45", "ZTK-12", "PZTK-12P");
        ProviderPrinting classic = archivist.printings().get(0);
        assertThat(classic.externalId()).isEqualTo("5c000000-0000-4000-8000-000000000002");
        assertThat(classic.externalCardId()).isEqualTo(ARCHIVIST);
        assertThat(classic.setCode()).isEqualTo("ZCL");
        assertThat(classic.collectorNumber()).isEqualTo("45");
        assertThat(classic.rarity()).isEqualTo("Rare");
        assertThat(classic.edition()).isEqualTo("UNLIMITED");
        assertThat(classic.language()).isEqualTo("en");
        assertThat(classic.finish()).as("a foil-only printing").isEqualTo("FOIL");
        assertThat(classic.marketPrice()).as("no prices from Scryfall").isNull();
        assertThat(classic.metadata())
                .containsEntry("artist", "Studio Mikan")
                .containsEntry("finishes", List.of("foil"));
        ProviderPrinting original = archivist.printings().get(1);
        assertThat(original.rarity()).isEqualTo("Uncommon");
        assertThat(original.finish()).isEqualTo("NORMAL");
        assertThat(original.metadata()).containsEntry("finishes", List.of("nonfoil", "foil"));
        assertThat(archivist.printings().get(2).metadata()).containsEntry("promo", true);
    }

    @Test
    void mapsEveryRarity() {
        assertThat(named("Quiet Lantern").printings().get(0).rarity()).isEqualTo("Common");
        assertThat(card(COLOSSUS).printings().get(0).rarity()).isEqualTo("Mythic Rare");
        assertThat(named("Starforged Relic").printings().get(0).rarity()).isEqualTo("Special");
        assertThat(named("Lumen Vault").printings().get(0).rarity()).isEqualTo("Bonus");
        assertThat(ScryfallMapper.rarity("timeshifted")).isEqualTo("Timeshifted");
        assertThat(ScryfallMapper.rarity(" ")).isNull();
    }

    @Test
    void oneImagePerArtworkAndEachPrintingOnItsOwn() {
        ProviderCard archivist = card(ARCHIVIST);
        assertThat(archivist.images())
                .extracting(ProviderImage::providerImageId)
                .as("the newest non-promo artwork is the primary one")
                .containsExactly(
                        "1a000000-0000-4000-8000-000000000002",
                        "1a000000-0000-4000-8000-000000000001",
                        "1a000000-0000-4000-8000-000000000003");
        assertThat(archivist.images().get(0).url())
                .isEqualTo(
                        IMAGES
                                + "normal/front/5/c/5c000000-0000-4000-8000-000000000002.jpg"
                                + "?1700000002")
                .doesNotContain("art_crop");
        assertThat(archivist.images()).allMatch(image -> image.source().equals("scryfall"));
        for (ProviderPrinting printing : archivist.printings()) {
            assertThat(printing.images()).hasSize(1);
        }
        assertThat(archivist.printings().get(1).images().get(0).providerImageId())
                .isEqualTo("1a000000-0000-4000-8000-000000000001");

        // A two-faced card: the front face's artwork only.
        ProviderCard colossus = card(COLOSSUS);
        assertThat(colossus.images())
                .extracting(ProviderImage::providerImageId)
                .containsExactly("1a000000-0000-4000-8000-000000000004");
        // No real scan: no artwork, the placeholder shows.
        assertThat(named("Quiet Lantern").images()).isEmpty();
        assertThat(named("Quiet Lantern").printings().get(0).images()).isEmpty();
        // An artwork claimed by a second card stays with the first.
        assertThat(named("Mirror Lantern").images()).isEmpty();
        assertThat(result.warnings())
                .contains(
                        "1 artworks listed by two cards skipped (e.g."
                                + " 1a000000-0000-4000-8000-000000000002)");
        long artworks = result.cards().stream().mapToLong(c -> c.images().size()).sum();
        assertThat(artworks).isEqualTo(6);
    }

    @Test
    void twoFacedCardsAndOddNumbers() {
        ProviderCard colossus = card(COLOSSUS);
        assertThat(colossus.cardType()).isEqualTo("Creature");
        assertThat(colossus.subtype()).isEqualTo("Giant");
        assertThat(colossus.text())
                .isEqualTo(
                        "Trample\nWhen Emberfall Colossus dies, return it transformed.\n//\n{T}:"
                                + " Add {R}.");
        assertThat(colossus.metadata())
                .containsEntry("manaCost", "{3}{R}{R}")
                .containsEntry("manaValue", 5L)
                .containsEntry("power", "6")
                .containsEntry("typeLine", "Creature — Giant // Land");
        ProviderPrinting star = colossus.printings().get(0);
        assertThat(star.collectorNumber()).isEqualTo("★7");
        assertThat(star.printingCode()).as("a code the pattern cannot hold").isNull();
        assertThat(star.metadata()).containsEntry("artist", "Studio Mikan");

        ProviderCard relic = named("Starforged Relic");
        assertThat(relic.cardType()).isEqualTo("Legendary Artifact");
        assertThat(relic.subtype()).isNull();
        assertThat(relic.metadata()).containsEntry("manaValue", 0.5);
        assertThat(relic.printings().get(0).finish()).isEqualTo("ETCHED");
        assertThat(named("Lumen Vault").printings().get(0).printingCode()).isEqualTo("ZCL-S1");
    }

    @Test
    void finishesAndImageAddresses() {
        assertThat(ScryfallMapper.finish(List.of())).isEqualTo("NORMAL");
        assertThat(ScryfallMapper.finish(List.of("foil", "nonfoil"))).isEqualTo("NORMAL");
        assertThat(ScryfallMapper.finish(List.of("glossy"))).isEqualTo("GLOSSY");
        // An image outside the configured host is never kept.
        try (MappingIterator<ScryfallDtos.Card> cards =
                JsonMapper.builder()
                        .build()
                        .readerFor(ScryfallDtos.Card.class)
                        .readValues(
                                new ByteArrayInputStream(CardSourceStub.scryfallFixture(IMAGES)))) {
            SyncResult elsewhere =
                    ScryfallMapper.map("mtg", "https://images.example.test/", "normal", cards, "v");
            assertThat(elsewhere.cards()).allMatch(card -> card.images().isEmpty());
        }
    }
}
