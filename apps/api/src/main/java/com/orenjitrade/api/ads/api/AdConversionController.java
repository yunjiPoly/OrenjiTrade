package com.orenjitrade.api.ads.api;

import com.orenjitrade.api.ads.api.AdRequests.ConversionRequest;
import com.orenjitrade.api.ads.api.AdResponses.ConversionResponse;
import com.orenjitrade.api.ads.domain.AdAdminService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code POST /internal/ads/clicks/{clickId}/conversions} (service token / Google OIDC): records a
 * conversion of a recorded click (house campaigns, partner postbacks), once per click and kind.
 */
@RestController
@Tag(name = "internal", description = "Internal job triggers (service token / Google OIDC)")
public class AdConversionController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final AdAdminService admin;

    public AdConversionController(AdAdminService admin) {
        this.admin = admin;
    }

    @PostMapping(
            path = "/internal/ads/clicks/{clickId}/conversions",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "recordAdConversion",
            summary = "Record a conversion of an ad click (service auth)",
            description =
                    "Once per click and kind (recorded=false for a repeat); 404 for unknown"
                            + " clicks.")
    @ApiResponse(responseCode = "200", description = "The outcome")
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public ConversionResponse record(
            @PathVariable UUID clickId, @Valid @RequestBody ConversionRequest body) {
        return new ConversionResponse(
                admin.recordConversion(clickId, body.kind(), body.value(), body.currency()));
    }
}
