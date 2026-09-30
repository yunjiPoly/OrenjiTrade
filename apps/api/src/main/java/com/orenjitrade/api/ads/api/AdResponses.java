package com.orenjitrade.api.ads.api;

import com.orenjitrade.api.ads.domain.AdAdminService.CampaignDetail;
import com.orenjitrade.api.ads.domain.AdAdminService.CampaignStats;
import com.orenjitrade.api.ads.domain.AdEnums.AdvertiserStatus;
import com.orenjitrade.api.ads.domain.AdEnums.CampaignStatus;
import com.orenjitrade.api.ads.domain.AdEnums.CreativeStatus;
import com.orenjitrade.api.ads.domain.AdEnums.PlacementKey;
import com.orenjitrade.api.ads.domain.AdEnums.PricingModel;
import com.orenjitrade.api.ads.domain.AdEnums.TargetingKind;
import com.orenjitrade.api.ads.domain.AdRows.AdvertiserRow;
import com.orenjitrade.api.ads.domain.AdRows.CampaignRow;
import com.orenjitrade.api.ads.domain.AdRows.CreativeRow;
import com.orenjitrade.api.ads.domain.AdRows.DailyRow;
import com.orenjitrade.api.ads.domain.AdRows.PlacementRow;
import com.orenjitrade.api.ads.domain.AdService;
import com.orenjitrade.api.ads.domain.AdService.ServedAdWithToken;
import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Response bodies of the advertising routes (Phase 10). */
public final class AdResponses {

    private AdResponses() {}

    /**
     * An ad as served. Always labelled "Sponsored".
     *
     * @param creativeId the creative (impression and click routes)
     * @param placement where it is shown
     * @param sponsored always true
     * @param label always "Sponsored"
     * @param advertiser advertiser name
     * @param headline headline
     * @param body text
     * @param imageUrl optional image
     * @param ctaLabel call to action
     * @param clickUrl API path to open on click (records the click, 302 to the landing page)
     * @param impressionToken token for {@code POST /ads/{creativeId}/impression}
     */
    @Schema(name = "Ad", description = "A sponsored placement (always labelled Sponsored)")
    public record AdResponse(
            UUID creativeId,
            PlacementKey placement,
            boolean sponsored,
            @Schema(example = "Sponsored") String label,
            @Schema(example = "Maple Sleeve Co.") String advertiser,
            String headline,
            String body,
            @Nullable String imageUrl,
            @Schema(example = "Shop sleeves") String ctaLabel,
            @Schema(example = "/api/v1/ads/7c9e.../click?token=v1...") String clickUrl,
            String impressionToken) {

        static AdResponse from(ServedAdWithToken served) {
            var ad = served.ad();
            return new AdResponse(
                    ad.creativeId(),
                    ad.placement(),
                    true,
                    AdService.SPONSORED,
                    ad.advertiserName(),
                    ad.headline(),
                    ad.body(),
                    ad.imageUrl(),
                    ad.ctaLabel(),
                    "/api/v1/ads/"
                            + ad.creativeId()
                            + "/click?token="
                            + URLEncoder.encode(served.token(), StandardCharsets.UTF_8),
                    served.token());
        }
    }

    /** An advertiser (admin). */
    @Schema(name = "AdminAdvertiser", description = "An advertiser (admin view)")
    public record AdvertiserResponse(
            UUID id,
            String name,
            @Nullable String contactEmail,
            AdvertiserStatus status,
            Instant createdAt,
            Instant updatedAt) {

        static AdvertiserResponse from(AdvertiserRow row) {
            return new AdvertiserResponse(
                    row.id(),
                    row.name(),
                    row.contactEmail(),
                    row.status(),
                    row.createdAt(),
                    row.updatedAt());
        }
    }

    /** A placement (admin). */
    @Schema(name = "AdminAdPlacement", description = "An ad placement (admin view)")
    public record PlacementResponse(
            PlacementKey key, String name, boolean active, int maxAds, Instant updatedAt) {

        static PlacementResponse from(PlacementRow row) {
            return new PlacementResponse(
                    row.key(), row.name(), row.active(), row.maxAds(), row.updatedAt());
        }
    }

    /** A campaign (admin). */
    @Schema(name = "AdminAdCampaign", description = "An ad campaign (admin view)")
    public record CampaignResponse(
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
            BigDecimal remainingBudget,
            String currency,
            PricingModel pricing,
            BigDecimal bidAmount,
            int priority,
            @Nullable Integer frequencyCapPerDay,
            Instant createdAt,
            Instant updatedAt) {

        static CampaignResponse from(CampaignRow row) {
            return new CampaignResponse(
                    row.id(),
                    row.advertiserId(),
                    row.advertiserName(),
                    row.name(),
                    row.status(),
                    row.startAt(),
                    row.endAt(),
                    row.budgetTotal(),
                    row.budgetDaily(),
                    row.spent(),
                    row.budgetTotal().subtract(row.spent()).max(BigDecimal.ZERO),
                    row.currency(),
                    row.pricing(),
                    row.bidAmount(),
                    row.priority(),
                    row.frequencyCapPerDay(),
                    row.createdAt(),
                    row.updatedAt());
        }
    }

