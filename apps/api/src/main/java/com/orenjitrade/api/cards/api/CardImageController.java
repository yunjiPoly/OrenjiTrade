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
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Duration;
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
 * card artworks (ADR 0015). Cached renditions are served from OrenjiTrade's own capped cache with a
 * long immutable cache lifetime and an ETag (the SHA-256 of the file); a re-host-only artwork that
 * is not cached triggers a bounded on-demand download when capacity remains, otherwise the card's
 * placeholder SVG is returned with a short cache lifetime. A re-host-only provider's URL is never
 * returned or redirected to.
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
        CardImageCache.Serving serving =
                cache.serving(id).orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        return switch (serving) {
            case CardImageCache.ServeFile file -> file(file.file(), ifNoneMatch);
            case CardImageCache.ServePlaceholder placeholder ->
                    placeholder(placeholder.gameSlug(), placeholder.cardName(), ifNoneMatch);
            case CardImageCache.ServeRedirect redirect ->
                    ResponseEntity.status(302)
                            .header(HttpHeaders.LOCATION, redirect.url())
                            .cacheControl(PLACEHOLDER)
                            .build();
        };
    }

    private ResponseEntity<byte[]> file(
            CardImageCache.CachedFile file, @Nullable String ifNoneMatch) {
        String etag = "\"" + file.checksum() + "\"";
        if (etag.equals(ifNoneMatch)) {
            return ResponseEntity.status(304).eTag(etag).cacheControl(IMMUTABLE).build();
        }
        byte[] body;
        try {
            body = Files.readAllBytes(file.path());
        } catch (IOException e) {
            throw ApiException.notFound(NOT_FOUND);
        }
        return ResponseEntity.ok()
                .cacheControl(IMMUTABLE)
                .eTag(etag)
                .contentType(MediaType.parseMediaType(file.contentType()))
                .body(body);
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
