package com.orenjitrade.api.billing.infra;

import com.orenjitrade.api.billing.domain.BillingProvider;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.webhooks.SignedWebhooks;
import com.orenjitrade.api.common.webhooks.SignedWebhooks.UnreadablePayloadException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Stripe Billing adapter ({@code BILLING_PROVIDER=stripe}; never needed locally).
 *
 * <ul>
 *   <li>Checkout: a Checkout Session in {@code subscription} mode for the plan's Stripe price
 *       ({@code orenji.billing.stripe.price-ids.<PLAN>}), {@code client_reference_id} and metadata
 *       carrying our subscription id, idempotency key {@code checkout:<subscriptionId>}.
 *   <li>Cancellation: {@code cancel_at_period_end=true} or {@code DELETE /v1/subscriptions/{id}}.
 *   <li>Webhooks ({@code Stripe-Signature}, HMAC-SHA256 with the endpoint secret): {@code
 *       checkout.session.completed} activates, {@code checkout.session.expired} fails the checkout,
 *       {@code invoice.paid} renews (period of the first invoice line), {@code
 *       invoice.payment_failed} marks PAST_DUE, {@code customer.subscription.deleted} cancels.
 * </ul>
 *
 * Requests are form-encoded over Spring's {@code RestClient} (no SDK dependency); errors never
 * expose the API key. Compile- and unit-tested only (no Stripe account locally).
 */
public class StripeBillingProvider implements BillingProvider {

    public static final String ID = "stripe";
    public static final String SIGNATURE_HEADER = "Stripe-Signature";

    private final BillingProperties.Stripe properties;
    private final JsonMapper jsonMapper;
    private final TimeProvider timeProvider;
    private final RestClient client;

    public StripeBillingProvider(
            BillingProperties.Stripe properties, JsonMapper jsonMapper, TimeProvider timeProvider) {
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
    public Checkout startCheckout(CheckoutRequest request) {
        JsonNode session =
                post(
                        "/v1/checkout/sessions",
                        checkoutForm(request, properties),
                        "checkout:" + request.subscriptionId());
        return new Checkout(text(session, "id"), text(session, "url"), null);
    }

    @Override
    public void cancel(String subscriptionRef, boolean atPeriodEnd) {
        if (atPeriodEnd) {
            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            form.add("cancel_at_period_end", "true");
            post("/v1/subscriptions/" + subscriptionRef, form, null);
            return;
        }
        try {
            client.delete()
                    .uri("/v1/subscriptions/" + subscriptionRef)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException e) {
            throw new BillingProviderException("Stripe subscription cancellation failed", null);
        }
    }

    @Override
    public BillingEvent parseWebhook(String payload, Map<String, String> headers) {
        @Nullable String claimedType = null;
        try {
            JsonNode body = jsonMapper.readTree(payload);
            claimedType = body.path("type").isString() ? body.path("type").asString() : null;
        } catch (RuntimeException e) {
            // verified below; an unreadable body fails the signature or the parsing
        }
        SignedWebhooks.verify(
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

    /** The form of {@code POST /v1/checkout/sessions}. */
    static MultiValueMap<String, String> checkoutForm(
            CheckoutRequest request, BillingProperties.Stripe properties) {
        @Nullable String price = properties.priceIds().get(request.planCode());
        if (price == null) {
            price = properties.priceIds().get(request.planCode().toLowerCase(Locale.ROOT));
        }
        if (price == null || price.isBlank()) {
            throw new BillingProviderException(
                    "No Stripe price is configured for plan " + request.planCode(), null);
        }
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("mode", "subscription");
        form.add("line_items[0][price]", price);
        form.add("line_items[0][quantity]", "1");
        form.add("success_url", properties.webBaseUrl() + request.successPath());
        form.add("cancel_url", properties.webBaseUrl() + request.cancelPath());
        form.add("client_reference_id", request.subscriptionId().toString());
        form.add("metadata[subscription_id]", request.subscriptionId().toString());
        form.add(
                "subscription_data[metadata][subscription_id]",
                request.subscriptionId().toString());
        form.add("subscription_data[metadata][plan_code]", request.planCode());
        return form;
    }

    /** A verified Stripe event, normalised. */
    static BillingEvent interpret(JsonMapper jsonMapper, String payload) {
        JsonNode event;
        try {
            event = jsonMapper.readTree(payload);
        } catch (RuntimeException e) {
            throw new UnreadablePayloadException("The body is not JSON");
        }
        String id = event.path("id").asString("");
        String type = event.path("type").asString("");
        if (id.isBlank() || type.isBlank()) {
            throw new UnreadablePayloadException("id and type are required");
        }
        JsonNode object = event.path("data").path("object");
        Instant occurredAt =
                event.path("created").isNumber()
                        ? Instant.ofEpochSecond(event.path("created").asLong())
                        : Instant.EPOCH;
        @Nullable String objectId = string(object, "id");
        return switch (type) {
            case "checkout.session.completed" ->
                    new BillingEvent(
                            id,
                            type,
                            EventKind.CHECKOUT_COMPLETED,
                            objectId,
                            string(object, "subscription"),
                            null,
                            null,
                            null,
                            occurredAt);
            case "checkout.session.expired" ->
                    new BillingEvent(
                            id,
                            type,
                            EventKind.CHECKOUT_FAILED,
                            objectId,
                            null,
                            null,
                            null,
                            "expired",
                            occurredAt);
            case "invoice.paid" -> {
                JsonNode period = object.path("lines").path("data").path(0).path("period");
                yield new BillingEvent(
                        id,
                        type,
                        EventKind.SUBSCRIPTION_RENEWED,
                        null,
                        string(object, "subscription"),
                        epoch(period, "start"),
                        epoch(period, "end"),
                        null,
                        occurredAt);
            }
            case "invoice.payment_failed" ->
                    new BillingEvent(
                            id,
                            type,
                            EventKind.PAYMENT_FAILED,
                            null,
                            string(object, "subscription"),
                            null,
                            null,
                            string(object.path("last_finalization_error"), "code"),
                            occurredAt);
            case "customer.subscription.deleted" ->
                    new BillingEvent(
                            id,
                            type,
                            EventKind.SUBSCRIPTION_CANCELLED,
                            null,
                            objectId,
                            null,
                            null,
                            null,
                            occurredAt);
            default ->
                    new BillingEvent(
                            id, type, EventKind.OTHER, null, null, null, null, null, occurredAt);
        };
    }

    private static @Nullable Instant epoch(JsonNode node, String field) {
        return node.path(field).isNumber()
                ? Instant.ofEpochSecond(node.path(field).asLong())
                : null;
    }

    private static @Nullable String string(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isString() && !value.asString().isBlank() ? value.asString() : null;
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
            throw new BillingProviderException(
                    "Stripe call " + path.replaceAll("/[a-z]+_[A-Za-z0-9]+", "/{id}") + " failed",
                    null);
        }
    }

    private static String text(JsonNode node, String field) {
        String value = node.path(field).asString("");
        if (value.isBlank()) {
            throw new BillingProviderException("Stripe answered without " + field, null);
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
