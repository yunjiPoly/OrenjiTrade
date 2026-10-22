package com.orenjitrade.api.messaging.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.inventory.domain.ItemImageProcessor;
import com.orenjitrade.api.messaging.domain.ImageUploadService;
import com.orenjitrade.api.messaging.domain.ImageUploadView;
import com.orenjitrade.api.messaging.domain.UploadKind;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.io.IOException;
import java.io.UncheckedIOException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** {@code POST /api/v1/uploads/images}: photos for private messages and community posts. */
@RestController
@Tag(name = "uploads", description = "Image uploads attached to messages and community posts")
public class UploadController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final ImageUploadService uploadService;

    public UploadController(ImageUploadService uploadService) {
        this.uploadService = uploadService;
    }

    @PostMapping(
            path = "/api/v1/uploads/images",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "uploadImage",
            summary = "Upload an image for a message or a community post",
            description =
                    "Multipart part `file` (JPEG, PNG or WebP; type sniffed from the content, so a"
                        + " video or any other file is 415) and form field `kind`: MESSAGE (the"
                        + " default, up to 8 MB), COMMUNITY (a photo of a community post, up to 3"
                        + " MB; stage R11); INVENTORY is refused (inventory photos use POST"
                        + " /inventory/items/{id}/images). Re-encoded as JPEG (≤ 1600 px, EXIF/GPS"
                        + " stripped) and inspected before storage. Attach it within 1 h"
                        + " (`expiresAt`): a MESSAGE upload with an IMAGE message, a COMMUNITY"
                        + " upload in a post's `photoUploadIds`; unattached uploads are deleted."
                        + " 413 above the kind's limit, 415 for other types, 400 for unreadable"
                        + " images. Rate-limited (30 per hour).")
    @ApiResponse(responseCode = "201", description = "The stored upload")
    @ApiResponse(
            responseCode = "413",
            description = "PAYLOAD_TOO_LARGE",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "415",
            description = "UNSUPPORTED_MEDIA_TYPE",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public ImageUploadView upload(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @RequestPart("file") MultipartFile file,
            @Parameter(description = "MESSAGE (default), COMMUNITY or INVENTORY (refused)")
                    @RequestParam(name = "kind", defaultValue = "MESSAGE")
                    UploadKind kind) {
        if (file.getSize() > Math.min(kind.maxBytes(), ItemImageProcessor.MAX_BYTES)) {
            throw new ApiException(
                    ErrorCode.PAYLOAD_TOO_LARGE, "The image must be at most " + kind.maxLabel());
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read the upload", e);
        }
        return uploadService.upload(principal.userId(), kind, bytes);
    }
}
