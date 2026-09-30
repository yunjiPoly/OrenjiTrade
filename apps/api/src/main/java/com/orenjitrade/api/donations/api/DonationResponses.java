package com.orenjitrade.api.donations.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.donations.domain.DonationRows.CurrencyTotal;
import com.orenjitrade.api.donations.domain.DonationRows.DonationRow;
import com.orenjitrade.api.donations.domain.DonationRows.DonationStatus;
import com.orenjitrade.api.donations.domain.DonationRows.DonationWebhookRow;
import com.orenjitrade.api.donations.domain.DonationRows.WebhookState;
import com.orenjitrade.api.donations.domain.DonationService.AdminDetail;
import com.orenjitrade.api.donations.domain.DonationService.Supporter;
import com.orenjitrade.api.donations.domain.DonationSettings;
import com.orenjitrade.api.donations.domain.DonationWebhookService.Receipt;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Response bodies of the donation routes (Phase 10). */
public final class DonationResponses {

    private DonationResponses() {}

    /** Wording every donation screen shows. */
    public static final String LABEL = "Voluntary support";

    /**
     * A donation as its donor sees it.
     *
     * @param id donation id
     * @param amount amount
     * @param currency ISO 4217 code
     * @param status status
     * @param message the donor's note
     * @param publicThanks listed among the supporters
     * @param checkoutUrl where to finish paying (PENDING only)
     * @param createdAt creation
     * @param succeededAt success
     * @param label always "Voluntary support"
     */
    @Schema(name = "Donation", description = "A voluntary donation")
    public record DonationResponse(
            UUID id,
            @Schema(example = "10.00") BigDecimal amount,
            @Schema(example = "CAD") String currency,
            DonationStatus status,
            @Nullable String message,
            boolean publicThanks,
            @Nullable String checkoutUrl,
            Instant createdAt,
            @Nullable Instant succeededAt,
            @Schema(example = LABEL) String label) {

        static DonationResponse from(DonationRow row) {
            return new DonationResponse(
                    row.id(),
                    row.amount(),
                    row.currency(),
                    row.status(),
                    row.message(),
                    row.publicThanks(),
                    row.status() == DonationStatus.PENDING ? row.checkoutUrl() : null,
                    row.createdAt(),
                    row.succeededAt(),
                    LABEL);
        }
    }

    /**
     * {@code POST /donations/checkout}.
     *
     * @param donation the PENDING donation
     * @param url where the donor pays
     */
    @Schema(name = "DonationCheckout", description = "Where the donor pays")
    public record CheckoutResponse(
            DonationResponse donation,
            @Schema(example = "/checkout/fake-donation/fake_dn_0123") String url) {}

    /** What {@code /checkout/fake-donation/<ref>} shows. */
    @Schema(name = "FakeDonationCheckout", description = "A fake donation checkout (local only)")
    public record FakeCheckoutResponse(
            String ref,
            UUID donationId,
            BigDecimal amount,
            String currency,
            DonationStatus status,
            String summary) {

        static FakeCheckoutResponse from(DonationRow row, String ref) {
            return new FakeCheckoutResponse(
                    ref,
                    row.id(),
                    row.amount(),
                    row.currency(),
                    row.status(),
                    "Test checkout: no money moves. Voluntary support of "
                            + row.amount().toPlainString()
                            + " "
                            + row.currency()
                            + ".");
        }
    }

