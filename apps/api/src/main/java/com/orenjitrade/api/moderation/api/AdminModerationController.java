package com.orenjitrade.api.moderation.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.moderation.domain.FlagReason;
import com.orenjitrade.api.moderation.domain.FlagSubjectType;
import com.orenjitrade.api.moderation.domain.FlaggedContentPreviews;
import com.orenjitrade.api.moderation.domain.FlaggedContentPreviews.FlaggedContent;
import com.orenjitrade.api.moderation.domain.ModerationFlagView;
import com.orenjitrade.api.moderation.domain.ModerationService;
import com.orenjitrade.api.users.domain.UserAccountService;
import com.orenjitrade.api.users.domain.UserAccountSnapshot;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.ObjectProvider;
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
 * {@code /api/v1/admin/moderation}: the automatic moderation queue (MODERATOR, ADMIN, SUPER_ADMIN;
 * resolutions audited). Flags reference content by id only; private message bodies are not part of
 * this view.
 */
@RestController
@Validated
@RequestMapping(path = "/api/v1/admin/moderation", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "admin-moderation", description = "Automatic moderation flags (moderator console)")
public class AdminModerationController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final ModerationService moderationService;
    private final UserAccountService userAccountService;
    private final ObjectProvider<FlaggedContentPreviews> previews;

    public AdminModerationController(
            ModerationService moderationService,
            UserAccountService userAccountService,
            ObjectProvider<FlaggedContentPreviews> previews) {
        this.moderationService = moderationService;
        this.userAccountService = userAccountService;
        this.previews = previews;
    }

    @GetMapping("/flags")
    @Operation(
            operationId = "listModerationFlags",
            summary = "List moderation flags (MODERATOR+)",
            description =
                    "Newest first. `state`: OPEN (default), RESOLVED or ALL. Flags are raised by"
                        + " FLAG banned-term rules, repeated-content thresholds (content) and rate"
                        + " thresholds (subjectType USER). No automatic ban ever follows a flag. A"
                        + " flag on a community post or reply carries its room and text"
                        + " (`community`); a private message's text is never sent here (web stage"
                        + " WH1).")
    public PageResponse<ModerationFlagResponse> list(
            @Parameter(description = "OPEN | RESOLVED | ALL") @RequestParam(defaultValue = "OPEN")
                    FlagState state,
            @RequestParam(required = false) @Nullable FlagSubjectType subjectType,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10_000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        @Nullable Boolean open =
                switch (state) {
                    case OPEN -> Boolean.TRUE;
                    case RESOLVED -> Boolean.FALSE;
                    case ALL -> null;
                };
        PageResponse<ModerationFlagView> flags =
                moderationService.flags(open, subjectType, page, size);
        Map<UUID, Optional<UserAccountSnapshot>> accounts = new HashMap<>();
        Map<UUID, FlaggedContent> contents = contentsOf(flags.items());
        return new PageResponse<>(
                flags.items().stream().map(flag -> response(flag, accounts, contents)).toList(),
                flags.page(),
                flags.size(),
                flags.totalItems(),
                flags.totalPages());
    }

    @PostMapping(path = "/flags/{id}/resolve", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "resolveModerationFlag",
            summary = "Resolve a moderation flag (MODERATOR+)",
            description =
                    "Closes an open flag with an optional note. 409 when already resolved."
                            + " Audited (`moderation.flag.resolve`).")
    @ApiResponse(responseCode = "200", description = "The resolved flag")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown flag",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description = "CONFLICT: already resolved",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public ModerationFlagResponse resolve(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable UUID id,
            @Valid @RequestBody ResolveFlagRequest body) {
        ModerationFlagView flag = moderationService.resolve(actor, id, body.note());
        return response(flag, new HashMap<>(), contentsOf(List.of(flag)));
    }

    /** The room and text of the page's flagged posts and replies (never a private message). */
    private Map<UUID, FlaggedContent> contentsOf(List<ModerationFlagView> flags) {
        FlaggedContentPreviews source = previews.getIfAvailable();
        if (source == null) {
            return Map.of();
        }
        Map<UUID, FlaggedContent> result = new HashMap<>();
        for (FlagSubjectType type :
                List.of(FlagSubjectType.COMMUNITY_POST, FlagSubjectType.COMMUNITY_REPLY)) {
            List<UUID> ids =
                    flags.stream()
                            .filter(flag -> flag.subjectType() == type)
                            .map(ModerationFlagView::subjectId)
                            .distinct()
                            .toList();
            if (!ids.isEmpty()) {
                result.putAll(source.previews(type, ids));
            }
        }
        return result;
    }

    private ModerationFlagResponse response(
            ModerationFlagView flag,
            Map<UUID, Optional<UserAccountSnapshot>> accounts,
            Map<UUID, FlaggedContent> contents) {
        @Nullable UserAccountSnapshot author = account(flag.authorId(), accounts);
        @Nullable UserAccountSnapshot resolver = account(flag.resolvedBy(), accounts);
        boolean community =
                flag.subjectType() == FlagSubjectType.COMMUNITY_POST
                        || flag.subjectType() == FlagSubjectType.COMMUNITY_REPLY;
        @Nullable FlaggedContent content = community ? contents.get(flag.subjectId()) : null;
        return new ModerationFlagResponse(
                flag.id(),
                flag.subjectType(),
                flag.subjectId(),
                flag.ruleId(),
                flag.reason(),
                flag.authorId(),
                author == null ? null : author.handle(),
                flag.open() ? FlagState.OPEN : FlagState.RESOLVED,
                flag.createdAt(),
                flag.resolvedAt(),
                flag.resolvedBy(),
                flag.resolutionNote(),
                author == null ? null : displayName(author),
                resolver == null ? null : resolver.handle(),
                content == null ? null : CommunityContentResponse.of(content));
    }

    private @Nullable UserAccountSnapshot account(
            @Nullable UUID id, Map<UUID, Optional<UserAccountSnapshot>> accounts) {
        if (id == null) {
            return null;
        }
        return accounts.computeIfAbsent(id, userAccountService::findSnapshot).orElse(null);
    }

    private static String displayName(UserAccountSnapshot account) {
        String name = account.displayName();
        return name == null || name.isBlank() ? account.handle() : name;
    }

    /** Flag filter / state. */
    @Schema(name = "ModerationFlagState")
    public enum FlagState {
        OPEN,
        RESOLVED,
        ALL
    }

    /** Body of {@code POST /admin/moderation/flags/{id}/resolve}. */
    @Schema(name = "ResolveModerationFlagRequest")
    public record ResolveFlagRequest(
            @Schema(description = "Optional moderator note", maxLength = 500) @Size(max = 500)
                    @Nullable String note) {}

    /** A moderation flag. */
    @Schema(name = "ModerationFlag", description = "Automatic moderation flag")
    public record ModerationFlagResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) FlagSubjectType subjectType,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Message, post, reply or account id")
                    UUID subjectId,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS) @Nullable UUID ruleId,
            @Schema(requiredMode = RequiredMode.REQUIRED) FlagReason reason,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID authorId,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String authorHandle,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            allowableValues = {"OPEN", "RESOLVED"})
                    FlagState state,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant resolvedAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID resolvedBy,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String resolutionNote,
            @Schema(nullable = true, description = "The author's display name (web stage WH1)")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String authorDisplayName,
            @Schema(nullable = true, description = "The resolving staff member's handle")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String resolvedByHandle,
            @Schema(
                            nullable = true,
                            description =
                                    "A flagged community post or reply: its room and text. Null"
                                            + " for a private message (its text is shown only"
                                            + " inside a report) and an account")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable CommunityContentResponse community) {}

    /** The room and text of a flagged community post or reply. */
    @Schema(name = "FlaggedCommunityContent")
    public record CommunityContentResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "The post (a reply's post)")
                    UUID postId,
            @Schema(
                            nullable = true,
                            example = "americas-north-yugioh",
                            description =
                                    "The room's slug; null for an archived channel named after a"
                                            + " city (ADR 0017)")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String roomSlug,
            @Schema(
                            nullable = true,
                            example = "Yu-Gi-Oh!",
                            description =
                                    "The room's name; null for an archived channel named after a"
                                            + " city (ADR 0017)")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String roomName,
            @Schema(
                            nullable = true,
                            description = "Platform region code of the room; null for others",
                            example = "americas-north")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String regionCode,
            @Schema(nullable = true, example = "yugioh") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String game,
            @Schema(requiredMode = RequiredMode.REQUIRED) String text,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Removed by moderators")
                    boolean removed) {

        static CommunityContentResponse of(FlaggedContent content) {
            return new CommunityContentResponse(
                    content.postId(),
                    content.roomSlug(),
                    content.roomName(),
                    content.regionCode(),
                    content.game(),
                    content.text(),
                    content.removed());
        }
    }
}
