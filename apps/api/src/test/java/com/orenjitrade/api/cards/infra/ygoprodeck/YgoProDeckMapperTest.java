package com.orenjitrade.api.cards.infra.ygoprodeck;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.cards.domain.provider.ProviderCard;
import com.orenjitrade.api.cards.domain.provider.ProviderImage;
import com.orenjitrade.api.cards.domain.provider.ProviderPrinting;
import com.orenjitrade.api.cards.domain.provider.ProviderSet;
import com.orenjitrade.api.cards.domain.provider.SyncResult;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/** Mapping of a YGOPRODeck snapshot to the generic catalog model (fictional fixtures). */
class YgoProDeckMapperTest {

    static final String IMAGES = "http://images.test/cards/";

    static SyncResult result;

    @BeforeAll
    static void map() throws Exception {
        JsonMapper mapper =
                JsonMapper.builder()
                        .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                        .build();
        YgoProDeckDtos.CardInfo info;
        List<YgoProDeckDtos.SetInfo> sets;
        try (InputStream in = resource("ygoprodeck/cardinfo-fixture.json")) {
            info = mapper.readValue(in, YgoProDeckDtos.CardInfo.class);
        }
        try (InputStream in = resource("ygoprodeck/cardsets-fixture.json")) {
            sets = mapper.readValue(in, new TypeReference<List<YgoProDeckDtos.SetInfo>>() {});
        }
        result =
                YgoProDeckMapper.map(
                        "yugioh", IMAGES, info.data(), sets, "147.20", "2026-09-28 00:05:08");
    }

    private static InputStream resource(String name) {
        return YgoProDeckMapperTest.class.getClassLoader().getResourceAsStream(name);
    }

    private static ProviderCard card(String id) {
        return result.cards().stream()
                .filter(c -> c.externalId().equals(id))
                .findFirst()
                .orElseThrow();
    }

    @Test
    void resultCarriesProviderAndVersion() {
        assertThat(result.providerId()).isEqualTo("ygoprodeck");
        assertThat(result.gameSlug()).isEqualTo("yugioh");
        assertThat(result.providerVersion()).isEqualTo("147.20");
        assertThat(result.cards()).hasSize(8);
        assertThat(result.cards()).extracting(ProviderCard::externalId).isSorted();
    }

    @Test
    void setsAreGroupedByCodeWithTheLargestProductAsName() {
        assertThat(result.sets())
                .extracting(ProviderSet::code)
                .containsExactly("ZTPR", "ZTS2", "ZTST", "ZUNU");
        ProviderSet main =
                result.sets().stream()
                        .filter(s -> s.code().equals("ZTST"))
                        .findFirst()
                        .orElseThrow();
        assertThat(main.name()).isEqualTo("Zephyrine Test Set");
        assertThat(main.totalCards()).isEqualTo(60);
        assertThat(main.releaseDate()).isEqualTo(LocalDate.of(2024, 5, 1));
        assertThat(main.metadata().get("products"))
                .isEqualTo(List.of("Zephyrine Test Set", "Zephyrine Test Set: Special Edition"));
        ProviderSet promo =
                result.sets().stream()
                        .filter(s -> s.code().equals("ZTPR"))
                        .findFirst()
                        .orElseThrow();
        assertThat(promo.name()).as("a code absent from cardsets.php").isEqualTo("Test Promo");
    }

    @Test
    void monstersSpellsAndTrapsMapToTheYugiohSchema() {
        ProviderCard dragon = card("900000001");
        assertThat(dragon.name()).isEqualTo("Zephyrine Test Dragon");
        assertThat(dragon.cardType()).isEqualTo("Monster");
        assertThat(dragon.subtype()).isEqualTo("Normal");
        assertThat(dragon.metadata())
                .containsEntry("attribute", "LIGHT")
                .containsEntry("level", 8)
                .containsEntry("atk", 3000)
                .containsEntry("def", 2500)
                .containsEntry("monsterType", "Dragon")
                .containsEntry("archetype", "Zephyrine")
                .containsEntry("frameType", "normal")
                .containsEntry("konamiId", 91001L);

        Map<String, Object> link = card("900000003").metadata();
        assertThat(link).containsEntry("linkRating", 3).doesNotContainKeys("def", "level");
        assertThat(link.get("linkMarkers"))
                .isEqualTo(List.of("Top", "Bottom-Left", "Bottom-Right"));
        assertThat(card("900000003").subtype()).isEqualTo("Link / Effect");
        assertThat(card("900000004").metadata())
                .containsEntry("rank", 4)
                .doesNotContainKey("level");
        assertThat(card("900000005").metadata())
                .containsEntry("pendulumScale", 8)
                .containsEntry("level", 5);

        ProviderCard spell = card("900000006");
        assertThat(spell.cardType()).isEqualTo("Spell");
        assertThat(spell.subtype()).isEqualTo("Field");
        assertThat(spell.metadata())
                .containsEntry("property", "Field")
                .doesNotContainKey("monsterType");
        ProviderCard trap = card("900000007");
        assertThat(trap.cardType()).isEqualTo("Trap");
        assertThat(trap.metadata()).containsEntry("property", "Counter");
    }

