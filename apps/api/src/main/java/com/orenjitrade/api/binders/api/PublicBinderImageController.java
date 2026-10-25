package com.orenjitrade.api.binders.api;

import com.orenjitrade.api.binders.domain.BinderService;
import com.orenjitrade.api.common.storage.PhotoUrls;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /api/v1/public/binder-images/{imageId}}: a photo of a binder or deck core, by the
 * photo's own id, without authentication. Every response names binder photos by this URL ({@link
 * PhotoUrls#binderImage}): the storage key names the owner's account and stays on the server, as a
 * signed-out visitor never learns who a collector is (stage R15, review fix 1). Anything but a
 * known photo id is a plain 404; immutable for a year (a photo id is never reused).
 */
@RestController
@Tag(name = "public", description = "Public, unauthenticated resources")
public class PublicBinderImageController {

    private final BinderService binders;

    public PublicBinderImageController(BinderService binders) {
        this.binders = binders;
    }

    @GetMapping("/api/v1/public/binder-images/{imageId}")
    @SecurityRequirements
    @Operation(
            operationId = "getPublicBinderImage",
            summary = "A photo of a binder or deck core",
            description =
                    "Serves a binder photo by its id (`photos[].id` of a binder; the URL every"
                            + " response gives). The URL never names the owner. Immutable: cache"
                            + " for a year.")
    @ApiResponse(
            responseCode = "200",
            description = "The photo (a JPEG without metadata)",
            content =
                    @Content(
                            mediaType = MediaType.IMAGE_JPEG_VALUE,
                            schema = @Schema(type = "string", format = "binary")))
    @ApiResponse(responseCode = "404", description = "No such photo")
    public ResponseEntity<byte[]> get(
            @Parameter(description = "The photo's id") @PathVariable("imageId") String imageId) {
        return PhotoUrls.serve(binders.photo(PhotoUrls.idOrNotFound(imageId)));
    }
}
