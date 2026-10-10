package com.orenjitrade.api.notifications.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.notifications.domain.NotificationPreferencesService;
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

/** {@code /api/v1/me/settings/notifications}: the caller's notification preferences. */
@RestController
@RequestMapping(
        path = "/api/v1/me/settings/notifications",
        produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "settings", description = "Privacy and notification settings of the caller")
public class NotificationSettingsController {

    private final NotificationPreferencesService service;

    public NotificationSettingsController(NotificationPreferencesService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(
            operationId = "getNotificationSettings",
            summary = "The caller's notification preferences",
            description =
                    "Defaults: push and in-app on, email off, MARKETING fully off, wishlist alerts"
                            + " on.")
    public NotificationSettingsResponse get(@AuthenticationPrincipal AuthenticatedUser principal) {
        return NotificationSettingsResponse.from(service.settingsOf(principal.userId()));
    }

    @PutMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateNotificationSettings",
            summary = "Replace the caller's notification preferences",
            description =
                    "Full replacement, except wishlistAlerts, which keeps its stored value when"
                            + " left out. Unknown categories, malformed times (HH:mm) and unknown"
                            + " time zones are 400.")
    public NotificationSettingsResponse update(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody NotificationSettingsRequest body) {
        return NotificationSettingsResponse.from(
                service.update(principal.userId(), body.toSettings(), body.keepsWishlistAlerts()));
    }
}
