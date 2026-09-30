package com.orenjitrade.api.inventory.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.binders.domain.ListingVisibility;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.common.PartialUpdate;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.inventory.api.InventoryRequests.BulkInventoryRequest;
import com.orenjitrade.api.inventory.api.InventoryRequests.CreateInventoryItemRequest;
import com.orenjitrade.api.inventory.api.InventoryRequests.UpdateInventoryItemRequest;
import com.orenjitrade.api.inventory.api.InventoryResponses.BulkInventoryResponse;
import com.orenjitrade.api.inventory.api.InventoryResponses.InventoryItemResponse;
import com.orenjitrade.api.inventory.api.InventoryResponses.InventorySummaryResponse;
import com.orenjitrade.api.inventory.domain.Availability;
import com.orenjitrade.api.inventory.domain.InventoryChanges.BulkRequest;
import com.orenjitrade.api.inventory.domain.InventoryChanges.ItemPatch;
import com.orenjitrade.api.inventory.domain.InventoryChanges.NewItem;
import com.orenjitrade.api.inventory.domain.InventoryChanges.OwnerQuery;
import com.orenjitrade.api.inventory.domain.InventoryChanges.SortKey;
import com.orenjitrade.api.inventory.domain.InventoryItemView;
import com.orenjitrade.api.inventory.domain.InventoryService;
import com.orenjitrade.api.inventory.domain.ItemImageProcessor;
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
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.JsonNode;

