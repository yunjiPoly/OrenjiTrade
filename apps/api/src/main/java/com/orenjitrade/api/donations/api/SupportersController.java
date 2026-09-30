package com.orenjitrade.api.donations.api;

import com.orenjitrade.api.donations.api.DonationResponses.SupporterResponse;
import com.orenjitrade.api.donations.api.DonationResponses.SupportersResponse;
import com.orenjitrade.api.donations.domain.DonationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.MediaType;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** {@code GET /api/v1/public/donations/supporters} (public; opt-in display names only). */
@RestController
@Validated
@Tag(name = "donations", description = "Voluntary support (DonationProvider; fake locally)")
public class SupportersController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final DonationService donations;

    public SupportersController(DonationService donations) {
        this.donations = donations;
    }

    @GetMapping(
            path = "/api/v1/public/donations/supporters",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @SecurityRequirements
    @Operation(
            operationId = "listSupporters",
            summary = "Supporters who opted in to public thanks (public)",
            description =
                    "Display names of active members who chose publicThanks, most recent first,"
                            + " with the month of their latest donation; never amounts, notes or"
                            + " handles. Voluntary support never affects ratings, ranking or trust."
                            + " 404 FEATURE_DISABLED while donations is off.")
    @ApiResponse(responseCode = "200", description = "The supporters")
    @ApiResponse(
            responseCode = "404",
            description = "FEATURE_DISABLED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public SupportersResponse supporters(
            @RequestParam(defaultValue = "50") @Min(1) @Max(100) int limit) {
        return new SupportersResponse(
                DonationResponses.LABEL,
                "Donations are voluntary support; they never change ratings, search ranking or"
                        + " trust.",
                donations.supporters(limit).stream().map(SupporterResponse::from).toList());
    }
}
