package com.orenjitrade.api.donations.infra;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code orenji.donations.*} (Phase 10 donations).
 *
 * @param provider {@code fake} (default, {@code DONATION_PROVIDER}); no other provider exists yet
 * @param fake settings of {@link FakeDonationProvider}
 */
@ConfigurationProperties(prefix = "orenji.donations")
public record DonationProperties(@DefaultValue("fake") String provider, @DefaultValue Fake fake) {

    public static final String PROVIDER_FAKE = "fake";

    /**
     * The local fake provider.
     *
     * @param webhookSecret HMAC key of the synthetic webhooks ({@code X-Fake-Signature}); not a
     *     secret of any real service
     * @param checkoutBaseUrl origin prepended to {@code /checkout/fake-donation/<ref>}; empty keeps
     *     the path relative
     * @param webhookTolerance accepted age of a synthetic webhook's timestamp
     */
    public record Fake(
            @DefaultValue("local-fake-donations-webhook-secret") String webhookSecret,
            @DefaultValue("") String checkoutBaseUrl,
            @DefaultValue("5m") Duration webhookTolerance) {}
}
