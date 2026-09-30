package com.orenjitrade.api.billing.infra;

import com.orenjitrade.api.common.TimeProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.json.JsonMapper;

/**
 * Selects the one active {@code BillingProvider} from {@code orenji.billing.provider} ({@code
 * BILLING_PROVIDER}): {@link FakeBillingProvider} by default, {@link StripeBillingProvider} only
 * with {@code stripe} (which then requires {@code STRIPE_SECRET_KEY} and {@code
 * STRIPE_BILLING_WEBHOOK_SECRET}; start-up fails without them). Only the active provider accepts
 * webhooks, so the fake provider's well-known local secret is useless wherever Stripe runs.
 */
@Configuration(proxyBeanMethods = false)
public class BillingProviderConfig {

    private static final Logger log = LoggerFactory.getLogger(BillingProviderConfig.class);

    @Bean
    @ConditionalOnProperty(
            name = "orenji.billing.provider",
            havingValue = BillingProperties.PROVIDER_FAKE,
            matchIfMissing = true)
    FakeBillingProvider fakeBillingProvider(
            BillingProperties properties, JsonMapper jsonMapper, TimeProvider timeProvider) {
        log.info("Billing provider: fake (no money moves; synthetic webhooks)");
        return new FakeBillingProvider(properties.fake(), jsonMapper, timeProvider);
    }

    @Bean
    @ConditionalOnProperty(
            name = "orenji.billing.provider",
            havingValue = BillingProperties.PROVIDER_STRIPE)
    StripeBillingProvider stripeBillingProvider(
            BillingProperties properties, JsonMapper jsonMapper, TimeProvider timeProvider) {
        BillingProperties.Stripe stripe = properties.stripe();
        if (stripe.secretKey().isBlank() || stripe.webhookSecret().isBlank()) {
            throw new IllegalStateException(
                    "BILLING_PROVIDER=stripe requires STRIPE_SECRET_KEY and"
                            + " STRIPE_BILLING_WEBHOOK_SECRET");
        }
        log.info("Billing provider: Stripe Billing");
        return new StripeBillingProvider(stripe, jsonMapper, timeProvider);
    }
}
