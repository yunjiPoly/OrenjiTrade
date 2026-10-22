package com.orenjitrade.api.cards.infra.tcgdex;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.cards.domain.provider.ProviderCard;
import com.orenjitrade.api.cards.domain.provider.ProviderImage;
import com.orenjitrade.api.cards.domain.provider.ProviderPrinting;
import com.orenjitrade.api.cards.domain.provider.ProviderSet;
import com.orenjitrade.api.cards.domain.provider.SyncResult;
import com.orenjitrade.api.cards.infra.CardSourceStub;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;

/**
 * TCGdex's card database mapped from an archive of hand-written fixtures in the repository's format
 * (TypeScript files per serie, set and card): English cards only, Pokémon TCG Pocket left out, one
 * card per English name with a printing per set and number, the rarities as written, one image per
 * printing. Nothing is fetched.
 */
class TcgdexMapperTest {

    static final String ASSETS = "https://assets.tcgdex.net/";

    @TempDir Path dir;

    private SyncResult result;
    private String license;

    @BeforeEach
    void map() throws Exception {
        Path zip = dir.resolve("cards-database.zip");
        Files.write(zip, CardSourceStub.tcgdexArchive(CardSourceStub.TCGDEX_SHA));
        TcgdexMapper.Builder builder =
                new TcgdexMapper.Builder("pokemon", ASSETS, "high.jpg", Set.of("tcgp"));
        license = TcgdexArchive.read(zip, JsonMapper.builder().build(), builder);
        result = builder.build(CardSourceStub.TCGDEX_SHA);
    }

    private ProviderCard named(String name) {
        return result.cards().stream()
                .filter(card -> card.name().equals(name))
                .findFirst()
                .orElseThrow();
    }

    @Test
    void englishCardsOnlyAndTheLicenceKept() {
        assertThat(license).startsWith("MIT License");
        assertThat(result.providerId()).isEqualTo("tcgdex");
        assertThat(result.providerVersion()).isEqualTo(CardSourceStub.TCGDEX_SHA);
        assertThat(result.cards())
                .extracting(ProviderCard::name)
                .containsExactly("Emberhound ex", "Emberpup", "Professor’s Notes", "Spark Energy");
        assertThat(result.warnings())
                .contains(
                        "1 sets without an English name skipped (e.g. tst0)",
                        "1 data files that could not be read skipped (e.g."
                                + " data/Test Era/Zephyr Skies/103.ts)",
                        "1 cards of excluded series (digital games) skipped (e.g. Emberpup)");
        assertThat(result.warnings())
                .anyMatch(w -> w.startsWith("2 cards without an English name skipped"));
        // data-asia/ is not read; no printing of the Pocket set or the French-only set.
        assertThat(result.cards().stream().flatMap(c -> c.printings().stream()))
                .extracting(ProviderPrinting::setCode)
                .doesNotContain("PA", "TST0");
    }

    @Test
    void setsTakeTheirOfficialAbbreviationWhenItIsUsable() {
        assertThat(result.sets())
                .extracting(ProviderSet::code)
                .containsExactly("EMR", "TST25", "ZSK");
        ProviderSet ember = result.sets().get(0);
        assertThat(ember.externalId()).isEqualTo("tst2");
        assertThat(ember.name()).isEqualTo("Ember Rise");
        assertThat(ember.releaseDate()).as("the English date").isEqualTo(LocalDate.of(2026, 3, 13));
        assertThat(ember.totalCards()).isEqualTo(98);
        assertThat(ember.series()).isEqualTo("Test Era");
        assertThat(ember.metadata())
                .containsEntry("tcgdexId", "tst2")
                .containsEntry("abbreviation", "EMR");
        assertThat(result.sets().get(1).metadata()).containsEntry("tcgdexId", "tst2.5");
        assertThat(TcgdexMapper.fallbackCode("sv03.5")).isEqualTo("SV035");
    }

