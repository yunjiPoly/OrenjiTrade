package com.orenjitrade.api.billing.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orenjitrade.api.billing.domain.BillingProvider.BillingEvent;
import com.orenjitrade.api.billing.domain.BillingProvider.BillingProviderException;
import com.orenjitrade.api.billing.domain.BillingProvider.CheckoutRequest;
import com.orenjitrade.api.billing.domain.BillingProvider.EventKind;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.webhooks.SignedWebhooks;
import com.orenjitrade.api.common.webhooks.SignedWebhooks.InvalidSignatureException;
import com.orenjitrade.api.common.webhooks.SignedWebhooks.UnreadablePayloadException;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/**
 * The Stripe Billing adapter without network: {@code Stripe-Signature} verification with a test
 * secret, the mapping of Stripe Billing events and the Checkout Session form. Never needs Stripe
 * credentials.
 */
class StripeBillingProviderTest {

    static final String SECRET = "whsec_test_orenjitrade_billing_unit";
    static final Instant NOW = Instant.parse("2026-09-30T12:00:00Z");

    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    private final BillingProperties.Stripe properties =
            new BillingProperties.Stripe(
                    "sk_test_unit_not_used",
                    SECRET,
                    "https://api.stripe.invalid",
                    "https://www.orenjitrade.test",
                    Duration.ofMinutes(5),
                    Map.of("PREMIUM", "price_test_premium"));

    private final StripeBillingProvider provider =
            new StripeBillingProvider(properties, jsonMapper, TimeProvider.fixed(NOW));

    static final String COMPLETED =
            """
            {"id":"evt_1","type":"checkout.session.completed","created":1790000000,
             "data":{"object":{"id":"cs_123","object":"checkout.session","subscription":"sub_9"}}}
            """;

    @Test
    void verifiedEventsAreNormalised() {
        BillingEvent event =
                provider.parseWebhook(
                        COMPLETED,
                        Map.of("stripe-signature", SignedWebhooks.header(SECRET, NOW, COMPLETED)));
        assertThat(event.kind()).isEqualTo(EventKind.CHECKOUT_COMPLETED);
        assertThat(event.checkoutRef()).isEqualTo("cs_123");
        assertThat(event.subscriptionRef()).isEqualTo("sub_9");
        assertThat(event.occurredAt()).isEqualTo(Instant.ofEpochSecond(1790000000));
    }

    @Test
    void badSignaturesAreRefused() {
        assertThatThrownBy(() -> provider.parseWebhook(COMPLETED, Map.of()))
                .isInstanceOf(InvalidSignatureException.class);
        assertThatThrownBy(
                        () ->
                                provider.parseWebhook(
                                        COMPLETED,
                                        Map.of(
                                                "stripe-signature",
                                                SignedWebhooks.header(
                                                        "whsec_other", NOW, COMPLETED))))
                .isInstanceOf(InvalidSignatureException.class);
        assertThatThrownBy(
                        () ->
                                provider.parseWebhook(
                                        COMPLETED,
                                        Map.of(
                                                "stripe-signature",
                                                SignedWebhooks.header(
                                                        SECRET,
                                                        NOW.minus(Duration.ofMinutes(6)),
                                                        COMPLETED))))
                .isInstanceOf(InvalidSignatureException.class)
                .hasMessageContaining("tolerance");
    }

    @Test
    void billingEventsMapToRenewalsFailuresAndCancellations() {
        BillingEvent paid =
                StripeBillingProvider.interpret(
                        jsonMapper,
                        """
                        {"id":"evt_2","type":"invoice.paid","created":1790000100,
                         "data":{"object":{"id":"in_1","subscription":"sub_9",
                           "lines":{"data":[{"period":{"start":1790000000,"end":1792600000}}]}}}}
                        """);
        assertThat(paid.kind()).isEqualTo(EventKind.SUBSCRIPTION_RENEWED);
        assertThat(paid.subscriptionRef()).isEqualTo("sub_9");
        assertThat(paid.periodStart()).isEqualTo(Instant.ofEpochSecond(1790000000));
        assertThat(paid.periodEnd()).isEqualTo(Instant.ofEpochSecond(1792600000));

        BillingEvent failed =
                StripeBillingProvider.interpret(
                        jsonMapper,
                        """
                        {"id":"evt_3","type":"invoice.payment_failed","created":1790000200,
                         "data":{"object":{"id":"in_2","subscription":"sub_9"}}}
                        """);
        assertThat(failed.kind()).isEqualTo(EventKind.PAYMENT_FAILED);

        BillingEvent deleted =
                StripeBillingProvider.interpret(
                        jsonMapper,
                        """
                        {"id":"evt_4","type":"customer.subscription.deleted","created":1790000300,
                         "data":{"object":{"id":"sub_9"}}}
                        """);
        assertThat(deleted.kind()).isEqualTo(EventKind.SUBSCRIPTION_CANCELLED);
        assertThat(deleted.subscriptionRef()).isEqualTo("sub_9");

        BillingEvent expired =
                StripeBillingProvider.interpret(
                        jsonMapper,
                        """
                        {"id":"evt_5","type":"checkout.session.expired","created":1790000400,
                         "data":{"object":{"id":"cs_123"}}}
                        """);
        assertThat(expired.kind()).isEqualTo(EventKind.CHECKOUT_FAILED);
        assertThat(expired.checkoutRef()).isEqualTo("cs_123");

        assertThat(
                        StripeBillingProvider.interpret(
                                        jsonMapper,
                                        "{\"id\":\"evt_6\",\"type\":\"customer.created\"}")
                                .kind())
                .isEqualTo(EventKind.OTHER);
        assertThatThrownBy(() -> StripeBillingProvider.interpret(jsonMapper, "{\"type\":\"x\"}"))
                .isInstanceOf(UnreadablePayloadException.class);
    }

    @Test
    void theCheckoutSessionUsesThePlansPriceAndCarriesOurIds() {
        UUID subscriptionId = UUID.fromString("00000000-0000-4000-a000-00000000abcd");
        CheckoutRequest request =
                new CheckoutRequest(
                        subscriptionId,
                        UUID.randomUUID(),
                        "PREMIUM",
                        "Premium",
                        new BigDecimal("4.99"),
                        "CAD",
                        "/premium?checkout=success",
                        "/premium?checkout=cancelled");
        Map<String, String> form =
                StripeBillingProvider.flatten(
                        StripeBillingProvider.checkoutForm(request, properties));
        assertThat(form)
                .containsEntry("mode", "subscription")
                .containsEntry("line_items[0][price]", "price_test_premium")
                .containsEntry("client_reference_id", subscriptionId.toString())
                .containsEntry(
                        "success_url", "https://www.orenjitrade.test/premium?checkout=success");
        assertThat(form.toString()).doesNotContain("4.99");

        CheckoutRequest unknown =
                new CheckoutRequest(
                        subscriptionId,
                        UUID.randomUUID(),
                        "GOLD",
                        "Gold",
                        BigDecimal.TEN,
                        "CAD",
                        "/premium",
                        "/premium");
        assertThatThrownBy(() -> StripeBillingProvider.checkoutForm(unknown, properties))
                .isInstanceOf(BillingProviderException.class);
    }
}
