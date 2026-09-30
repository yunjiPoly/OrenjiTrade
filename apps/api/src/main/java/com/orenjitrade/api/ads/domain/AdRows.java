package com.orenjitrade.api.ads.domain;

import com.orenjitrade.api.ads.domain.AdEnums.AdvertiserStatus;
import com.orenjitrade.api.ads.domain.AdEnums.CampaignStatus;
import com.orenjitrade.api.ads.domain.AdEnums.CreativeStatus;
import com.orenjitrade.api.ads.domain.AdEnums.PlacementKey;
import com.orenjitrade.api.ads.domain.AdEnums.PricingModel;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Rows of the advertising tables (V092), read by the ads module only. */
public final class AdRows {

    private AdRows() {}

    /** {@code advertiser}. */
    public record AdvertiserRow(
            UUID id,
            String name,
            @Nullable String contactEmail,
            AdvertiserStatus status,
            Instant createdAt,
            Instant updatedAt) {}

    /** {@code ad_placement}. */
    public record PlacementRow(
            UUID id,
            PlacementKey key,
            String name,
            boolean active,
            int maxAds,
            @Nullable UUID updatedBy,
            Instant updatedAt) {}

    /** {@code ad_campaign} with its advertiser's name. */
    public record CampaignRow(
            UUID id,
            UUID advertiserId,
            String advertiserName,
            String name,
            CampaignStatus status,
            Instant startAt,
            @Nullable Instant endAt,
            BigDecimal budgetTotal,
            @Nullable BigDecimal budgetDaily,
            BigDecimal spent,
            String currency,
            PricingModel pricing,
            BigDecimal bidAmount,
            int priority,
            @Nullable Integer frequencyCapPerDay,
            Instant createdAt,
            Instant updatedAt) {}

    /** {@code ad_creative} with its placement key. */
    public record CreativeRow(
            UUID id,
            UUID campaignId,
            PlacementKey placement,
            String headline,
            String body,
            @Nullable String imageUrl,
            String ctaLabel,
            String landingUrl,
            CreativeStatus status,
            Instant createdAt,
            Instant updatedAt) {}

    /**
     * A servable creative with its campaign's budget and delivery counters.
     *
     * @param creativeId creative
     * @param campaignId campaign
     * @param advertiserName advertiser
     * @param headline headline
     * @param body text
     * @param imageUrl image
     * @param ctaLabel call to action
     * @param budget budget settings
     * @param delivery delivery counters
     * @param priority campaign priority (higher first)
     * @param frequencyCapPerDay impressions per viewer and day, {@code null} = no cap
     */
    public record Candidate(
            UUID creativeId,
            UUID campaignId,
            String advertiserName,
            String headline,
            String body,
            @Nullable String imageUrl,
            String ctaLabel,
            AdPacing.Budget budget,
            AdPacing.Delivery delivery,
            int priority,
            @Nullable Integer frequencyCapPerDay) {}

    /** Counters of a campaign and UTC day. */
    public record DailyRow(LocalDate day, long impressions, long clicks, long conversions) {}
}
