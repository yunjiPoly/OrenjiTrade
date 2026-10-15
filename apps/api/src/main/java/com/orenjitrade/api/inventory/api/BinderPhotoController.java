package com.orenjitrade.api.inventory.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.binders.api.BinderResponse;
import com.orenjitrade.api.binders.domain.BinderService;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.inventory.domain.ItemImageProcessor;
import com.orenjitrade.api.inventory.domain.ItemImageProcessor.ImageRejectedException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * {@code /api/v1/binders/{id}/images}: the photos of one of the caller's binders, a deck core's
 * photos (owner spec 2026-10-14, section 12, stage R3). The upload follows the rules of an item
 * photo, with the same processor ({@link ItemImageProcessor}: JPEG, PNG or WebP by content, at most
 * 8 MB, re-encoded without EXIF or GPS data); the binders module stores it. The route lives here,
 * like {@code GET /binders/{id}/items}, because the dependency points from inventory to binders.
 */
@RestController
@Tag(name = "binders", description = "The caller's binders: create, publish, confirm, reorder")
public class BinderPhotoController {

    private final BinderService binderService;
    private final ItemImageProcessor imageProcessor;
    private final TimeProvider timeProvider;

    public BinderPhotoController(
            BinderService binderService,
            ItemImageProcessor imageProcessor,
            TimeProvider timeProvider) {
        this.binderService = binderService;
        this.imageProcessor = imageProcessor;
        this.timeProvider = timeProvider;
    }

    @PostMapping(
            path = "/api/v1/binders/{id}/images",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "uploadBinderImage",
            summary = "Add a photo to one of the caller's binders (a deck core)",
            description =
                    "Multipart part `file`: JPEG, PNG or WebP up to 8 MB (type sniffed from the"
                        + " content). Re-encoded as JPEG, at most 1600 px on the long side, without"
                        + " any metadata (EXIF/GPS stripped). At most 4 photos per binder (409)."
                        + " 404 for another collector's binder, 413 above 8 MB, 415 for other"
                        + " types, 400 for unreadable images. Rate-limited (60 per hour). Public"
                        + " views show the photos of a deck core only.")
    @ApiResponse(responseCode = "201", description = "The binder with its photos")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown binder or not the caller's",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = InventoryController.PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description = "CONFLICT: the binder already has 4 photos",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = InventoryController.PROBLEM_REF)))
    @ApiResponse(
            responseCode = "413",
            description = "PAYLOAD_TOO_LARGE",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = InventoryController.PROBLEM_REF)))
    @ApiResponse(
            responseCode = "415",
            description = "UNSUPPORTED_MEDIA_TYPE",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = InventoryController.PROBLEM_REF)))
    public ResponseEntity<BinderResponse> upload(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @RequestPart("file") MultipartFile file) {
        if (file.getSize() > ItemImageProcessor.MAX_BYTES) {
            throw new ApiException(ErrorCode.PAYLOAD_TOO_LARGE, "The image must be at most 8 MB");
        }
        // Another collector's binder is a 404 before anything is read or decoded.
        binderService.requireOwned(principal.userId(), id);
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read the upload", e);
        }
        ItemImageProcessor.Processed processed;
        try {
            processed = imageProcessor.process(bytes);
        } catch (ImageRejectedException e) {
            throw ItemImageProcessor.problem(e);
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(
                        BinderResponse.from(
                                binderService.addPhoto(
                                        principal.userId(),
                                        id,
                                        processed.jpeg(),
                                        processed.width(),
                                        processed.height()),
                                timeProvider.now()));
    }

    @DeleteMapping("/api/v1/binders/{id}/images/{imageId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "deleteBinderImage",
            summary = "Remove a photo of one of the caller's binders")
    @ApiResponse(responseCode = "204", description = "Removed")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown binder (or not the caller's) or photo",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = InventoryController.PROBLEM_REF)))
    public void delete(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @PathVariable UUID imageId) {
        binderService.deletePhoto(principal.userId(), id, imageId);
    }
}
