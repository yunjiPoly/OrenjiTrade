package com.orenjitrade.api.inventory.api;

import com.orenjitrade.api.auth.domain.AccountNames;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.inventory.api.InventoryImportResponses.SettingsResponse;
import com.orenjitrade.api.inventory.domain.imports.InventoryImportSettings;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/admin/inventory/import-settings}: the limits of an inventory import file and the
 * time a preview is kept (ADMIN, audited).
 */
@RestController
@RequestMapping(path = "/api/v1/admin/inventory", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "admin-inventory-import", description = "Admin: inventory import settings")
public class AdminInventoryImportController {

    private final InventoryImportSettings settings;
    private final AccountNames accountNames;

    public AdminInventoryImportController(
            InventoryImportSettings settings, AccountNames accountNames) {
        this.settings = settings;
        this.accountNames = accountNames;
    }

    @GetMapping("/import-settings")
    @Operation(
            operationId = "getAdminInventoryImportSettings",
            summary = "The limits of an inventory import (ADMIN)")
    public SettingsResponse getSettings() {
        return SettingsResponse.from(settings.current(), accountNames);
    }

    @PutMapping(path = "/import-settings", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateAdminInventoryImportSettings",
            summary = "Change the limits of an inventory import (ADMIN)",
            description =
                    "Any subset of the fields; absent fields are unchanged. ydkMaxKb 1-1024,"
                            + " ydkMaxLines 10-5000, csvMaxKb 16-8192, csvMaxRows 10-20000,"
                            + " previewTtlMinutes 5-1440. Applied to the next upload (cached at"
                            + " most 60 s on other instances). Audited"
                            + " (inventory.import.settings.update).")
    @ApiResponse(responseCode = "200", description = "The settings")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = InventoryImportController.PROBLEM_REF)))
    public SettingsResponse updateSettings(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody UpdateImportSettingsRequest body) {
        return SettingsResponse.from(
                settings.update(
                        principal,
                        new InventoryImportSettings.Update(
                                body.ydkMaxKb(),
                                body.ydkMaxLines(),
                                body.csvMaxKb(),
                                body.csvMaxRows(),
                                body.previewTtlMinutes())),
                accountNames);
    }

    /** {@code PUT /admin/inventory/import-settings}. */
    @Schema(
            name = "UpdateInventoryImportSettingsRequest",
            description = "Any subset of the fields; absent fields are unchanged")
    public record UpdateImportSettingsRequest(
            @Schema(description = "1-1024", example = "100") @Nullable Integer ydkMaxKb,
            @Schema(description = "10-5000", example = "500") @Nullable Integer ydkMaxLines,
            @Schema(description = "16-8192", example = "2048") @Nullable Integer csvMaxKb,
            @Schema(description = "10-20000", example = "5000") @Nullable Integer csvMaxRows,
            @Schema(description = "5-1440", example = "60") @Nullable Integer previewTtlMinutes) {}
}
