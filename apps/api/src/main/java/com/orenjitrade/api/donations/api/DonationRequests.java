package com.orenjitrade.api.donations.api;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;
import org.jspecify.annotations.Nullable;

/** Request bodies of the donation routes (Phase 10). */
public final class DonationRequests {

    private DonationRequests() {}

    /** Body of {@code POST /donations/checkout}. */
    @Schema(name = "DonationCheckoutRequest")
    public record CheckoutRequest(
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Within donations.min_amount..max_amount",
                            example = "10.00")
                    @NotNull
                    @DecimalMin("0.01")
                    @Digits(integer = 10, fraction = 2)
                    BigDecimal amount,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "One of donations.currencies",
                            example = "CAD")
                    @NotBlank
                    @Size(min = 3, max = 3)
                    String currency,
            @Schema(description = "Optional note to the team (never public)", maxLength = 280)
                    @Size(max = 280)
                    @Nullable String message,
            @Schema(description = "List my display name among the supporters (default false)")
                    @Nullable Boolean publicThanks) {}

    /** Optional body of {@code POST /donations/fake/{ref}/confirm}. */
    @Schema(name = "FakeDonationConfirmRequest")
    public record FakeConfirmRequest(
            @Schema(description = "SUCCEEDED (default) or FAILED", example = "SUCCEEDED")
                    @Size(max = 16)
                    @Nullable String outcome) {}

    /** Body of {@code PUT /admin/donations/settings} (absent values are kept). */
    @Schema(name = "UpdateDonationSettingsRequest")
    public record UpdateSettingsRequest(
            @Schema(example = "2.00") @Digits(integer = 10, fraction = 2)
                    @Nullable BigDecimal minAmount,
            @Schema(example = "500.00") @Digits(integer = 10, fraction = 2)
                    @Nullable BigDecimal maxAmount,
            @Schema(example = "[\"CAD\",\"USD\"]") @Size(max = 10)
                    @Nullable List<@NotBlank @Size(min = 3, max = 3) String> currencies) {}
}
