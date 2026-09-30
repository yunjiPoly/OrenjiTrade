package com.orenjitrade.api.offers.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.offers.api.OfferRequests.UpdateOfferSettingsRequest;
import com.orenjitrade.api.offers.api.OfferResponses.OfferSettingsResponse;
import com.orenjitrade.api.offers.domain.OfferPreferencesService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/me/settings/offers}: the caller's offer settings (the contract's seller setting
 * {@code accepts_mixed}, default true).
 */
@RestController
@Tag(name = "offers", description = "Cash, trade and mixed offers on public cards")
public class OfferSettingsController {

    private final OfferPreferencesService preferences;

    public OfferSettingsController(OfferPreferencesService preferences) {
        this.preferences = preferences;
    }

    @GetMapping(path = "/api/v1/me/settings/offers", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "getOfferSettings",
            summary = "The caller's offer settings",
            description = "acceptsMixed: whether MIXED offers are welcome (default true).")
    public OfferSettingsResponse get(@AuthenticationPrincipal AuthenticatedUser principal) {
        return new OfferSettingsResponse(preferences.acceptsMixed(principal.userId()));
    }

    @PutMapping(
            path = "/api/v1/me/settings/offers",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateOfferSettings",
            summary = "Change the caller's offer settings",
            description =
                    "acceptsMixed=false refuses new MIXED offers on the caller's cards (422"
                            + " OFFERS_NOT_ACCEPTED); negotiations already open continue.")
    public OfferSettingsResponse update(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody UpdateOfferSettingsRequest body) {
        return new OfferSettingsResponse(
                preferences.update(principal.userId(), body.acceptsMixed()));
    }
}
