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

/** {@code POST /api/v1/uploads/images}: photos for private messages. */
@RestController
@Tag(name = "uploads", description = "Image uploads attached to messages")
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
            summary = "Upload an image for a message",
            description =
                    "Multipart part `file` (JPEG, PNG or WebP up to 8 MB; type sniffed from the"
                        + " content) and form field `kind` (MESSAGE, the default; INVENTORY is"
                        + " refused: inventory photos use POST /inventory/items/{id}/images)."
                        + " Re-encoded as JPEG (≤ 1600 px, EXIF/GPS stripped) and inspected before"
                        + " storage. Attach it with an IMAGE message within 1 h (`expiresAt`);"
                        + " unattached uploads are deleted. 413 above 8 MB, 415 for other types,"
                        + " 400 for unreadable images. Rate-limited (30 per hour).")
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
            @Parameter(description = "MESSAGE (default) or INVENTORY")
                    @RequestParam(name = "kind", defaultValue = "MESSAGE")
                    UploadKind kind) {
        if (file.getSize() > ItemImageProcessor.MAX_BYTES) {
            throw new ApiException(ErrorCode.PAYLOAD_TOO_LARGE, "The image must be at most 8 MB");
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
