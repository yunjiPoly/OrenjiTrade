package com.orenjitrade.api.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class ServiceTokenStartupValidatorTest {

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"  ", "local-service-token", "too-short"})
    void refusesMissingDefaultOrShortTokens(String token) {
        assertThatThrownBy(() -> ServiceTokenStartupValidator.validate(token))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("SERVICE_TOKEN");
    }

    @Test
    void acceptsAStrongToken() {
        assertThatCode(
                        () ->
                                ServiceTokenStartupValidator.validate(
                                        "0123456789abcdef0123456789abcdef-strong"))
                .doesNotThrowAnyException();
    }

    @Test
    void beanValidatesTheBoundProperties() {
        OrenjiSecurityProperties weak =
                new OrenjiSecurityProperties(
                        new OrenjiSecurityProperties.Cors(null),
                        new OrenjiSecurityProperties.Hsts(true, 1, true),
                        new OrenjiSecurityProperties.Admin(true),
                        OrenjiSecurityProperties.DEFAULT_SERVICE_TOKEN,
                        "",
                        null);

        assertThatThrownBy(() -> new ServiceTokenStartupValidator(weak).afterPropertiesSet())
                .isInstanceOf(IllegalStateException.class);
    }
}
