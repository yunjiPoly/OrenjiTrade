package com.orenjitrade.api.inventory.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.common.PartialUpdate;
import com.orenjitrade.api.inventory.api.InventoryImportResponses.BulkResponse;
import com.orenjitrade.api.inventory.api.InventoryImportResponses.ImportResponse;
import com.orenjitrade.api.inventory.api.InventoryImportResponses.LimitsResponse;
import com.orenjitrade.api.inventory.api.InventoryImportResponses.RowChangeResponse;
import com.orenjitrade.api.inventory.api.InventoryImportResponses.RowResponse;
import com.orenjitrade.api.inventory.domain.imports.ImportChanges.BulkAction;
import com.orenjitrade.api.inventory.domain.imports.ImportChanges.RowPatch;
import com.orenjitrade.api.inventory.domain.imports.ImportSource;
import com.orenjitrade.api.inventory.domain.imports.ImportText;
import com.orenjitrade.api.inventory.domain.imports.InventoryImportService;
import com.orenjitrade.api.inventory.domain.imports.InventoryImportSettings;
import com.orenjitrade.api.inventory.domain.imports.PrintingChoice;
import com.orenjitrade.api.inventory.domain.imports.RowStatus;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.util.HashSet;
import java.util.List;
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

/**
 * {@code /api/v1/inventory/imports}: the caller's inventory imports (stage S5). A YDK deck file or
 * a Collectr CSV export is uploaded and becomes a preview; the caller edits the preview, then
 * commits it. An import belongs to its collector: everyone else gets 404.
 */
