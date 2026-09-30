package com.orenjitrade.api.users.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.users.domain.AccountExportService;
import com.orenjitrade.api.users.domain.AccountExportService.AccountExport;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code GET /api/v1/me/export}: the owner's personal data as a JSON attachment. */
@RestController
@Tag(name = "account", description = "Data export and account deletion of the caller")
public class ExportController {

    private static final DateTimeFormatter FILE_DATE =
            DateTimeFormatter.ofPattern("yyyyMMdd").withZone(ZoneOffset.UTC);

    private final AccountExportService accountExportService;

    public ExportController(AccountExportService accountExportService) {
        this.accountExportService = accountExportService;
    }

    @GetMapping(path = "/api/v1/me/export", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "exportMyData",
            summary = "Download the caller's data",
            description =
                    "JSON document with one section per module (account + consents, profile + tags"
                            + " + privacy settings, notification preferences, trading area, ...)."
                            + " Served as an attachment. Rate-limited (10 per hour); also available"
                            + " while a deletion is pending.")
    public ResponseEntity<AccountExport> export(
            @AuthenticationPrincipal AuthenticatedUser principal) {
        AccountExport export = accountExportService.export(principal.userId());
        String filename =
                "orenjitrade-export-"
                        + principal.handle()
                        + "-"
                        + FILE_DATE.format(export.exportedAt())
                        + ".json";
        return ResponseEntity.ok()
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(filename).build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .contentType(MediaType.APPLICATION_JSON)
                .body(export);
    }
}
