package com.orenjitrade.api.messaging.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.messaging.api.MessagingRequests.BlockUserRequest;
import com.orenjitrade.api.messaging.domain.BlockService;
import com.orenjitrade.api.messaging.domain.BlockedUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Blocks: {@code POST/DELETE /api/v1/users/{id}/block} and {@code GET /api/v1/me/blocks}. A block
 * hides conversations both ways, forbids new conversations and messages, and hides the two
 * collectors from each other on profiles, public binders, the map and search.
 */
@RestController
@Validated
@Tag(name = "blocks", description = "Blocking collectors")
public class BlockController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final BlockService blockService;

    public BlockController(BlockService blockService) {
        this.blockService = blockService;
    }

    @PostMapping(path = "/api/v1/users/{id}/block", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "blockUser",
            summary = "Block a collector",
            description =
                    "Idempotent. Optional JSON body `{reason}` (private note). 400 for oneself, 404"
                            + " for unknown or deleted accounts.")
    @ApiResponse(responseCode = "200", description = "The blocked collector")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown collector",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public BlockedUser block(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody(required = false) @Nullable BlockUserRequest body) {
        return blockService.block(principal.userId(), id, body == null ? null : body.reason());
    }

    @DeleteMapping("/api/v1/users/{id}/block")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "unblockUser",
            summary = "Unblock a collector",
            description = "Idempotent (204 whether or not a block existed).")
    @ApiResponse(responseCode = "204", description = "No block remains")
    public void unblock(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable UUID id) {
        blockService.unblock(principal.userId(), id);
    }

    @GetMapping(path = "/api/v1/me/blocks", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(operationId = "listMyBlocks", summary = "Collectors the caller blocked")
    public List<BlockedUser> blocks(@AuthenticationPrincipal AuthenticatedUser principal) {
        return blockService.blockedBy(principal.userId());
    }
}
