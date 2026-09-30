package com.orenjitrade.api.notifications.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.notifications.domain.NotificationAdminService;
import com.orenjitrade.api.notifications.domain.NotificationAdminService.Audience;
import com.orenjitrade.api.notifications.domain.NotificationAdminService.Broadcast;
import com.orenjitrade.api.notifications.domain.NotificationAdminService.BroadcastResult;
import com.orenjitrade.api.notifications.domain.NotificationAdminService.Stats;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/admin/notifications}: delivery statistics (ADMIN, SUPER_ADMIN) and broadcasts
 * (SUPER_ADMIN, audited).
 */
@RestController
@Validated
@RequestMapping(path = "/api/v1/admin/notifications", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "admin-notifications", description = "Notification statistics and broadcasts (admin)")
public class AdminNotificationController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final NotificationAdminService admin;

    public AdminNotificationController(NotificationAdminService admin) {
        this.admin = admin;
    }

    @GetMapping("/stats")
    @Operation(
            operationId = "getNotificationStats",
            summary = "Notification delivery statistics (ADMIN)",
            description =
                    "Counts of the last `days` days by type and by channel state (realtime, push,"
                            + " email: SENT, FAILED, SKIPPED, PENDING), unread in-app"
                            + " notifications, failures of the last 24 hours and push tokens."
                            + " Counts only.")
    public NotificationStatsResponse stats(
            @RequestParam(defaultValue = "7") @Min(1) @Max(90) int days) {
        return NotificationStatsResponse.from(admin.stats(days));
    }

    @PostMapping(path = "/broadcast", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "broadcastNotification",
            summary = "Broadcast a notice to every collector (SUPER_ADMIN)",
            description =
                    "A SYSTEM in-app notice to every account that can receive it (audience ALL) or"
                            + " to moderators and admins (STAFF). 403 for other roles. Audited"
                            + " (`notification.broadcast`).")
    @ApiResponse(responseCode = "200", description = "How many accounts got it")
    @ApiResponse(
            responseCode = "403",
            description = "FORBIDDEN: SUPER_ADMIN only",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public BroadcastResponse broadcast(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @Valid @RequestBody BroadcastRequest body) {
        BroadcastResult result =
                admin.broadcast(
                        actor,
                        new Broadcast(
                                body.title(),
                                body.body(),
                                body.audience() == null ? Audience.ALL : body.audience(),
                                body.deepLink()));
        return new BroadcastResponse(
                result.broadcastId(), result.audience(), result.recipients(), result.skipped());
    }

    /** Body of {@code POST /admin/notifications/broadcast}. */
    @Schema(name = "BroadcastRequest")
    public record BroadcastRequest(
            @Schema(maxLength = 200) @NotBlank @Size(max = 200) String title,
            @Schema(maxLength = 1000) @NotBlank @Size(max = 1000) String body,
            @Schema(nullable = true, description = "ALL (default) or STAFF")
                    @Nullable Audience audience,
            @Schema(nullable = true, description = "App path, e.g. /premium", maxLength = 200)
                    @Size(max = 200)
                    @Nullable String deepLink) {}

    /** Outcome of a broadcast. */
    @Schema(name = "BroadcastResponse")
    public record BroadcastResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID broadcastId,
            @Schema(requiredMode = RequiredMode.REQUIRED) Audience audience,
            @Schema(requiredMode = RequiredMode.REQUIRED) int recipients,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Accounts whose preferences refused it")
                    int skipped) {}

    /** Notification statistics. */
    @Schema(name = "NotificationStats")
    public record NotificationStatsResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant from,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant to,
            @Schema(requiredMode = RequiredMode.REQUIRED) long total,
            @Schema(requiredMode = RequiredMode.REQUIRED) long unread,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Type name to count")
                    Map<String, Long> byType,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Channel (realtime, push, email) to state to count")
                    Map<String, Map<String, Long>> channels,
            @Schema(requiredMode = RequiredMode.REQUIRED) long failedLast24h,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "active and invalid")
                    Map<String, Long> pushTokens) {

        static NotificationStatsResponse from(Stats stats) {
            return new NotificationStatsResponse(
                    stats.from(),
                    stats.to(),
                    stats.total(),
                    stats.unread(),
                    stats.byType(),
                    stats.channels(),
                    stats.failedLast24h(),
                    stats.pushTokens());
        }
    }
}
