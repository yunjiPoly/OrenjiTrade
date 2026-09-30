package com.orenjitrade.api.notifications.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.notifications.domain.PushPlatform;
import com.orenjitrade.api.notifications.domain.PushTokenService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/me/push-tokens}: device push tokens of the caller (mobile registers the Expo/FCM
 * token after the permission prompt). Tokens are never returned.
 */
@RestController
@RequestMapping(path = "/api/v1/me/push-tokens", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "notifications", description = "In-app notification centre, unread badge, read state")
public class PushTokenController {

    private final PushTokenService pushTokenService;

    public PushTokenController(PushTokenService pushTokenService) {
        this.pushTokenService = pushTokenService;
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "registerPushToken",
            summary = "Register a device push token",
            description =
                    "Idempotent. A token registered by another account moves to the caller; an"
                            + " invalidated token becomes valid again.")
    @ApiResponse(responseCode = "204", description = "Registered")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED (unknown platform, empty or malformed token)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = NotificationController.PROBLEM_REF)))
    public void register(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody PushTokenRequest body) {
        pushTokenService.register(principal.userId(), body.platform(), body.token());
    }

    @DeleteMapping("/{token}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "deletePushToken",
            summary = "Remove a device push token (sign-out)",
            description = "Idempotent; tokens of other accounts are left untouched.")
    @ApiResponse(responseCode = "204", description = "Removed (or unknown)")
    public void delete(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable String token) {
        pushTokenService.unregister(principal.userId(), token);
    }

    /** Body of {@code POST /me/push-tokens}. */
    @Schema(name = "PushTokenRequest")
    public record PushTokenRequest(
            @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull PushPlatform platform,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "FCM / Expo device token")
                    @NotBlank
                    @Size(max = PushTokenService.TOKEN_MAX)
                    String token) {}
}
