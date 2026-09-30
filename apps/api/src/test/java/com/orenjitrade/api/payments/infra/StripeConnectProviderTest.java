package com.orenjitrade.api.payments.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.payments.domain.PaymentProvider.CreatePaymentRequest;
import com.orenjitrade.api.payments.domain.PaymentProvider.Money;
import com.orenjitrade.api.payments.domain.PaymentProvider.WebhookEvent;
import com.orenjitrade.api.payments.domain.PaymentProvider.WebhookKind;
import com.orenjitrade.api.payments.domain.PaymentProvider.WebhookPayloadException;
import com.orenjitrade.api.payments.domain.PaymentProvider.WebhookSignatureException;
import com.orenjitrade.api.payments.domain.SellerAccountState;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/**
 * The Stripe Connect adapter without network: {@code Stripe-Signature} verification with a test
 * secret, the mapping of Stripe events and account objects, and the request forms. Never needs
 * Stripe credentials.
 */
class StripeConnectProviderTest {

    static final String SECRET = "whsec_test_orenjitrade_unit";
    static final Instant NOW = Instant.parse("2026-09-30T12:00:00Z");

    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    private final StripeConnectProvider provider =
            new StripeConnectProvider(
                    new PaymentProperties.Stripe(
                            "sk_test_unit_not_used",
                            SECRET,
                            "https://api.stripe.invalid",
                            "https://www.orenjitrade.test",
                            Duration.ofMinutes(5)),
                    jsonMapper,
                    TimeProvider.fixed(NOW));

    static final String SUCCEEDED =
            """
            {"id":"evt_1","type":"payment_intent.succeeded","created":1790000000,
             "data":{"object":{"id":"pi_123","object":"payment_intent","amount":4000}}}
            """;

    private static Map<String, String> signed(String payload, Instant at, String secret) {
        return Map.of("stripe-signature", WebhookSignatures.header(secret, at, payload));
    }

    @Test
    void verifiedEventsAreNormalised() {
        WebhookEvent event = provider.parseWebhook(SUCCEEDED, signed(SUCCEEDED, NOW, SECRET));
        assertThat(event.providerEventId()).isEqualTo("evt_1");
        assertThat(event.kind()).isEqualTo(WebhookKind.PAYMENT_SECURED);
        assertThat(event.paymentRef()).isEqualTo("pi_123");
        assertThat(event.occurredAt()).isEqualTo(Instant.ofEpochSecond(1790000000));

        // Several v1 signatures (secret rotation): one valid is enough.
        String header =
                "t="
                        + NOW.getEpochSecond()
                        + ",v1=deadbeef,"
                        + WebhookSignatures.header(SECRET, NOW, SUCCEEDED)
                                .substring(
                                        WebhookSignatures.header(SECRET, NOW, SUCCEEDED)
                                                .indexOf("v1="));
        assertThat(provider.parseWebhook(SUCCEEDED, Map.of("stripe-signature", header)).kind())
                .isEqualTo(WebhookKind.PAYMENT_SECURED);
    }

    @Test
    void badSignaturesAreRefused() {
        assertThatThrownBy(() -> provider.parseWebhook(SUCCEEDED, Map.of()))
                .isInstanceOf(WebhookSignatureException.class)
                .hasMessageContaining("Missing");
        assertThatThrownBy(
                        () ->
                                provider.parseWebhook(
                                        SUCCEEDED.replace("pi_123", "pi_999"),
                                        signed(SUCCEEDED, NOW, SECRET)))
                .isInstanceOf(WebhookSignatureException.class)
                .hasMessageContaining("mismatch");
        assertThatThrownBy(
                        () ->
                                provider.parseWebhook(
                                        SUCCEEDED, signed(SUCCEEDED, NOW, "whsec_other")))
                .isInstanceOf(WebhookSignatureException.class);
        assertThatThrownBy(
                        () ->
                                provider.parseWebhook(
                                        SUCCEEDED,
                                        signed(
                                                SUCCEEDED,
                                                NOW.minus(Duration.ofMinutes(10)),
                                                SECRET)))
                .isInstanceOf(WebhookSignatureException.class)
                .hasMessageContaining("tolerance");
        assertThatThrownBy(
                        () ->
                                provider.parseWebhook(
                                        SUCCEEDED, Map.of("stripe-signature", "t=abc,v1=00")))
                .isInstanceOf(WebhookSignatureException.class);
        String unreadable = "not json";
        assertThatThrownBy(() -> provider.parseWebhook(unreadable, signed(unreadable, NOW, SECRET)))
                .isInstanceOf(WebhookPayloadException.class);
    }

