package com.orenjitrade.api.billing.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.billing.domain.BillingWebhookService.Receipt;
import com.orenjitrade.api.billing.domain.SubscriptionRows.BillingWebhookRow;
import com.orenjitrade.api.billing.domain.SubscriptionRows.SubscriptionEventRow;
import com.orenjitrade.api.billing.domain.SubscriptionRows.SubscriptionRow;
import com.orenjitrade.api.billing.domain.SubscriptionRows.WebhookState;
import com.orenjitrade.api.billing.domain.SubscriptionService.CheckoutResult;
import com.orenjitrade.api.billing.domain.SubscriptionService.SubscriptionDetail;
import com.orenjitrade.api.billing.domain.SubscriptionStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Response bodies of the subscription routes (Phase 10). */
public final class SubscriptionResponses {

    private SubscriptionResponses() {}

    /**
     * A subscription as its member sees it (no provider references).
     *
     * @param id subscription id
     * @param planCode plan
     * @param planName plan display name
     * @param status status
     * @param provider billing provider
     * @param amount price per period
     * @param currency ISO 4217 code
     * @param currentPeriodStart start of the paid period
     * @param currentPeriodEnd end of the paid period (the plan stays until then after a
     *     cancellation)
     * @param cancelAtPeriodEnd the member cancelled
     * @param checkoutUrl where to finish paying (PENDING only)
     * @param failureCode last provider failure (PENDING, PAST_DUE)
     * @param createdAt creation
     * @param activatedAt activation
     * @param endedAt end
     */
    @Schema(name = "MySubscription", description = "The caller's subscription")
    public record MySubscription(
            UUID id,
            @Schema(example = "PREMIUM") String planCode,
            String planName,
            SubscriptionStatus status,
            @Schema(example = "fake") String provider,
            @Schema(example = "4.99") BigDecimal amount,
            @Schema(example = "CAD") String currency,
            @Nullable Instant currentPeriodStart,
            @Nullable Instant currentPeriodEnd,
            boolean cancelAtPeriodEnd,
            @Schema(example = "/checkout/fake-billing/fake_cs_0123") @Nullable String checkoutUrl,
            @Nullable String failureCode,
            Instant createdAt,
            @Nullable Instant activatedAt,
            @Nullable Instant endedAt) {

        public static MySubscription from(SubscriptionRow row) {
            boolean pending = row.status() == SubscriptionStatus.PENDING;
            return new MySubscription(
                    row.id(),
                    row.planCode(),
                    row.planName(),
                    row.status(),
                    row.provider(),
                    row.amount(),
                    row.currency(),
                    row.currentPeriodStart(),
                    row.currentPeriodEnd(),
                    row.cancelAtPeriodEnd(),
                    pending ? row.checkoutUrl() : null,
                    pending || row.status() == SubscriptionStatus.PAST_DUE
                            ? row.failureCode()
                            : null,
                    row.createdAt(),
                    row.activatedAt(),
                    row.endedAt());
        }
    }

    /**
     * An opened checkout.
     *
     * @param subscription the PENDING subscription
     * @param url where the member pays
     * @param clientSecret embedded-form secret (Stripe), returned once, never stored
     * @param resumed an open checkout of the same plan was answered again
     */
    @Schema(name = "SubscriptionCheckout", description = "Where the member pays for a plan")
    public record CheckoutResponse(
            MySubscription subscription,
            @Schema(example = "/checkout/fake-billing/fake_cs_0123") String url,
            @Nullable String clientSecret,
            boolean resumed) {

        static CheckoutResponse from(CheckoutResult result) {
            return new CheckoutResponse(
                    MySubscription.from(result.subscription()),
                    result.url(),
                    result.clientSecret(),
                    result.resumed());
        }
    }

    /**
     * What {@code /checkout/fake-billing/<ref>} shows.
     *
     * @param ref checkout reference
     * @param subscriptionId the subscription
     * @param planCode plan
     * @param planName plan display name
     * @param amount price per period
     * @param currency ISO 4217 code
     * @param status subscription status
     * @param failureCode last simulated failure
     * @param summary text shown on the fake checkout
     */
    @Schema(name = "FakeBillingCheckout", description = "A fake billing checkout (local only)")
    public record FakeBillingCheckoutResponse(
            String ref,
            UUID subscriptionId,
            String planCode,
            String planName,
            BigDecimal amount,
            String currency,
            SubscriptionStatus status,
            @Nullable String failureCode,
            String summary) {

        static FakeBillingCheckoutResponse from(SubscriptionRow row, String ref) {
            return new FakeBillingCheckoutResponse(
                    ref,
                    row.id(),
                    row.planCode(),
                    row.planName(),
                    row.amount(),
                    row.currency(),
                    row.status(),
                    row.failureCode(),
                    "Test checkout: no money moves. "
                            + row.planName()
                            + " for "
                            + row.amount().toPlainString()
                            + " "
                            + row.currency()
                            + " per month.");
        }
    }

