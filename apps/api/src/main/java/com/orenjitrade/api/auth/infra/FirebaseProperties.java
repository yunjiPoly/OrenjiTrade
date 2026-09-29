package com.orenjitrade.api.auth.infra;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code orenji.firebase.*}.
 *
 * @param projectId Firebase / Identity Platform project id ({@code FIREBASE_PROJECT_ID})
 * @param authEmulatorHost {@code host:port} of the Auth emulator ({@code
 *     FIREBASE_AUTH_EMULATOR_HOST}); empty in deployed environments
 */
@ConfigurationProperties(prefix = "orenji.firebase")
public record FirebaseProperties(
        @DefaultValue("orenjitrade-local") String projectId,
        @DefaultValue("") String authEmulatorHost) {

    public boolean emulatorEnabled() {
        return !authEmulatorHost.isBlank();
    }
}
