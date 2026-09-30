package com.orenjitrade.api.payments.api;

import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.payments.api.AdminPaymentResponses.TransactionResponse;
import com.orenjitrade.api.payments.domain.PaymentAdminService;
import com.orenjitrade.api.payments.domain.PaymentAdminService.TransactionQueue;
import com.orenjitrade.api.payments.domain.PaymentStatus;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/admin/transactions} (ADMIN, SUPER_ADMIN; Phase 9 contract "Admin"): trades with a
 * protected payment, the ones waiting for the seller's shipment and the ones waiting for the
 * buyer's confirmation. Read-only; available whatever the protectedPayments flag says (existing
 * payments stay manageable).
 */
@RestController
@RequestMapping(path = "/api/v1/admin/transactions", produces = MediaType.APPLICATION_JSON_VALUE)
@Validated
@Tag(name = "admin-payments", description = "Admin: transactions, payments, disputes, webhooks")
public class AdminTransactionController {

    private final PaymentAdminService admin;

    public AdminTransactionController(PaymentAdminService admin) {
        this.admin = admin;
    }

    @GetMapping
    @Operation(
            operationId = "listAdminTransactions",
            summary = "Trades with a protected payment (ADMIN)",
            description = "Most recent activity first; status filters the payment status.")
    public PageResponse<TransactionResponse> list(
            @Parameter(description = "Payment status filter") @RequestParam(required = false)
                    @Nullable PaymentStatus status,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return map(admin.transactions(TransactionQueue.ALL, status, page, size));
    }

    @GetMapping("/pending-shipment")
    @Operation(
            operationId = "listPendingShipmentTransactions",
            summary = "Paid trades waiting for the seller's shipment (ADMIN)",
            description = "Secured payments without a shipment or dispute, oldest payment first.")
    public PageResponse<TransactionResponse> pendingShipment(
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return map(admin.transactions(TransactionQueue.PENDING_SHIPMENT, null, page, size));
    }

    @GetMapping("/pending-confirmation")
    @Operation(
            operationId = "listPendingConfirmationTransactions",
            summary = "Shipped trades waiting for the buyer's confirmation (ADMIN)",
            description =
                    "Secured payments of shipped trades without a dispute, the dispute window"
                            + " ending first (the auto-release job releases them after it).")
    public PageResponse<TransactionResponse> pendingConfirmation(
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return map(admin.transactions(TransactionQueue.PENDING_CONFIRMATION, null, page, size));
    }

    static PageResponse<TransactionResponse> map(
            PageResponse<PaymentAdminService.Transaction> page) {
        return new PageResponse<>(
                page.items().stream().map(TransactionResponse::from).toList(),
                page.page(),
                page.size(),
                page.totalItems(),
                page.totalPages());
    }
}