    /** A received billing webhook. */
    @Schema(name = "BillingWebhookReceipt", description = "A received billing provider webhook")
    public record WebhookReceiptResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean received,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "The provider already sent this event (no new change)")
                    boolean duplicate,
            @Schema(nullable = true, description = "Stored event (null for a duplicate)")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID webhookEventId,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "checkout.completed")
                    String type) {

        static WebhookReceiptResponse from(Receipt receipt) {
            return new WebhookReceiptResponse(
                    true, receipt.duplicate(), receipt.webhookEventId(), receipt.type());
        }
    }

    /**
     * A subscription in the admin console.
     *
     * @param id subscription id
     * @param userId the member
     * @param userHandle the member's handle
     * @param planCode plan
     * @param status status
     * @param provider billing provider
     * @param amount price per period
     * @param currency ISO 4217 code
     * @param currentPeriodStart start of the paid period
     * @param currentPeriodEnd end of the paid period
     * @param cancelAtPeriodEnd cancellation requested
     * @param failureCode last provider failure
     * @param createdAt creation
     * @param activatedAt activation
     * @param endedAt end
     * @param updatedAt last change
     */
    @Schema(name = "AdminSubscription", description = "A subscription (admin view)")
    public record AdminSubscription(
            UUID id,
            UUID userId,
            @Nullable String userHandle,
            String planCode,
            SubscriptionStatus status,
            String provider,
            BigDecimal amount,
            String currency,
            @Nullable Instant currentPeriodStart,
            @Nullable Instant currentPeriodEnd,
            boolean cancelAtPeriodEnd,
            @Nullable String failureCode,
            Instant createdAt,
            @Nullable Instant activatedAt,
            @Nullable Instant endedAt,
            Instant updatedAt) {

        static AdminSubscription from(SubscriptionRow row, @Nullable String handle) {
            return new AdminSubscription(
                    row.id(),
                    row.userId(),
                    handle,
                    row.planCode(),
                    row.status(),
                    row.provider(),
                    row.amount(),
                    row.currency(),
                    row.currentPeriodStart(),
                    row.currentPeriodEnd(),
                    row.cancelAtPeriodEnd(),
                    row.failureCode(),
                    row.createdAt(),
                    row.activatedAt(),
                    row.endedAt(),
                    row.updatedAt());
        }
    }

    /** A history entry of a subscription (admin view). */
    @Schema(name = "AdminSubscriptionEvent", description = "A subscription history entry")
    public record AdminSubscriptionEvent(
            UUID id,
            @Schema(example = "ACTIVATED") String event,
            @Nullable String providerEventId,
            @Nullable UUID actorId,
            @Schema(description = "Structured details (statuses, plan, dates)") JsonNode details,
            Instant createdAt) {

        static AdminSubscriptionEvent from(SubscriptionEventRow row, JsonMapper jsonMapper) {
            return new AdminSubscriptionEvent(
                    row.id(),
                    row.event(),
                    row.providerEventId(),
                    row.actorId(),
                    jsonMapper.readTree(row.detailsJson()),
                    row.createdAt());
        }
    }

    /** A billing webhook linked to a subscription (admin view, with its payload). */
    @Schema(name = "AdminBillingWebhook", description = "A billing provider webhook (admin)")
    public record AdminBillingWebhook(
            UUID id,
            String provider,
            @Nullable String providerEventId,
            String type,
            boolean signatureValid,
            WebhookState status,
            @Nullable String error,
            Instant receivedAt,
            @Nullable Instant processedAt,
            @Schema(description = "The body as received (confidential)")
                    @Nullable JsonNode payload) {

        static AdminBillingWebhook from(BillingWebhookRow row, JsonMapper jsonMapper) {
            return new AdminBillingWebhook(
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

    /** A subscription with its history and webhooks (admin detail). */
    @Schema(name = "AdminSubscriptionDetail", description = "A subscription with its history")
    public record AdminSubscriptionDetail(
            AdminSubscription subscription,
            List<AdminSubscriptionEvent> events,
            List<AdminBillingWebhook> webhooks) {

        static AdminSubscriptionDetail from(
                SubscriptionDetail detail, @Nullable String handle, JsonMapper jsonMapper) {
            return new AdminSubscriptionDetail(
                    AdminSubscription.from(detail.subscription(), handle),
                    detail.events().stream()
                            .map(event -> AdminSubscriptionEvent.from(event, jsonMapper))
                            .toList(),
                    detail.webhooks().stream()
                            .map(webhook -> AdminBillingWebhook.from(webhook, jsonMapper))
                            .toList());
        }
    }

    /** {@code POST /internal/jobs/subscriptions-period}. */
    @Schema(name = "SubscriptionsPeriodJobResult")
    public record PeriodJobResponse(
            @Schema(description = "Subscriptions whose period ended") int due,
            @Schema(description = "Cancellations at the period end applied") int cancelled,
            @Schema(description = "Fake renewals requested") int renewalsRequested,
            @Schema(description = "Subscriptions expired without renewal") int expired) {}
}