    @Test
    void oneArtworkPerImageIdWithTheFirstAsPrimaryAndServerSideSourceUrls() {
        List<ProviderImage> dragon = card("900000001").images();
        assertThat(dragon)
                .extracting(ProviderImage::providerImageId)
                .containsExactly("900000001", "900000011");
        assertThat(dragon.get(0).url()).isEqualTo(IMAGES + "900000001.jpg");
        assertThat(dragon.get(0).kind()).isEqualTo("FRONT");
        assertThat(dragon.get(0).source()).isEqualTo("ygoprodeck");
        assertThat(card("900000007").images()).as("card without artwork").isEmpty();
        assertThat(card("900000008").images()).hasSize(1);
        assertThat(card("900000008").printings()).as("OCG-only card").isEmpty();
    }

    @Test
    void printingsCarryCodeRarityAndPricesAndSkipProviderDataErrors() {
        List<ProviderPrinting> dragon = card("900000001").printings();
        assertThat(dragon)
                .extracting(ProviderPrinting::printingCode)
                .containsExactly("ZTST-EN001", "ZTST-EN001", "ZTS2-EN010");
        ProviderPrinting ultra = dragon.get(0);
        assertThat(ultra.setCode()).isEqualTo("ZTST");
        assertThat(ultra.collectorNumber()).isEqualTo("EN001");
        assertThat(ultra.rarity()).isEqualTo("Ultra Rare");
        assertThat(ultra.edition()).isEqualTo("UNLIMITED");
        assertThat(ultra.language()).isEqualTo("en");
        assertThat(ultra.finish()).isEqualTo("NORMAL");
        assertThat(ultra.externalId()).isEqualTo("900000001:ZTST-EN001:ULTRA_RARE");
        assertThat(ultra.metadata()).containsEntry("rarityCode", "UR").doesNotContainKey("setName");
        assertThat(ultra.marketPrice().amount()).isEqualByComparingTo(new BigDecimal("12.50"));
        assertThat(ultra.marketPrice().currency()).isEqualTo("USD");
        assertThat(ultra.marketPrice().updatedAt())
                .isEqualTo(Instant.parse("2026-09-28T00:05:08Z"));
        ProviderPrinting special = dragon.get(1);
        assertThat(special.rarity()).isEqualTo("Secret Rare");
        assertThat(special.marketPrice()).as("price 0 means unknown").isNull();
        assertThat(special.metadata())
                .containsEntry("setName", "Zephyrine Test Set: Special Edition");

        assertThat(card("900000002").printings())
                .extracting(ProviderPrinting::rarity)
                .as("rarity spellings unified")
                .containsExactly("Super Rare", "Secret Rare");
        assertThat(card("900000006").printings())
                .extracting(ProviderPrinting::printingCode)
                .as("ZTST-EN002 belongs to the earlier card; DB49 is not a printing code")
                .containsExactly("ZTS2-EN006");
        assertThat(String.join("\n", result.warnings()))
                .contains("1 printings with an invalid printing code skipped (e.g. DB49)")
                .contains("1 printings claimed by two cards skipped")
                .contains("1 sets with an invalid set code skipped");
    }

    @Test
    void rarityIdsAreStableCodes() {
        assertThat(YgoProDeckMapper.rarityId("Collector's Rare")).isEqualTo("COLLECTORS_RARE");
        assertThat(YgoProDeckMapper.rarityId("Ultra Rare (Pharaoh's Rare)"))
                .isEqualTo("ULTRA_RARE_PHARAOHS_RARE");
        assertThat(YgoProDeckMapper.rarityId(null)).isEqualTo("NONE");
        assertThat(YgoProDeckMapper.price("abc", Instant.EPOCH)).isNull();
        assertThat(YgoProDeckMapper.parseLastUpdate("not a date")).isNull();
    }
}
