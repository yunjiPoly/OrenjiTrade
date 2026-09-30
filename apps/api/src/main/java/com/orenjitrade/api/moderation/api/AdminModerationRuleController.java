package com.orenjitrade.api.moderation.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.moderation.domain.ModerationAction;
import com.orenjitrade.api.moderation.domain.ModerationRuleKind;
import com.orenjitrade.api.moderation.domain.ModerationRuleService;
import com.orenjitrade.api.moderation.domain.ModerationRuleService.ModerationRuleView;
import com.orenjitrade.api.moderation.domain.ModerationRuleService.RuleChange;
import com.orenjitrade.api.moderation.domain.ModerationRuleService.RuleInput;
import com.orenjitrade.api.moderation.domain.ModerationScope;
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
import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/admin/moderation/rules}: the configurable moderation rules (ADR 0014). MODERATOR+
 * read; ADMIN and SUPER_ADMIN change (audited, caches dropped).
 */
@RestController
@Validated
@RequestMapping(
        path = "/api/v1/admin/moderation/rules",
        produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "admin-moderation", description = "Automatic moderation flags (moderator console)")
public class AdminModerationRuleController {

    private final ModerationRuleService rules;

    public AdminModerationRuleController(ModerationRuleService rules) {
        this.rules = rules;
    }

    @GetMapping
    @Operation(
            operationId = "listModerationRules",
            summary = "List moderation rules (MODERATOR+)",
            description =
                    "BANNED_TERM (regular expression on accent-stripped text), RATE_LIMIT and"
                        + " THRESHOLD (`<count>/<seconds>` per author) for MESSAGE, POST, TAG and"
                        + " PROFILE; RATE_LIMIT (reports per reporter) and REPORT_THRESHOLD (open"
                        + " reports from distinct reporters; BLOCK also pauses listings pending"
                        + " review) for REPORT.")
    public List<ModerationRuleResponse> list(
            @RequestParam(required = false) @Nullable ModerationScope scope,
            @RequestParam(required = false) @Nullable ModerationRuleKind kind) {
        return rules.list(scope, kind).stream().map(ModerationRuleResponse::from).toList();
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "createModerationRule",
            summary = "Create a moderation rule (ADMIN)",
            description =
                    "400 for an invalid kind/scope combination, regular expression or rate"
                            + " pattern; 403 for moderators. Audited (`moderation.rule.create`).")
    @ApiResponse(responseCode = "201", description = "The new rule")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = AdminModerationController.PROBLEM_REF)))
    public ResponseEntity<ModerationRuleResponse> create(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @Valid @RequestBody CreateModerationRuleRequest body) {
        ModerationRuleResponse created =
                ModerationRuleResponse.from(
                        rules.create(
                                actor,
                                new RuleInput(
                                        body.kind(),
                                        body.pattern(),
                                        body.action(),
                                        body.scope(),
                                        body.active() == null || body.active())));
        return ResponseEntity.status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/admin/moderation/rules/" + created.id()))
                .body(created);
    }

    @PutMapping(path = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateModerationRule",
            summary = "Change a moderation rule (ADMIN)",
            description =
                    "Pattern, action, scope and the active switch; omitted members stay. The kind"
                            + " cannot change. Takes effect within a minute on every instance."
                            + " Audited (`moderation.rule.update`).")
    @ApiResponse(responseCode = "200", description = "The changed rule")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown rule",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = AdminModerationController.PROBLEM_REF)))
    public ModerationRuleResponse update(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateModerationRuleRequest body) {
        return ModerationRuleResponse.from(
                rules.update(
                        actor,
                        id,
                        new RuleChange(
                                body.pattern(), body.action(), body.scope(), body.active())));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "deleteModerationRule",
            summary = "Delete a moderation rule (ADMIN)",
            description =
                    "Flags raised by the rule keep their history. Audited"
                            + " (`moderation.rule.delete`).")
    @ApiResponse(responseCode = "204", description = "Deleted")
    public void delete(@AuthenticationPrincipal AuthenticatedUser actor, @PathVariable UUID id) {
        rules.delete(actor, id);
    }

    /** Body of {@code POST /admin/moderation/rules}. */
    @Schema(name = "CreateModerationRuleRequest")
    public record CreateModerationRuleRequest(
            @NotNull ModerationRuleKind kind,
            @Schema(example = "5/86400", maxLength = 200) @NotBlank @Size(max = 200) String pattern,
            @NotNull ModerationAction action,
            @NotNull ModerationScope scope,
            @Schema(nullable = true, description = "Defaults to true") @Nullable Boolean active) {}

    /** Body of {@code PUT /admin/moderation/rules/{id}}. */
    @Schema(name = "UpdateModerationRuleRequest")
    public record UpdateModerationRuleRequest(
            @Schema(nullable = true, maxLength = 200) @Size(min = 1, max = 200)
                    @Nullable String pattern,
            @Schema(nullable = true) @Nullable ModerationAction action,
            @Schema(nullable = true) @Nullable ModerationScope scope,
            @Schema(nullable = true) @Nullable Boolean active) {}

    /** A moderation rule. */
    @Schema(name = "ModerationRule", description = "Configurable moderation rule (ADR 0014)")
    public record ModerationRuleResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) ModerationRuleKind kind,
            @Schema(requiredMode = RequiredMode.REQUIRED) String pattern,
            @Schema(requiredMode = RequiredMode.REQUIRED) ModerationAction action,
            @Schema(requiredMode = RequiredMode.REQUIRED) ModerationScope scope,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean active,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant updatedAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID updatedBy) {

        static ModerationRuleResponse from(ModerationRuleView view) {
            return new ModerationRuleResponse(
                    view.id(),
                    view.kind(),
                    view.pattern(),
                    view.action(),
                    view.scope(),
                    view.active(),
                    view.createdAt(),
                    view.updatedAt(),
                    view.updatedBy());
        }
    }
}
