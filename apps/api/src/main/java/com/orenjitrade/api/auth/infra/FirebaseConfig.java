package com.orenjitrade.api.auth.infra;

import com.google.auth.oauth2.AccessToken;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.internal.FirebaseProcessEnvironment;
import java.io.IOException;
import java.io.UncheckedIOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/**
 * Initialises the Firebase Admin SDK once (ADR 0008). Not active under the {@code test} profile,
 * where {@link StaticIdentityTokenVerifier} replaces Firebase entirely.
 *
 * <p>With {@code FIREBASE_AUTH_EMULATOR_HOST} set (local docker compose) the SDK talks to the Auth
 * emulator and needs no service account: a static "owner" access token is enough. In the cloud,
 * Application Default Credentials (the Cloud Run service account) are used.
 */
@Configuration(proxyBeanMethods = false)
@Profile("!test")
public class FirebaseConfig {

    /** Name of the {@link FirebaseApp} so a context refresh never collides with the default app. */
    static final String APP_NAME = "orenjitrade";

    static final String EMULATOR_HOST_ENV = "FIREBASE_AUTH_EMULATOR_HOST";
    static final String EMULATOR_OWNER_TOKEN = "owner";

    private static final Logger log = LoggerFactory.getLogger(FirebaseConfig.class);

    @Bean
    FirebaseApp firebaseApp(FirebaseProperties properties) {
        for (FirebaseApp existing : FirebaseApp.getApps()) {
            if (APP_NAME.equals(existing.getName())) {
                return existing;
            }
        }
        GoogleCredentials credentials;
        if (properties.emulatorEnabled()) {
            // The Admin SDK reads the emulator host from the process environment; mirror the
            // Spring property so a value from application.yml works without an exported variable.
            FirebaseProcessEnvironment.setenv(EMULATOR_HOST_ENV, properties.authEmulatorHost());
            credentials = GoogleCredentials.create(new AccessToken(EMULATOR_OWNER_TOKEN, null));
            log.info(
                    "Firebase Admin SDK using the Auth emulator at {} (project {})",
                    properties.authEmulatorHost(),
                    properties.projectId());
        } else {
            try {
                credentials = GoogleCredentials.getApplicationDefault();
            } catch (IOException e) {
                throw new UncheckedIOException(
                        "Application Default Credentials are required for Firebase Admin SDK"
                                + " (or set FIREBASE_AUTH_EMULATOR_HOST locally)",
                        e);
            }
            log.info("Firebase Admin SDK using ADC (project {})", properties.projectId());
        }
        FirebaseOptions options =
                FirebaseOptions.builder()
                        .setCredentials(credentials)
                        .setProjectId(properties.projectId())
                        .build();
        return FirebaseApp.initializeApp(options, APP_NAME);
    }

    @Bean
    FirebaseAuth firebaseAuth(FirebaseApp app) {
        return FirebaseAuth.getInstance(app);
    }
}
