package com.orenjitrade.api.payments.infra;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.payments.domain.PaymentProvider;
import com.orenjitrade.api.payments.domain.SellerAccountState;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The local and test payment provider ({@code PAYMENT_PROVIDER=fake}, the default): no network, no
 * credentials, no money. Onboarding completes at once (ACTIVE, payouts enabled); a protected
 * payment gets a {@code fake_pi_…} reference and the web checkout path {@code
 * /checkout/fake/<ref>}; payouts and refunds succeed immediately and idempotently (in memory, per
 * idempotency key). The fake checkout ({@code POST /payments/fake/{ref}/confirm}) and the internal
 * routes ({@code /internal/fake-payments/{ref}/succeed|fail}) produce synthetic webhooks signed
 * with {@code orenji.payments.fake.webhook-secret} in the Stripe format ({@code X-Fake-Signature})
 * that travel through the same webhook pipeline as real ones.
 *
 * <p>Event types: {@code payment.secured}, {@code payment.failed}, {@code account.updated}, {@code
 * refund.succeeded}, {@code refund.failed}, {@code payout.paid}; body {@code {id, type, created,
 * data: {paymentRef?, accountRef?, accountStatus?, payoutsEnabled?, refundRef?, failureCode?}}}.
 */
public class FakePaymentProvider implements PaymentProvider {

    public static final String ID = "fake";
    public static final String SIGNATURE_HEADER = "X-Fake-Signature";
    public static final String CHECKOUT_PATH = "/checkout/fake/";

    public static final String PAYMENT_SECURED = "payment.secured";
    public static final String PAYMENT_FAILED = "payment.failed";
    public static final String ACCOUNT_UPDATED = "account.updated";
    public static final String REFUND_SUCCEEDED = "refund.succeeded";
    public static final String REFUND_FAILED = "refund.failed";
    public static final String PAYOUT_PAID = "payout.paid";

    private static final Logger log = LoggerFactory.getLogger(FakePaymentProvider.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final PaymentProperties.Fake properties;
    private final JsonMapper jsonMapper;
    private final TimeProvider timeProvider;
    private final ConcurrentMap<String, String> payouts = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, String> refunds = new ConcurrentHashMap<>();
    private final List<String> calls = Collections.synchronizedList(new ArrayList<>());

    public FakePaymentProvider(
            PaymentProperties.Fake properties, JsonMapper jsonMapper, TimeProvider timeProvider) {
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
    public SellerOnboarding onboardSeller(
            UUID userId, @Nullable String accountRef, String returnUrl) {
        String account = accountRef != null ? accountRef : "fake_acct_" + random();
        calls.add("onboard:" + account);
        String url = returnUrl + (returnUrl.contains("?") ? "&" : "?") + "onboarding=complete";
        return new SellerOnboarding(account, url, SellerAccountState.ACTIVE, true);
    }

    @Override
    public SellerAccountStatus sellerStatus(String accountRef) {
        return new SellerAccountStatus(SellerAccountState.ACTIVE, true);
    }

    @Override
    public ProtectedPayment createProtectedPayment(CreatePaymentRequest request) {
        String ref = "fake_pi_" + random();
        calls.add("create:" + ref + ":" + request.amount().text());
        return new ProtectedPayment(ref, properties.checkoutBaseUrl() + CHECKOUT_PATH + ref, null);
    }

    @Override
    public void cancelPayment(String paymentRef) {
        calls.add("cancel:" + paymentRef);
    }

    @Override
    public Payout releasePayout(PayoutRequest request) {
        String ref =
                payouts.computeIfAbsent(
                        "payout:" + request.paymentId(), key -> "fake_tr_" + random());
        calls.add("payout:" + ref + ":" + request.amount().text());
        return new Payout(ref, true);
    }

    @Override
    public Refund refund(String paymentRef, Money amount, String reason, String idempotencyKey) {
        String ref = refunds.computeIfAbsent(idempotencyKey, key -> "fake_re_" + random());
        calls.add("refund:" + ref + ":" + paymentRef + ":" + amount.text());
        return new Refund(ref, true);
    }

    @Override
    public WebhookEvent parseWebhook(String payload, Map<String, String> headers) {
        @Nullable JsonNode body = readLeniently(payload);
        @Nullable String claimedType = body == null ? null : text(body, "type");
        WebhookSignatures.verify(
                headers.get(SIGNATURE_HEADER.toLowerCase(Locale.ROOT)),
                payload,
                properties.webhookSecret(),
                properties.webhookTolerance(),
                timeProvider.now(),
                claimedType);
        if (body == null || !body.isObject()) {
            throw new WebhookPayloadException("The body is not a JSON object");
        }
        @Nullable String id = text(body, "id");
        @Nullable String type = text(body, "type");
        if (id == null || type == null) {
            throw new WebhookPayloadException("id and type are required");
        }
        JsonNode data = body.path("data");
        Instant occurredAt;
        try {
            @Nullable String created = text(body, "created");
            occurredAt = created == null ? timeProvider.now() : Instant.parse(created);
        } catch (RuntimeException e) {
            throw new WebhookPayloadException("created must be an ISO-8601 instant");
        }
        WebhookKind kind =
                switch (type) {
                    case PAYMENT_SECURED -> WebhookKind.PAYMENT_SECURED;
                    case PAYMENT_FAILED -> WebhookKind.PAYMENT_FAILED;
                    case ACCOUNT_UPDATED -> WebhookKind.SELLER_ACCOUNT_UPDATED;
                    case REFUND_SUCCEEDED -> WebhookKind.REFUND_SUCCEEDED;
                    case REFUND_FAILED -> WebhookKind.REFUND_FAILED;
                    case PAYOUT_PAID -> WebhookKind.PAYOUT_PAID;
                    default -> WebhookKind.OTHER;
                };
        @Nullable SellerAccountStatus account = null;
        @Nullable String status = text(data, "accountStatus");
        if (status != null) {
            try {
                account =
                        new SellerAccountStatus(
                                SellerAccountState.valueOf(status),
                                data.path("payoutsEnabled").asBoolean(false));
            } catch (IllegalArgumentException e) {
                throw new WebhookPayloadException("Unknown accountStatus");
            }
        }
        return new WebhookEvent(
                id,
                type,
                kind,
                text(data, "paymentRef"),
                text(data, "accountRef"),
                account,
                text(data, "refundRef"),
                text(data, "failureCode"),
                occurredAt);
    }

    /**
     * A synthetic webhook of {@code type} for the fake checkout and the internal routes, signed
     * now.
     *
     * @param data the {@code data} object (references and codes)
     */
    public SignedWebhook syntheticEvent(String type, Map<String, ?> data) {
        Instant now = timeProvider.now();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", "evt_fake_" + random());
        body.put("type", type);
        body.put("created", now.toString());
        body.put("data", data);
        String payload = jsonMapper.writeValueAsString(body);
        String header = WebhookSignatures.header(properties.webhookSecret(), now, payload);
        log.debug("Synthetic fake webhook {}", type);
        return new SignedWebhook(payload, Map.of(SIGNATURE_HEADER, header));
    }

    /** Signs an arbitrary body (tests replay a webhook with the same event id). */
    public SignedWebhook sign(String payload) {
        return new SignedWebhook(
                payload,
                Map.of(
                        SIGNATURE_HEADER,
                        WebhookSignatures.header(
                                properties.webhookSecret(), timeProvider.now(), payload)));
    }

    /** Provider calls made so far (tests): {@code create:…}, {@code payout:…}, {@code refund:…}. */
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
