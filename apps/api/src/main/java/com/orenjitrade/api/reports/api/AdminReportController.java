package com.orenjitrade.api.reports.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.reports.api.ReportResponses.HistoryResponse;
import com.orenjitrade.api.reports.api.ReportResponses.NoteResponse;
import com.orenjitrade.api.reports.api.ReportResponses.ReportDetailResponse;
import com.orenjitrade.api.reports.api.ReportResponses.ReportSummaryResponse;
import com.orenjitrade.api.reports.domain.AdminReportService;
import com.orenjitrade.api.reports.domain.AdminReportService.ReportSummaryView;
import com.orenjitrade.api.reports.domain.AdminReportService.Resolution;
import com.orenjitrade.api.reports.domain.ModerationHistoryService;
import com.orenjitrade.api.reports.domain.ReportReason;
import com.orenjitrade.api.reports.domain.ReportStatus;
import com.orenjitrade.api.reports.domain.ResolutionAction;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/admin/reports} (MODERATOR, ADMIN, SUPER_ADMIN) and {@code GET
 * /api/v1/admin/users/{id}/history} (ADMIN, SUPER_ADMIN): the report queue, report detail with the
 * reported collector's history, assignment, notes and decisions (every write audited).
 */
@RestController
@Validated
@Tag(name = "admin-reports", description = "Collector report review (moderator console)")
public class AdminReportController {

    private final AdminReportService reports;
    private final ModerationHistoryService history;

    public AdminReportController(AdminReportService reports, ModerationHistoryService history) {
        this.reports = reports;
        this.history = history;
    }

    @GetMapping(path = "/api/v1/admin/reports", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "listReports",
            summary = "List collector reports (MODERATOR+)",
            description = "Newest first; every filter optional.")
    public PageResponse<ReportSummaryResponse> list(
            @RequestParam(required = false) @Nullable ReportStatus status,
            @RequestParam(required = false) @Nullable ReportReason reason,
            @RequestParam(required = false) @Nullable UUID reportedUserId,
            @RequestParam(required = false) @Nullable UUID assignedTo,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10_000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        PageResponse<ReportSummaryView> result =
                reports.list(status, reason, reportedUserId, assignedTo, page, size);
        return new PageResponse<>(
                result.items().stream().map(ReportSummaryResponse::from).toList(),
                result.page(),
                result.size(),
                result.totalItems(),
                result.totalPages());
    }

    @GetMapping(path = "/api/v1/admin/reports/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "getReport",
            summary = "A collector report with the reported collector's history (MODERATOR+)",
            description =
                    "Reporter, reported collector, context, notes and history (recent reports,"
                            + " ratings received, posts removed, suspensions, listing pauses, open"
                            + " flags). Private messages only when the report names a conversation"
                            + " between the two, and then that conversation only (access audited as"
                            + " `report.conversation.view`).")
    @ApiResponse(responseCode = "200", description = "The report")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown report",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = ReportController.PROBLEM_REF)))
    public ReportDetailResponse get(
            @AuthenticationPrincipal AuthenticatedUser actor, @PathVariable UUID id) {
        return ReportDetailResponse.from(reports.detail(actor, id));
    }

