package com.orenjitrade.api.ads.infra;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code orenji.ads.*} (Phase 10 advertising).
 *
 * @param tokenSecret HMAC key of the serve tokens ({@code ADS_TOKEN_SECRET}); the local default is
 *     refused outside the {@code local}, {@code test} and {@code dev} profiles
 * @param tokenMaxAge how long a served ad's impression and click are accepted
 * @param webBaseUrl origin prepended to relative landing paths of house ads (e.g. {@code /premium})
 *     when a click is redirected
 */
@ConfigurationProperties(prefix = "orenji.ads")
public record AdProperties(
        @DefaultValue(AdProperties.LOCAL_SECRET) String tokenSecret,
        @DefaultValue("24h") Duration tokenMaxAge,
        @DefaultValue("http://localhost:4200") String webBaseUrl) {

    /** Development default of {@link #tokenSecret}. */
    public static final String LOCAL_SECRET = "local-ads-token-secret";
}
