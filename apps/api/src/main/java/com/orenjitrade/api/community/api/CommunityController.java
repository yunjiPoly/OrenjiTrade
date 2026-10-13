package com.orenjitrade.api.community.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.CursorPage;
import com.orenjitrade.api.community.api.CommunityRequests.CreatePostRequest;
import com.orenjitrade.api.community.api.CommunityRequests.CreateReplyRequest;
import com.orenjitrade.api.community.api.CommunityRequests.UpdatePostRequest;
import com.orenjitrade.api.community.domain.ChannelView;
import com.orenjitrade.api.community.domain.CommunityInputs.NewPost;
import com.orenjitrade.api.community.domain.CommunityService;
import com.orenjitrade.api.community.domain.PostView;
import com.orenjitrade.api.community.domain.ReplyView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/community}: public community channels, posts and replies for signed-in members
 * (feature flag {@code publicChat}; 404 FEATURE_DISABLED when off).
 */
@RestController
@Validated
@RequestMapping(path = "/api/v1/community", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "community", description = "Public community channels, posts and replies")
public class CommunityController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final CommunityService communityService;

    public CommunityController(CommunityService communityService) {
        this.communityService = communityService;
    }

    @GetMapping("/channels")
    @Operation(
            operationId = "listCommunityChannels",
            summary = "Community channels",
            description =
                    "Active channels ordered for display. `game` filters by game slug, `region` by"
                            + " platform region code (the region channels, ADR 0017). 404"
                            + " FEATURE_DISABLED while the publicChat flag is off.")
    @ApiResponse(responseCode = "200", description = "The channels")
    @ApiResponse(
            responseCode = "404",
            description = "FEATURE_DISABLED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public List<ChannelView> channels(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Parameter(description = "Game slug") @RequestParam(required = false) @Size(max = 32)
                    @Nullable String game,
            @Parameter(description = "Platform region code (GET /regions), e.g. americas-north")
                    @RequestParam(required = false)
                    @Size(max = 120)
                    @Nullable String region) {
        return communityService.channels(principal, game, region);
    }

    @GetMapping("/channels/{slug}/posts")
    @Operation(
            operationId = "listCommunityPosts",
            summary = "Posts of a channel (newest first)",
            description =
                    "Cursor-paginated. Posts of collectors blocked in either direction, of"
                            + " suspended or deleted accounts, deleted and removed posts are not"
                            + " served. 404 for unknown or archived channels.")
    @ApiResponse(responseCode = "200", description = "One slice of posts")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown channel or FEATURE_DISABLED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public CursorPage<PostView> posts(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable @Size(max = 64) String slug,
            @Parameter(description = "Opaque cursor of the previous slice")
                    @RequestParam(required = false)
                    @Size(max = 200)
                    @Nullable String cursor,
            @RequestParam(defaultValue = "" + CommunityService.DEFAULT_LIMIT)
                    @Min(1)
                    @Max(CommunityService.MAX_LIMIT)
                    int limit) {
        return communityService.posts(principal, slug, cursor, limit);
    }

    @PostMapping(path = "/channels/{slug}/posts", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "createCommunityPost",
            summary = "Post in a channel",
            description =
                    "`body` 1-2000 characters, optional `cardPrintingId` and public `binderId`"
                        + " links. 409 DUPLICATE_POST when the caller posted the same text in the"
                        + " last 24 hours; 429 RATE_LIMITED above the channel's"
                        + " postRateLimitPerHour (default 10) or the moderation rate rule; 422"
                        + " POST_BLOCKED for text the moderation rules refuse (FLAG rules store the"
                        + " post as FLAGGED for review).")
    @ApiResponse(responseCode = "201", description = "The post")
    @ApiResponse(
            responseCode = "409",
            description = "DUPLICATE_POST",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "422",
            description = "POST_BLOCKED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public PostView createPost(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable @Size(max = 64) String slug,
            @Valid @RequestBody CreatePostRequest body) {
        return communityService.createPost(
                principal, slug, new NewPost(body.body(), body.cardPrintingId(), body.binderId()));
    }

    @PatchMapping(path = "/posts/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateCommunityPost",
            summary = "Edit a post (author only)",
            description =
                    "Replaces the text (moderation applies; 422 POST_BLOCKED). 403 for other"
                            + " members.")
    @ApiResponse(responseCode = "200", description = "The edited post")
    @ApiResponse(
            responseCode = "403",
            description = "Not the author",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public PostView updatePost(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody UpdatePostRequest body) {
        return communityService.editPost(principal, id, body.body());
    }

    @DeleteMapping("/posts/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "deleteCommunityPost",
            summary = "Delete a post (author or MODERATOR+)",
            description = "Soft delete; a moderator deleting another member's post is audited.")
    @ApiResponse(responseCode = "204", description = "Deleted")
    @ApiResponse(
            responseCode = "403",
            description = "Neither the author nor a moderator",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public void deletePost(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable UUID id) {
        communityService.deletePost(principal, id);
    }

    @GetMapping("/posts/{id}/replies")
    @Operation(
            operationId = "listCommunityReplies",
            summary = "Replies of a post (oldest first)",
            description = "Cursor-paginated, chronological.")
    public CursorPage<ReplyView> replies(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Parameter(description = "Opaque cursor of the previous slice")
                    @RequestParam(required = false)
                    @Size(max = 200)
                    @Nullable String cursor,
            @RequestParam(defaultValue = "" + CommunityService.DEFAULT_LIMIT)
                    @Min(1)
                    @Max(CommunityService.MAX_LIMIT)
                    int limit) {
        return communityService.replies(principal, id, cursor, limit);
    }

    @PostMapping(path = "/posts/{id}/replies", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "createCommunityReply",
            summary = "Reply to a post",
            description =
                    "`body` 1-1000 characters. Moderation as for posts (422 POST_BLOCKED, 429"
                            + " RATE_LIMITED).")
    @ApiResponse(responseCode = "201", description = "The reply")
    public ReplyView createReply(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody CreateReplyRequest body) {
        return communityService.createReply(principal, id, body.body());
    }

    @DeleteMapping("/replies/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "deleteCommunityReply",
            summary = "Delete a reply (author or MODERATOR+)",
            description = "Soft delete; a moderator deleting another member's reply is audited.")
    @ApiResponse(responseCode = "204", description = "Deleted")
    public void deleteReply(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable UUID id) {
        communityService.deleteReply(principal, id);
    }
}
