package com.orenjitrade.api.community.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.community.api.CommunityRequests.CreateChannelRequest;
import com.orenjitrade.api.community.api.CommunityRequests.RemoveContentRequest;
import com.orenjitrade.api.community.api.CommunityRequests.UpdateChannelRequest;
import com.orenjitrade.api.community.domain.AdminChannelView;
import com.orenjitrade.api.community.domain.CommunityInputs.ChannelPatch;
import com.orenjitrade.api.community.domain.CommunityInputs.NewChannel;
import com.orenjitrade.api.community.domain.CommunityService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/admin/community}: channel management and content removal (MODERATOR, ADMIN,
 * SUPER_ADMIN; every write audited). Not gated by the publicChat flag.
 */
@RestController
@RequestMapping(path = "/api/v1/admin/community", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "admin-community", description = "Community moderation (moderator console)")
public class AdminCommunityController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final CommunityService communityService;

    public AdminCommunityController(CommunityService communityService) {
        this.communityService = communityService;
    }

    @GetMapping("/channels")
    @Operation(
            operationId = "listAdminCommunityChannels",
            summary = "Every community channel (MODERATOR+)",
            description = "Archived channels included.")
    public List<AdminChannelView> channels() {
        return communityService.adminChannels();
    }

    @PostMapping(path = "/channels", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "createCommunityChannel",
            summary = "Create a community channel (MODERATOR+)",
            description =
                    "409 when the slug exists; 400 for an unknown game. Audited"
                            + " (`community.channel.create`).")
    @ApiResponse(responseCode = "201", description = "The channel")
    @ApiResponse(
            responseCode = "409",
            description = "CONFLICT: slug taken",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public AdminChannelView createChannel(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @Valid @RequestBody CreateChannelRequest body) {
        return communityService.createChannel(
                actor,
                new NewChannel(
                        body.slug(),
                        body.name(),
                        body.kind(),
                        body.game(),
                        body.regionLabel(),
                        body.description(),
                        body.postRateLimitPerHour(),
                        body.sortOrder()));
    }

    @PatchMapping(path = "/channels/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateCommunityChannel",
            summary = "Edit or archive a community channel (MODERATOR+)",
            description =
                    "Absent fields are kept; `status: ARCHIVED` hides the channel from members."
                            + " Audited (`community.channel.update`).")
    @ApiResponse(responseCode = "200", description = "The channel")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown channel",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public AdminChannelView updateChannel(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateChannelRequest body) {
        return communityService.updateChannel(
                actor,
                id,
                new ChannelPatch(
                        body.name(),
                        body.description(),
                        body.status(),
                        body.postRateLimitPerHour(),
                        body.sortOrder(),
                        body.game(),
                        body.regionLabel()));
    }

    @PostMapping(path = "/posts/{id}/remove", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "removeCommunityPost",
            summary = "Remove a post (MODERATOR+)",
            description =
                    "The post disappears for everybody (moderation state REMOVED); its open"
                            + " moderation flags are resolved. Audited with the reason"
                            + " (`community.post.remove`). 409 when already removed.")
    @ApiResponse(responseCode = "204", description = "Removed")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown post",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public void removePost(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable UUID id,
            @Valid @RequestBody RemoveContentRequest body) {
        communityService.removePost(actor, id, body.reason());
    }

    @PostMapping(path = "/replies/{id}/remove", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "removeCommunityReply",
            summary = "Remove a reply (MODERATOR+)",
            description = "Audited with the reason (`community.reply.remove`).")
    @ApiResponse(responseCode = "204", description = "Removed")
    public void removeReply(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable UUID id,
            @Valid @RequestBody RemoveContentRequest body) {
        communityService.removeReply(actor, id, body.reason());
    }
}
