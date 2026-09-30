package com.orenjitrade.api.notifications.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.CursorPage;
import com.orenjitrade.api.notifications.domain.NotificationService;
import com.orenjitrade.api.notifications.domain.NotificationView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/notifications}: the caller's in-app notification centre (their own notifications
 * only; others are 404). New notifications are also pushed on {@code /user/queue/notifications}.
 */
@RestController
@Validated
@RequestMapping(path = "/api/v1/notifications", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "notifications", description = "In-app notification centre, unread badge, read state")
public class NotificationController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @GetMapping
    @Operation(
            operationId = "listNotifications",
            summary = "The caller's notifications (newest first)",
            description =
                    "Cursor-paginated, newest first; `unreadOnly=true` lists unread ones only."
                            + " Notifications whose in-app channel was disabled by the caller's"
                            + " preferences are never listed.")
    @ApiResponse(responseCode = "200", description = "One slice of notifications")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED (invalid cursor or limit)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public CursorPage<NotificationView> list(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Parameter(description = "Opaque cursor of the previous slice")
                    @RequestParam(required = false)
                    @Size(max = 200)
                    @Nullable String cursor,
            @RequestParam(defaultValue = "" + NotificationService.DEFAULT_LIMIT)
                    @Min(1)
                    @Max(NotificationService.MAX_LIMIT)
                    int limit,
            @Parameter(description = "true: unread notifications only")
                    @RequestParam(defaultValue = "false")
                    boolean unreadOnly) {
        return notificationService.list(principal.userId(), cursor, unreadOnly, limit);
    }

    @GetMapping("/unread-count")
    @Operation(
            operationId = "getUnreadNotificationCount",
            summary = "Number of unread notifications (badge)")
    @ApiResponse(responseCode = "200", description = "The unread count")
    public UnreadCountResponse unreadCount(@AuthenticationPrincipal AuthenticatedUser principal) {
        return new UnreadCountResponse(notificationService.unreadCount(principal.userId()));
    }

    @PostMapping("/{id}/read")
    @Operation(
            operationId = "markNotificationRead",
            summary = "Mark one notification read",
            description = "Idempotent: the first read time is kept.")
    @ApiResponse(responseCode = "200", description = "The notification")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown notification or not the caller's",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public NotificationView markRead(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable UUID id) {
        return notificationService.markRead(principal.userId(), id);
    }

    @PostMapping("/read-all")
    @Operation(operationId = "markAllNotificationsRead", summary = "Mark every notification read")
    @ApiResponse(responseCode = "200", description = "How many notifications were marked read")
    public ReadAllResponse readAll(@AuthenticationPrincipal AuthenticatedUser principal) {
        return new ReadAllResponse(notificationService.markAllRead(principal.userId()));
    }

    /** {@code GET /notifications/unread-count}. */
    @Schema(name = "UnreadNotificationCount")
    public record UnreadCountResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "3") long count) {}

    /** {@code POST /notifications/read-all}. */
    @Schema(name = "ReadAllNotificationsResponse")
    public record ReadAllResponse(
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            example = "3",
                            description = "Notifications that were unread")
                    int updated) {}
}
