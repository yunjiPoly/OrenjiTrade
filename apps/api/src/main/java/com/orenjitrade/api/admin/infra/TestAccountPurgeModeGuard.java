package com.orenjitrade.api.admin.infra;

import java.util.List;
import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;

/**
 * Stops the purge mode ({@code orenji.maintenance.purge-test-accounts=true}) before the application
 * context starts when it is not safe ({@link TestAccountPurgeCommand#refusals}): a misconfigured
 * run never reaches Flyway, the seed runner, the scheduled jobs, the event republication or the
 * card image reconciliation, let alone the purge. Runs after the config data (profiles and
 * application.yml are known); without the purge property it does nothing.
 */
public class TestAccountPurgeModeGuard implements EnvironmentPostProcessor, Ordered {

    static final String PURGE_PROPERTY = "orenji.maintenance.purge-test-accounts";

    @Override
    public void postProcessEnvironment(
            ConfigurableEnvironment environment, SpringApplication application) {
        if (!environment.getProperty(PURGE_PROPERTY, Boolean.class, false)) {
            return;
        }
        boolean webServer =
                !"none"
                        .equalsIgnoreCase(
                                environment.getProperty("spring.main.web-application-type", ""));
        List<String> refusals =
                TestAccountPurgeCommand.refusals(
                        TestAccountPurgeCommand.factsOf(environment, webServer));
        if (!refusals.isEmpty()) {
            throw new IllegalStateException(
                    "Test account purge refused before start-up: " + String.join("; ", refusals));
        }
    }

    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }
}
