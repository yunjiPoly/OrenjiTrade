package com.orenjitrade.api.billing.infra;

import com.orenjitrade.api.billing.domain.BillingProvider;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.webhooks.SignedWebhooks;
import com.orenjitrade.api.common.webhooks.SignedWebhooks.UnreadablePayloadException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The local and test billing provider ({@code BILLING_PROVIDER=fake}, the default): no network, no
 * credentials, no money. A checkout gets a {@code fake_cs_…} reference and the web checkout path
 * {@code /checkout/fake-billing/<ref>}; the member's click on "Subscribe" there ({@code POST
 * /api/v1/billing/fake/{ref}/confirm}) produces a synthetic {@code checkout.completed} (or {@code
 * checkout.failed}) webhook signed with {@code orenji.billing.fake.webhook-secret} in the Stripe
 * format ({@code X-Fake-Signature}) that travels through the regular billing webhook pipeline.
 * Renewals are synthetic {@code subscription.renewed} webhooks emitted by the {@code
 * subscriptions-period} job.
 *
 * <p>Event types: {@code checkout.completed}, {@code checkout.failed}, {@code
 * subscription.renewed}, {@code invoice.payment_failed}, {@code subscription.cancelled}; body
 * {@code {id, type, created, data: {checkoutRef?, subscriptionRef?, periodStart?, periodEnd?,
 * failureCode?}}}.
 */
public class FakeBillingProvider implements BillingProvider {

    public static final String ID = "fake";
    public static final String SIGNATURE_HEADER = "X-Fake-Signature";
    public static final String CHECKOUT_PATH = "/checkout/fake-billing/";

    public static final String CHECKOUT_COMPLETED = "checkout.completed";
    public static final String CHECKOUT_FAILED = "checkout.failed";
    public static final String SUBSCRIPTION_RENEWED = "subscription.renewed";
    public static final String PAYMENT_FAILED = "invoice.payment_failed";
    public static final String SUBSCRIPTION_CANCELLED = "subscription.cancelled";

    private static final SecureRandom RANDOM = new SecureRandom();

    private final BillingProperties.Fake properties;
    private final JsonMapper jsonMapper;
    private final TimeProvider timeProvider;
    private final List<String> calls = Collections.synchronizedList(new ArrayList<>());

    public FakeBillingProvider(
            BillingProperties.Fake properties, JsonMapper jsonMapper, TimeProvider timeProvider) {
        this.properties = properties;
        this.jsonMapper = jsonMapper;
        this.timeProvider = timeProvider;
    }

    /**
     * A signed synthetic webhook.
     *
     * @param payload JSON body
     * @param headers the signature header
     */
    public record SignedWebhook(String payload, Map<String, String> headers) {}

    @Override
    public String providerId() {
        return ID;
    }

    @Override
    public Checkout startCheckout(CheckoutRequest request) {
        String ref = "fake_cs_" + random();
        calls.add(
                "checkout:"
                        + ref
                        + ":"
                        + request.planCode()
                        + ":"
                        + request.amount().toPlainString()
                        + " "
                        + request.currency());
        return new Checkout(ref, properties.checkoutBaseUrl() + CHECKOUT_PATH + ref, null);
    }

    @Override
    public void cancel(String subscriptionRef, boolean atPeriodEnd) {
        calls.add("cancel:" + subscriptionRef + ":" + (atPeriodEnd ? "period-end" : "now"));
    }

    @Override
    public BillingEvent parseWebhook(String payload, Map<String, String> headers) {
        @Nullable JsonNode body = readLeniently(payload);
        @Nullable String claimedType = body == null ? null : text(body, "type");
        SignedWebhooks.verify(
                headers.get(SIGNATURE_HEADER.toLowerCase(Locale.ROOT)),
                payload,
                properties.webhookSecret(),
                properties.webhookTolerance(),
                timeProvider.now(),
                claimedType);
        if (body == null || !body.isObject()) {
            throw new UnreadablePayloadException("The body is not a JSON object");
        }
        @Nullable String id = text(body, "id");
        @Nullable String type = text(body, "type");
        if (id == null || type == null) {
            throw new UnreadablePayloadException("id and type are required");
        }
        JsonNode data = body.path("data");
        EventKind kind =
                switch (type) {
                    case CHECKOUT_COMPLETED -> EventKind.CHECKOUT_COMPLETED;
                    case CHECKOUT_FAILED -> EventKind.CHECKOUT_FAILED;
                    case SUBSCRIPTION_RENEWED -> EventKind.SUBSCRIPTION_RENEWED;
                    case PAYMENT_FAILED -> EventKind.PAYMENT_FAILED;
                    case SUBSCRIPTION_CANCELLED -> EventKind.SUBSCRIPTION_CANCELLED;
                    default -> EventKind.OTHER;
                };
        return new BillingEvent(
                id,
                type,
                kind,
                text(data, "checkoutRef"),
                text(data, "subscriptionRef"),
                instant(data, "periodStart"),
                instant(data, "periodEnd"),
                text(data, "failureCode"),
                Objects.requireNonNullElse(instant(body, "created"), timeProvider.now()));
    }

    /** The paid period the fake provider grants from {@code start}. */
    public Instant periodEnd(Instant start) {
        return start.plus(properties.period());
    }

    public Duration period() {
        return properties.period();
    }

    /** A new fake subscription reference. */
    public String newSubscriptionRef() {
        return "fake_sub_" + random();
    }

    /** A synthetic webhook of {@code type} with the given {@code data}, signed now. */
    public SignedWebhook syntheticEvent(String type, Map<String, ?> data) {
        Instant now = timeProvider.now();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", "evt_fake_" + random());
        body.put("type", type);
        body.put("created", now.toString());
        body.put("data", data);
        return sign(jsonMapper.writeValueAsString(body));
    }

    /** Signs an arbitrary body (tests replay a webhook with the same event id). */
    public SignedWebhook sign(String payload) {
        return new SignedWebhook(
                payload,
                Map.of(
                        SIGNATURE_HEADER,
                        SignedWebhooks.header(
                                properties.webhookSecret(), timeProvider.now(), payload)));
    }

    /** Provider calls made so far (tests): {@code checkout:…}, {@code cancel:…}. */
    public List<String> calls() {
        synchronized (calls) {
            return List.copyOf(calls);
        }
    }

    private @Nullable JsonNode readLeniently(String payload) {
        try {
            return jsonMapper.readTree(payload);
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static @Nullable Instant instant(JsonNode node, String field) {
        @Nullable String value = text(node, field);
        if (value == null) {
            return null;
        }
        try {
            return Instant.parse(value);
        } catch (RuntimeException e) {
            throw new UnreadablePayloadException(field + " must be an ISO-8601 instant");
        }
    }

    private static @Nullable String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull()) {
            return null;
        }
        String text = value.asString();
        return text.isBlank() ? null : text;
    }

    private static String random() {
        byte[] bytes = new byte[12];
        RANDOM.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }
}
