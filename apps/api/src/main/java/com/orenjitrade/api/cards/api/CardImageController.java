package com.orenjitrade.api.cards.api;

import com.orenjitrade.api.cards.domain.PlaceholderSvgRenderer;
import com.orenjitrade.api.cards.domain.images.CardImageCache;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.games.domain.GameService;
import com.orenjitrade.api.games.domain.GameView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.DigestUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /api/v1/public/card-images/{imageId}}: the one game-agnostic endpoint for provider
 * card artworks (ADR 0015). Cached renditions are served from OrenjiTrade's own capped cache (local
 * files or the media bucket, never the provider) with a long immutable cache lifetime and an ETag
 * (the SHA-256 of the rendition; a matching {@code If-None-Match} answers 304 without reading the
 * object); a re-host-only artwork that is not cached triggers a bounded on-demand download when
 * capacity remains, otherwise the card's placeholder SVG is returned with a short cache lifetime. A
 * re-host-only provider's URL is never returned or redirected to.
 */
@RestController
@Tag(name = "public", description = "Public, unauthenticated resources")
public class CardImageController {

    static final CacheControl IMMUTABLE =
            CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable();
    static final CacheControl PLACEHOLDER =
            CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic();
    static final MediaType SVG = MediaType.parseMediaType("image/svg+xml");

    private static final String NOT_FOUND = "The requested resource does not exist";

    private final CardImageCache cache;
    private final GameService gameService;

    public CardImageController(CardImageCache cache, GameService gameService) {
        this.cache = cache;
        this.gameService = gameService;
    }

    @GetMapping("/api/v1/public/card-images/{imageId}")
    @SecurityRequirements
    @Operation(
            operationId = "getCardImage",
            summary = "Card artwork (cached rendition or placeholder)",
            description =
                    "Serves a card artwork from OrenjiTrade's own cache (JPEG, `Cache-Control:"
                            + " public, max-age=31536000, immutable`, ETag = SHA-256). When the"
                            + " artwork is not cached yet, a bounded download may fill the cache;"
                            + " otherwise the card's placeholder SVG is returned with a short"
                            + " cache lifetime. Provider URLs are never exposed.")
    @ApiResponse(
            responseCode = "200",
            description = "The image (JPEG) or the placeholder (SVG)",
            content = {
                @Content(
                        mediaType = "image/jpeg",
                        schema = @Schema(type = "string", format = "binary")),
                @Content(
                        mediaType = "image/svg+xml",
                        schema = @Schema(type = "string", format = "binary"))
            })
    @ApiResponse(responseCode = "304", description = "Not modified (If-None-Match)")
    @ApiResponse(responseCode = "404", description = "Unknown image")
    public ResponseEntity<byte[]> image(
            @Parameter(description = "Card image id") @PathVariable String imageId,
            @RequestHeader(name = HttpHeaders.IF_NONE_MATCH, required = false)
                    @Nullable String ifNoneMatch) {
        UUID id;
        try {
            id = UUID.fromString(imageId);
        } catch (IllegalArgumentException e) {
            throw ApiException.notFound(NOT_FOUND);
        }
        // A cached rendition whose object turned out to be gone (evicted by another instance, the
        // local disk wiped) has been marked NOT_CACHED by the read: decide once more, which fills
        // it on demand or serves the placeholder.
        for (int attempt = 0; ; attempt++) {
            CardImageCache.Serving serving =
                    cache.serving(id).orElseThrow(() -> ApiException.notFound(NOT_FOUND));
            switch (serving) {
                case CardImageCache.ServeFile file -> {
                    @Nullable ResponseEntity<byte[]> response = file(file.file(), ifNoneMatch);
                    if (response != null) {
                        return response;
                    }
                    if (attempt > 0) {
                        throw ApiException.notFound(NOT_FOUND);
                    }
                }
                case CardImageCache.ServePlaceholder placeholder -> {
                    return placeholder(placeholder.gameSlug(), placeholder.cardName(), ifNoneMatch);
                }
                case CardImageCache.ServeRedirect redirect -> {
                    return ResponseEntity.status(302)
                            .header(HttpHeaders.LOCATION, redirect.url())
                            .cacheControl(PLACEHOLDER)
                            .build();
                }
            }
        }
    }

    /** The rendition, or {@code null} when its object is gone (the row has been repaired). */
    private @Nullable ResponseEntity<byte[]> file(
            CardImageCache.CachedFile file, @Nullable String ifNoneMatch) {
        String etag = "\"" + file.checksum() + "\"";
        if (etag.equals(ifNoneMatch)) {
            return ResponseEntity.status(304).eTag(etag).cacheControl(IMMUTABLE).build();
        }
        Optional<byte[]> body = cache.read(file);
        if (body.isEmpty()) {
            return null;
        }
        return ResponseEntity.ok()
                .cacheControl(IMMUTABLE)
                .eTag(etag)
                .contentType(MediaType.parseMediaType(file.contentType()))
                .body(body.get());
    }

    private ResponseEntity<byte[]> placeholder(
            String gameSlug, String cardName, @Nullable String ifNoneMatch) {
        String shortName = gameService.find(gameSlug).map(GameView::shortName).orElse(gameSlug);
        byte[] body =
                PlaceholderSvgRenderer.render(gameSlug, shortName, cardName)
                        .getBytes(StandardCharsets.UTF_8);
        String etag = "\"" + DigestUtils.md5DigestAsHex(body) + "\"";
        if (etag.equals(ifNoneMatch)) {
            return ResponseEntity.status(304).eTag(etag).cacheControl(PLACEHOLDER).build();
        }
        return ResponseEntity.ok()
                .cacheControl(PLACEHOLDER)
                .eTag(etag)
                .contentType(SVG)
                .header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'")
                .body(body);
    }
}
