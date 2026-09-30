package com.orenjitrade.api.ads.infra;

import com.orenjitrade.api.ads.domain.AdEnums.AdvertiserStatus;
import com.orenjitrade.api.ads.domain.AdEnums.CampaignStatus;
import com.orenjitrade.api.ads.domain.AdEnums.CreativeStatus;
import com.orenjitrade.api.ads.domain.AdEnums.PlacementKey;
import com.orenjitrade.api.ads.domain.AdEnums.PricingModel;
import com.orenjitrade.api.ads.domain.AdEnums.TargetingKind;
import com.orenjitrade.api.ads.domain.Targeting.Rule;
import com.orenjitrade.api.ads.infra.AdRepository.CampaignValues;
import com.orenjitrade.api.ads.infra.AdRepository.CreativeValues;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.seed.SeedContributor;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Seeds internal campaigns (fictional, local/dev only; stable ids {@code
 * 00000000-0000-4000-a200-...}; inserted once, admin edits are kept): the fictional TCG accessory
 * brand "Maple Sleeve Co." (sleeves for Pokémon and Yu-Gi-Oh! pages, CPM; deck boxes around
 * Montréal, CPC) and an OrenjiTrade house ad for Premium (FLAT, FREE plan and signed-out visitors
 * only). Landing pages use the reserved {@code .example} domain or a web path.
 */
@Component
public class AdSeedContributor implements SeedContributor {

    static final UUID MAPLE = UUID.fromString("00000000-0000-4000-a200-000000000001");
    static final UUID HOUSE = UUID.fromString("00000000-0000-4000-a200-000000000002");
    static final UUID SLEEVES = UUID.fromString("00000000-0000-4000-a200-000000000101");
    static final UUID DECK_BOXES = UUID.fromString("00000000-0000-4000-a200-000000000102");
    static final UUID PREMIUM = UUID.fromString("00000000-0000-4000-a200-000000000103");

    private final AdRepository repository;
    private final TimeProvider timeProvider;

    public AdSeedContributor(AdRepository repository, TimeProvider timeProvider) {
        this.repository = repository;
        this.timeProvider = timeProvider;
    }

    @Override
    public String name() {
        return "ads";
    }

    @Override
    public int order() {
        return ORDER_INTERACTIONS + 72;
    }

    @Override
    @Transactional
    public void seed() {
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.SECONDS);
        Instant start = now.minus(1, ChronoUnit.DAYS);
        repository.insertAdvertiser(
                MAPLE,
                "Maple Sleeve Co.",
                "partners@maplesleeve.example",
                AdvertiserStatus.ACTIVE,
                null,
                now);
        repository.insertAdvertiser(HOUSE, "OrenjiTrade", null, AdvertiserStatus.ACTIVE, null, now);

        if (repository.insertCampaign(
                SLEEVES,
                new CampaignValues(
                        MAPLE,
                        "Matte sleeves (spring)",
                        CampaignStatus.ACTIVE,
                        start,
                        start.plus(90, ChronoUnit.DAYS),
                        new BigDecimal("500.00"),
                        null,
                        "CAD",
                        PricingModel.CPM,
                        new BigDecimal("4.00"),
                        10,
                        5),
                null,
                now)) {
            repository.replaceRules(
                    SLEEVES,
                    List.of(
                            new Rule(TargetingKind.GAME, "pokemon"),
                            new Rule(TargetingKind.GAME, "yugioh")),
                    now);
            creative(
                    "00000000-0000-4000-a200-000000001011",
                    SLEEVES,
                    PlacementKey.SEARCH_SPONSORED,
                    "Matte sleeves that shuffle like new",
                    "Fictional Maple Sleeve Co. matte sleeves for 60-card decks, 100 per box.",
                    "See sleeves",
                    "https://maplesleeve.example/sleeves",
                    now);
            creative(
                    "00000000-0000-4000-a200-000000001012",
                    SLEEVES,
                    PlacementKey.MAP_PANEL,
                    "Protect every pull",
                    "Matte and clear sleeves from the fictional Maple Sleeve Co.",
                    "See sleeves",
                    "https://maplesleeve.example/sleeves",
                    now);
        }

        if (repository.insertCampaign(
                DECK_BOXES,
                new CampaignValues(
                        MAPLE,
                        "Harbour deck boxes (Montréal)",
                        CampaignStatus.ACTIVE,
                        start,
                        start.plus(60, ChronoUnit.DAYS),
                        new BigDecimal("200.00"),
                        new BigDecimal("10.00"),
                        "CAD",
                        PricingModel.CPC,
                        new BigDecimal("0.40"),
                        5,
                        null),
                null,
                now)) {
            repository.replaceRules(
                    DECK_BOXES, List.of(new Rule(TargetingKind.REGION_LABEL, "Montréal")), now);
            creative(
                    "00000000-0000-4000-a200-000000001021",
                    DECK_BOXES,
                    PlacementKey.INVENTORY_SIDEBAR,
                    "Harbour deck boxes",
                    "Magnetic deck boxes for 100 double-sleeved cards (fictional brand).",
                    "Shop deck boxes",
                    "https://maplesleeve.example/deck-boxes",
                    now);
            creative(
                    "00000000-0000-4000-a200-000000001022",
                    DECK_BOXES,
                    PlacementKey.COLLECTOR_PROFILE,
                    "Nine-pocket binders for trade nights",
                    "Side-loading binder pages from the fictional Maple Sleeve Co.",
                    "See binders",
                    "https://maplesleeve.example/binders",
                    now);
        }

        if (repository.insertCampaign(
                PREMIUM,
                new CampaignValues(
                        HOUSE,
                        "OrenjiTrade Premium (house ad)",
                        CampaignStatus.ACTIVE,
                        start,
                        null,
                        BigDecimal.ZERO.setScale(2),
                        null,
                        "CAD",
                        PricingModel.FLAT,
                        BigDecimal.ZERO.setScale(2),
                        0,
                        3),
                null,
                now)) {
            repository.replaceRules(
                    PREMIUM,
                    List.of(
                            new Rule(TargetingKind.PLAN, "FREE"),
                            new Rule(TargetingKind.PLAN, "ANONYMOUS")),
                    now);
            creative(
                    "00000000-0000-4000-a200-000000001031",
                    PREMIUM,
                    PlacementKey.MAP_PANEL,
                    "Search further with Premium",
                    "A 100 km map radius, unlimited binder views and no ads.",
                    "See Premium",
                    "/premium",
                    now);
            creative(
                    "00000000-0000-4000-a200-000000001032",
                    PREMIUM,
                    PlacementKey.MOBILE_FEED,
                    "Unlimited binder views with Premium",
                    "Premium removes the daily binder view limit and the ads.",
                    "See Premium",
                    "/premium",
                    now);
        }
    }

    private void creative(
            String id,
            UUID campaignId,
            PlacementKey placement,
            String headline,
            String body,
            String cta,
            String landing,
            Instant now) {
        repository.insertCreative(
                UUID.fromString(id),
                campaignId,
                new CreativeValues(
                        placement, headline, body, null, cta, landing, CreativeStatus.ACTIVE),
                now);
    }
}
