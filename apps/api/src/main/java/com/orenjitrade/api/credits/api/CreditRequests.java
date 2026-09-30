package com.orenjitrade.api.credits.api;

import com.orenjitrade.api.credits.domain.AdminCreditReason;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Request bodies of the credits routes (Phase 10). */
public final class CreditRequests {

    private CreditRequests() {}

    /** Body of {@code POST /me/credits/spend}. */
    @Schema(name = "CreditSpendRequest")
    public record SpendRequest(
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Credit product key (see products of GET /me/credits)",
                            example = "premium_search_day",
                            maxLength = 40)
                    @NotBlank
                    @Size(max = 40)
                    String featureKey,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "Client-generated key; a retry with the same key returns the"
                                            + " original result without spending again",
                            example = "3f0f5d8e-4c1e-4a55-9f9e-5b1e0b0c2d11",
                            maxLength = 100)
                    @NotBlank
                    @Size(max = 100)
                    @Pattern(regexp = "^[A-Za-z0-9._:-]+$")
                    String idempotencyKey) {}

    /** Body of {@code POST /me/referrals/redeem}. */
    @Schema(name = "ReferralRedeemRequest")
    public record RedeemRequest(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "COLLECTOR1", maxLength = 32)
                    @NotBlank
                    @Size(max = 32)
                    String code) {}

    /** Body of {@code POST /admin/credits/grant}. */
    @Schema(name = "AdminCreditGrantRequest")
    public record GrantRequest(
            @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull UUID userId,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "Positive: GRANT; negative: ADJUST (never below a balance of"
                                            + " 0); never 0",
                            example = "100")
                    @NotNull
                    @Min(-100_000)
                    @Max(100_000)
                    Integer amount,
            @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull AdminCreditReason reason,
            @Schema(description = "Internal note (admin views only)", maxLength = 500)
                    @Size(max = 500)
                    @Nullable String note) {}

    /** Body of {@code PUT /admin/credits/products/{key}}. */
    @Schema(name = "UpdateCreditProductRequest")
    public record UpdateProductRequest(
            @Schema(requiredMode = RequiredMode.REQUIRED, maxLength = 80) @NotBlank @Size(max = 80)
                    String name,
            @Schema(maxLength = 500) @Size(max = 500) @Nullable String description,
            @Schema(
                            description =
                                    "Entitlement value: true/false for features, a number or"
                                            + " unlimited for limits",
                            maxLength = 200)
                    @Size(max = 200)
                    @Nullable String featureValue,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "50")
                    @NotNull
                    @Min(1)
                    @Max(100_000)
                    Integer cost,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "24") @NotNull @Min(1) @Max(720)
                    Integer durationHours,
            @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull Boolean active,
            @Schema(example = "10") @Min(0) @Max(10_000) @Nullable Integer sortOrder) {}

    /** Body of {@code PUT /admin/credits/settings} (absent values are kept). */
    @Schema(name = "UpdateCreditSettingsRequest")
    public record UpdateSettingsRequest(
            @Schema(example = "100") @Nullable Integer referrerReward,
            @Schema(example = "50") @Nullable Integer refereeReward,
            @Schema(example = "30") @Nullable Integer maxAccountAgeDays,
            @Schema(example = "50") @Nullable Integer maxPerReferrer) {}
}
