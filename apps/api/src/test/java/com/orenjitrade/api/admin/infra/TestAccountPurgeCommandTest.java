package com.orenjitrade.api.admin.infra;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.admin.infra.TestAccountPurgeCommand.Facts;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Safety rules of the one-shot purge mode: it only ever runs as a local/dev maintenance process
 * that starts nothing else (no web server, Flyway, seed, scheduled jobs, event republication or
 * card image reconciliation) against the local PostgreSQL and the local Auth emulator.
 */
class TestAccountPurgeCommandTest {

    private static Facts safe() {
        return new Facts(
                false,
                List.of("local"),
                "local",
                false,
                false,
                false,
                false,
                false,
                "jdbc:postgresql://localhost:5432/orenjitrade",
                "localhost:9099");
    }

    @Test
    void theSafeConfigurationRuns() {
        assertThat(TestAccountPurgeCommand.refusals(safe())).isEmpty();
        assertThat(
                        TestAccountPurgeCommand.refusals(
                                new Facts(
                                        false,
                                        List.of("dev"),
                                        "development",
                                        false,
                                        false,
                                        false,
                                        false,
                                        false,
                                        "jdbc:postgresql://127.0.0.1:5433/orenjitrade_e2e?ssl=false",
                                        "127.0.0.1:9099")))
                .isEmpty();
    }

    @Test
    void refusesOtherProfilesAndEnvironments() {
        Facts staging =
                new Facts(
                        false,
                        List.of("staging"),
                        "staging",
                        false,
                        false,
                        false,
                        false,
                        false,
                        "jdbc:postgresql://localhost:5432/orenjitrade",
                        "localhost:9099");
        assertThat(TestAccountPurgeCommand.refusals(staging))
                .anyMatch(reason -> reason.startsWith("profile must be local or dev"))
                .anyMatch(reason -> reason.startsWith("orenji.environment"));
    }

    @Test
    void refusesWhenAnythingElseWouldStart() {
        Facts all =
                new Facts(
                        true,
                        List.of("local"),
                        "local",
                        true,
                        true,
                        true,
                        true,
                        true,
                        "jdbc:postgresql://localhost:5432/orenjitrade",
                        "localhost:9099");
        assertThat(TestAccountPurgeCommand.refusals(all))
                .hasSize(6)
                .anyMatch(reason -> reason.contains("web server"))
                .anyMatch(reason -> reason.contains("Flyway"))
                .anyMatch(reason -> reason.contains("seed"))
                .anyMatch(reason -> reason.contains("scheduled"))
                .anyMatch(reason -> reason.contains("republish"))
                .anyMatch(reason -> reason.contains("reconciliation"));
    }

    @Test
    void refusesARemoteDatabaseOrARealIdentityProject() {
        Facts remote =
                new Facts(
                        false,
                        List.of("local"),
                        "local",
                        false,
                        false,
                        false,
                        false,
                        false,
                        "jdbc:postgresql://10.20.0.5:5432/orenjitrade",
                        "");
        assertThat(TestAccountPurgeCommand.refusals(remote))
                .anyMatch(reason -> reason.contains("local PostgreSQL"))
                .anyMatch(reason -> reason.contains("Auth emulator"));
        Facts remoteEmulator =
                new Facts(
                        false,
                        List.of("local"),
                        "local",
                        false,
                        false,
                        false,
                        false,
                        false,
                        "jdbc:postgresql://localhost:5432/orenjitrade",
                        "emulator.internal:9099");
        assertThat(TestAccountPurgeCommand.refusals(remoteEmulator))
                .singleElement()
                .asString()
                .contains("Auth emulator");
    }

    @Test
    void readsTheDatabaseHost() {
        assertThat(TestAccountPurgeCommand.hostOfJdbcUrl("jdbc:postgresql://localhost:5432/x"))
                .isEqualTo("localhost");
        assertThat(TestAccountPurgeCommand.hostOfJdbcUrl("jdbc:postgresql://[::1]:5432/x"))
                .isEqualTo("[::1]");
        assertThat(TestAccountPurgeCommand.hostOfJdbcUrl("jdbc:postgresql://db/x")).isEqualTo("db");
        assertThat(TestAccountPurgeCommand.hostOfJdbcUrl("jdbc:mysql://localhost/x")).isNull();
        assertThat(TestAccountPurgeCommand.hostOfJdbcUrl(null)).isNull();
    }
}