    /** A received donation webhook. */
    @Schema(name = "DonationWebhookReceipt", description = "A received donation webhook")
    public record WebhookReceiptResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean received,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean duplicate,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID webhookEventId,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "donation.succeeded")
                    String type) {

        static WebhookReceiptResponse from(Receipt receipt) {
            return new WebhookReceiptResponse(
                    true, receipt.duplicate(), receipt.webhookEventId(), receipt.type());
        }
    }

    /**
     * A public supporter (opt-in; display name only, never amounts or notes).
     *
     * @param displayName display name
     * @param month month of the latest donation (YYYY-MM)
     */
    @Schema(name = "Supporter", description = "An opted-in supporter (name only)")
    public record SupporterResponse(String displayName, @Schema(example = "2026-09") String month) {

        static SupporterResponse from(Supporter supporter) {
            return new SupporterResponse(supporter.displayName(), supporter.month());
        }
    }

    /**
     * {@code GET /public/donations/supporters}.
     *
     * @param label always "Voluntary support"
     * @param note explains that donations change nothing else
     * @param supporters the supporters
     */
    @Schema(name = "Supporters", description = "Opted-in supporters")
    public record SupportersResponse(
            String label, String note, List<SupporterResponse> supporters) {}

    /** A donation in the admin console. */
    @Schema(name = "AdminDonation", description = "A donation (admin view)")
    public record AdminDonation(
            UUID id,
            @Nullable UUID userId,
            BigDecimal amount,
            String currency,
            String provider,
            DonationStatus status,
            @Nullable String message,
            boolean publicThanks,
            @Nullable String failureCode,
            Instant createdAt,
            @Nullable Instant succeededAt,
            @Nullable Instant refundedAt) {

        static AdminDonation from(DonationRow row) {
            return new AdminDonation(
                    row.id(),
                    row.userId(),
                    row.amount(),
                    row.currency(),
                    row.provider(),
                    row.status(),
                    row.message(),
                    row.publicThanks(),
                    row.failureCode(),
                    row.createdAt(),
                    row.succeededAt(),
                    row.refundedAt());
        }
    }

    /** Succeeded donations of one currency. */
    @Schema(name = "DonationTotal", description = "Succeeded donations of one currency")
    public record TotalResponse(String currency, BigDecimal total, long donations) {

        static TotalResponse from(CurrencyTotal total) {
            return new TotalResponse(total.currency(), total.total(), total.count());
        }
    }

    /** {@code GET /admin/donations}. */
    @Schema(name = "AdminDonations", description = "Donations with totals (admin)")
    public record AdminPageResponse(
            PageResponse<AdminDonation> donations, List<TotalResponse> totals) {}

    /** A donation webhook (admin). */
    @Schema(name = "AdminDonationWebhook", description = "A donation webhook (admin)")
    public record AdminWebhook(
            UUID id,
            String provider,
            @Nullable String providerEventId,
            String type,
            boolean signatureValid,
            WebhookState status,
            @Nullable String error,
            Instant receivedAt,
            @Nullable Instant processedAt,
            @Nullable JsonNode payload) {

        static AdminWebhook from(DonationWebhookRow row, JsonMapper jsonMapper) {
            return new AdminWebhook(
                    row.id(),
                    row.provider(),
                    row.providerEventId(),
                    row.type(),
                    row.signatureValid(),
                    row.status(),
                    row.error(),
                    row.receivedAt(),
                    row.processedAt(),
                    row.payload() == null ? null : jsonMapper.readTree(row.payload()));
        }
    }

    /** {@code GET /admin/donations/{id}}. */
    @Schema(name = "AdminDonationDetail", description = "A donation with its webhooks (admin)")
    public record AdminDetailResponse(AdminDonation donation, List<AdminWebhook> webhooks) {

        static AdminDetailResponse from(AdminDetail detail, JsonMapper jsonMapper) {
            return new AdminDetailResponse(
                    AdminDonation.from(detail.donation()),
                    detail.webhooks().stream()
                            .map(webhook -> AdminWebhook.from(webhook, jsonMapper))
                            .toList());
        }
    }

    /** {@code GET/PUT /admin/donations/settings}. */
    @Schema(name = "DonationSettings", description = "Accepted amounts and currencies")
    public record SettingsResponse(
            BigDecimal minAmount,
            BigDecimal maxAmount,
            List<String> currencies,
            @Nullable UUID updatedBy,
            @Nullable Instant updatedAt) {

        static SettingsResponse from(DonationSettings.Values values) {
            return new SettingsResponse(
                    values.minAmount(),
                    values.maxAmount(),
                    values.currencies(),
                    values.updatedBy(),
                    values.updatedAt());
        }
    }
}
