package com.orenjitrade.api.ads.infra;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/** The ad token secret guard: the development default only in local, test and dev. */
class AdsConfigTest {

    @Test
    void theDevelopmentSecretIsRefusedOutsideDevelopmentProfiles() {
        assertThatCode(
                        () ->
                                AdsConfig.validateSecret(
                                        AdProperties.LOCAL_SECRET, new String[] {"local"}))
                .doesNotThrowAnyException();
        assertThatThrownBy(
                        () ->
                                AdsConfig.validateSecret(
                                        AdProperties.LOCAL_SECRET, new String[] {"prod"}))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> AdsConfig.validateSecret("short", new String[] {"staging"}))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> AdsConfig.validateSecret(" ", new String[] {"local"}))
                .isInstanceOf(IllegalStateException.class);
        assertThatCode(
                        () ->
                                AdsConfig.validateSecret(
                                        "a-strong-secret-with-more-than-32-characters",
                                        new String[] {"prod"}))
                .doesNotThrowAnyException();
    }
}
