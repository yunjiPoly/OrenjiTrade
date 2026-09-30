package com.orenjitrade.api.credits.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.credits.api.CreditRequests.GrantRequest;
import com.orenjitrade.api.credits.api.CreditRequests.UpdateProductRequest;
import com.orenjitrade.api.credits.api.CreditRequests.UpdateSettingsRequest;
import com.orenjitrade.api.credits.api.CreditResponses.AdminCreditEntry;
import com.orenjitrade.api.credits.api.CreditResponses.AdminLedgerResponse;
import com.orenjitrade.api.credits.api.CreditResponses.CreditProductResponse;
import com.orenjitrade.api.credits.api.CreditResponses.SettingsResponse;
import com.orenjitrade.api.credits.domain.CreditLedger;
import com.orenjitrade.api.credits.domain.CreditProducts;
import com.orenjitrade.api.credits.domain.CreditProducts.ProductUpdate;
import com.orenjitrade.api.credits.domain.CreditRows.CreditEntry;
import com.orenjitrade.api.credits.domain.CreditSettings;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

/**
 * {@code /api/v1/admin/credits} (Phase 10 contract "OriEnji credits", admin): grants and
 * adjustments (ADMIN, audited {@code credits.grant}), the ledger browser, credit products and
 * referral settings (read ADMIN, write SUPER_ADMIN, audited). Not feature-flagged.
 */
@RestController
@RequestMapping(path = "/api/v1/admin/credits", produces = MediaType.APPLICATION_JSON_VALUE)
@Validated
@Tag(name = "admin-billing", description = "Admin: subscriptions, credits, ads, donations")
public class AdminCreditsController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final CreditLedger ledger;
    private final CreditProducts products;
    private final CreditSettings settings;
    private final JsonMapper jsonMapper;

    public AdminCreditsController(
            CreditLedger ledger,
            CreditProducts products,
            CreditSettings settings,
            JsonMapper jsonMapper) {
        this.ledger = ledger;
        this.products = products;
        this.settings = settings;
        this.jsonMapper = jsonMapper;
    }

    @PostMapping(path = "/grant", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "grantAdminCredits",
            summary = "Grant or adjust credits (ADMIN)",
            description =
                    "Positive amounts append a GRANT, negative ones an ADJUST (never below a"
                        + " balance of 0: 409 INSUFFICIENT_CREDITS). The ledger is never edited."
                        + " Audited (credits.grant); 404 for unknown accounts.")
    @ApiResponse(responseCode = "200", description = "The new entry")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description = "INSUFFICIENT_CREDITS",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public AdminCreditEntry grant(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody GrantRequest body) {
        CreditEntry entry =
                ledger.adminGrant(
                        principal, body.userId(), body.amount(), body.reason(), body.note());
        return AdminCreditEntry.from(entry, jsonMapper);
    }

    @GetMapping("/ledger")
    @Operation(
            operationId = "listAdminCreditLedger",
            summary = "Credit ledger entries (ADMIN)",
            description =
                    "Newest first; with userId the account's entries and balance, without it"
                            + " every account's entries.")
    public AdminLedgerResponse ledger(
            @Parameter(description = "Account filter") @RequestParam(required = false)
                    @Nullable UUID userId,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        PageResponse<CreditEntry> rows = ledger.ledgerPage(userId, page, size);
        return new AdminLedgerResponse(
                userId,
                userId == null ? null : ledger.balanceNow(userId),
                new PageResponse<>(
                        rows.items().stream()
                                .map(entry -> AdminCreditEntry.from(entry, jsonMapper))
                                .toList(),
                        rows.page(),
                        rows.size(),
                        rows.totalItems(),
                        rows.totalPages()));
    }

    @GetMapping("/products")
    @Operation(
            operationId = "listAdminCreditProducts",
            summary = "Credit products, active or not (ADMIN)")
    public List<CreditProductResponse> products() {
        return products.all().stream().map(CreditProductResponse::from).toList();
    }

    @PutMapping(path = "/products/{key}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateAdminCreditProduct",
            summary = "Change a credit product (SUPER_ADMIN)",
            description =
                    "Name, description, entitlement value, cost, duration, availability and order;"
                            + " the entitlement key is fixed. Audited (credits.product.update); 404"
                            + " for unknown keys.")
    @ApiResponse(responseCode = "200", description = "The product")
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public CreditProductResponse updateProduct(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable String key,
            @Valid @RequestBody UpdateProductRequest body) {
        return CreditProductResponse.from(
                products.update(
                        principal,
                        key,
                        new ProductUpdate(
                                body.name(),
                                body.description(),
                                body.featureValue(),
                                body.cost(),
                                body.durationHours(),
                                body.active(),
                                body.sortOrder() == null ? 0 : body.sortOrder())));
    }

    @GetMapping("/settings")
    @Operation(operationId = "getAdminCreditSettings", summary = "Referral settings (ADMIN)")
    public SettingsResponse getSettings() {
        return SettingsResponse.from(settings.current());
    }

    @PutMapping(path = "/settings", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateAdminCreditSettings",
            summary = "Change referral settings (SUPER_ADMIN)",
            description =
                    "Absent values are kept; bounds: rewards 0-10000, window 1-365 days,"
                            + " redemptions per code 1-10000. Audited (credits.settings.update).")
    @ApiResponse(responseCode = "200", description = "The settings")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public SettingsResponse updateSettings(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody UpdateSettingsRequest body) {
        return SettingsResponse.from(
                settings.update(
                        principal,
                        new CreditSettings.Update(
                                body.referrerReward(),
                                body.refereeReward(),
                                body.maxAccountAgeDays(),
                                body.maxPerReferrer())));
    }
}