    @PostMapping(
            path = "/api/v1/admin/reports/{id}/assign",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "assignReport",
            summary = "Assign a report (MODERATOR+)",
            description =
                    "To the caller by default or to another active moderator; OPEN becomes"
                            + " UNDER_REVIEW. 409 for decided reports. Audited (`report.assign`).")
    @ApiResponse(responseCode = "200", description = "The assigned report")
    @ApiResponse(
            responseCode = "409",
            description = "CONFLICT: already decided",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = ReportController.PROBLEM_REF)))
    public ReportSummaryResponse assign(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable UUID id,
            @Valid @RequestBody(required = false) @Nullable AssignReportRequest body) {
        return ReportSummaryResponse.from(
                reports.assign(actor, id, body == null ? null : body.assigneeId()));
    }

    @PostMapping(
            path = "/api/v1/admin/reports/{id}/notes",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "addReportNote",
            summary = "Add an internal note to a report (MODERATOR+)",
            description = "Never shown to members. Audited (`report.note`, without the text).")
    @ApiResponse(responseCode = "201", description = "The note")
    public NoteResponse addNote(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable UUID id,
            @Valid @RequestBody AddReportNoteRequest body) {
        return NoteResponse.from(reports.addNote(actor, id, body.body()));
    }

    @PostMapping(
            path = "/api/v1/admin/reports/{id}/resolve",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "resolveReport",
            summary = "Decide a report (MODERATOR+; suspensions and bans ADMIN+)",
            description =
                    "ACTIONED with an action (WARNING: a notice to the collector; LISTINGS_PAUSED:"
                        + " their public listings are paused; SUSPENDED: suspension with the note"
                        + " as reason and an optional suspendUntil; BANNED: suspension without end"
                        + " plus the ban mark) or DISMISSED (action NONE). SUSPENDED and BANNED"
                        + " need ADMIN (403 for moderators); an administrator's account needs a"
                        + " SUPER_ADMIN. Audited (`REPORT_RESOLVED` with the action; `user.suspend`"
                        + " / `user.ban` on the account). With notifyReporter the reporter gets a"
                        + " REPORT_DECISION notification without specifics. 409 for decided"
                        + " reports.")
    @ApiResponse(responseCode = "200", description = "The decided report")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED (status/action combination, note)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = ReportController.PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description = "CONFLICT: already decided",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = ReportController.PROBLEM_REF)))
    public ReportSummaryResponse resolve(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable UUID id,
            @Valid @RequestBody ResolveReportRequest body) {
        return ReportSummaryResponse.from(
                reports.resolve(
                        actor,
                        id,
                        new Resolution(
                                body.status(),
                                body.action(),
                                body.note(),
                                Boolean.TRUE.equals(body.notifyReporter()),
                                body.suspendUntil())));
    }

    @GetMapping(
            path = "/api/v1/admin/users/{id}/history",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "getUserModerationHistory",
            summary = "A collector's moderation history (ADMIN)",
            description =
                    "Recent reports against them, ratings received, posts removed, suspensions,"
                            + " listing pauses, the current pause and open flags. Never private"
                            + " messages.")
    @ApiResponse(responseCode = "200", description = "The history")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown account",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = ReportController.PROBLEM_REF)))
    public HistoryResponse history(@PathVariable UUID id) {
        return HistoryResponse.from(history.historyOf(id));
    }

    /** Optional body of {@code POST /admin/reports/{id}/assign}. */
    @Schema(name = "AssignReportRequest")
    public record AssignReportRequest(
            @Schema(nullable = true, description = "Defaults to the caller")
                    @Nullable UUID assigneeId) {}

    /** Body of {@code POST /admin/reports/{id}/notes}. */
    @Schema(name = "AddReportNoteRequest")
    public record AddReportNoteRequest(
            @Schema(maxLength = 2000) @NotBlank @Size(max = 2000) String body) {}

    /** Body of {@code POST /admin/reports/{id}/resolve}. */
    @Schema(name = "ResolveReportRequest")
    public record ResolveReportRequest(
            @NotNull @Schema(allowableValues = {"ACTIONED", "DISMISSED"}) ReportStatus status,
            @Schema(nullable = true, description = "Required for ACTIONED; NONE for DISMISSED")
                    @Nullable ResolutionAction action,
            @Schema(maxLength = 1000, description = "Moderator note (reason of a suspension)")
                    @NotBlank
                    @Size(max = 1000)
                    String note,
            @Schema(nullable = true, description = "Send a REPORT_DECISION to the reporter")
                    @Nullable Boolean notifyReporter,
            @Schema(nullable = true, description = "End of a SUSPENDED decision (future)") @Future
                    @Nullable Instant suspendUntil) {}
}
