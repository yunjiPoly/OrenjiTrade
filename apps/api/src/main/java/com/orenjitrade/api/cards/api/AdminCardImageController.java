package com.orenjitrade.api.cards.api;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.cards.domain.images.CardImageCache;
import com.orenjitrade.api.cards.domain.images.CardImageCacheStatus;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.games.domain.GameService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/admin/card-images}: the local card image cache (ADR 0015) for administrators
 * (ADMIN, SUPER_ADMIN). Every write is audited.
 */
@RestController
@RequestMapping(path = "/api/v1/admin/card-images", produces = MediaType.APPLICATION_JSON_VALUE)
@Validated
@Tag(name = "admin-catalog", description = "Catalog administration (admin console)")
public class AdminCardImageController {

    public static final String TARGET_CACHE = "CARD_IMAGE_CACHE";
    public static final String TARGET_IMAGE = "CARD_IMAGE";

    private final CardImageCache cache;
    private final GameService gameService;
    private final AuditService auditService;

    public AdminCardImageController(
            CardImageCache cache, GameService gameService, AuditService auditService) {
        this.cache = cache;
        this.gameService = gameService;
        this.auditService = auditService;
    }

    @GetMapping("/status")
    @Operation(
            operationId = "getCardImageCacheStatus",
            summary = "Local card image cache status (ADMIN, SUPER_ADMIN)",
            description =
                    "Used, reserved and remaining bytes, the limit (CARD_IMAGE_LOCAL_CACHE_MAX_MB,"
                            + " at most 5 GB = 5120 MiB; byte figures are 64-bit) and provider"
                            + " artworks per cache status and game.")
    public CardImageCacheStatus status() {
        return cache.status();
    }

    @PostMapping(path = "/clear", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "clearCardImageCache",
            summary = "Delete cached card images (ADMIN, SUPER_ADMIN)",
            description =
                    "Deletes the cached renditions (of one game when `game` is given) and releases"
                            + " their capacity; card metadata and image source references stay."
                            + " Audited (`card_images.cache.clear`).")
    public ClearResponse clear(
            @AuthenticationPrincipal AuthenticatedUser actor, @RequestBody ClearRequest body) {
        @Nullable String game = blankToNull(body.game());
        if (game != null && gameService.find(game).isEmpty()) {
            throw ApiException.validation(
                    "Validation failed", List.of(new ProblemFieldError("game", "unknown game")));
        }
        CardImageCache.ClearResult result = cache.clear(game);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("game", game == null ? "*" : game);
        details.put("images", result.images());
        details.put("filesDeleted", result.filesDeleted());
        details.put("bytesReleased", result.bytesReleased());
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                "card_images.cache.clear",
                TARGET_CACHE,
                game == null ? "*" : game,
                details);
        return new ClearResponse(result.images(), result.filesDeleted(), result.bytesReleased());
    }

    @PostMapping("/reconcile")
    @Operation(
            operationId = "reconcileCardImageCache",
            summary = "Reconcile cache files, rows and accounting (ADMIN, SUPER_ADMIN)",
            description =
                    "Deletes orphan temporary files and files no row references, marks cached rows"
                            + " whose file is missing as not cached, reclaims expired reservations"
                            + " and recomputes the usage from the files on disk. Audited"
                            + " (`card_images.cache.reconcile`).")
    public CardImageCache.ReconcileResult reconcile(
            @AuthenticationPrincipal AuthenticatedUser actor) {
        CardImageCache.ReconcileResult result = cache.reconcile();
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                "card_images.cache.reconcile",
                TARGET_CACHE,
                "*",
                Map.of(
                        "orphanFiles", result.orphanFiles(),
                        "orphanTempFiles", result.orphanTempFiles(),
                        "missingFiles", result.missingFiles(),
                        "usedBytes", result.usedBytes()));
        return result;
    }

    @DeleteMapping("/{imageId}/cache")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "evictCardImage",
            summary = "Evict one cached card image (ADMIN, SUPER_ADMIN)",
            description =
                    "The row goes back to NOT_CACHED; the file is deleted unless another artwork"
                            + " shares it. 404 when the image is not cached. Audited"
                            + " (`card_images.cache.evict`).")
    @ApiResponse(responseCode = "204", description = "Evicted")
    @ApiResponse(responseCode = "404", description = "Unknown or not cached")
    public void evict(
            @AuthenticationPrincipal AuthenticatedUser actor, @PathVariable UUID imageId) {
        if (!cache.evict(imageId)) {
            throw ApiException.notFound("This card image is not cached");
        }
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                "card_images.cache.evict",
                TARGET_IMAGE,
                imageId.toString(),
                Map.of());
    }

    private static @Nullable String blankToNull(@Nullable String value) {
        return value == null || value.isBlank() ? null : value.trim().toLowerCase();
    }

    /**
     * Body of {@code POST /admin/card-images/clear}.
     *
     * @param game only this game's images; all images when absent
     */
    @Schema(name = "CardImageCacheClearRequest")
    public record ClearRequest(
            @Size(max = 32) @Pattern(regexp = "^[a-z0-9]+(-[a-z0-9]+)*$") @Nullable String game) {}

    /**
     * Outcome of a clear.
     *
     * @param images artworks set back to NOT_CACHED
     * @param filesDeleted files deleted
     * @param bytesReleased capacity released
     */
    @Schema(name = "CardImageCacheClearResponse")
    public record ClearResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) int images,
            @Schema(requiredMode = RequiredMode.REQUIRED) int filesDeleted,
            @Schema(requiredMode = RequiredMode.REQUIRED) long bytesReleased) {}
}
