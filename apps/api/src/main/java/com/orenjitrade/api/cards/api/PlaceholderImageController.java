package com.orenjitrade.api.cards.api;

import com.orenjitrade.api.cards.domain.CatalogService;
import com.orenjitrade.api.cards.domain.CatalogText;
import com.orenjitrade.api.cards.domain.PlaceholderSvgRenderer;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.games.domain.GameService;
import com.orenjitrade.api.games.domain.GameView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.regex.Pattern;
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
 * {@code GET /api/v1/public/placeholder-images/{game}/{slug}.svg}: server-generated card
 * placeholders (the card name on a game-coloured card), so the local catalog never hotlinks
 * third-party images. Cacheable for a day with an ETag; 404 for unknown cards.
 */
@RestController
@Tag(name = "public", description = "Public, unauthenticated resources")
public class PlaceholderImageController {

    static final MediaType SVG = MediaType.parseMediaType("image/svg+xml");
    static final CacheControl CACHE = CacheControl.maxAge(Duration.ofDays(1)).cachePublic();

    private static final Pattern GAME_SLUG = Pattern.compile("^[a-z0-9]+(-[a-z0-9]+)*$");
    private static final String NOT_FOUND = "The requested resource does not exist";

    private final CatalogService catalogService;
    private final GameService gameService;

    public PlaceholderImageController(CatalogService catalogService, GameService gameService) {
        this.catalogService = catalogService;
        this.gameService = gameService;
    }

    @GetMapping("/api/v1/public/placeholder-images/{game}/{file}")
    @SecurityRequirements
    @Operation(
            operationId = "getPlaceholderImage",
            summary = "Card placeholder image (SVG)",
            description =
                    "`file` is `<card slug>.svg`. Generated on the server from the card name; no"
                            + " scripts or external references. Public cache for a day, ETag.")
    @ApiResponse(
            responseCode = "200",
            description = "The SVG image",
            content =
                    @Content(
                            mediaType = "image/svg+xml",
                            schema = @Schema(type = "string", format = "binary")))
    public ResponseEntity<byte[]> placeholder(
            @PathVariable String game,
            @PathVariable String file,
            @RequestHeader(name = HttpHeaders.IF_NONE_MATCH, required = false)
                    @Nullable String ifNoneMatch) {
        if (!file.endsWith(".svg") || !GAME_SLUG.matcher(game).matches()) {
            throw ApiException.notFound(NOT_FOUND);
        }
        String slug = file.substring(0, file.length() - ".svg".length());
        if (!CatalogText.SLUG.matcher(slug).matches() || slug.length() > 120) {
            throw ApiException.notFound(NOT_FOUND);
        }
        GameView gameView =
                gameService
                        .find(game)
                        .filter(GameView::isActive)
                        .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        String name =
                catalogService
                        .cardName(game, slug)
                        .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        byte[] body =
                PlaceholderSvgRenderer.render(game, gameView.shortName(), name)
                        .getBytes(StandardCharsets.UTF_8);
        String etag = "\"" + DigestUtils.md5DigestAsHex(body) + "\"";
        if (etag.equals(ifNoneMatch)) {
            return ResponseEntity.status(304).eTag(etag).cacheControl(CACHE).build();
        }
        return ResponseEntity.ok()
                .cacheControl(CACHE)
                .eTag(etag)
                .contentType(SVG)
                .header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'")
                .body(body);
    }
}
