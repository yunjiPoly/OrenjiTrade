package com.orenjitrade.api.payments.infra;

import com.orenjitrade.api.common.TimeProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.json.JsonMapper;

/**
 * Selects the one active {@code PaymentProvider} from {@code orenji.payments.provider} ({@code
 * PAYMENT_PROVIDER}): {@link FakePaymentProvider} by default, {@link StripeConnectProvider} only
 * with {@code stripe} (which then requires {@code STRIPE_SECRET_KEY} and {@code
 * STRIPE_WEBHOOK_SECRET}; start-up fails without them). Only the active provider accepts webhooks,
 * so the fake provider's well-known local secret is useless wherever Stripe runs.
 */
@Configuration(proxyBeanMethods = false)
public class PaymentProviderConfig {

    private static final Logger log = LoggerFactory.getLogger(PaymentProviderConfig.class);

    @Bean
    @ConditionalOnProperty(
            name = "orenji.payments.provider",
            havingValue = PaymentProperties.PROVIDER_FAKE,
            matchIfMissing = true)
    FakePaymentProvider fakePaymentProvider(
            PaymentProperties properties, JsonMapper jsonMapper, TimeProvider timeProvider) {
        log.info("Payment provider: fake (no money moves; synthetic webhooks)");
        return new FakePaymentProvider(properties.fake(), jsonMapper, timeProvider);
    }

    @Bean
    @ConditionalOnProperty(
            name = "orenji.payments.provider",
            havingValue = PaymentProperties.PROVIDER_STRIPE)
    StripeConnectProvider stripeConnectProvider(
            PaymentProperties properties, JsonMapper jsonMapper, TimeProvider timeProvider) {
        PaymentProperties.Stripe stripe = properties.stripe();
        if (stripe.secretKey().isBlank() || stripe.webhookSecret().isBlank()) {
            throw new IllegalStateException(
                    "PAYMENT_PROVIDER=stripe requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET");
        }
        log.info("Payment provider: Stripe Connect");
        return new StripeConnectProvider(stripe, jsonMapper, timeProvider);
    }
}
