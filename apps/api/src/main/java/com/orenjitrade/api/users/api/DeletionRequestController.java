package com.orenjitrade.api.users.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.users.domain.AccountDeletionService;
import com.orenjitrade.api.users.domain.DeletionRequestView;
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
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/**
 * {@code /api/v1/me/deletion-requests}: the owner's account deletion (request, list, cancel). Works
 * while the account is {@code DELETION_REQUESTED} and before the terms are accepted.
 */
@RestController
@RequestMapping(path = "/api/v1/me/deletion-requests", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "account", description = "Data export and account deletion of the caller")
public class DeletionRequestController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final AccountDeletionService accountDeletionService;

    public DeletionRequestController(AccountDeletionService accountDeletionService) {
        this.accountDeletionService = accountDeletionService;
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "requestAccountDeletion",
            summary = "Request the deletion of the caller's account",
            description =
                    "Needs an ID token whose `auth_time` is at most 5 minutes old (401"
                        + " REAUTHENTICATION_REQUIRED otherwise). On success the account becomes"
                        + " DELETION_REQUESTED, every identity-provider session is revoked (signed"
                        + " out everywhere; signing in again only gives access to GET /me, GET"
                        + " /me/export and these deletion endpoints), the collector disappears from"
                        + " the map and the deletion runs after a 7-day grace period. 409"
                        + " DELETION_BLOCKED (extension `blockers[]`) while obligations are open;"
                        + " 409 CONFLICT when a request is already pending.")
    @ApiResponse(responseCode = "201", description = "Deletion scheduled")
    @ApiResponse(
            responseCode = "409",
            description = "Already pending (CONFLICT) or blocked (DELETION_BLOCKED, `blockers[]`)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public ResponseEntity<DeletionRequestResponse> request(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody CreateDeletionRequest body) {
        DeletionRequestView view =
                accountDeletionService.request(
                        principal.userId(),
                        principal.authTime(),
                        body.reason(),
                        Boolean.TRUE.equals(body.exportFirst()));
        return ResponseEntity.created(
                        ServletUriComponentsBuilder.fromCurrentRequestUri()
                                .path("/{id}")
                                .buildAndExpand(view.id())
                                .toUri())
                .body(DeletionRequestResponse.from(view));
    }

    @GetMapping
    @Operation(
            operationId = "listAccountDeletionRequests",
            summary = "The caller's deletion requests",
            description =
                    "Newest first; lets clients find the pending request to cancel it after a"
                            + " reload.")
    public List<DeletionRequestResponse> list(
            @AuthenticationPrincipal AuthenticatedUser principal) {
        return accountDeletionService.requestsOf(principal.userId()).stream()
                .map(DeletionRequestResponse::from)
                .toList();
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "cancelAccountDeletion",
            summary = "Cancel a pending deletion during the grace period",
            description =
                    "Re-activates the account (and its map presence). 404 when the request is not"
                            + " the caller's, 409 when it is no longer pending.")
    @ApiResponse(responseCode = "204", description = "Cancelled")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown request",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public void cancel(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable UUID id) {
        accountDeletionService.cancel(principal.userId(), id);
    }
}
