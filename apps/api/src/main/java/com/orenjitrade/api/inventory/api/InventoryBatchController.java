package com.orenjitrade.api.inventory.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.binders.domain.ListingVisibility;
import com.orenjitrade.api.featureflags.domain.FeatureFlagKeys;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import com.orenjitrade.api.inventory.domain.InventoryBatchService;
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
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code POST /api/v1/inventory/items/batch}: the ready cards of a camera scan added to the
 * caller's inventory in one go (owner spec 2026-10-15, section 3.6). A controller of its own, next
 * to the inventory's, so the inventory's controller, requests and responses stay as they are.
 */
@RestController
@Validated
@Tag(name = "inventory", description = "The caller's inventory items, photos and bulk operations")
public class InventoryBatchController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final InventoryBatchService batchService;
    private final FeatureFlags featureFlags;

    public InventoryBatchController(InventoryBatchService batchService, FeatureFlags featureFlags) {
        this.batchService = batchService;
        this.featureFlags = featureFlags;
    }

    /** The visibility of the cards of a batch. */
    @Schema(name = "AddInventoryItemsBatchVisibility")
    public enum BatchVisibility {
        PRIVATE,
        PUBLIC
    }

    /**
     * A line: a printing and its copies.
     *
     * @param printingId catalog printing
     * @param quantity copies, 1 to 9999 (lines of one printing are summed)
     */
    @Schema(name = "AddInventoryItemsBatchLine", description = "A printing and its copies")
    public record BatchLine(
            @NotNull UUID printingId, @NotNull @Min(1) @Max(9999) Integer quantity) {}

    /**
     * The cards to add.
     *
     * @param visibility PRIVATE by default, or PUBLIC
     * @param binderId one of the caller's binders (404 otherwise); none by default
     * @param lines 1 to 500 lines
     */
    @Schema(name = "AddInventoryItemsBatchRequest", description = "Cards to add in one go")
    public record AddInventoryItemsBatchRequest(
            @Schema(description = "PRIVATE by default") @Nullable BatchVisibility visibility,
            @Schema(description = "One of the caller's binders; none by default")
                    @Nullable UUID binderId,
            @NotNull @Size(min = 1, max = 500) List<@NotNull @Valid BatchLine> lines) {}

    /**
     * What was added.
     *
     * @param itemsCreated new items
     * @param itemsRaised items that got extra copies
     * @param copiesAdded copies written
     * @param copiesNotAdded copies an item could not take (an item holds at most 9999)
     * @param createdItemIds the new items, in the order of the lines
     * @param raisedItemIds the items that got extra copies, in the order of the lines
     */
    @Schema(name = "AddInventoryItemsBatchResponse", description = "What a batch added")
    public record AddInventoryItemsBatchResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) int itemsCreated,
            @Schema(requiredMode = RequiredMode.REQUIRED) int itemsRaised,
            @Schema(requiredMode = RequiredMode.REQUIRED) int copiesAdded,
            @Schema(requiredMode = RequiredMode.REQUIRED) int copiesNotAdded,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<UUID> createdItemIds,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<UUID> raisedItemIds) {}

    @PostMapping(
            path = "/api/v1/inventory/items/batch",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "addInventoryItemsBatch",
            summary = "Add several cards at once (camera scan)",
            description =
                    "One transaction. Lines of the same printing are summed. Each line adds its"
                        + " copies to the caller's equal item (same printing, language, condition,"
                        + " edition and finish, same visibility and binder) or creates one with the"
                        + " defaults of a card added on the phone (the printing's language, edition"
                        + " and finish, no condition stated, TRADE_OR_SALE, offers off, CAD, no"
                        + " price). The items count as confirmed. `inventory.items.max` is checked"
                        + " for the whole batch: 429 LIMIT_REACHED (with `requested`) and nothing"
                        + " written. 404 when `binderId` is not one of the caller's binders, 404"
                        + " FEATURE_DISABLED while the flag cardTextScan is off. An Idempotency-Key"
                        + " repeats the first answer for 24 hours, whatever the body: nothing is"
                        + " added a second time.")
    @ApiResponse(responseCode = "200", description = "What was added")
    @ApiResponse(
            responseCode = "400",
            description =
                    "VALIDATION_FAILED (bad lines, unknown printings, a malformed Idempotency-Key)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND (binder) or FEATURE_DISABLED (cardTextScan is off)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description =
                    "BINDER_GAME_MISMATCH: a card of another game than the binder (stage G),"
                            + " nothing written",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "429",
            description = "LIMIT_REACHED (inventory.items.max), nothing written",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public AddInventoryItemsBatchResponse addBatch(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Parameter(
                            description =
                                    "The caller's key for this add (1 to 100 letters, digits or"
                                            + " . _ : -): the same key again gets the first"
                                            + " answer back for 24 hours")
                    @RequestHeader(name = "Idempotency-Key", required = false)
                    @Nullable String idempotencyKey,
            @Valid @RequestBody AddInventoryItemsBatchRequest body) {
        featureFlags.require(FeatureFlagKeys.CARD_TEXT_SCAN, principal.userId());
        InventoryBatchService.Outcome outcome =
                batchService.add(
                        principal.userId(),
                        new InventoryBatchService.Batch(
                                body.visibility() == BatchVisibility.PUBLIC
                                        ? ListingVisibility.PUBLIC
                                        : ListingVisibility.PRIVATE,
                                body.binderId(),
                                body.lines().stream()
                                        .map(
                                                line ->
                                                        new InventoryBatchService.Line(
                                                                line.printingId(), line.quantity()))
                                        .toList()),
                        idempotencyKey);
        return new AddInventoryItemsBatchResponse(
                outcome.created().size(),
                outcome.raised().size(),
                outcome.copiesAdded(),
                outcome.copiesNotAdded(),
                outcome.created(),
                outcome.raised());
    }
}