    /** A creative (admin). */
    @Schema(name = "AdminAdCreative", description = "An ad creative (admin view)")
    public record CreativeResponse(
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
            Instant updatedAt) {

        static CreativeResponse from(CreativeRow row) {
            return new CreativeResponse(
                    row.id(),
                    row.campaignId(),
                    row.placement(),
                    row.headline(),
                    row.body(),
                    row.imageUrl(),
                    row.ctaLabel(),
                    row.landingUrl(),
                    row.status(),
                    row.createdAt(),
                    row.updatedAt());
        }
    }

    /** A targeting rule. */
    @Schema(name = "AdTargeting", description = "A targeting rule")
    public record RuleResponse(TargetingKind kind, String value) {}

    /** Delivery counters. */
    @Schema(name = "AdDeliveryTotals", description = "Impressions, clicks and conversions")
    public record TotalsResponse(
            long impressions,
            long clicks,
            long conversions,
            @Schema(description = "Click-through rate in percent, 2 decimals", example = "1.25")
                    BigDecimal ctrPercent) {

        static TotalsResponse from(DailyRow row) {
            return new TotalsResponse(row.impressions(), row.clicks(), row.conversions(), ctr(row));
        }
    }

    /** A campaign with its creatives, targeting and totals (admin). */
    @Schema(name = "AdminAdCampaignDetail", description = "An ad campaign with everything")
    public record CampaignDetailResponse(
            CampaignResponse campaign,
            List<CreativeResponse> creatives,
            List<RuleResponse> targeting,
            TotalsResponse totals) {

        static CampaignDetailResponse from(CampaignDetail detail) {
            return new CampaignDetailResponse(
                    CampaignResponse.from(detail.campaign()),
                    detail.creatives().stream().map(CreativeResponse::from).toList(),
                    detail.targeting().stream()
                            .map(rule -> new RuleResponse(rule.kind(), rule.value()))
                            .toList(),
                    TotalsResponse.from(detail.totals()));
        }
    }

    /** One day of delivery. */
    @Schema(name = "AdDailyStats", description = "Delivery of a campaign on one UTC day")
    public record DailyResponse(
            LocalDate day,
            long impressions,
            long clicks,
            long conversions,
            BigDecimal ctrPercent,
            BigDecimal spent) {}

    /** {@code GET /admin/ads/campaigns/{id}/stats}. */
    @Schema(name = "AdCampaignStats", description = "Delivery statistics of a campaign")
    public record StatsResponse(
            UUID campaignId,
            CampaignStatus status,
            PricingModel pricing,
            String currency,
            BigDecimal budgetTotal,
            BigDecimal spent,
            BigDecimal remainingBudget,
            TotalsResponse totals,
            LocalDate from,
            LocalDate to,
            List<DailyResponse> daily) {

        static StatsResponse from(CampaignStats stats) {
            CampaignRow campaign = stats.campaign();
            return new StatsResponse(
                    campaign.id(),
                    campaign.status(),
                    campaign.pricing(),
                    campaign.currency(),
                    campaign.budgetTotal(),
                    campaign.spent(),
                    campaign.budgetTotal().subtract(campaign.spent()).max(BigDecimal.ZERO),
                    TotalsResponse.from(stats.totals()),
                    stats.from(),
                    stats.to(),
                    stats.daily().stream()
                            .map(
                                    day ->
                                            new DailyResponse(
                                                    day.day(),
                                                    day.impressions(),
                                                    day.clicks(),
                                                    day.conversions(),
                                                    ctr(day),
                                                    stats.spend(day)))
                            .toList());
        }
    }

    /** {@code POST /internal/ads/clicks/{clickId}/conversions}. */
    @Schema(name = "AdConversionResult")
    public record ConversionResponse(
            @Schema(description = "false when this click already converted with this kind")
                    boolean recorded) {}

    /** Click-through rate in percent with two decimals. */
    static BigDecimal ctr(DailyRow row) {
        if (row.impressions() == 0) {
            return BigDecimal.ZERO.setScale(2);
        }
        return BigDecimal.valueOf(row.clicks() * 100L)
                .divide(BigDecimal.valueOf(row.impressions()), 2, RoundingMode.HALF_UP);
    }
}
