package com.orenjitrade.api.location.infra;

import com.orenjitrade.api.location.domain.ApproximateLocationService;
import com.orenjitrade.api.location.domain.RegionGeocoder;
import java.util.Arrays;
import java.util.Set;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/**
 * Wires the location domain services and validates {@code LOCATION_JITTER_SECRET} at start-up:
 * outside the {@code local} and {@code test} profiles the application refuses to start when the
 * secret is missing, is the development default or is shorter than {@value #MIN_SECRET_LENGTH}
 * characters (a known secret would let anyone reverse the jitter inside a cell).
 */
@Configuration(proxyBeanMethods = false)
public class LocationConfig {

    static final int MIN_SECRET_LENGTH = 32;
    static final Set<String> DEVELOPMENT_PROFILES = Set.of("local", "test");

    @Bean
    RegionGeocoder regionGeocoder(LocationProperties properties) {
        if (!"static".equals(properties.geocoder())) {
            throw new IllegalStateException(
                    "Unsupported orenji.location.geocoder '" + properties.geocoder() + "'");
        }
        return new StaticRegionGeocoder();
    }

    @Bean
    ApproximateLocationService approximateLocationService(
            LocationProperties properties, RegionGeocoder regionGeocoder, Environment environment) {
        validateSecret(properties.jitterSecret(), environment.getActiveProfiles());
        return new ApproximateLocationService(properties.jitterSecret(), regionGeocoder);
    }

    /**
     * @throws IllegalStateException when the secret is unusable for the active profiles
     */
    static void validateSecret(String secret, String[] activeProfiles) {
        boolean development =
                activeProfiles.length == 0
                        || Arrays.stream(activeProfiles).anyMatch(DEVELOPMENT_PROFILES::contains);
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException(
                    "LOCATION_JITTER_SECRET (orenji.location.jitter-secret) must be set");
        }
        if (development) {
            return;
        }
        if (LocationProperties.DEVELOPMENT_SECRET.equals(secret)) {
            throw new IllegalStateException(
                    "LOCATION_JITTER_SECRET must not be the development default in this profile");
        }
        if (secret.length() < MIN_SECRET_LENGTH) {
            throw new IllegalStateException(
                    "LOCATION_JITTER_SECRET must be at least "
                            + MIN_SECRET_LENGTH
                            + " characters long");
        }
    }
}
