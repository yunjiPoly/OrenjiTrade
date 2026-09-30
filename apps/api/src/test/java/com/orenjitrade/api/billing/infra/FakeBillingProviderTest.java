package com.orenjitrade.api.billing.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orenjitrade.api.billing.domain.BillingProvider.BillingEvent;
import com.orenjitrade.api.billing.domain.BillingProvider.Checkout;
import com.orenjitrade.api.billing.domain.BillingProvider.CheckoutRequest;
import com.orenjitrade.api.billing.domain.BillingProvider.EventKind;
import com.orenjitrade.api.billing.infra.FakeBillingProvider.SignedWebhook;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.webhooks.SignedWebhooks.InvalidSignatureException;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/** The fake billing provider: checkout paths, signed synthetic webhooks and their parsing. */
class FakeBillingProviderTest {

    static final Instant NOW = Instant.parse("2026-09-30T12:00:00Z");

    private final FakeBillingProvider provider =
            new FakeBillingProvider(
                    new BillingProperties.Fake(
                            "local-fake-billing-webhook-secret",
                            "",
                            Duration.ofMinutes(5),
                            Duration.ofDays(30)),
                    JsonMapper.builder().build(),
                    TimeProvider.fixed(NOW));

    @Test
    void checkoutsAreWebPathsAndSyntheticWebhooksRoundTrip() {
        Checkout checkout =
                provider.startCheckout(
                        new CheckoutRequest(
                                UUID.randomUUID(),
                                UUID.randomUUID(),
                                "PREMIUM",
                                "Premium",
                                new BigDecimal("4.99"),
                                "CAD",
                                "/premium",
                                "/premium"));
        assertThat(checkout.url()).isEqualTo("/checkout/fake-billing/" + checkout.checkoutRef());
        assertThat(checkout.checkoutRef()).startsWith("fake_cs_");
        assertThat(provider.periodEnd(NOW)).isEqualTo(NOW.plus(Duration.ofDays(30)));

        SignedWebhook webhook =
                provider.syntheticEvent(
                        FakeBillingProvider.CHECKOUT_COMPLETED,
                        Map.of(
                                "checkoutRef", checkout.checkoutRef(),
                                "subscriptionRef", "fake_sub_1",
                                "periodStart", NOW.toString(),
                                "periodEnd", NOW.plus(Duration.ofDays(30)).toString()));
        Map<String, String> headers =
                Map.of(
                        FakeBillingProvider.SIGNATURE_HEADER.toLowerCase(Locale.ROOT),
                        webhook.headers().get(FakeBillingProvider.SIGNATURE_HEADER));
        BillingEvent event = provider.parseWebhook(webhook.payload(), headers);
        assertThat(event.kind()).isEqualTo(EventKind.CHECKOUT_COMPLETED);
        assertThat(event.checkoutRef()).isEqualTo(checkout.checkoutRef());
        assertThat(event.subscriptionRef()).isEqualTo("fake_sub_1");
        assertThat(event.periodEnd()).isEqualTo(NOW.plus(Duration.ofDays(30)));

        assertThatThrownBy(
                        () ->
                                provider.parseWebhook(
                                        webhook.payload().replace("fake_sub_1", "fake_sub_2"),
                                        headers))
                .isInstanceOf(InvalidSignatureException.class);
    }
}
