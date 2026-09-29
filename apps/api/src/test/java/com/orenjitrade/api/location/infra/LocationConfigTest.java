package com.orenjitrade.api.location.infra;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/** Start-up validation of LOCATION_JITTER_SECRET. */
class LocationConfigTest {

    private static final String STRONG = "a-very-long-and-random-production-jitter-secret";

    @Test
    void developmentProfilesAcceptTheDefault() {
        assertThatCode(
                        () ->
                                LocationConfig.validateSecret(
                                        LocationProperties.DEVELOPMENT_SECRET,
                                        new String[] {"local"}))
                .doesNotThrowAnyException();
        assertThatCode(
                        () ->
                                LocationConfig.validateSecret(
                                        LocationProperties.DEVELOPMENT_SECRET,
                                        new String[] {"test"}))
                .doesNotThrowAnyException();
    }

    @Test
    void missingSecretFailsEverywhere() {
        assertThatThrownBy(() -> LocationConfig.validateSecret("", new String[] {"local"}))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> LocationConfig.validateSecret("  ", new String[] {"prod"}))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("LOCATION_JITTER_SECRET");
    }

    @Test
    void deployedProfilesNeedAStrongNonDefaultSecret() {
        for (String profile : new String[] {"dev", "staging", "prod"}) {
            assertThatThrownBy(
                            () ->
                                    LocationConfig.validateSecret(
                                            LocationProperties.DEVELOPMENT_SECRET,
                                            new String[] {profile}))
                    .isInstanceOf(IllegalStateException.class);
            assertThatThrownBy(() -> LocationConfig.validateSecret("short", new String[] {profile}))
                    .isInstanceOf(IllegalStateException.class);
            assertThatCode(() -> LocationConfig.validateSecret(STRONG, new String[] {profile}))
                    .doesNotThrowAnyException();
        }
    }
}
