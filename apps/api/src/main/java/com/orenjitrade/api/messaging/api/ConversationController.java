package com.orenjitrade.api.messaging.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.CursorPage;
import com.orenjitrade.api.messaging.api.MessagingRequests.MarkReadRequest;
import com.orenjitrade.api.messaging.api.MessagingRequests.SendMessageRequest;
import com.orenjitrade.api.messaging.api.MessagingRequests.StartConversationRequest;
import com.orenjitrade.api.messaging.api.MessagingRequests.UpdateConversationRequest;
import com.orenjitrade.api.messaging.domain.ConversationService;
import com.orenjitrade.api.messaging.domain.ConversationSummary;
import com.orenjitrade.api.messaging.domain.MessageView;
import com.orenjitrade.api.messaging.domain.NewMessage;
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
import java.net.URI;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
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
 * {@code /api/v1/conversations}: the caller's private conversations and messages (participants
 * only; 404 for everybody else and for conversations hidden by a block).
 */
@RestController
@Validated
@RequestMapping(path = "/api/v1/conversations", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "messaging", description = "Private conversations, messages and read state")
public class ConversationController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final ConversationService conversationService;

    public ConversationController(ConversationService conversationService) {
        this.conversationService = conversationService;
    }

    @GetMapping
    @Operation(
            operationId = "listConversations",
            summary = "The caller's conversations",
            description =
                    "Most recent activity first, cursor-paginated. Conversations hidden by a block"
                        + " in either direction are omitted, as are empty conversations started by"
                        + " the other participant. `archived=true` lists the archive instead of the"
                        + " inbox. `other.onlineStatus` is HIDDEN unless the participant shows"
                        + " their online status.")
    @ApiResponse(responseCode = "200", description = "One slice of conversations")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED (invalid cursor or limit)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public CursorPage<ConversationSummary> list(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Parameter(description = "Opaque cursor of the previous slice")
                    @RequestParam(required = false)
                    @Size(max = 200)
                    @Nullable String cursor,
            @RequestParam(defaultValue = "" + ConversationService.CONVERSATIONS_DEFAULT_LIMIT)
                    @Min(1)
                    @Max(ConversationService.CONVERSATIONS_MAX_LIMIT)
                    int limit,
            @Parameter(description = "true: archived conversations only")
                    @RequestParam(defaultValue = "false")
                    boolean archived) {
        return conversationService.list(principal.userId(), archived, cursor, limit);
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "startConversation",
            summary = "Start (or reopen) a conversation with a collector",
            description =
                    "Idempotent: returns the existing conversation of the pair (200) or creates it"
                        + " (201); never 409. 403 MESSAGING_BLOCKED when a block exists in either"
                        + " direction or, for a new conversation, when the recipient's messaging"
                        + " permission refuses the caller (NOBODY, or MEMBERS_WITH_PROFILE and the"
                        + " caller has no saved profile). 404 for unknown, suspended or deleted"
                        + " recipients; 400 for oneself.")
    @ApiResponse(responseCode = "200", description = "The existing conversation")
    @ApiResponse(responseCode = "201", description = "The new conversation")
    @ApiResponse(
            responseCode = "403",
            description = "MESSAGING_BLOCKED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "404",
            description = "Unknown recipient",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public ResponseEntity<ConversationSummary> start(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody StartConversationRequest body) {
        ConversationService.Started started =
                conversationService.start(principal.userId(), body.recipientId());
        URI location = URI.create("/api/v1/conversations/" + started.conversation().id());
        return ResponseEntity.status(started.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .location(location)
                .body(started.conversation());
    }

    @PatchMapping(path = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateConversation",
            summary = "Mute or archive a conversation (caller only)",
            description =
                    "Absent fields are kept. A new message un-archives the conversation for both"
                            + " participants.")
    @ApiResponse(responseCode = "200", description = "The conversation")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown conversation (or not a participant, or hidden by a block)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public ConversationSummary update(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateConversationRequest body) {
        return conversationService.update(principal.userId(), id, body.muted(), body.archived());
    }

    @GetMapping("/{id}/messages")
    @Operation(
            operationId = "listMessages",
            summary = "Messages of a conversation (newest first)",
            description =
                    "Cursor-paginated, newest first. `readByOther` tells whether the participant"
                            + " who did not send a message has read it. REMOVED messages keep their"
                            + " place with an empty body and payload.")
    @ApiResponse(responseCode = "200", description = "One slice of messages")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown conversation (or not a participant, or hidden by a block)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public CursorPage<MessageView> messages(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Parameter(description = "Opaque cursor of the previous slice")
                    @RequestParam(required = false)
                    @Size(max = 200)
                    @Nullable String cursor,
            @RequestParam(defaultValue = "" + ConversationService.MESSAGES_DEFAULT_LIMIT)
                    @Min(1)
                    @Max(ConversationService.MESSAGES_MAX_LIMIT)
                    int limit) {
        return conversationService.messages(principal.userId(), id, cursor, limit);
    }

    @PostMapping(path = "/{id}/messages", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "sendMessage",
            summary = "Send a message",
            description =
                    "TEXT needs `body` (≤ 4000 characters); CARD_LINK `cardPrintingId`; BINDER_LINK"
                        + " `binderId` of a public binder; IMAGE `imageUploadId` of POST"
                        + " /uploads/images (within 1 h); OFFER_LINK `offerId` of an offer between"
                        + " the two participants (Phase 8). SYSTEM is refused (400). Moderation:"
                        + " 422 MESSAGE_BLOCKED for content the rules refuse (generic reason), FLAG"
                        + " rules store the message as FLAGGED; 429 RATE_LIMITED above the rate"
                        + " rule (30 per minute). 403 MESSAGING_BLOCKED when a block exists or the"
                        + " other participant cannot receive messages. Pushed to both participants"
                        + " on /user/queue/messages.")
    @ApiResponse(responseCode = "201", description = "The stored message")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "403",
            description = "MESSAGING_BLOCKED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "404",
            description = "Unknown conversation (or not a participant)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "422",
            description = "MESSAGE_BLOCKED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public MessageView send(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody SendMessageRequest body) {
        return conversationService.send(
                principal.userId(),
                id,
                new NewMessage(
                        body.kind(),
                        body.body(),
                        body.cardPrintingId(),
                        body.binderId(),
                        body.offerId(),
                        body.imageUploadId()));
    }

    @PostMapping(path = "/{id}/read", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "markConversationRead",
            summary = "Mark a conversation read up to a message",
            description =
                    "Moves the caller's read marker forward (never backward) and pushes a read"
                            + " receipt to both participants on /user/queue/receipts. 400 when"
                            + " the message is not part of the conversation.")
    @ApiResponse(responseCode = "204", description = "Marker updated (or already further)")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown conversation (or not a participant, or hidden by a block)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public void markRead(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody MarkReadRequest body) {
        conversationService.markRead(principal.userId(), id, body.lastReadMessageId());
    }
}
