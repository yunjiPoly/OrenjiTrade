package com.orenjitrade.api.payments.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.payments.api.AdminPaymentResponses.PaymentDetailResponse;
import com.orenjitrade.api.payments.api.AdminPaymentResponses.SettingsResponse;
import com.orenjitrade.api.payments.api.AdminPaymentResponses.TransactionResponse;
import com.orenjitrade.api.payments.api.AdminPaymentResponses.WebhookEventResponse;
import com.orenjitrade.api.payments.api.PaymentRequests.RefundRequest;
import com.orenjitrade.api.payments.api.PaymentRequests.UpdateSettingsRequest;
import com.orenjitrade.api.payments.domain.PaymentAdminService;
import com.orenjitrade.api.payments.domain.PaymentRows.WebhookEventRow;
import com.orenjitrade.api.payments.domain.PaymentSettings;
import com.orenjitrade.api.payments.domain.PaymentStatus;
import com.orenjitrade.api.payments.domain.WebhookStatus;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
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
 * {@code /api/v1/admin/payments} (ADMIN, SUPER_ADMIN; Phase 9 contract "Admin"): payments with
 * their history, refunds (SUPER_ADMIN, or ADMIN while {@code payments.admin_refunds_enabled}), the
 * webhook event browser and the payment settings (SUPER_ADMIN writes). Every write is audited.
 */
@RestController
@RequestMapping(path = "/api/v1/admin/payments", produces = MediaType.APPLICATION_JSON_VALUE)
@Validated
@Tag(name = "admin-payments", description = "Admin: transactions, payments, disputes, webhooks")
public class AdminPaymentController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final PaymentAdminService admin;
    private final PaymentSettings settings;
    private final JsonMapper jsonMapper;

    public AdminPaymentController(
            PaymentAdminService admin, PaymentSettings settings, JsonMapper jsonMapper) {
        this.admin = admin;
        this.settings = settings;
        this.jsonMapper = jsonMapper;
    }

    @GetMapping
    @Operation(
            operationId = "listAdminPayments",
            summary = "Protected payments (ADMIN)",
            description = "Most recent activity first; status filters.")
    public PageResponse<TransactionResponse> list(
            @Parameter(description = "Status filter") @RequestParam(required = false)
                    @Nullable PaymentStatus status,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return AdminTransactionController.map(admin.payments(status, page, size));
    }

    @GetMapping("/{id}")
    @Operation(
            operationId = "getAdminPayment",
            summary = "A payment with its history (ADMIN)",
            description =
                    "Payment events, refunds and linked webhooks; refundAllowed tells whether the"
                            + " caller may refund it now.")
    @ApiResponse(responseCode = "200", description = "The payment")
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public PaymentDetailResponse get(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable UUID id) {
        return PaymentDetailResponse.from(admin.payment(principal, id), jsonMapper);
    }

    @PostMapping(path = "/{id}/refund", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "refundAdminPayment",
            summary = "Refund a payment (SUPER_ADMIN, or ADMIN under the refund policy)",
            description =
                    "Refunds amount (at most what is still refundable) through the provider. 403"
                        + " unless SUPER_ADMIN, or ADMIN while payments.admin_refunds_enabled; 409"
                        + " for payments not secured or already refunded, or with an open dispute"
                        + " (resolve it instead). A full refund cancels an unfinished trade."
                        + " Audited (payment.refund).")
    @ApiResponse(responseCode = "200", description = "The payment")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description = "CONFLICT",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public PaymentDetailResponse refund(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody RefundRequest body) {
        return PaymentDetailResponse.from(
                admin.refund(principal, id, body.amount(), body.reason()), jsonMapper);
    }

    @GetMapping("/webhooks")
    @Operation(
            operationId = "listPaymentWebhooks",
            summary = "The provider webhook browser (ADMIN)",
            description =
                    "Every stored webhook, newest first (without payloads); status and provider"
                            + " filter.")
    public PageResponse<WebhookEventResponse> webhooks(
            @Parameter(description = "Status filter") @RequestParam(required = false)
                    @Nullable WebhookStatus status,
            @Parameter(description = "fake or stripe")
                    @RequestParam(required = false)
                    @Pattern(regexp = "^[a-z][a-z0-9_]{1,31}$")
                    @Nullable String provider,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        PageResponse<WebhookEventRow> rows = admin.webhooks(status, provider, page, size);
        return new PageResponse<>(
                rows.items().stream().map(row -> WebhookEventResponse.from(row, null)).toList(),
                rows.page(),
                rows.size(),
                rows.totalItems(),
                rows.totalPages());
    }

    @GetMapping("/webhooks/{id}")
    @Operation(
            operationId = "getPaymentWebhook",
            summary = "One stored webhook with its payload (ADMIN)")
    @ApiResponse(responseCode = "200", description = "The event")
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public WebhookEventResponse webhook(@PathVariable UUID id) {
        WebhookEventRow row = admin.webhook(id);
        @Nullable Object payload = null;
        if (row.payloadJson() != null) {
            try {
                payload = jsonMapper.readValue(row.payloadJson(), Object.class);
            } catch (RuntimeException e) {
                payload = null;
            }
        }
        return WebhookEventResponse.from(row, payload);
    }

    @GetMapping("/settings")
    @Operation(
            operationId = "getPaymentSettings",
            summary = "The payment rules (ADMIN)",
            description =
                    "platform_settings payments.*: dispute window, platform fee, auto-release,"
                            + " reminder lead time, admin refund policy.")
    public SettingsResponse getSettings() {
        return SettingsResponse.from(settings.current(), settings.lastChange());
    }

    @PutMapping(path = "/settings", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updatePaymentSettings",
            summary = "Change the payment rules (SUPER_ADMIN)",
            description =
                    "Absent fields keep their value. 403 for ADMIN. Audited"
                            + " (payments.settings.update); every instance applies the change"
                            + " within 60 s.")
    @ApiResponse(responseCode = "200", description = "The rules")
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
        PaymentSettings.Settings updated =
                settings.update(
                        principal,
                        body.disputeWindowDays(),
                        body.platformFeePercent(),
                        body.autoReleaseEnabled(),
                        body.releaseReminderHours(),
                        body.adminRefundsEnabled());
        return SettingsResponse.from(updated, settings.lastChange());
    }
}
