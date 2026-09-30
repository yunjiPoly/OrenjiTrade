package com.orenjitrade.api.billing.infra;

import java.time.Duration;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code orenji.billing.*} (Phase 10 subscriptions).
 *
 * @param provider {@code fake} (default, {@code BILLING_PROVIDER}) or {@code stripe}
 * @param renewalGrace how long an entitling subscription of a real provider may stay past its
 *     period end without a renewal webhook before the {@code subscriptions-period} job expires it
 * @param fake settings of {@link FakeBillingProvider}
 * @param stripe settings of {@link StripeBillingProvider} (only read with {@code stripe})
 */
@ConfigurationProperties(prefix = "orenji.billing")
public record BillingProperties(
        @DefaultValue("fake") String provider,
        @DefaultValue("3d") Duration renewalGrace,
        @DefaultValue Fake fake,
        @DefaultValue Stripe stripe) {

    public static final String PROVIDER_FAKE = "fake";
    public static final String PROVIDER_STRIPE = "stripe";

    /**
     * The local fake provider.
     *
     * @param webhookSecret HMAC key of the synthetic webhooks ({@code X-Fake-Signature}); not a
     *     secret of any real service
     * @param checkoutBaseUrl origin prepended to the fake checkout path {@code
     *     /checkout/fake-billing/<ref>}; empty keeps the path relative (the web app routes it)
     * @param webhookTolerance accepted age of a synthetic webhook's timestamp
     * @param period length of a fake paid period (renewed by the {@code subscriptions-period} job)
     */
    public record Fake(
            @DefaultValue("local-fake-billing-webhook-secret") String webhookSecret,
            @DefaultValue("") String checkoutBaseUrl,
            @DefaultValue("5m") Duration webhookTolerance,
            @DefaultValue("30d") Duration period) {}

    /**
     * Stripe Billing.
     *
     * @param secretKey restricted API key ({@code STRIPE_SECRET_KEY}; required with {@code stripe})
     * @param webhookSecret endpoint signing secret of the billing webhook ({@code
     *     STRIPE_BILLING_WEBHOOK_SECRET}; required)
     * @param apiBaseUrl Stripe API origin
     * @param webBaseUrl web app origin for checkout return links ({@code WEB_BASE_URL})
     * @param webhookTolerance accepted age of the {@code Stripe-Signature} timestamp
     * @param priceIds Stripe price id per plan code ({@code STRIPE_PRICE_PREMIUM})
     */
    public record Stripe(
            @DefaultValue("") String secretKey,
            @DefaultValue("") String webhookSecret,
            @DefaultValue("https://api.stripe.com") String apiBaseUrl,
            @DefaultValue("https://www.orenjitrade.com") String webBaseUrl,
            @DefaultValue("5m") Duration webhookTolerance,
            @DefaultValue Map<String, String> priceIds) {

        public Stripe {
            priceIds = priceIds == null ? Map.of() : Map.copyOf(priceIds);
        }
    }
}
