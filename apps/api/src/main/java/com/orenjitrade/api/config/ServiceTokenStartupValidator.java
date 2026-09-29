package com.orenjitrade.api.config;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Refuses to start staging and production with a missing or default {@code SERVICE_TOKEN}: the
 * shared token authenticates {@code /internal/**}, so a well-known value would let anyone trigger
 * internal jobs.
 */
@Component
@Profile({"staging", "prod"})
public class ServiceTokenStartupValidator implements InitializingBean {

    static final int MIN_LENGTH = 32;

    private final OrenjiSecurityProperties properties;

    public ServiceTokenStartupValidator(OrenjiSecurityProperties properties) {
        this.properties = properties;
    }

    @Override
    public void afterPropertiesSet() {
        validate(properties.serviceToken());
    }

    /**
     * @throws IllegalStateException when the token is blank, the development default or too short
     */
    static void validate(String serviceToken) {
        if (serviceToken == null || serviceToken.isBlank()) {
            throw new IllegalStateException(
                    "SERVICE_TOKEN must be set (orenji.security.service-token) in this profile");
        }
        if (OrenjiSecurityProperties.DEFAULT_SERVICE_TOKEN.equals(serviceToken)) {
            throw new IllegalStateException(
                    "SERVICE_TOKEN must not be the development default in this profile");
        }
        if (serviceToken.length() < MIN_LENGTH) {
            throw new IllegalStateException(
                    "SERVICE_TOKEN must be at least " + MIN_LENGTH + " characters long");
        }
    }
}
