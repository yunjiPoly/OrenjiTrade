package com.orenjitrade.api.cards.api;

import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.cards.domain.ImageMode;
import com.orenjitrade.api.cards.domain.SyncRunView;
import com.orenjitrade.api.cards.domain.images.CardImageCache;
import com.orenjitrade.api.cards.domain.images.CardImageCacheStatus;
import com.orenjitrade.api.cards.infra.SyncRunRepository;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.games.domain.GameService;
import com.orenjitrade.api.jobs.domain.JobRunService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Internal job triggers of the catalog and the card image cache (service token / Google OIDC), used
 * by the root npm scripts {@code catalog:import}, {@code card-images:status} and {@code
 * card-images:clear} (ADR 0015).
 */
@RestController
@Validated
@Tag(name = "internal", description = "Internal job triggers (service token / Google OIDC)")
public class InternalCatalogJobController {

    public static final String JOB_CLEAR = "card-images-clear";
    public static final String JOB_RECONCILE = "card-images-reconcile";

    private final CatalogImportService importService;
    private final SyncRunRepository runs;
    private final CardImageCache cache;
    private final GameService gameService;
    private final JobRunService jobRunService;

    public InternalCatalogJobController(
            CatalogImportService importService,
            SyncRunRepository runs,
            CardImageCache cache,
            GameService gameService,
            JobRunService jobRunService) {
        this.importService = importService;
        this.runs = runs;
        this.cache = cache;
        this.gameService = gameService;
        this.jobRunService = jobRunService;
    }

    @PostMapping(
            path = "/internal/jobs/catalog-import",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(
            operationId = "runCatalogImportJob",
            summary = "Queue a catalog import (service auth)",
            description =
                    "Same as `POST /admin/catalog/sync` for schedulers and the local `npm run"
                            + " catalog:import` script: metadata is always imported, `imageMode`"
                            + " (default REFERENCED for providers with image downloads) fills the"
                            + " capped local image cache. Poll `GET"
                            + " /internal/jobs/catalog-import/{id}` for the report. 409 while"
                            + " another import of the game is queued or running.")
    @ApiResponse(responseCode = "202", description = "Queued")
    @ApiResponse(responseCode = "409", description = "An import of the game is already running")
    public SyncRunView importCatalog(@Valid @RequestBody CatalogSyncRequest body) {
        ImageMode imageMode =
                body.imageMode() != null
                        ? body.imageMode()
                        : importService.defaultImageMode(body.provider());
        return importService.requestSystemSync(
                body.gameSlug(), body.provider(), body.mode(), imageMode, body.imageLimit());
    }

    @GetMapping(
            path = "/internal/jobs/catalog-import/{id}",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "getCatalogImportJob",
            summary = "One catalog import run with its report (service auth)")
    public SyncRunView importRun(@PathVariable UUID id) {
        return runs.find(id).orElseThrow(() -> ApiException.notFound("Sync run not found"));
    }

    @GetMapping(
            path = "/internal/jobs/card-images/status",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "getCardImageCacheJobStatus",
            summary = "Local card image cache status with its directory (service auth)")
    public InternalCacheStatus status() {
        return new InternalCacheStatus(cache.directory().toString(), cache.status());
    }

    @PostMapping(
            path = "/internal/jobs/card-images/clear",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "clearCardImageCacheJob",
            summary = "Delete cached card images (service auth)",
            description =
                    "Deletes the cached renditions (of one game with `game`) and releases their"
                            + " capacity; metadata and source references stay. Records a job run.")
    public AdminCardImageController.ClearResponse clear(
            @Parameter(description = "Only this game's images")
                    @RequestParam(required = false)
                    @Size(max = 32)
                    @Pattern(regexp = "^[a-z0-9]+(-[a-z0-9]+)*$")
                    @Nullable String game) {
        if (game != null && gameService.find(game).isEmpty()) {
            throw ApiException.validation(
                    "Validation failed", List.of(new ProblemFieldError("game", "unknown game")));
        }
        Map<String, Object> details = new LinkedHashMap<>();
        CardImageCache.ClearResult[] holder = new CardImageCache.ClearResult[1];
        jobRunService.run(
                JOB_CLEAR,
                () -> {
                    holder[0] = cache.clear(game);
                    details.put("game", game == null ? "*" : game);
                    details.put("images", holder[0].images());
                    details.put("filesDeleted", holder[0].filesDeleted());
                    details.put("bytesReleased", holder[0].bytesReleased());
                    return details;
                });
        CardImageCache.ClearResult result = holder[0];
        return new AdminCardImageController.ClearResponse(
                result.images(), result.filesDeleted(), result.bytesReleased());
    }

    @PostMapping(
            path = "/internal/jobs/card-images/reconcile",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "reconcileCardImageCacheJob",
            summary = "Reconcile cache files, rows and accounting (service auth)")
    public CardImageCache.ReconcileResult reconcile() {
        CardImageCache.ReconcileResult[] holder = new CardImageCache.ReconcileResult[1];
        jobRunService.run(
                JOB_RECONCILE,
                () -> {
                    holder[0] = cache.reconcile();
                    return Map.of(
                            "orphanFiles", holder[0].orphanFiles(),
                            "orphanTempFiles", holder[0].orphanTempFiles(),
                            "missingFiles", holder[0].missingFiles(),
                            "usedBytes", holder[0].usedBytes());
                });
        return holder[0];
    }

    /**
     * Cache status for the local scripts.
     *
     * @param directory absolute cache directory on the API host
     * @param status the figures
     */
    @Schema(name = "InternalCardImageCacheStatus")
    public record InternalCacheStatus(
            @Schema(requiredMode = RequiredMode.REQUIRED) String directory,
            @Schema(requiredMode = RequiredMode.REQUIRED) CardImageCacheStatus status) {}
}