@RestController
@Validated
@RequestMapping(path = "/api/v1/inventory/imports", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(
        name = "inventory-import",
        description = "Import a YDK deck file or a Collectr CSV export into the caller's inventory")
public class InventoryImportController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    /** Fields of {@link UpdateImportRowRequest}. */
    static final List<String> ROW_FIELDS =
            List.of("printingId", "condition", "quantity", "included");

    private final InventoryImportService importService;
    private final InventoryImportSettings settings;

    public InventoryImportController(
            InventoryImportService importService, InventoryImportSettings settings) {
        this.importService = importService;
        this.settings = settings;
    }

    @GetMapping("/limits")
    @Operation(
            operationId = "getInventoryImportLimits",
            summary = "What an import file may be",
            description =
                    "The size and length limits of both sources and the time a preview is kept"
                            + " (admin settings). A client may check a file before it uploads it;"
                            + " the server applies the limits whatever the client did.")
    public LimitsResponse limits() {
        return LimitsResponse.from(settings.current());
    }

    @GetMapping
    @Operation(
            operationId = "listInventoryImports",
            summary = "The caller's imports that are still kept",
            description =
                    "Newest first, at most 20: the open preview (PENDING, not expired; there is at"
                            + " most one), a commit that was cut and waits to be finished"
                            + " (COMMITTING), and the results of recent imports (COMMITTED) until"
                            + " they are purged. An app that was closed in the middle of an"
                            + " import finds it here.")
    public List<ImportResponse> list(@AuthenticationPrincipal AuthenticatedUser principal) {
        return importService.list(principal.userId()).stream().map(ImportResponse::from).toList();
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            operationId = "createInventoryImport",
            summary = "Upload a file and get its preview",
            description =
                    "Multipart part `file` and parameter `source` (in the query string, or as a"
                        + " form field of the same multipart body): YDK (a deck file: `#main`,"
                        + " `#extra`, `!side`, one passcode per line) or COLLECTR_CSV (a CSV the"
                        + " collector exported from Collectr; the columns are found by their"
                        + " titles, prices are never read). The file must be UTF-8 text; what it"
                        + " is, is decided from its content, never from its name or declared type."
                        + " Optional `game` (COLLECTR_CSV): the game of rows that name none. The"
                        + " preview is stored for a limited time (`expiresAt`) and replaces the"
                        + " caller's previews no commit has started. Nothing is added to the"
                        + " inventory yet. 413 above the size limit, 415 for a file that is not"
                        + " UTF-8 text, 400 with `reason` for a file that cannot be imported."
                        + " Rate-limited (30 per hour).")
    @ApiResponse(responseCode = "201", description = "The preview")
    @ApiResponse(
            responseCode = "400",
            description =
                    "VALIDATION_FAILED (field `file`; reason EMPTY_FILE, TOO_MANY_LINES,"
                            + " TOO_MANY_ROWS, MISSING_COLUMNS, MALFORMED or NO_CARDS), or an"
                            + " unknown `source` or `game`",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "413",
            description = "PAYLOAD_TOO_LARGE (reason TOO_LARGE, `fileLimit` in bytes)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "415",
            description = "UNSUPPORTED_MEDIA_TYPE (reason NOT_TEXT)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "429",
            description = "RATE_LIMITED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public ResponseEntity<ImportResponse> create(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @RequestPart("file") MultipartFile file,
            @Parameter(description = "YDK or COLLECTR_CSV") @RequestParam("source")
                    ImportSource source,
            @Parameter(description = "COLLECTR_CSV: game slug of rows that name no game")
                    @RequestParam(name = "game", required = false)
                    @Size(max = 32)
                    @Nullable String game) {
        int maxBytes = settings.current().maxBytes(source);
        if (file.getSize() > maxBytes) {
            throw new ApiException(
                            ErrorCode.PAYLOAD_TOO_LARGE,
                            "The file is larger than " + ImportText.describeBytes(maxBytes))
                    .withProperty("reason", "TOO_LARGE")
                    .withProperty("fileLimit", maxBytes);
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read the upload", e);
        }
        ImportResponse created =
                ImportResponse.from(importService.preview(principal.userId(), source, bytes, game));
        return ResponseEntity.created(URI.create("/api/v1/inventory/imports/" + created.id()))
                .body(created);
    }

    @GetMapping("/{id}")
    @Operation(
            operationId = "getInventoryImport",
            summary = "One of the caller's imports",
            description =
                    "The import with its counts; while a commit is under way, how many chunks are"
                            + " written (`result`).")
    @ApiResponse(responseCode = "200", description = "The import")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown, purged or not the caller's import",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "410",
            description = "IMPORT_EXPIRED: the preview is older than its time to live",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public ImportResponse get(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable UUID id) {
        return ImportResponse.from(importService.get(principal.userId(), id));
    }

    @GetMapping("/{id}/rows")
    @Operation(
            operationId = "listInventoryImportRows",
            summary = "The rows of an import (pages)",
            description =
                    "In file order. `status` keeps the rows of one status: READY,"
                            + " CHOOSE_PRINTING or UNMATCHED. `printingChoice` keeps the rows whose"
                            + " printing was chosen one way: MOST_RECENT_ASSUMED lists the rows"
                            + " `summary.assumedPrintings` counts, for the collector to check."
                            + " Both together keep the rows that fit both.")
    @ApiResponse(responseCode = "200", description = "One page of rows")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown, purged or not the caller's import",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "410",
            description = "IMPORT_EXPIRED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public PageResponse<RowResponse> rows(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @RequestParam(required = false) @Nullable RowStatus status,
            @RequestParam(required = false) @Nullable PrintingChoice printingChoice,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10_000) int page,
            @RequestParam(defaultValue = "50") @Min(1) @Max(100) int size) {
        return InventoryImportResponses.page(
                importService.rows(principal.userId(), id, status, printingChoice, page, size));
    }

    @PatchMapping(path = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateInventoryImport",
            summary = "Which sections of a deck count",
            description =
                    "YDK only. A section that does not count gives none of its copies; a card"
                            + " that is in no section that counts leaves the import (`inScope`"
                            + " false). Absent fields are unchanged.")
    @ApiResponse(responseCode = "200", description = "The preview with its new counts")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED (a CSV import has no sections)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description = "IMPORT_ALREADY_COMMITTED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public ImportResponse update(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateImportRequest body) {
        return ImportResponse.from(
                importService.setSections(
                        principal.userId(),
                        id,
                        body.includeMain(),
                        body.includeExtra(),
                        body.includeSide()));
    }

    @PatchMapping(path = "/{id}/rows/{rowId}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateInventoryImportRow",
            summary = "Change a row of a preview",
            description =
                    "Any subset of the fields; absent fields are unchanged. `printingId`: a"
                        + " printing of the row's card (null: back to \"choose a printing\")."
                        + " `condition`: a condition of the card's game. `quantity`: 1-9999 (null:"
                        + " back to the copies of the file). `included`: false leaves the row out."
                        + " A row that fits nothing in the catalog cannot be changed (409).",
            requestBody =
                    @io.swagger.v3.oas.annotations.parameters.RequestBody(
                            required = true,
                            content =
                                    @Content(
                                            mediaType = MediaType.APPLICATION_JSON_VALUE,
                                            schema =
                                                    @Schema(
                                                            implementation =
                                                                    UpdateImportRowRequest.class))))
    @ApiResponse(responseCode = "200", description = "The row and the preview with its new counts")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "404",
            description = "Unknown import or row, or not the caller's",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description = "IMPORT_ALREADY_COMMITTED, or CONFLICT for a row that fits nothing",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public RowChangeResponse updateRow(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @PathVariable UUID rowId,
            @RequestBody JsonNode body) {
        PartialUpdate patch = PartialUpdate.of(body).notNull("condition", "included");
        Set<String> present = new HashSet<>();
        for (String field : ROW_FIELDS) {
            if (patch.has(field)) {
                present.add(field);
            }
        }
        RowPatch rowPatch =
                new RowPatch(
                        present,
                        patch.uuid("printingId"),
                        patch.text("condition"),
                        patch.integer("quantity"),
                        patch.bool("included"));
        patch.throwIfInvalid();
        return RowChangeResponse.from(
                importService.updateRow(principal.userId(), id, rowId, rowPatch));
    }

    @PostMapping(path = "/{id}/bulk", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "bulkUpdateInventoryImport",
            summary = "One action on every row of a preview it applies to",
            description =
                    "USE_MOST_RECENT_PRINTING: every matched row without a printing gets the most"
                        + " recent printing of its card (by the release date of the set), among the"
                        + " printings its file narrowed it to when it did. Where that most recent"
                        + " set holds the card in several editions or finishes, the plain copy"
                        + " (Unlimited, normal finish) is taken and the row is marked"
                        + " MOST_RECENT_ASSUMED (`assumed` counts them); a row whose printings of"
                        + " that date differ otherwise stays to choose (`undecided`). SET_CONDITION"
                        + " (`condition`): every matched row whose condition nobody chose"
                        + " (`conditionSource` DEFAULT) gets that condition; rows of a game that"
                        + " does not have it are left alone.")
    @ApiResponse(responseCode = "200", description = "Rows changed and the preview")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description = "IMPORT_ALREADY_COMMITTED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public BulkResponse bulk(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody BulkImportRequest body) {
        return BulkResponse.from(
                importService.bulk(principal.userId(), id, body.action(), body.condition()));
    }

    @PostMapping(path = "/{id}/commit", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "commitInventoryImport",
            summary = "Add the rows of a preview to the inventory",
            description =
                    "Idempotent: a second commit of the same import, also one sent while the first"
                        + " is running, adds nothing and answers with the same result. Rows that"
                        + " are equal (printing, condition, edition, language) are one item; a row"
                        + " equal to a private item the caller already has raises that item's"
                        + " quantity instead of adding a second one; every new item is PRIVATE and"
                        + " unfiled, and an item the caller shows is never raised (nothing an"
                        + " import adds is public). Up to 500 items are one transaction; above that"
                        + " the import is written in chunks of 500, in order, and a commit that was"
                        + " cut answers COMMITTING: commit again to finish (it continues after the"
                        + " last chunk written). The usage limit `inventory.items.max` is checked"
                        + " for the whole import before the first item (429 LIMIT_REACHED, nothing"
                        + " written), and the items of the chunks still to write count as used from"
                        + " then on. Rows that still need a printing refuse the commit (409"
                        + " IMPORT_ROWS_UNRESOLVED) unless `skipUnresolved` leaves them out."
                        + " Rate-limited (30 per hour).")
    @ApiResponse(responseCode = "200", description = "The import, COMMITTED, with its result")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown, purged or not the caller's import",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description = "IMPORT_ROWS_UNRESOLVED (`unresolved`), IMPORT_EMPTY, or CONFLICT",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "410",
            description = "IMPORT_EXPIRED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "429",
            description = "LIMIT_REACHED (`inventory.items.max`, with `requested`) or RATE_LIMITED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public ImportResponse commit(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody(required = false) @Nullable CommitImportRequest body) {
        boolean skipUnresolved = body != null && Boolean.TRUE.equals(body.skipUnresolved());
        return ImportResponse.from(importService.commit(principal.userId(), id, skipUnresolved));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "deleteInventoryImport",
            summary = "Discard a preview",
            description = "Only while no commit has started; nothing was added to the inventory.")
    @ApiResponse(responseCode = "204", description = "Discarded")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown, purged or not the caller's import",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description = "IMPORT_ALREADY_COMMITTED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public void delete(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable UUID id) {
        importService.discard(principal.userId(), id);
    }

    /** {@code PATCH /inventory/imports/{id}}. */
    @Schema(
            name = "UpdateInventoryImportRequest",
            description = "Which sections of a deck count; absent fields are unchanged")
    public record UpdateImportRequest(
            @Nullable Boolean includeMain,
            @Nullable Boolean includeExtra,
            @Nullable Boolean includeSide) {}

    /** {@code PATCH /inventory/imports/{id}/rows/{rowId}}: any subset of the fields. */
    @Schema(
            name = "UpdateInventoryImportRowRequest",
            description =
                    "Any subset of the fields; absent fields are unchanged. printingId null means"
                            + " \"to choose\" again; quantity null means the copies of the file")
    public record UpdateImportRowRequest(
            @Schema(nullable = true) @Nullable UUID printingId,
            @Size(max = 32) @Schema(example = "NEAR_MINT") @Nullable String condition,
            @Schema(nullable = true) @Min(1) @Max(9999) @Nullable Integer quantity,
            @Nullable Boolean included) {}

    /** {@code POST /inventory/imports/{id}/bulk}. */
    @Schema(name = "BulkInventoryImportRequest", description = "A bulk action on a preview")
    public record BulkImportRequest(
            @NotNull BulkAction action,
            @Size(max = 32)
                    @Schema(description = "Required for SET_CONDITION", example = "NEAR_MINT")
                    @Nullable String condition) {}

    /** {@code POST /inventory/imports/{id}/commit}. */
    @Schema(name = "CommitInventoryImportRequest", description = "How to commit a preview")
    public record CommitImportRequest(
            @Schema(
                            description =
                                    "Leave out the rows that still need a printing instead of"
                                            + " refusing the commit",
                            defaultValue = "false")
                    @Nullable Boolean skipUnresolved) {}
}
