package com.orenjitrade.api.ads.infra;

import com.orenjitrade.api.ads.domain.AdContext;
import com.orenjitrade.api.ads.domain.AdEnums.PlacementKey;
import com.orenjitrade.api.ads.domain.AdPacing;
import com.orenjitrade.api.ads.domain.AdPacing.Decision;
import com.orenjitrade.api.ads.domain.AdProvider;
import com.orenjitrade.api.ads.domain.AdRows.Candidate;
import com.orenjitrade.api.ads.domain.AdRows.PlacementRow;
import com.orenjitrade.api.ads.domain.Targeting;
import com.orenjitrade.api.ads.domain.Targeting.Rule;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * The internal campaign provider: active creatives of the placement whose campaign (ACTIVE, inside
 * its schedule, advertiser ACTIVE) matches the {@link Targeting} rules, passes {@link AdPacing}
 * (total, daily and intraday budget) and the per-viewer daily frequency cap; ranked by priority,
 * then by pace (behind schedule first), then randomly; one creative per campaign, at most the
 * placement's {@code max_ads}. Impressions and clicks are recorded once per serve and update the
 * daily counters and the campaign's derived spend.
 */
@Component
public class InternalCampaignAdProvider implements AdProvider {

    public static final String ID = "internal";

    private final AdRepository repository;

    public InternalCampaignAdProvider(AdRepository repository) {
        this.repository = repository;
    }

    @Override
    public String providerId() {
        return ID;
    }

    @Override
    @Transactional(readOnly = true)
    public List<ServedAd> selectAds(PlacementKey placement, AdContext context) {
        Optional<PlacementRow> slot = repository.placement(placement);
        if (slot.isEmpty() || !slot.get().active()) {
            return List.of();
        }
        List<Candidate> candidates = repository.candidates(placement, context.now());
        if (candidates.isEmpty()) {
            return List.of();
        }
        Set<UUID> campaignIds = new LinkedHashSet<>();
        candidates.forEach(candidate -> campaignIds.add(candidate.campaignId()));
        Map<UUID, List<Rule>> rules = repository.rules(campaignIds);
        Map<UUID, Long> seenToday =
                context.userHash() == null
                        ? Map.of()
                        : repository.impressionsSince(
                                campaignIds,
                                context.userHash(),
                                context.now().truncatedTo(ChronoUnit.DAYS));

        List<Ranked> eligible = new ArrayList<>();
        for (Candidate candidate : candidates) {
            if (!Targeting.matches(
                    rules.getOrDefault(candidate.campaignId(), List.of()), context)) {
                continue;
            }
            Integer cap = candidate.frequencyCapPerDay();
            if (cap != null && seenToday.getOrDefault(candidate.campaignId(), 0L) >= cap) {
                continue;
            }
            Decision decision =
                    AdPacing.decide(candidate.budget(), candidate.delivery(), context.now());
            if (decision.eligible()) {
                eligible.add(new Ranked(candidate, decision.pace()));
            }
        }
        Collections.shuffle(eligible, ThreadLocalRandom.current());
        eligible.sort(
                Comparator.comparingInt((Ranked ranked) -> -ranked.candidate().priority())
                        .thenComparingDouble(Ranked::pace));
        Map<UUID, ServedAd> chosen = new LinkedHashMap<>();
        for (Ranked ranked : eligible) {
            Candidate candidate = ranked.candidate();
            if (chosen.size() >= slot.get().maxAds()) {
                break;
            }
            chosen.putIfAbsent(
                    candidate.campaignId(),
                    new ServedAd(
                            candidate.creativeId(),
                            candidate.campaignId(),
                            placement,
                            candidate.advertiserName(),
                            candidate.headline(),
                            candidate.body(),
                            candidate.imageUrl(),
                            candidate.ctaLabel()));
        }
        return List.copyOf(chosen.values());
    }

    @Override
    @Transactional
    public boolean recordImpression(Delivery delivery) {
        Optional<UUID> campaign = repository.campaignOfCreative(delivery.creativeId());
        if (campaign.isEmpty() || !repository.insertImpression(delivery, campaign.get())) {
            return false;
        }
        repository.bumpDaily(campaign.get(), day(delivery.at()), 1, 0, 0);
        repository.refreshSpent(campaign.get(), delivery.at());
        return true;
    }

    @Override
    @Transactional
    public boolean recordClick(Delivery delivery) {
        Optional<UUID> campaign = repository.campaignOfCreative(delivery.creativeId());
        if (campaign.isEmpty() || !repository.insertClick(delivery, campaign.get())) {
            return false;
        }
        repository.bumpDaily(campaign.get(), day(delivery.at()), 0, 1, 0);
        repository.refreshSpent(campaign.get(), delivery.at());
        return true;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<String> landingUrl(UUID creativeId) {
        return repository.landingUrl(creativeId);
    }

    private static LocalDate day(Instant at) {
        return LocalDate.ofInstant(at, ZoneOffset.UTC);
    }

    private record Ranked(Candidate candidate, double pace) {}
}
