package com.orenjitrade.api.profiles.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.profiles.domain.PrivacySettingsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code /api/v1/me/settings/privacy}: the caller's privacy switches. */
@RestController
@RequestMapping(path = "/api/v1/me/settings/privacy", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "settings", description = "Privacy and notification settings of the caller")
public class PrivacySettingsController {

    private final PrivacySettingsService privacySettingsService;

    public PrivacySettingsController(PrivacySettingsService privacySettingsService) {
        this.privacySettingsService = privacySettingsService;
    }

    @GetMapping
    @Operation(
            operationId = "getPrivacySettings",
            summary = "The caller's privacy settings",
            description =
                    "Defaults favour safety: not discoverable, online status hidden, profile"
                            + " visible to members, messages from members with a profile, wishlist"
                            + " hidden.")
    public PrivacySettingsDto get(@AuthenticationPrincipal AuthenticatedUser principal) {
        return PrivacySettingsDto.from(privacySettingsService.settingsOf(principal.userId()));
    }

    @PutMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updatePrivacySettings",
            summary = "Replace the caller's privacy settings",
            description =
                    "Full replacement (every field required). Switching `discoverable` on derives"
                            + " the public map point from the trading area; switching it off"
                            + " removes the collector from the map immediately.")
    public PrivacySettingsDto update(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody PrivacySettingsDto body) {
        return PrivacySettingsDto.from(
                privacySettingsService.update(principal.userId(), body.toView()));
    }
}
