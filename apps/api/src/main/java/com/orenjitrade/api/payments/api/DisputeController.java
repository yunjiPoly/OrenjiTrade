package com.orenjitrade.api.payments.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.payments.api.DisputeResponses.DisputeResponse;
import com.orenjitrade.api.payments.api.DisputeResponses.EvidenceResponse;
import com.orenjitrade.api.payments.api.DisputeResponses.MessageResponse;
import com.orenjitrade.api.payments.api.PaymentRequests.EvidenceRequest;
import com.orenjitrade.api.payments.api.PaymentRequests.MessageRequest;
import com.orenjitrade.api.payments.domain.DisputeService;
import com.orenjitrade.api.payments.domain.DisputeService.EvidenceFile;
import com.orenjitrade.api.payments.domain.DisputeService.PostedMessage;
import com.orenjitrade.api.payments.domain.EvidenceKind;
import com.orenjitrade.api.payments.domain.PaymentRows.DisputeMessageRow;
import com.orenjitrade.api.profiles.domain.MemberCard;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.json.JsonMapper;

/**
 * {@code /api/v1/disputes} (Phase 9 contract): a dispute's detail, evidence (JSON for TEXT and
 * TRACKING, multipart for IMAGE and DOCUMENT; ≤ 10 per party), evidence files and the thread. The
 * two parties and admins only (404 for anybody else); feature flag {@code protectedPayments}
 * (evaluated for the trade's buyer) for the parties.
 */
