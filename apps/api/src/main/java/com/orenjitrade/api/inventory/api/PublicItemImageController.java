package com.orenjitrade.api.inventory.api;

import com.orenjitrade.api.common.storage.PhotoUrls;
import com.orenjitrade.api.inventory.domain.InventoryService;
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
 * {@code GET /api/v1/public/item-images/{imageId}}: a photo of an inventory item, by the photo's
 * own id, without authentication. Every response names item photos by this URL ({@link
 * PhotoUrls#itemImage}): the storage key names the owner's account and stays on the server, as a
 * signed-out visitor never learns who a collector is (stage R15, review fix 1). Anything but a
 * known photo id is a plain 404; immutable for a year (a photo id is never reused).
 */
@RestController
@Tag(name = "public", description = "Public, unauthenticated resources")
public class PublicItemImageController {

    private final InventoryService inventory;

    public PublicItemImageController(InventoryService inventory) {
        this.inventory = inventory;
    }

    @GetMapping("/api/v1/public/item-images/{imageId}")
    @SecurityRequirements
    @Operation(
            operationId = "getPublicItemImage",
            summary = "A photo of an inventory item",
            description =
                    "Serves an item photo by its id (`images[].id` of an item; the URL every"
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
        return PhotoUrls.serve(inventory.photo(PhotoUrls.idOrNotFound(imageId)));
    }
}
