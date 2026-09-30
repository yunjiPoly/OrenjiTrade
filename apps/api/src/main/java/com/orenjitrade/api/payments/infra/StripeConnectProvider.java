package com.orenjitrade.api.payments.infra;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.payments.domain.PaymentProvider;
import com.orenjitrade.api.payments.domain.SellerAccountState;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Currency;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Stripe Connect adapter ({@code PAYMENT_PROVIDER=stripe}; never needed locally, ADR 0011).
 *
 * <ul>
 *   <li>Sellers: Connect Express accounts ({@code POST /v1/accounts}) onboarded through account
 *       links ({@code POST /v1/account_links}); ACTIVE once charges and payouts are enabled.
 *   <li>Payments: a PaymentIntent on the platform ({@code automatic_payment_methods}, {@code
 *       transfer_group=trade_<id>}); the web app confirms it with the returned client secret.
 *   <li>Payout release: a Transfer of the seller's share to the connected account ({@code POST
 *       /v1/transfers}, idempotency key {@code payout:<paymentId>}); refunds through {@code POST
 *       /v1/refunds}.
 *   <li>Webhooks: {@code Stripe-Signature} verification (HMAC-SHA256 of {@code "<t>.<body>"} with
 *       the endpoint secret, tolerance {@code orenji.payments.stripe.webhook-tolerance}); {@code
 *       payment_intent.succeeded} secures a payment, {@code payment_intent.payment_failed} fails
 *       it, {@code account.updated} updates a seller, {@code refund.updated} / {@code
 *       refund.failed} settle refunds.
 * </ul>
 *
 * Requests are form-encoded with an {@code Idempotency-Key}; errors never expose the API key.
 */
public class StripeConnectProvider implements PaymentProvider {

    public static final String ID = "stripe";
    public static final String SIGNATURE_HEADER = "Stripe-Signature";

    private final PaymentProperties.Stripe properties;
    private final JsonMapper jsonMapper;
    private final TimeProvider timeProvider;
    private final RestClient client;

    public StripeConnectProvider(
            PaymentProperties.Stripe properties, JsonMapper jsonMapper, TimeProvider timeProvider) {
        this.properties = properties;
        this.jsonMapper = jsonMapper;
        this.timeProvider = timeProvider;
        this.client =
                RestClient.builder()
                        .baseUrl(properties.apiBaseUrl())
                        .defaultHeader("Authorization", "Bearer " + properties.secretKey())
                        .build();
    }

    @Override
    public String providerId() {
        return ID;
    }

    @Override
    public SellerOnboarding onboardSeller(
            UUID userId, @Nullable String accountRef, String returnUrl) {
        String account = accountRef;
        if (account == null) {
            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            form.add("type", "express");
            form.add("capabilities[transfers][requested]", "true");
            form.add("metadata[orenji_user_id]", userId.toString());
            account = text(post("/v1/accounts", form, "account:" + userId), "id");
        }
        MultiValueMap<String, String> link = new LinkedMultiValueMap<>();
        link.add("account", account);
        link.add("refresh_url", properties.webBaseUrl() + returnUrl);
        link.add("return_url", properties.webBaseUrl() + returnUrl);
        link.add("type", "account_onboarding");
        String url = text(post("/v1/account_links", link, null), "url");
        return new SellerOnboarding(account, url, SellerAccountState.PENDING, false);
    }

    @Override
    public SellerAccountStatus sellerStatus(String accountRef) {
        return accountStatus(get("/v1/accounts/" + accountRef));
    }

    @Override
    public ProtectedPayment createProtectedPayment(CreatePaymentRequest request) {
        JsonNode intent =
                post(
                        "/v1/payment_intents",
                        paymentIntentForm(request),
                        "pay:" + request.paymentId() + ":" + request.attempt());
        return new ProtectedPayment(text(intent, "id"), null, text(intent, "client_secret"));
    }

    @Override
    public void cancelPayment(String paymentRef) {
        post("/v1/payment_intents/" + paymentRef + "/cancel", new LinkedMultiValueMap<>(), null);
    }

