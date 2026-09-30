package com.orenjitrade.api.ads.infra;

import com.orenjitrade.api.ads.domain.AdToken;
import java.util.Arrays;
import java.util.Set;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import tools.jackson.databind.json.JsonMapper;

/**
 * Wires the ad serve tokens. Outside the {@code local}, {@code test} and {@code dev} profiles the
 * application refuses to start with the development secret (a known secret would let anybody mint
 * impressions and clicks).
 */
@Configuration(proxyBeanMethods = false)
public class AdsConfig {

    static final Set<String> DEVELOPMENT_PROFILES = Set.of("local", "test", "dev");

    @Bean
    AdToken adToken(AdProperties properties, JsonMapper jsonMapper, Environment environment) {
        validateSecret(properties.tokenSecret(), environment.getActiveProfiles());
        return new AdToken(properties.tokenSecret(), properties.tokenMaxAge(), jsonMapper);
    }

    static void validateSecret(String secret, String[] activeProfiles) {
        boolean development =
                activeProfiles.length == 0
                        || Arrays.stream(activeProfiles).anyMatch(DEVELOPMENT_PROFILES::contains);
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException(
                    "ADS_TOKEN_SECRET (orenji.ads.token-secret) must be set");
        }
        if (!development && (AdProperties.LOCAL_SECRET.equals(secret) || secret.length() < 32)) {
            throw new IllegalStateException(
                    "ADS_TOKEN_SECRET must be a strong secret (32+ characters, not the development"
                            + " default) in this profile");
        }
    }
}