/** {@code /api/v1/inventory}: the caller's inventory (owner only; others' items are 404). */
@RestController
@Validated
@RequestMapping(path = "/api/v1/inventory", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "inventory", description = "The caller's inventory items, photos and bulk operations")
public class InventoryController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    /** Fields of {@link UpdateInventoryItemRequest}. */
    static final List<String> PATCH_FIELDS =
            List.of(
                    "printingId",
                    "quantity",
                    "condition",
                    "language",
                    "edition",
                    "finish",
                    "askingPrice",
                    "currency",
                    "availability",
                    "acceptsOffers",
                    "notes",
                    "publicNotes",
                    "visibility",
                    "publicUntil",
                    "binderId");

    private final InventoryService inventoryService;
    private final TimeProvider timeProvider;

    public InventoryController(InventoryService inventoryService, TimeProvider timeProvider) {
        this.inventoryService = inventoryService;
        this.timeProvider = timeProvider;
    }

    @GetMapping("/items")
    @Operation(
            operationId = "listInventoryItems",
            summary = "The caller's items (filters, sort, pages)",
            description =
                    "`query` matches card names (accent-insensitive, full text), printing codes"
                            + " (prefix) and set codes/names. `binderId` limits to one binder,"
                            + " `unfiled=true` to items without a binder. `sort`: updated (default,"
                            + " newest first), name (A-Z) or price (highest first); `direction`"
                            + " overrides the order.")
    @ApiResponse(responseCode = "200", description = "One page of items")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public PageResponse<InventoryItemResponse> list(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Parameter(description = "Card name, printing code or set")
                    @RequestParam(required = false)
                    @Size(max = 100)
                    @Nullable String query,
            @Parameter(description = "Game slug") @RequestParam(required = false) @Size(max = 32)
                    @Nullable String game,
            @RequestParam(required = false) @Nullable UUID binderId,
            @Parameter(description = "Only items without a binder")
                    @RequestParam(defaultValue = "false")
                    boolean unfiled,
            @RequestParam(required = false) @Nullable ListingVisibility visibility,
            @RequestParam(required = false) @Nullable Availability availability,
            @Parameter(description = "Condition code, e.g. NEAR_MINT")
                    @RequestParam(required = false)
                    @Size(max = 32)
                    @Nullable String condition,
            @RequestParam(required = false) @Nullable FreshnessState freshness,
            @Parameter(
                            description = "updated | name | price",
                            schema =
                                    @Schema(
                                            allowableValues = {"updated", "name", "price"},
                                            defaultValue = "updated"))
                    @RequestParam(defaultValue = "updated")
                    String sort,
            @Parameter(
                            description =
                                    "asc | desc (default: desc for updated and price, asc for"
                                            + " name)",
                            schema = @Schema(allowableValues = {"asc", "desc"}))
                    @RequestParam(required = false)
                    @Nullable String direction,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10_000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return responses(
                inventoryService.list(
                        principal.userId(),
                        ownerQuery(
                                query,
                                game,
                                binderId,
                                unfiled,
                                visibility,
                                availability,
                                condition,
                                freshness,
                                sort,
                                direction,
                                page,
                                size)));
    }

    @PostMapping(path = "/items", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "createInventoryItem",
            summary = "Add an item",
            description =
                    "Language, edition and finish default to the printing's; condition to"
                            + " NEAR_MINT (must be one of the game's conditions); currency to CAD."
                            + " Visibility defaults to PUBLIC inside a binder (the binder decides"
                            + " whether it shows) and PRIVATE otherwise; TEMPORARILY_PUBLIC needs"
                            + " `publicUntil` at most 30 days ahead.")
    @ApiResponse(responseCode = "201", description = "Created")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "404",
            description = "binderId is not one of the caller's binders",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public ResponseEntity<InventoryItemResponse> create(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody CreateInventoryItemRequest body) {
        InventoryItemView created =
                inventoryService.create(
                        principal.userId(),
                        new NewItem(
                                body.printingId(),
                                body.quantity(),
                                body.condition(),
                                body.language(),
                                body.edition(),
                                body.finish(),
                                body.askingPrice(),
                                body.currency(),
                                body.availability(),
                                body.acceptsOffers(),
                                body.notes(),
                                body.publicNotes(),
                                body.visibility(),
                                body.publicUntil(),
                                body.binderId()));
        return ResponseEntity.created(URI.create("/api/v1/inventory/items/" + created.row().id()))
                .body(InventoryItemResponse.from(created, timeProvider.now()));
    }

    @GetMapping("/items/{id}")
    @Operation(operationId = "getInventoryItem", summary = "One of the caller's items")
    @ApiResponse(responseCode = "200", description = "The item")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown, deleted or not the caller's item",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public InventoryItemResponse get(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable UUID id) {
        return InventoryItemResponse.from(
                inventoryService.get(principal.userId(), id), timeProvider.now());
    }

    @PatchMapping(path = "/items/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateInventoryItem",
            summary = "Update an item (any subset of the fields)",
            description =
                    "Absent fields are unchanged. `askingPrice`, `publicUntil`, `binderId`, `notes`"
                        + " and `publicNotes` may be null to clear them. TEMPORARILY_PUBLIC needs"
                        + " `publicUntil` at most 30 days ahead. Making the item public confirms"
                        + " it.",
            requestBody =
                    @io.swagger.v3.oas.annotations.parameters.RequestBody(
                            required = true,
                            content =
                                    @Content(
                                            mediaType = MediaType.APPLICATION_JSON_VALUE,
                                            schema =
                                                    @Schema(
                                                            implementation =
                                                                    UpdateInventoryItemRequest
                                                                            .class))))
    @ApiResponse(responseCode = "200", description = "Updated item")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown, deleted or not the caller's item (or binder)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public InventoryItemResponse update(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @RequestBody JsonNode body) {
        PartialUpdate patch =
                PartialUpdate.of(body)
                        .notNull(
                                "printingId",
                                "quantity",
                                "condition",
                                "language",
                                "edition",
                                "finish",
                                "currency",
                                "availability",
                                "acceptsOffers",
                                "visibility");
        Set<String> present = new HashSet<>();
        for (String field : PATCH_FIELDS) {
            if (patch.has(field)) {
                present.add(field);
            }
        }
        ItemPatch itemPatch =
                new ItemPatch(
                        present,
                        patch.uuid("printingId"),
                        patch.integer("quantity"),
                        patch.text("condition"),
                        patch.text("language"),
                        patch.text("edition"),
                        patch.text("finish"),
                        patch.decimal("askingPrice"),
                        patch.text("currency"),
                        patch.enumValue("availability", Availability.class),
                        patch.bool("acceptsOffers"),
                        patch.text("notes"),
                        patch.text("publicNotes"),
                        patch.enumValue("visibility", ListingVisibility.class),
                        patch.instant("publicUntil"),
                        patch.uuid("binderId"));
        patch.throwIfInvalid();
        return InventoryItemResponse.from(
                inventoryService.update(principal.userId(), id, itemPatch), timeProvider.now());
    }

    @DeleteMapping("/items/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "deleteInventoryItem",
            summary = "Delete an item",
            description = "Soft delete: the item disappears everywhere; its photos are removed.")
    @ApiResponse(responseCode = "204", description = "Deleted")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown, deleted or not the caller's item",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public void delete(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable UUID id) {
        inventoryService.delete(principal.userId(), id);
    }

    @PostMapping("/items/{id}/confirm")
    @Operation(
            operationId = "confirmInventoryItem",
            summary = "Confirm an item is still available",
            description =
                    "Refreshes `confirmedAt` (and the binder's): freshness back to ACTIVE, a HIDDEN"
                            + " item becomes public again when its visibility allows it.")
    @ApiResponse(responseCode = "200", description = "Confirmed item")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown, deleted or not the caller's item",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public InventoryItemResponse confirm(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable UUID id) {
        return InventoryItemResponse.from(
                inventoryService.confirm(principal.userId(), id), timeProvider.now());
    }

    @PostMapping(path = "/items/{id}/images", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            operationId = "uploadInventoryItemImage",
            summary = "Add a photo to an item",
            description =
                    "Multipart part `file`: JPEG, PNG or WebP up to 8 MB (type sniffed from the"
                        + " content). Re-encoded as JPEG, at most 1600 px on the long side, without"
                        + " any metadata (EXIF/GPS stripped). At most 4 photos per item (409). 413"
                        + " above 8 MB, 415 for other types, 400 for unreadable images."
                        + " Rate-limited (60 per hour).")
    @ApiResponse(responseCode = "201", description = "The item with its photos")
    @ApiResponse(
            responseCode = "409",
            description = "CONFLICT: the item already has 4 photos",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "413",
            description = "PAYLOAD_TOO_LARGE",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "415",
            description = "UNSUPPORTED_MEDIA_TYPE",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public ResponseEntity<InventoryItemResponse> uploadImage(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @RequestPart("file") MultipartFile file) {
        if (file.getSize() > ItemImageProcessor.MAX_BYTES) {
            throw new ApiException(ErrorCode.PAYLOAD_TOO_LARGE, "The image must be at most 8 MB");
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read the upload", e);
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(
                        InventoryItemResponse.from(
                                inventoryService.addImage(principal.userId(), id, bytes),
                                timeProvider.now()));
    }

    @DeleteMapping("/items/{id}/images/{imageId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "deleteInventoryItemImage", summary = "Remove a photo of an item")
    @ApiResponse(responseCode = "204", description = "Removed")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown item or photo",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public void deleteImage(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @PathVariable UUID imageId) {
        inventoryService.deleteImage(principal.userId(), id, imageId);
    }

    @PostMapping(path = "/items/bulk", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "bulkUpdateInventoryItems",
            summary = "Bulk operation on the caller's items",
            description =
                    "One transaction. SET_VISIBILITY (`visibility`, `publicUntil` for"
                        + " TEMPORARILY_PUBLIC), MOVE_TO_BINDER (`binderId`; null = unfiled),"
                        + " SET_AVAILABILITY (`availability`), CONFIRM, DELETE. Items that are not"
                        + " the caller's (or unknown/deleted) are skipped as NOT_FOUND, items"
                        + " already in the requested state as UNCHANGED. 404 when `binderId` is not"
                        + " one of the caller's binders.")
    @ApiResponse(responseCode = "200", description = "Outcome")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public BulkInventoryResponse bulk(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody BulkInventoryRequest body) {
        return BulkInventoryResponse.from(
                inventoryService.bulk(
                        principal.userId(),
                        new BulkRequest(
                                body.itemIds(),
                                body.action(),
                                body.visibility(),
                                body.publicUntil(),
                                body.binderId(),
                                body.availability())));
    }

    @GetMapping("/summary")
    @Operation(
            operationId = "getInventorySummary",
            summary = "Totals of the caller's inventory",
            description =
                    "Item and copy totals, items per visibility and game, freshness counts, items"
                            + " public right now and the next temporary publication end.")
    public InventorySummaryResponse summary(@AuthenticationPrincipal AuthenticatedUser principal) {
        return InventorySummaryResponse.from(inventoryService.summary(principal.userId()));
    }

    // ---------------------------------------------------------------------------------------
    // Helpers (shared with the binder items route)
    // ---------------------------------------------------------------------------------------

    private PageResponse<InventoryItemResponse> responses(PageResponse<InventoryItemView> page) {
        return InventoryResponses.ownerPage(page, timeProvider.now());
    }

    static OwnerQuery ownerQuery(
            @Nullable String query,
            @Nullable String game,
            @Nullable UUID binderId,
            boolean unfiled,
            @Nullable ListingVisibility visibility,
            @Nullable Availability availability,
            @Nullable String condition,
            @Nullable FreshnessState freshness,
            String sort,
            @Nullable String direction,
            int page,
            int size) {
        SortKey key;
        try {
            key = SortKey.valueOf(sort.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(new ProblemFieldError("sort", "must be updated, name or price")));
        }
        boolean descending = key != SortKey.NAME;
        if (direction != null && !direction.isBlank()) {
            String normalised = direction.trim().toLowerCase(Locale.ROOT);
            if (!normalised.equals("asc") && !normalised.equals("desc")) {
                throw ApiException.validation(
                        "Validation failed",
                        List.of(new ProblemFieldError("direction", "must be asc or desc")));
            }
            descending = normalised.equals("desc");
        }
        return new OwnerQuery(
                query == null || query.isBlank() ? null : query.trim(),
                game == null || game.isBlank() ? null : game.trim().toLowerCase(Locale.ROOT),
                binderId,
                unfiled,
                visibility,
                availability,
                condition == null || condition.isBlank()
                        ? null
                        : condition.trim().toUpperCase(Locale.ROOT),
                freshness,
                key,
                descending,
                page,
                size);
    }
}