    @Test
    void oneCardPerEnglishNameWithAPrintingPerSetAndNumber() {
        ProviderCard pup = named("Emberpup");
        assertThat(pup.externalId()).isEqualTo("name:Emberpup");
        assertThat(pup.cardType()).isEqualTo("Pokémon");
        assertThat(pup.subtype()).isEqualTo("Basic");
        assertThat(pup.printings())
                .as("newest set first")
                .extracting(ProviderPrinting::printingCode)
                .containsExactly("TST25-007", "EMR-014", "ZSK-001");
        assertThat(pup.printings())
                .extracting(ProviderPrinting::externalId)
                .containsExactly("tst2.5-007", "tst2-014", "tst1-001");
        assertThat(pup.printings())
                .extracting(ProviderPrinting::rarity)
                .containsExactly("Promo", "Uncommon", "Common");
        assertThat(pup.printings())
                .extracting(ProviderPrinting::finish)
                .containsExactly("HOLO", "HOLO", "NORMAL");
        ProviderPrinting first = pup.printings().get(2);
        assertThat(first.collectorNumber()).isEqualTo("001");
        assertThat(first.language()).isEqualTo("en");
        assertThat(first.edition()).isEqualTo("UNLIMITED");
        assertThat(first.marketPrice()).isNull();
        assertThat(first.metadata())
                .containsEntry("illustrator", "Atelier Orenji")
                .containsEntry("regulationMark", "G")
                .containsEntry("variants", List.of("normal", "reverse"));
        // The card's game data is its newest printing's.
        assertThat(pup.metadata())
                .containsEntry("hp", 70)
                .containsEntry("types", List.of("Fire"))
                .containsEntry("stage", "Basic");

        ProviderCard hound = named("Emberhound ex");
        assertThat(hound.subtype()).isEqualTo("Stage 1");
        assertThat(hound.metadata())
                .containsEntry("stage", "Stage 1")
                .containsEntry("hp", 260)
                .containsEntry("weakness", "Water");
        assertThat(hound.text())
                .isEqualTo(
                        "Ability: Heat Shield\nPrevent all damage done to this Pokémon by attacks"
                                + " from Water Pokémon.\n\n[Fire, Fire] Blaze Fang 160");
        assertThat(hound.printings().get(0).printingCode()).isEqualTo("EMR-TG05");
        assertThat(hound.printings().get(0).rarity()).isEqualTo("Double rare");
        assertThat(hound.printings().get(0).finish()).as("variants as a list").isEqualTo("HOLO");

        // Typographic and straight apostrophes are one name.
        ProviderCard notes = named("Professor’s Notes");
        assertThat(notes.externalId()).isEqualTo("name:Professor's Notes");
        assertThat(notes.cardType()).isEqualTo("Trainer");
        assertThat(notes.subtype()).isEqualTo("Supporter");
        assertThat(notes.text()).isEqualTo("Draw 3 cards.");
        assertThat(notes.printings())
                .extracting(ProviderPrinting::printingCode)
                .containsExactly("EMR-150", "ZSK-100");

        ProviderCard energy = named("Spark Energy");
        assertThat(energy.cardType()).isEqualTo("Energy");
        assertThat(energy.subtype()).isEqualTo("Special");
        assertThat(energy.text()).isEqualTo("This card provides 1 {L} Energy. /* not a comment */");
        assertThat(energy.printings().get(0).rarity()).as("None is no rarity").isNull();
    }

    @Test
    void oneImagePerPrintingOnTheAssetHost() {
        ProviderCard pup = named("Emberpup");
        assertThat(pup.images())
                .extracting(ProviderImage::providerImageId)
                .containsExactly("tst2.5-007", "tst2-014", "tst1-001");
        assertThat(pup.images().get(0).url()).isEqualTo(ASSETS + "en/tst/tst2.5/007/high.jpg");
        assertThat(pup.images()).allMatch(image -> image.source().equals("tcgdex"));
        for (ProviderPrinting printing : pup.printings()) {
            assertThat(printing.images()).hasSize(1);
            assertThat(printing.images().get(0).providerImageId()).isEqualTo(printing.externalId());
        }
        long images = result.cards().stream().mapToLong(c -> c.images().size()).sum();
        long printings = result.cards().stream().mapToLong(c -> c.printings().size()).sum();
        assertThat(images).isEqualTo(printings).isEqualTo(7);
    }

    @Test
    void stagesFinishesAndRarities() {
        assertThat(TcgdexMapper.stage("Stage2")).isEqualTo("Stage 2");
        assertThat(TcgdexMapper.stage("VMAX")).isEqualTo("VMAX");
        assertThat(TcgdexMapper.finish(List.of("reverse"))).isEqualTo("REVERSE_HOLO");
        assertThat(TcgdexMapper.finish(List.of())).isEqualTo("NORMAL");
        assertThat(TcgdexMapper.rarity("none")).isNull();
        assertThat(TcgdexMapper.nameKey("Professor’s  Notes ")).isEqualTo("Professor's Notes");
    }
}
