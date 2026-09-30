package com.orenjitrade.api.reports.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.reports.api.ReportResponses.MemberResponse;
import com.orenjitrade.api.reports.api.ReportResponses.MyReportResponse;
import com.orenjitrade.api.reports.api.ReportResponses.ReasonResponse;
import com.orenjitrade.api.reports.api.ReportResponses.ReportConfirmationResponse;
import com.orenjitrade.api.reports.domain.CollectorReportService;
import com.orenjitrade.api.reports.domain.CollectorReportService.Filed;
import com.orenjitrade.api.reports.domain.ReportContext;
import com.orenjitrade.api.reports.domain.ReportReason;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * Collector reporting for members (Phase 7): the reasons list (public), filing a report and the
 * caller's own reports (status only).
 */
@RestController
@Validated
@Tag(name = "reports", description = "Reporting collectors to the moderation team")
public class ReportController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final CollectorReportService reports;

    public ReportController(CollectorReportService reports) {
        this.reports = reports;
    }

    @GetMapping(path = "/api/v1/public/report-reasons", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "listReportReasons",
            summary = "Reasons for reporting a collector",
            description = "In the order the report dialog shows them.")
    @SecurityRequirements
    public List<ReasonResponse> reasons() {
        return reports.reasons().stream().map(ReasonResponse::from).toList();
    }

    @PostMapping(
            path = "/api/v1/reports/collectors",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "reportCollector",
            summary = "Report a collector",
            description =
                    "A reason is required; details at most 1000 characters. The context says where"
                        + " the report was made (PROFILE by default; CONVERSATION needs a"
                        + " conversation between the caller and the collector, POST one of their"
                        + " community posts, BINDER one of their binders; 400 otherwise). 422"
                        + " CANNOT_REPORT_SELF, 404 unknown collector, 409 REPORT_ALREADY_OPEN"
                        + " (extension reportId) while the caller's previous report against the"
                        + " collector is open, 429 RATE_LIMITED beyond 5 reports per day. An"
                        + " Idempotency-Key repeats the original answer for 24 hours. Open reports"
                        + " from 3 distinct reporters within 7 days flag the collector for review"
                        + " and pause their public listings pending review (never a ban).")
    @ApiResponse(responseCode = "201", description = "The confirmation (status OPEN)")
    @ApiResponse(
            responseCode = "409",
            description = "REPORT_ALREADY_OPEN",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "422",
            description = "CANNOT_REPORT_SELF",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "404",
            description = "Unknown collector",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public ResponseEntity<ReportConfirmationResponse> report(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Parameter(description = "Optional retry key (24 h)")
                    @RequestHeader(name = "Idempotency-Key", required = false)
                    @Nullable String idempotencyKey,
            @Valid @RequestBody ReportCollectorRequest body) {
        Filed filed =
                reports.file(
                        principal.userId(),
                        body.reportedUserId(),
                        body.reason(),
                        body.details(),
                        body.context() == null ? null : body.context().toContext(),
                        idempotencyKey);
        ReportConfirmationResponse confirmation = ReportConfirmationResponse.from(filed.report());
        return ResponseEntity.status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/me/reports"))
                .body(confirmation);
    }

    @GetMapping(path = "/api/v1/me/reports", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "listMyReports",
            summary = "The caller's reports (status only)",
            description =
                    "Newest first, at most 100. Moderator notes and decisions stay private; the"
                            + " reporter only sees the status.")
    public List<MyReportResponse> mine(@AuthenticationPrincipal AuthenticatedUser principal) {
        return reports.mine(principal.userId()).stream()
                .map(
                        mine ->
                                new MyReportResponse(
                                        mine.report().id(),
                                        mine.report().status(),
                                        mine.report().reason(),
                                        mine.report().createdAt(),
                                        mine.report().resolvedAt(),
                                        MemberResponse.of(
                                                mine.report().reportedUserId(), mine.reported())))
                .toList();
    }

    /** Body of {@code POST /reports/collectors}. */
    @Schema(name = "ReportCollectorRequest")
    public record ReportCollectorRequest(
            @NotNull UUID reportedUserId,
            @NotNull ReportReason reason,
            @Schema(maxLength = 1000) @Size(max = 1000) @Nullable String details,
            @Schema(nullable = true) @Valid @Nullable ReportContextRequest context) {}

    /** Where the report is made. */
    @Schema(name = "ReportContextRequest")
    public record ReportContextRequest(
            @NotNull ReportContext.Source source,
            @Nullable UUID conversationId,
            @Nullable UUID postId,
            @Nullable UUID binderId) {

        ReportContext toContext() {
            return new ReportContext(source, conversationId, postId, binderId);
        }
    }
}
