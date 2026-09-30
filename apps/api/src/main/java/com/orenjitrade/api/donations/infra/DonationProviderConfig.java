package com.orenjitrade.api.donations.infra;

import com.orenjitrade.api.common.TimeProvider;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.json.JsonMapper;

/**
 * Selects the donation provider from {@code orenji.donations.provider} ({@code DONATION_PROVIDER}):
 * only {@link FakeDonationProvider} ({@code fake}, the default) exists; any other value fails the
 * start-up instead of silently accepting donations nobody can pay.
 */
@Configuration(proxyBeanMethods = false)
public class DonationProviderConfig {

    private static final Logger log = LoggerFactory.getLogger(DonationProviderConfig.class);

    @Bean
    FakeDonationProvider fakeDonationProvider(
            DonationProperties properties, JsonMapper jsonMapper, TimeProvider timeProvider) {
        String provider = properties.provider().trim().toLowerCase(Locale.ROOT);
        if (!DonationProperties.PROVIDER_FAKE.equals(provider)) {
            throw new IllegalStateException(
                    "DONATION_PROVIDER=" + provider + " is not supported yet (only fake)");
        }
        log.info("Donation provider: fake (no money moves; synthetic webhooks)");
        return new FakeDonationProvider(properties.fake(), jsonMapper, timeProvider);
    }
}
