package com.orenjitrade.api.ads.api;

import com.orenjitrade.api.ads.domain.AdEnums.AdvertiserStatus;
import com.orenjitrade.api.ads.domain.AdEnums.CampaignStatus;
import com.orenjitrade.api.ads.domain.AdEnums.ConversionKind;
import com.orenjitrade.api.ads.domain.AdEnums.CreativeStatus;
import com.orenjitrade.api.ads.domain.AdEnums.PlacementKey;
import com.orenjitrade.api.ads.domain.AdEnums.PricingModel;
import com.orenjitrade.api.ads.domain.AdEnums.TargetingKind;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Request bodies of the advertising routes (Phase 10). */
public final class AdRequests {

    private AdRequests() {}

    /** Body of {@code POST /ads/{creativeId}/impression}. */
    @Schema(name = "AdImpressionRequest")
    public record ImpressionRequest(
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "impressionToken of the served ad",
                            maxLength = 1000)
                    @NotBlank
                    @Size(max = 1000)
                    String token) {}

    /** Body of {@code POST/PUT /admin/ads/advertisers}. */
    @Schema(name = "AdvertiserRequest")
    public record AdvertiserRequest(
            @Schema(requiredMode = RequiredMode.REQUIRED, maxLength = 120)
                    @NotBlank
                    @Size(max = 120)
                    String name,
            @Schema(description = "Business contact (admin only)", maxLength = 254) @Size(max = 254)
                    @Nullable String contactEmail,
            @Schema(description = "ACTIVE (default), PAUSED or ARCHIVED")
                    @Nullable AdvertiserStatus status) {}

    /** Body of {@code PUT /admin/ads/placements/{key}}. */
    @Schema(name = "AdPlacementRequest")
    public record PlacementRequest(
            @Schema(requiredMode = RequiredMode.REQUIRED, maxLength = 80) @NotBlank @Size(max = 80)
                    String name,
            @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull Boolean active,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "1") @NotNull @Min(1) @Max(5)
                    Integer maxAds) {}

    /** Body of {@code POST/PUT /admin/ads/campaigns}. */
    @Schema(name = "AdCampaignRequest")
    public record CampaignRequest(
            @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull UUID advertiserId,
            @Schema(requiredMode = RequiredMode.REQUIRED, maxLength = 120)
                    @NotBlank
                    @Size(max = 120)
                    String name,
            @Schema(description = "DRAFT (default), ACTIVE, PAUSED or ENDED")
                    @Nullable CampaignStatus status,
            @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull Instant startAt,
            @Nullable Instant endAt,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "250.00") @NotNull
                    BigDecimal budgetTotal,
            @Schema(example = "10.00") @Nullable BigDecimal budgetDaily,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "CAD")
                    @NotBlank
                    @Size(min = 3, max = 3)
                    String currency,
            @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull PricingModel pricing,
            @Schema(description = "CPM: per 1000 impressions; CPC: per click; ignored for FLAT")
                    @Nullable BigDecimal bidAmount,
            @Schema(example = "10") @Min(0) @Max(100) @Nullable Integer priority,
            @Schema(example = "3") @Min(1) @Max(100) @Nullable Integer frequencyCapPerDay) {}

    /** A targeting rule. */
    @Schema(name = "AdTargetingRule")
    public record RuleRequest(
            @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull TargetingKind kind,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "GAME/TAG slug, REGION_LABEL text (never coordinates),"
                                            + " GEO_CELL id r<row>c<col>, PLAN code or ANONYMOUS",
                            example = "pokemon",
                            maxLength = 120)
                    @NotBlank
                    @Size(max = 120)
                    String value) {}

    /** Body of {@code PUT /admin/ads/campaigns/{id}/targeting}. */
    @Schema(name = "AdTargetingRequest")
    public record TargetingRequest(
            @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull @Size(max = 50)
                    List<@Valid RuleRequest> rules) {}

    /** Body of {@code POST /admin/ads/campaigns/{id}/creatives} and {@code PUT /creatives/{id}}. */
    @Schema(name = "AdCreativeRequest")
    public record CreativeRequest(
            @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull PlacementKey placement,
            @Schema(requiredMode = RequiredMode.REQUIRED, maxLength = 80) @NotBlank @Size(max = 80)
                    String headline,
            @Schema(maxLength = 200) @Size(max = 200) @Nullable String body,
            @Schema(description = "https URL or site path", maxLength = 500) @Size(max = 500)
                    @Nullable String imageUrl,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "Shop now", maxLength = 30)
                    @NotBlank
                    @Size(max = 30)
                    String ctaLabel,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "https URL or site path",
                            maxLength = 500)
                    @NotBlank
                    @Size(max = 500)
                    String landingUrl,
            @Schema(description = "DRAFT (default), ACTIVE, PAUSED or ARCHIVED")
                    @Nullable CreativeStatus status) {}

    /** Body of {@code POST /internal/ads/clicks/{clickId}/conversions}. */
    @Schema(name = "AdConversionRequest")
    public record ConversionRequest(
            @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull ConversionKind kind,
            @Schema(example = "4.99") @Nullable BigDecimal value,
            @Schema(example = "CAD") @Size(min = 3, max = 3) @Nullable String currency) {}
}