    @Test
    void eventTypesMapToPlatformMeanings() {
        String failed =
                """
                {"id":"evt_2","type":"payment_intent.payment_failed","created":1,
                 "data":{"object":{"id":"pi_9","last_payment_error":{"code":"card_declined"}}}}
                """;
        WebhookEvent failure = StripeConnectProvider.interpret(jsonMapper, failed);
        assertThat(failure.kind()).isEqualTo(WebhookKind.PAYMENT_FAILED);
        assertThat(failure.failureCode()).isEqualTo("card_declined");

        String account =
                """
                {"id":"evt_3","type":"account.updated","created":1,
                 "data":{"object":{"id":"acct_1","charges_enabled":true,"payouts_enabled":true}}}
                """;
        WebhookEvent updated = StripeConnectProvider.interpret(jsonMapper, account);
        assertThat(updated.kind()).isEqualTo(WebhookKind.SELLER_ACCOUNT_UPDATED);
        assertThat(updated.accountRef()).isEqualTo("acct_1");
        assertThat(updated.account().status()).isEqualTo(SellerAccountState.ACTIVE);

        String refund =
                """
                {"id":"evt_4","type":"refund.updated","created":1,
                 "data":{"object":{"id":"re_1","status":"succeeded"}}}
                """;
        WebhookEvent refunded = StripeConnectProvider.interpret(jsonMapper, refund);
        assertThat(refunded.kind()).isEqualTo(WebhookKind.REFUND_SUCCEEDED);
        assertThat(refunded.refundRef()).isEqualTo("re_1");

        String other =
                """
                {"id":"evt_5","type":"customer.created","created":1,"data":{"object":{}}}
                """;
        assertThat(StripeConnectProvider.interpret(jsonMapper, other).kind())
                .isEqualTo(WebhookKind.OTHER);
        assertThatThrownBy(() -> StripeConnectProvider.interpret(jsonMapper, "{\"type\":\"x\"}"))
                .isInstanceOf(WebhookPayloadException.class);
    }

    @Test
    void accountObjectsMapToSellerStates() {
        assertThat(
                        StripeConnectProvider.accountStatus(
                                        jsonMapper.readTree(
                                                "{\"charges_enabled\":false,\"payouts_enabled\":false,"
                                                    + "\"requirements\":{\"disabled_reason\":"
                                                    + "\"requirements.past_due\"}}"))
                                .status())
                .isEqualTo(SellerAccountState.RESTRICTED);
        assertThat(
                        StripeConnectProvider.accountStatus(
                                        jsonMapper.readTree(
                                                "{\"charges_enabled\":true,\"payouts_enabled\":false,"
                                                    + "\"requirements\":{\"disabled_reason\":null}}"))
                                .status())
                .isEqualTo(SellerAccountState.PENDING);
    }

    @Test
    void requestsUseMinorUnitsAndCarryOnlyReferences() {
        UUID paymentId = UUID.fromString("00000000-0000-4000-9f00-00000000aaaa");
        UUID tradeId = UUID.fromString("00000000-0000-4000-9d00-00000000bbbb");
        Map<String, String> form =
                StripeConnectProvider.flatten(
                        StripeConnectProvider.paymentIntentForm(
                                new CreatePaymentRequest(
                                        paymentId,
                                        1,
                                        tradeId,
                                        UUID.randomUUID(),
                                        "acct_1",
                                        new Money(new BigDecimal("40.00"), "CAD"),
                                        new Money(new BigDecimal("2.00"), "CAD"),
                                        "OrenjiTrade payment protection: 40.00 CAD for a card")));
        assertThat(form)
                .containsEntry("amount", "4000")
                .containsEntry("currency", "cad")
                .containsEntry("automatic_payment_methods[enabled]", "true")
                .containsEntry("transfer_group", "trade_" + tradeId)
                .containsEntry("metadata[payment_id]", paymentId.toString())
                .containsEntry("metadata[platform_fee]", "2.00");
        assertThat(form.keySet()).noneMatch(key -> key.contains("card"));
        assertThat(StripeConnectProvider.minorUnits(new Money(new BigDecimal("12.34"), "USD")))
                .isEqualTo(1234);
        assertThat(StripeConnectProvider.minorUnits(new Money(new BigDecimal("500"), "JPY")))
                .isEqualTo(500);
        assertThat(StripeConnectProvider.fromMinorUnits(4000, "cad").amount())
                .isEqualByComparingTo("40.00");
        assertThat(provider.providerId()).isEqualTo("stripe");
    }
}
