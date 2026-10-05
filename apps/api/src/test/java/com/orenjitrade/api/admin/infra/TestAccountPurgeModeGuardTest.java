package com.orenjitrade.api.admin.infra;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.mock.env.MockEnvironment;

/**
 * The purge mode is refused before the context starts (so before Flyway, the seed runner and the
 * other start-up work) unless every safety switch is set; without the purge property nothing is
 * checked.
 */
class TestAccountPurgeModeGuardTest {

    private final TestAccountPurgeModeGuard guard = new TestAccountPurgeModeGuard();
    private final SpringApplication application = new SpringApplication();

    private static MockEnvironment safe() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("local");
        environment.setProperty(TestAccountPurgeModeGuard.PURGE_PROPERTY, "true");
        environment.setProperty("spring.main.web-application-type", "none");
        environment.setProperty("orenji.environment", "local");
        environment.setProperty("spring.flyway.enabled", "false");
        environment.setProperty("orenji.seed.enabled", "false");
        environment.setProperty("orenji.scheduling.enabled", "false");
        environment.setProperty(
                "spring.modulith.events.republish-outstanding-events-on-restart", "false");
        environment.setProperty("orenji.card-images.cache.reconcile-on-startup", "false");
        environment.setProperty(
                "spring.datasource.url", "jdbc:postgresql://localhost:5432/orenjitrade");
        environment.setProperty("orenji.firebase.auth-emulator-host", "localhost:9099");
        return environment;
    }

    @Test
    void letsASafePurgeModeStart() {
        assertThatCode(() -> guard.postProcessEnvironment(safe(), application))
                .doesNotThrowAnyException();
    }

    @Test
    void ignoresEveryOtherStart() {
        MockEnvironment normal = new MockEnvironment();
        normal.setProperty("spring.flyway.enabled", "true");
        assertThatCode(() -> guard.postProcessEnvironment(normal, application))
                .doesNotThrowAnyException();
    }

    @Test
    void refusesAPurgeModeThatWouldRunFlywayOrTheSeedOrAWebServer() {
        for (String[] unsafe :
                new String[][] {
                    {"spring.flyway.enabled", "true"},
                    {"orenji.seed.enabled", "true"},
                    {"spring.main.web-application-type", "servlet"},
                    {"orenji.scheduling.enabled", "true"},
                    {"spring.modulith.events.republish-outstanding-events-on-restart", "true"},
                    {"orenji.card-images.cache.reconcile-on-startup", "true"},
                    {"spring.datasource.url", "jdbc:postgresql://db.example.com:5432/orenjitrade"},
                    {"orenji.firebase.auth-emulator-host", ""},
                    {"orenji.environment", "production"}
                }) {
            MockEnvironment environment = safe();
            environment.setProperty(unsafe[0], unsafe[1]);
            assertThatThrownBy(() -> guard.postProcessEnvironment(environment, application))
                    .as(unsafe[0] + "=" + unsafe[1])
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageStartingWith("Test account purge refused before start-up");
        }
        MockEnvironment prod = safe();
        prod.setActiveProfiles("prod");
        assertThatThrownBy(() -> guard.postProcessEnvironment(prod, application))
                .hasMessageContaining("profile must be local or dev");
    }
}