    @Override
    public Payout releasePayout(PayoutRequest request) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("amount", Long.toString(minorUnits(request.amount())));
        form.add("currency", request.amount().currency().toLowerCase(Locale.ROOT));
        form.add("destination", request.sellerAccountRef());
        form.add("transfer_group", request.transferGroup());
        form.add("metadata[payment_id]", request.paymentId().toString());
        JsonNode transfer = post("/v1/transfers", form, "payout:" + request.paymentId());
        return new Payout(text(transfer, "id"), true);
    }

    @Override
    public Refund refund(String paymentRef, Money amount, String reason, String idempotencyKey) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("payment_intent", paymentRef);
        form.add("amount", Long.toString(minorUnits(amount)));
        form.add("metadata[reason]", reason.length() > 500 ? reason.substring(0, 500) : reason);
        JsonNode refund = post("/v1/refunds", form, idempotencyKey);
        return new Refund(text(refund, "id"), "succeeded".equals(refund.path("status").asString()));
    }

    @Override
    public WebhookEvent parseWebhook(String payload, Map<String, String> headers) {
        @Nullable String claimedType = null;
        try {
            JsonNode body = jsonMapper.readTree(payload);
            claimedType = body.path("type").isString() ? body.path("type").asString() : null;
        } catch (RuntimeException e) {
            // verified below; an unreadable body fails the signature or the parsing
        }
        WebhookSignatures.verify(
                headers.get(SIGNATURE_HEADER.toLowerCase(Locale.ROOT)),
                payload,
                properties.webhookSecret(),
                properties.webhookTolerance(),
                timeProvider.now(),
                claimedType);
        return interpret(jsonMapper, payload);
    }

    // ---------------------------------------------------------------------------------------
    // Mapping (pure, unit-tested)
    // ---------------------------------------------------------------------------------------

    /** The form of {@code POST /v1/payment_intents}. */
    static MultiValueMap<String, String> paymentIntentForm(CreatePaymentRequest request) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("amount", Long.toString(minorUnits(request.amount())));
        form.add("currency", request.amount().currency().toLowerCase(Locale.ROOT));
        form.add("automatic_payment_methods[enabled]", "true");
        form.add("capture_method", "automatic");
        form.add("transfer_group", "trade_" + request.tradeId());
        form.add("description", request.description());
        form.add("metadata[payment_id]", request.paymentId().toString());
        form.add("metadata[trade_id]", request.tradeId().toString());
        form.add("metadata[platform_fee]", request.platformFee().amount().toPlainString());
        return form;
    }

    /** Amount in the currency's minor units (cents; yen stay whole). */
    static long minorUnits(Money money) {
        int digits = Currency.getInstance(money.currency()).getDefaultFractionDigits();
        return money.amount().movePointRight(Math.max(digits, 0)).setScale(0).longValueExact();
    }

    /** Amount of minor units as money (the inverse of {@link #minorUnits}). */
    static Money fromMinorUnits(long units, String currency) {
        String code = currency.toUpperCase(Locale.ROOT);
        int digits = Currency.getInstance(code).getDefaultFractionDigits();
        return new Money(BigDecimal.valueOf(units).movePointLeft(Math.max(digits, 0)), code);
    }

    /** A verified Stripe event, normalised. */
    static WebhookEvent interpret(JsonMapper jsonMapper, String payload) {
        JsonNode event;
        try {
            event = jsonMapper.readTree(payload);
        } catch (RuntimeException e) {
            throw new WebhookPayloadException("The body is not JSON");
        }
        String id = event.path("id").asString("");
        String type = event.path("type").asString("");
        if (id.isBlank() || type.isBlank()) {
            throw new WebhookPayloadException("id and type are required");
        }
        JsonNode object = event.path("data").path("object");
        Instant occurredAt =
                event.path("created").isNumber()
                        ? Instant.ofEpochSecond(event.path("created").asLong())
                        : Instant.EPOCH;
        @Nullable String objectId =
                object.path("id").isString() ? object.path("id").asString() : null;
        return switch (type) {
            case "payment_intent.succeeded" ->
                    new WebhookEvent(
                            id,
                            type,
                            WebhookKind.PAYMENT_SECURED,
                            objectId,
                            null,
                            null,
                            null,
                            null,
                            occurredAt);
            case "payment_intent.payment_failed" ->
                    new WebhookEvent(
                            id,
                            type,
                            WebhookKind.PAYMENT_FAILED,
                            objectId,
                            null,
                            null,
                            null,
                            object.path("last_payment_error").path("code").isString()
                                    ? object.path("last_payment_error").path("code").asString()
                                    : null,
                            occurredAt);
            case "account.updated" ->
                    new WebhookEvent(
                            id,
                            type,
                            WebhookKind.SELLER_ACCOUNT_UPDATED,
                            null,
                            objectId,
                            accountStatus(object),
                            null,
                            null,
                            occurredAt);
            case "refund.updated", "refund.created" -> {
                String status = object.path("status").asString("");
                WebhookKind kind =
                        switch (status) {
                            case "succeeded" -> WebhookKind.REFUND_SUCCEEDED;
                            case "failed", "canceled" -> WebhookKind.REFUND_FAILED;
                            default -> WebhookKind.OTHER;
                        };
                yield new WebhookEvent(
                        id, type, kind, null, null, null, objectId, null, occurredAt);
            }
            case "refund.failed" ->
                    new WebhookEvent(
                            id,
                            type,
                            WebhookKind.REFUND_FAILED,
                            null,
                            null,
                            null,
                            objectId,
                            null,
                            occurredAt);
            default ->
                    new WebhookEvent(
                            id, type, WebhookKind.OTHER, null, null, null, null, null, occurredAt);
        };
    }

    /** Account state from a Stripe account object. */
    static SellerAccountStatus accountStatus(JsonNode account) {
        boolean charges = account.path("charges_enabled").asBoolean(false);
        boolean payouts = account.path("payouts_enabled").asBoolean(false);
        JsonNode disabled = account.path("requirements").path("disabled_reason");
        boolean restricted = disabled.isString() && !disabled.asString().isBlank();
        if (charges && payouts) {
            return new SellerAccountStatus(SellerAccountState.ACTIVE, true);
        }
        if (restricted) {
            return new SellerAccountStatus(SellerAccountState.RESTRICTED, payouts);
        }
        return new SellerAccountStatus(SellerAccountState.PENDING, payouts);
    }

    // ---------------------------------------------------------------------------------------
    // HTTP
    // ---------------------------------------------------------------------------------------

    private JsonNode post(
            String path, MultiValueMap<String, String> form, @Nullable String idempotencyKey) {
        try {
            RestClient.RequestBodySpec spec =
                    client.post().uri(path).contentType(MediaType.APPLICATION_FORM_URLENCODED);
            if (idempotencyKey != null) {
                spec = spec.header("Idempotency-Key", idempotencyKey);
            }
            String body = spec.body(form).retrieve().body(String.class);
            return jsonMapper.readTree(body == null ? "{}" : body);
        } catch (RestClientException e) {
            throw new PaymentProviderException(
                    "Stripe call " + path.replaceAll("/[a-z]+_[A-Za-z0-9]+", "/{id}") + " failed",
                    null);
        }
    }

    private JsonNode get(String path) {
        try {
            String body = client.get().uri(path).retrieve().body(String.class);
            return jsonMapper.readTree(body == null ? "{}" : body);
        } catch (RestClientException e) {
            throw new PaymentProviderException("Stripe account lookup failed", null);
        }
    }

    private static String text(JsonNode node, String field) {
        String value = node.path(field).asString("");
        if (value.isBlank()) {
            throw new PaymentProviderException("Stripe answered without " + field, null);
        }
        return value;
    }

    /** Values sent with a request (tests). */
    static Map<String, String> flatten(MultiValueMap<String, String> form) {
        Map<String, String> result = new LinkedHashMap<>();
        form.forEach((key, values) -> result.put(key, String.join(",", values)));
        return result;
    }
}
