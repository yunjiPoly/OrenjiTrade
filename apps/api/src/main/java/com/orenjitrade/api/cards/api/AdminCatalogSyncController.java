package com.orenjitrade.api.cards.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.cards.domain.CatalogImportReport;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.cards.domain.ImageMode;
import com.orenjitrade.api.cards.domain.SyncRunView;
import com.orenjitrade.api.cards.infra.SyncRunRepository;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.games.domain.GameService;
import com.orenjitrade.api.games.domain.GameView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** {@code /api/v1/admin/catalog}: provider syncs and their runs (ADMIN, SUPER_ADMIN). */
@RestController
@RequestMapping(path = "/api/v1/admin/catalog", produces = MediaType.APPLICATION_JSON_VALUE)
@Validated
@Tag(name = "admin-catalog", description = "Catalog administration (admin console)")
public class AdminCatalogSyncController {

    private final CatalogImportService importService;
    private final SyncRunRepository runs;
    private final GameService gameService;

    public AdminCatalogSyncController(
            CatalogImportService importService, SyncRunRepository runs, GameService gameService) {
        this.importService = importService;
        this.runs = runs;
        this.gameService = gameService;
    }

    @GetMapping("/providers")
    @Operation(
            operationId = "listCatalogProviders",
            summary = "Card providers and the games they serve (ADMIN, SUPER_ADMIN)")
    public Map<String, List<String>> providers() {
        return importService.providers();
    }

    @PostMapping(path = "/sync", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(
            operationId = "requestCatalogSync",
            summary = "Queue a catalog import (ADMIN, SUPER_ADMIN)",
            description =
                    "Returns the QUEUED run at once; the import runs asynchronously and is"
                            + " idempotent (unchanged rows are not rewritten). Metadata is always"
                            + " imported; `imageMode` then fills the local card image cache"
                            + " (REFERENCED by default for providers with image downloads such as"
                            + " `ygoprodeck`, capped at CARD_IMAGE_LOCAL_CACHE_MAX_MB). Poll"
                            + " `GET /admin/catalog/sync-runs/{id}`. 409 while another import of"
                            + " the game is queued or running. Audited (`catalog.sync.request`).")
    @ApiResponse(responseCode = "202", description = "Queued")
    @ApiResponse(responseCode = "409", description = "An import of the game is already running")
    public SyncRunView sync(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @Valid @RequestBody CatalogSyncRequest body) {
        ImageMode imageMode =
                body.imageMode() != null
                        ? body.imageMode()
                        : importService.defaultImageMode(body.provider());
        return importService.requestSync(
                actor, body.gameSlug(), body.provider(), body.mode(), imageMode, body.imageLimit());
    }

    @GetMapping("/sync-runs")
    @Operation(
            operationId = "listCatalogSyncRuns",
            summary = "Catalog import runs (ADMIN, SUPER_ADMIN)",
            description = "Newest first, optionally for one game.")
    public PageResponse<SyncRunView> syncRuns(
            @Parameter(description = "Game slug") @RequestParam(required = false) @Size(max = 32)
                    @Nullable String game,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        @Nullable UUID gameId = null;
        if (game != null && !game.isBlank()) {
            gameId =
                    gameService
                            .find(game.trim())
                            .map(GameView::id)
                            .orElseThrow(() -> ApiException.notFound("Game not found"));
        }
        return PageResponse.of(runs.page(gameId, page, size), page, size, runs.count(gameId));
    }

    @GetMapping("/sync-runs/{id}")
    @Operation(
            operationId = "getCatalogSyncRun",
            summary = "One catalog import run (ADMIN, SUPER_ADMIN)")
    public SyncRunView syncRun(@PathVariable UUID id) {
        return runs.find(id).orElseThrow(() -> ApiException.notFound("Sync run not found"));
    }

    @GetMapping("/sync-runs/{id}/report")
    @Operation(
            operationId = "getCatalogSyncRunReport",
            summary = "Report of one catalog import run (ADMIN, SUPER_ADMIN)",
            description =
                    "Counts of cards, sets and printings, image cache fill (downloaded, already"
                            + " cached, skipped because the cache is full, failed, missing at the"
                            + " source), cache figures and the first errors. Available while the"
                            + " run is in progress; 404 for runs without a report.")
    public CatalogImportReport syncRunReport(@PathVariable UUID id) {
        SyncRunView run =
                runs.find(id).orElseThrow(() -> ApiException.notFound("Sync run not found"));
        if (run.report() == null) {
            throw ApiException.notFound("This run has no report yet");
        }
        return run.report();
    }
}
