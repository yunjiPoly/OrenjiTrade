package com.orenjitrade.api.binders.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.binders.domain.AdminBinderService;
import com.orenjitrade.api.binders.domain.BinderKind;
import com.orenjitrade.api.binders.domain.BinderService;
import com.orenjitrade.api.binders.domain.BinderView;
import com.orenjitrade.api.binders.domain.ListingVisibility;
import com.orenjitrade.api.binders.infra.BinderRepository.AdminRow;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.delisting.domain.FreshnessState;
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
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/admin/binders}: every binder and the admin unpublish (ADMIN, SUPER_ADMIN; the
 * unpublish is audited as {@code binder.unpublish} in the same transaction).
 */
@RestController
@Validated
@RequestMapping(path = "/api/v1/admin/binders", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "admin-binders", description = "Binders (admin console)")
public class AdminBinderController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final BinderService binders;
    private final AdminBinderService adminBinders;

    public AdminBinderController(BinderService binders, AdminBinderService adminBinders) {
        this.binders = binders;
        this.adminBinders = adminBinders;
    }

    @GetMapping
    @Operation(
            operationId = "listAdminBinders",
            summary = "List binders (ADMIN)",
            description =
                    "Every owner's binders, newest change first; `query` matches the name,"
                            + " `effectivePublic` says whether the binder is public right now.")
    public PageResponse<AdminBinderResponse> list(
            @RequestParam(required = false) @Size(max = 100) @Nullable String query,
            @RequestParam(required = false) @Nullable UUID ownerId,
            @RequestParam(required = false) @Nullable ListingVisibility visibility,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10_000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        PageResponse<AdminRow> result = binders.adminList(query, ownerId, visibility, page, size);
        return new PageResponse<>(
                result.items().stream()
                        .map(row -> AdminBinderResponse.from(row.binder(), row.ownerHandle()))
                        .toList(),
                result.page(),
                result.size(),
                result.totalItems(),
                result.totalPages());
    }

    @PostMapping(path = "/{id}/unpublish", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "unpublishBinderAsAdmin",
            summary = "Make a binder private (ADMIN)",
            description =
                    "The owner can publish it again. Audited (`binder.unpublish` with the"
                            + " reason).")
    @ApiResponse(responseCode = "200", description = "The binder, now private")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown binder",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public AdminBinderResponse unpublish(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable UUID id,
            @Valid @RequestBody UnpublishBinderRequest body) {
        BinderView binder = adminBinders.unpublish(actor, id, body.reason());
        return AdminBinderResponse.from(binder, null);
    }

    /** Body of {@code POST /admin/binders/{id}/unpublish}. */
    @Schema(name = "UnpublishBinderRequest")
    public record UnpublishBinderRequest(
            @Schema(maxLength = 500, description = "Why (audited)") @NotBlank @Size(max = 500)
                    String reason) {}

    /** A binder in the admin console (never item notes). */
    @Schema(name = "AdminBinder")
    public record AdminBinderResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID ownerId,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String ownerHandle,
            @Schema(requiredMode = RequiredMode.REQUIRED) String name,
            @Schema(requiredMode = RequiredMode.REQUIRED) BinderKind kind,
            @Schema(requiredMode = RequiredMode.REQUIRED) ListingVisibility visibility,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant publicUntil,
            @Schema(requiredMode = RequiredMode.REQUIRED) FreshnessState freshnessState,
            @Schema(requiredMode = RequiredMode.REQUIRED) int itemCount,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean effectivePublic,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant confirmedAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant updatedAt) {

        static AdminBinderResponse from(BinderView binder, @Nullable String ownerHandle) {
            return new AdminBinderResponse(
                    binder.id(),
                    binder.ownerId(),
                    ownerHandle,
                    binder.name(),
                    binder.kind(),
                    binder.visibility(),
                    binder.publicUntil(),
                    binder.freshnessState(),
                    binder.itemCount(),
                    binder.effectivePublic(),
                    binder.confirmedAt(),
                    binder.updatedAt());
        }
    }
}
