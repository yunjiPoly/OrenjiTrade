package com.orenjitrade.api.delisting.api;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.jspecify.annotations.Nullable;

/**
 * Body of {@code PUT /api/v1/admin/delist-policies/{id}}: full replacement of the thresholds
 * (ordering {@code aging < stale < hidden} and {@code warn < hidden} is checked by the service).
 *
 * @param name new display name; unchanged when omitted
 * @param agingAfterDays first day of AGING
 * @param staleAfterDays first day of STALE
 * @param hiddenAfterDays first day of HIDDEN
 * @param warnBeforeHiddenDays warning lead time before hiding
 * @param maxStrikes unresponsiveness strikes before listings are paused; unchanged when omitted
 */
@Schema(name = "UpdateDelistPolicyRequest", description = "New freshness thresholds (days)")
public record UpdateDelistPolicyRequest(
        @Size(max = 80) @Nullable String name,
        @NotNull @Min(1) @Max(3650) @Schema(example = "15") Integer agingAfterDays,
        @NotNull @Min(2) @Max(3650) @Schema(example = "31") Integer staleAfterDays,
        @NotNull @Min(3) @Max(3650) @Schema(example = "46") Integer hiddenAfterDays,
        @NotNull @Min(0) @Max(3649) @Schema(example = "5") Integer warnBeforeHiddenDays,
        @Min(1) @Max(100) @Schema(example = "3") @Nullable Integer maxStrikes) {}