@RestController
@RequestMapping(path = "/api/v1/disputes", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "disputes", description = "Disputes of protected trades")
public class DisputeController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final DisputeService disputes;
    private final JsonMapper jsonMapper;

    public DisputeController(DisputeService disputes, JsonMapper jsonMapper) {
        this.disputes = disputes;
        this.jsonMapper = jsonMapper;
    }

    @GetMapping("/{id}")
    @Operation(
            operationId = "getDispute",
            summary = "A dispute with its timeline, evidence and thread",
            description =
                    "The two parties and admins (404 for anybody else). Admin messages appear as"
                            + " OrenjiTrade support; internal notes are never included.")
    @ApiResponse(responseCode = "200", description = "The dispute")
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND, FEATURE_DISABLED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public DisputeResponse get(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable UUID id) {
        return DisputeResponse.from(disputes.get(principal, id), jsonMapper);
    }

    @PostMapping(path = "/{id}/evidence", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "addDisputeEvidence",
            summary = "Add TEXT or TRACKING evidence (a party)",
            description =
                    "While OPEN or UNDER_REVIEW (409 INVALID_STATE_TRANSITION while FROZEN or"
                        + " resolved); at most 10 per party (409 EVIDENCE_LIMIT_REACHED, extension"
                        + " limit). TEXT needs body; TRACKING needs body (tracking number, carrier)"
                        + " and may carry an https url. IMAGE and DOCUMENT use the multipart form"
                        + " of this route; VIDEO is reserved (400). Admins add notes instead"
                        + " (403).")
    @ApiResponse(responseCode = "201", description = "The evidence")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description = "INVALID_STATE_TRANSITION, EVIDENCE_LIMIT_REACHED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public EvidenceResponse addEvidence(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody EvidenceRequest body) {
        if (body.kind().hasFile()) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(
                            new ProblemFieldError(
                                    "kind",
                                    "IMAGE and DOCUMENT evidence is uploaded as multipart/form-data"
                                            + " with a file part")));
        }
        return EvidenceResponse.from(
                disputes.addEvidence(principal, id, body.kind(), body.body(), body.url(), null));
    }

    @PostMapping(path = "/{id}/evidence", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "addDisputeEvidence",
            summary = "Add IMAGE or DOCUMENT evidence (a party)",
            description =
                    "Multipart part `file` and form fields `kind` (IMAGE: JPEG, PNG or WebP up to 8"
                        + " MB, re-encoded as JPEG without metadata; DOCUMENT: PDF up to 10 MB) and"
                        + " optional `body` (caption). Same rules as the JSON route: 413 above the"
                        + " size, 415 for other types, 409 while FROZEN or after 10 items.")
    @ApiResponse(responseCode = "201", description = "The evidence")
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
    public EvidenceResponse uploadEvidence(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @RequestPart("file") MultipartFile file,
            @Parameter(
                            description = "IMAGE or DOCUMENT",
                            schema = @Schema(allowableValues = {"IMAGE", "DOCUMENT"}))
                    @RequestPart("kind")
                    String kind,
            @Parameter(description = "Optional caption (≤ 2000)")
                    @RequestPart(name = "body", required = false)
                    @Nullable String body) {
        EvidenceKind evidenceKind = uploadKind(kind);
        if (file.getSize() > DisputeService.MAX_DOCUMENT_BYTES) {
            throw new ApiException(ErrorCode.PAYLOAD_TOO_LARGE, "The file must be at most 10 MB");
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read the upload", e);
        }
        return EvidenceResponse.from(
                disputes.addEvidence(principal, id, evidenceKind, body, null, bytes));
    }

    @GetMapping(path = "/{id}/evidence/{evidenceId}/file", produces = MediaType.ALL_VALUE)
    @Operation(
            operationId = "getDisputeEvidenceFile",
            summary = "The file of IMAGE or DOCUMENT evidence",
            description =
                    "The two parties and admins (404 otherwise); never cached by shared caches.")
    @ApiResponse(
            responseCode = "200",
            description = "The file",
            content = {
                @Content(
                        mediaType = MediaType.IMAGE_JPEG_VALUE,
                        schema = @Schema(type = "string", format = "binary")),
                @Content(
                        mediaType = MediaType.APPLICATION_PDF_VALUE,
                        schema = @Schema(type = "string", format = "binary"))
            })
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public ResponseEntity<byte[]> evidenceFile(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @PathVariable UUID evidenceId) {
        EvidenceFile file = disputes.evidenceFile(principal, id, evidenceId);
        boolean pdf = MediaType.APPLICATION_PDF_VALUE.equals(file.object().contentType());
        ContentDisposition disposition =
                (pdf ? ContentDisposition.attachment() : ContentDisposition.inline())
                        .filename("evidence-" + evidenceId + (pdf ? ".pdf" : ".jpg"))
                        .build();
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore().cachePrivate())
                .contentType(MediaType.parseMediaType(file.object().contentType()))
                .contentLength(file.object().content().length)
                .header("Content-Disposition", disposition.toString())
                .header("Content-Security-Policy", "sandbox; default-src 'none'")
                .body(file.object().content());
    }

    private static EvidenceKind uploadKind(String raw) {
        try {
            EvidenceKind kind = EvidenceKind.valueOf(raw.trim().toUpperCase(Locale.ROOT));
            if (kind.hasFile() || kind == EvidenceKind.VIDEO) {
                return kind;
            }
        } catch (IllegalArgumentException e) {
            // reported below
        }
        throw ApiException.validation(
                "Validation failed",
                List.of(new ProblemFieldError("kind", "must be IMAGE or DOCUMENT for a file")));
    }

    @PostMapping(path = "/{id}/messages", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "postDisputeMessage",
            summary = "Post in the dispute thread",
            description =
                    "The two parties (not while FROZEN) and admins, until the dispute is resolved"
                            + " (409 INVALID_STATE_TRANSITION). The other side gets"
                            + " DISPUTE_UPDATE.")
    @ApiResponse(responseCode = "201", description = "The message")
    @ApiResponse(
            responseCode = "409",
            description = "INVALID_STATE_TRANSITION",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public MessageResponse postMessage(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody MessageRequest body) {
        PostedMessage posted = disputes.postMessage(principal, id, body.body());
        DisputeMessageRow message = posted.message();
        MemberCard author = posted.author();
        return MessageResponse.from(
                message,
                author == null ? Map.of() : Map.of(author.id(), author),
                principal.isAdmin());
    }
}
