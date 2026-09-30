package com.orenjitrade.api.donations.infra;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.webhooks.SignedWebhooks;
import com.orenjitrade.api.common.webhooks.SignedWebhooks.UnreadablePayloadException;
import com.orenjitrade.api.donations.domain.DonationProvider;
import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The local and test donation provider ({@code DONATION_PROVIDER=fake}, the default): no network,
 * no credentials, no money. A checkout gets a {@code fake_dn_…} reference and the web path {@code
 * /checkout/fake-donation/<ref>}; the donor's click there ({@code POST
 * /api/v1/donations/fake/{ref}/confirm}) produces a synthetic {@code donation.succeeded} (or {@code
 * donation.failed}) webhook signed with {@code orenji.donations.fake.webhook-secret} ({@code
 * X-Fake-Signature}) through the regular donation webhook pipeline. Refunds succeed at once and
 * idempotently.
 */
public class FakeDonationProvider implements DonationProvider {

    public static final String ID = "fake";
    public static final String SIGNATURE_HEADER = "X-Fake-Signature";
    public static final String CHECKOUT_PATH = "/checkout/fake-donation/";

    public static final String DONATION_SUCCEEDED = "donation.succeeded";
    public static final String DONATION_FAILED = "donation.failed";
    public static final String DONATION_REFUNDED = "donation.refunded";

    private static final SecureRandom RANDOM = new SecureRandom();

    private final DonationProperties.Fake properties;
    private final JsonMapper jsonMapper;
    private final TimeProvider timeProvider;
    private final ConcurrentMap<String, String> refunds = new ConcurrentHashMap<>();
    private final List<String> calls = Collections.synchronizedList(new ArrayList<>());

    public FakeDonationProvider(
            DonationProperties.Fake properties, JsonMapper jsonMapper, TimeProvider timeProvider) {
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
        String ref = "fake_dn_" + random();
        calls.add(
                "checkout:"
                        + ref
                        + ":"
                        + request.amount().toPlainString()
                        + " "
                        + request.currency());
        return new Checkout(ref, properties.checkoutBaseUrl() + CHECKOUT_PATH + ref);
    }

    @Override
    public Refund refund(
            String checkoutRef, BigDecimal amount, String currency, String idempotencyKey) {
        String ref = refunds.computeIfAbsent(idempotencyKey, key -> "fake_dre_" + random());
        calls.add(
                "refund:"
                        + ref
                        + ":"
                        + checkoutRef
                        + ":"
                        + amount.toPlainString()
                        + " "
                        + currency);
        return new Refund(ref, true);
    }

    @Override
    public DonationEvent parseWebhook(String payload, Map<String, String> headers) {
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
                    case DONATION_SUCCEEDED -> EventKind.SUCCEEDED;
                    case DONATION_FAILED -> EventKind.FAILED;
                    case DONATION_REFUNDED -> EventKind.REFUNDED;
                    default -> EventKind.OTHER;
                };
        Instant occurredAt;
        try {
            @Nullable String created = text(body, "created");
            occurredAt = created == null ? timeProvider.now() : Instant.parse(created);
        } catch (RuntimeException e) {
            throw new UnreadablePayloadException("created must be an ISO-8601 instant");
        }
        return new DonationEvent(
                id, type, kind, text(data, "checkoutRef"), text(data, "failureCode"), occurredAt);
    }

    /** A synthetic webhook of {@code type}, signed now. */
    public SignedWebhook syntheticEvent(String type, Map<String, ?> data) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", "evt_fake_" + random());
        body.put("type", type);
        body.put("created", timeProvider.now().toString());
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

    /** Provider calls made so far (tests). */
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
