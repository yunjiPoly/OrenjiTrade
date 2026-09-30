package com.orenjitrade.api.common.storage;

import com.orenjitrade.api.common.ApiException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Duration;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /api/v1/public/media/{key}}: serves stored media (avatars) without authentication.
 * Keys are strictly validated ({@link ObjectKeys}); anything else is a plain 404 so the endpoint
 * never reveals the storage layout. Responses are immutable for a year (keys are random and never
 * reused).
 */
@RestController
@Tag(name = "public", description = "Public, unauthenticated resources")
public class PublicMediaController {

    static final CacheControl IMMUTABLE =
            CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable();

    private static final String NOT_FOUND = "The requested resource does not exist";

    private final ObjectStorage storage;

    public PublicMediaController(ObjectStorage storage) {
        this.storage = storage;
    }

    @GetMapping("/api/v1/public/media/{*key}")
    @SecurityRequirements
    @Operation(
            operationId = "getPublicMedia",
            summary = "Stored media (avatars)",
            description =
                    "Serves an object of the media storage by key (for example"
                            + " `avatars/<user id>/<random>.jpg`). Immutable: cache for a year.")
    @ApiResponse(
            responseCode = "200",
            description = "The media file",
            content = {
                @Content(
                        mediaType = MediaType.IMAGE_JPEG_VALUE,
                        schema = @Schema(type = "string", format = "binary")),
                @Content(
                        mediaType = MediaType.IMAGE_PNG_VALUE,
                        schema = @Schema(type = "string", format = "binary")),
                @Content(
                        mediaType = "image/webp",
                        schema = @Schema(type = "string", format = "binary"))
            })
    public ResponseEntity<byte[]> get(
            @Parameter(description = "Object key, e.g. avatars/<user id>/<random>.jpg")
                    @PathVariable("key")
                    String key) {
        String normalised = key.startsWith("/") ? key.substring(1) : key;
        if (!ObjectKeys.isPublic(normalised)) {
            throw ApiException.notFound(NOT_FOUND);
        }
        StoredObject object =
                storage.get(normalised).orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        return ResponseEntity.ok()
                .cacheControl(IMMUTABLE)
                .contentType(MediaType.parseMediaType(object.contentType()))
                .contentLength(object.content().length)
                .body(object.content());
    }
}
