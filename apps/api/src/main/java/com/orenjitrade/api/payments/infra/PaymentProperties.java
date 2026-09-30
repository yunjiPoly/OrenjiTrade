package com.orenjitrade.api.payments.infra;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code orenji.payments.*} (ADR 0011).
 *
 * @param provider {@code fake} (default, {@code PAYMENT_PROVIDER}) or {@code stripe}
 * @param fake settings of {@link FakePaymentProvider}
 * @param stripe settings of {@link StripeConnectProvider} (only read with {@code stripe})
 */
@ConfigurationProperties(prefix = "orenji.payments")
public record PaymentProperties(
        @DefaultValue("fake") String provider,
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
     *     /checkout/fake/<ref>}; empty keeps the path relative (the web app routes it)
     * @param webhookTolerance accepted age of a synthetic webhook's timestamp
     */
    public record Fake(
            @DefaultValue("local-fake-payments-webhook-secret") String webhookSecret,
            @DefaultValue("") String checkoutBaseUrl,
            @DefaultValue("5m") Duration webhookTolerance) {}

    /**
     * Stripe Connect.
     *
     * @param secretKey restricted API key ({@code STRIPE_SECRET_KEY}; required with {@code stripe})
     * @param webhookSecret endpoint signing secret ({@code STRIPE_WEBHOOK_SECRET}; required)
     * @param apiBaseUrl Stripe API origin
     * @param webBaseUrl web app origin for onboarding return links ({@code WEB_BASE_URL})
     * @param webhookTolerance accepted age of the {@code Stripe-Signature} timestamp
     */
    public record Stripe(
            @DefaultValue("") String secretKey,
            @DefaultValue("") String webhookSecret,
            @DefaultValue("https://api.stripe.com") String apiBaseUrl,
            @DefaultValue("https://www.orenjitrade.com") String webBaseUrl,
            @DefaultValue("5m") Duration webhookTolerance) {}
}
