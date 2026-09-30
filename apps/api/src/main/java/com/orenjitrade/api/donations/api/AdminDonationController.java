package com.orenjitrade.api.donations.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.donations.api.DonationRequests.UpdateSettingsRequest;
import com.orenjitrade.api.donations.api.DonationResponses.AdminDetailResponse;
import com.orenjitrade.api.donations.api.DonationResponses.AdminDonation;
import com.orenjitrade.api.donations.api.DonationResponses.AdminPageResponse;
import com.orenjitrade.api.donations.api.DonationResponses.SettingsResponse;
import com.orenjitrade.api.donations.api.DonationResponses.TotalResponse;
import com.orenjitrade.api.donations.domain.DonationRows.DonationStatus;
import com.orenjitrade.api.donations.domain.DonationService;
import com.orenjitrade.api.donations.domain.DonationService.AdminPage;
import com.orenjitrade.api.donations.domain.DonationSettings;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

/**
 * {@code /api/v1/admin/donations} (ADMIN reads; SUPER_ADMIN refunds and settings, audited). Not
 * feature-flagged.
 */
@RestController
@RequestMapping(path = "/api/v1/admin/donations", produces = MediaType.APPLICATION_JSON_VALUE)
@Validated
@Tag(name = "admin-billing", description = "Admin: subscriptions, credits, ads, donations")
public class AdminDonationController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final DonationService donations;
    private final DonationSettings settings;
    private final JsonMapper jsonMapper;

    public AdminDonationController(
            DonationService donations, DonationSettings settings, JsonMapper jsonMapper) {
        this.donations = donations;
        this.settings = settings;
        this.jsonMapper = jsonMapper;
    }

    @GetMapping
    @Operation(
            operationId = "listAdminDonations",
            summary = "Donations with totals (ADMIN)",
            description = "Newest first; totals of succeeded donations per currency.")
    public AdminPageResponse list(
            @Parameter(description = "Status filter") @RequestParam(required = false)
                    @Nullable DonationStatus status,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        AdminPage result = donations.page(status, page, size);
        PageResponse<AdminDonation> rows =
                new PageResponse<>(
                        result.page().items().stream().map(AdminDonation::from).toList(),
                        result.page().page(),
                        result.page().size(),
                        result.page().totalItems(),
                        result.page().totalPages());
        return new AdminPageResponse(
                rows, result.totals().stream().map(TotalResponse::from).toList());
    }

    @GetMapping("/{id}")
    @Operation(
            operationId = "getAdminDonation",
            summary = "A donation with its provider webhooks (ADMIN)")
    @ApiResponse(responseCode = "200", description = "The donation")
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public AdminDetailResponse get(@PathVariable UUID id) {
        return AdminDetailResponse.from(donations.detail(id), jsonMapper);
    }

    @PostMapping("/{id}/refund")
    @Operation(
            operationId = "refundAdminDonation",
            summary = "Refund a donation (SUPER_ADMIN)",
            description =
                    "Full refund through the provider; 409 unless SUCCEEDED. Audited"
                            + " (donation.refund).")
    @ApiResponse(responseCode = "200", description = "The donation")
    @ApiResponse(
            responseCode = "409",
            description = "CONFLICT",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public AdminDetailResponse refund(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable UUID id) {
        return AdminDetailResponse.from(donations.refund(principal, id), jsonMapper);
    }

    @GetMapping("/settings")
    @Operation(
            operationId = "getAdminDonationSettings",
            summary = "Accepted donation amounts and currencies (ADMIN)")
    public SettingsResponse getSettings() {
        return SettingsResponse.from(settings.current());
    }

    @PutMapping(path = "/settings", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateAdminDonationSettings",
            summary = "Change donation amounts and currencies (SUPER_ADMIN)",
            description =
                    "Absent values are kept; minimum 0.50-1000.00, maximum 1.00-10000.00 (at least"
                            + " the minimum), 1-10 ISO currencies. Audited"
                            + " (donations.settings.update).")
    @ApiResponse(responseCode = "200", description = "The settings")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public SettingsResponse updateSettings(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody UpdateSettingsRequest body) {
        return SettingsResponse.from(
                settings.update(
                        principal,
                        new DonationSettings.Update(
                                body.minAmount(), body.maxAmount(), body.currencies())));
    }
}
