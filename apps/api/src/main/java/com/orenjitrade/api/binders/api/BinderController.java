package com.orenjitrade.api.binders.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.binders.api.BinderRequests.CreateBinderRequest;
import com.orenjitrade.api.binders.api.BinderRequests.PublishBinderRequest;
import com.orenjitrade.api.binders.api.BinderRequests.ReorderBindersRequest;
import com.orenjitrade.api.binders.api.BinderRequests.UpdateBinderRequest;
import com.orenjitrade.api.binders.domain.BinderChanges.BinderPatch;
import com.orenjitrade.api.binders.domain.BinderChanges.NewBinder;
import com.orenjitrade.api.binders.domain.BinderDetails;
import com.orenjitrade.api.binders.domain.BinderKind;
import com.orenjitrade.api.binders.domain.BinderService;
import com.orenjitrade.api.binders.domain.ListingVisibility;
import com.orenjitrade.api.common.PartialUpdate;
import com.orenjitrade.api.common.TimeProvider;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/** {@code /api/v1/binders}: the caller's binders (owner only; others' binders are 404). */
@RestController
@RequestMapping(path = "/api/v1/binders", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "binders", description = "The caller's binders: create, publish, confirm, reorder")
public class BinderController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final BinderService binderService;
    private final TimeProvider timeProvider;

    public BinderController(BinderService binderService, TimeProvider timeProvider) {
        this.binderService = binderService;
        this.timeProvider = timeProvider;
    }

    @GetMapping
    @Operation(
            operationId = "listMyBinders",
            summary = "The caller's binders",
            description = "In the caller's order (see PUT /binders/reorder).")
    public List<BinderResponse> list(@AuthenticationPrincipal AuthenticatedUser principal) {
        return responses(binderService.listMine(principal.userId()));
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "createBinder",
            summary = "Create a binder",
            description =
                    "Added at the end of the caller's list. PRIVATE unless `visibility` says"
                            + " otherwise; TEMPORARILY_PUBLIC needs `publicUntil` at most 30 days"
                            + " ahead. 429 LIMIT_REACHED (limitKey `binders.max`) beyond the plan's"
                            + " binder limit.")
    @ApiResponse(responseCode = "201", description = "Created")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "429",
            description = "LIMIT_REACHED (`binders.max`) or RATE_LIMITED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public ResponseEntity<BinderResponse> create(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody CreateBinderRequest body) {
        BinderDetails created =
                binderService.create(
                        principal.userId(),
                        new NewBinder(
                                body.name(),
                                body.description(),
                                body.kind(),
                                body.visibility(),
                                body.publicUntil(),
                                body.coverPrintingId()));
        return ResponseEntity.created(URI.create("/api/v1/binders/" + created.binder().id()))
                .body(BinderResponse.from(created, timeProvider.now()));
    }

    @GetMapping("/{id}")
    @Operation(operationId = "getBinder", summary = "One of the caller's binders")
    @ApiResponse(responseCode = "200", description = "The binder")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown binder or not the caller's",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public BinderResponse get(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable UUID id) {
        return BinderResponse.from(
                binderService.getMine(principal.userId(), id), timeProvider.now());
    }

    @PatchMapping(path = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateBinder",
            summary = "Update a binder (any subset of the fields)",
            description =
                    "Absent fields are unchanged; `publicUntil` and `coverPrintingId` may be null."
                            + " Making the binder PUBLIC or TEMPORARILY_PUBLIC confirms it and its"
                            + " items (like publish).",
            requestBody =
                    @io.swagger.v3.oas.annotations.parameters.RequestBody(
                            required = true,
                            content =
                                    @Content(
                                            mediaType = MediaType.APPLICATION_JSON_VALUE,
                                            schema =
                                                    @Schema(
                                                            implementation =
                                                                    UpdateBinderRequest.class))))
    @ApiResponse(responseCode = "200", description = "Updated binder")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown binder or not the caller's",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public BinderResponse update(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @RequestBody JsonNode body) {
        PartialUpdate patch = PartialUpdate.of(body).notNull("name", "description", "kind");
        String name = patch.text("name");
        String description = patch.text("description");
        BinderKind kind = patch.enumValue("kind", BinderKind.class);
        ListingVisibility visibility = patch.enumValue("visibility", ListingVisibility.class);
        if (patch.has("visibility") && !patch.hasValue("visibility")) {
            patch.reject("visibility", "must not be null");
        }
        Instant publicUntil = patch.instant("publicUntil");
        UUID cover = patch.uuid("coverPrintingId");
        patch.throwIfInvalid();
        BinderDetails updated =
                binderService.update(
                        principal.userId(),
                        id,
                        new BinderPatch(
                                name,
                                description,
                                kind,
                                visibility,
                                patch.has("publicUntil"),
                                publicUntil,
                                patch.has("coverPrintingId"),
                                cover));
        return BinderResponse.from(updated, timeProvider.now());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "deleteBinder",
            summary = "Delete a binder",
            description =
                    "Its items become unfiled (they keep their visibility only when the binder was"
                            + " PUBLIC without an end date, otherwise they become PRIVATE), or are"
                            + " deleted with `deleteItems=true`.")
    @ApiResponse(responseCode = "204", description = "Deleted")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown binder or not the caller's",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public void delete(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Parameter(description = "Also delete the binder's items")
                    @RequestParam(defaultValue = "false")
                    boolean deleteItems) {
        binderService.delete(principal.userId(), id, deleteItems);
    }

    @PostMapping(path = "/{id}/publish", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "publishBinder",
            summary = "Publish a binder",
            description =
                    "PUBLIC / UNTIL_DISABLED: public without an end date; ONE_HOUR / ONE_DAY:"
                        + " TEMPORARILY_PUBLIC until now + 1 h / 24 h. Publishing confirms the"
                        + " binder and its items (hidden stale items come back). Items still need"
                        + " their own visibility PUBLIC (the default inside a binder) to show.")
    @ApiResponse(responseCode = "200", description = "Published binder")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown binder or not the caller's",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public BinderResponse publish(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody PublishBinderRequest body) {
        return BinderResponse.from(
                binderService.publish(principal.userId(), id, body.mode()), timeProvider.now());
    }

    @PostMapping("/{id}/unpublish")
    @Operation(
            operationId = "unpublishBinder",
            summary = "Make a binder private",
            description = "Its items keep their own visibility.")
    @ApiResponse(responseCode = "200", description = "Private binder")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown binder or not the caller's",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public BinderResponse unpublish(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable UUID id) {
        return BinderResponse.from(
                binderService.unpublish(principal.userId(), id), timeProvider.now());
    }

    @PostMapping("/{id}/confirm")
    @Operation(
            operationId = "confirmBinder",
            summary = "Confirm a binder is still available",
            description =
                    "Refreshes the confirmation of the binder and every item in it: freshness back"
                            + " to ACTIVE, HIDDEN listings restored.")
    @ApiResponse(responseCode = "200", description = "Confirmed binder")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown binder or not the caller's",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public BinderResponse confirm(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable UUID id) {
        return BinderResponse.from(
                binderService.confirm(principal.userId(), id), timeProvider.now());
    }

    @PutMapping(path = "/reorder", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "reorderBinders",
            summary = "Reorder the caller's binders",
            description =
                    "The listed binders come first in the given order; the others keep their"
                        + " relative order after them. 400 for duplicates, 404 when an id is not"
                        + " one of the caller's binders. Returns every binder in the new order.")
    @ApiResponse(responseCode = "200", description = "Binders in the new order")
    public List<BinderResponse> reorder(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody ReorderBindersRequest body) {
        return responses(binderService.reorder(principal.userId(), body.binderIds()));
    }

    private List<BinderResponse> responses(List<BinderDetails> binders) {
        Instant now = timeProvider.now();
        return binders.stream().map(details -> BinderResponse.from(details, now)).toList();
    }
}
