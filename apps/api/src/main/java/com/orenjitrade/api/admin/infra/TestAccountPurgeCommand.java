package com.orenjitrade.api.admin.infra;

import com.orenjitrade.api.admin.domain.TestAccountPurgeService;
import com.orenjitrade.api.admin.domain.TestAccountPurgeService.PurgeReport;
import com.orenjitrade.api.common.TimeProvider;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * One-shot maintenance mode of the API jar behind {@code npm run e2e:purge}: started with {@code
 * orenji.maintenance.purge-test-accounts=true}, it removes the fictional web E2E test accounts
 * ({@link TestAccountPurgeService}), prints one {@value #REPORT_PREFIX}{@code <json>} line and
 * exits. No HTTP endpoint exists for it.
 *
 * <p>It refuses (exit code 2, nothing changed) unless every one of these holds: a {@code local} or
 * {@code dev} profile and environment; no web server; Flyway, the seed runner, the scheduled jobs,
 * the republication of other instances' outstanding events and the card image start-up
 * reconciliation all switched off (so the run changes nothing but the test accounts); a PostgreSQL
 * on this machine; the Firebase Auth emulator on this machine (never a real project).
 */
@Component
@ConditionalOnProperty(name = "orenji.maintenance.purge-test-accounts", havingValue = "true")
public class TestAccountPurgeCommand implements ApplicationRunner {

    static final String REPORT_PREFIX = "ORENJI_PURGE_REPORT ";
    static final int EXIT_REFUSED = 2;
    static final int EXIT_INCOMPLETE = 1;
    private static final Duration EVENT_WAIT = Duration.ofSeconds(90);
    private static final Set<String> LOCAL_HOSTS = Set.of("localhost", "127.0.0.1", "::1", "[::1]");
    private static final Pattern JDBC_HOST =
            Pattern.compile(
                    "^jdbc:postgresql://(\\[[^\\]]+\\]|[^/:?;]+)", Pattern.CASE_INSENSITIVE);
    private static final Logger log = LoggerFactory.getLogger(TestAccountPurgeCommand.class);

    private final ConfigurableApplicationContext context;
    private final Environment environment;
    private final TestAccountPurgeService purge;
    private final TestAccountPurgeRepository repository;
    private final TimeProvider timeProvider;
    private final JsonMapper jsonMapper;

    public TestAccountPurgeCommand(
            ConfigurableApplicationContext context,
            Environment environment,
            TestAccountPurgeService purge,
            TestAccountPurgeRepository repository,
            TimeProvider timeProvider,
            JsonMapper jsonMapper) {
        this.context = context;
        this.environment = environment;
        this.purge = purge;
        this.repository = repository;
        this.timeProvider = timeProvider;
        this.jsonMapper = jsonMapper;
    }

    /** What the safety rules look at, read from the running context. */
    record Facts(
            boolean webServer,
            List<String> profiles,
            String environment,
            boolean flyway,
            boolean seed,
            boolean scheduling,
            boolean republishOutstandingEvents,
            boolean cardImageReconciliation,
            String datasourceUrl,
            String authEmulatorHost) {}

    /** Every reason to refuse the run (empty: it may run). */
    static List<String> refusals(Facts facts) {
        List<String> refusals = new ArrayList<>();
        if (facts.profiles().stream().noneMatch(p -> p.equals("local") || p.equals("dev"))) {
            refusals.add("profile must be local or dev, not " + facts.profiles());
        }
        if (!Set.of("local", "development").contains(facts.environment())) {
            refusals.add(
                    "orenji.environment must be local or development, not " + facts.environment());
        }
        if (facts.webServer()) {
            refusals.add("must run without a web server (spring.main.web-application-type=none)");
        }
        if (facts.flyway()) {
            refusals.add("Flyway must be off (spring.flyway.enabled=false)");
        }
        if (facts.seed()) {
            refusals.add("the seed runner must be off (orenji.seed.enabled=false)");
        }
        if (facts.scheduling()) {
            refusals.add("scheduled jobs must be off (orenji.scheduling.enabled=false)");
        }
        if (facts.republishOutstandingEvents()) {
            refusals.add(
                    "republishing other instances' events must be off"
                        + " (spring.modulith.events.republish-outstanding-events-on-restart=false)");
        }
        if (facts.cardImageReconciliation()) {
            refusals.add(
                    "the card image start-up reconciliation must be off"
                            + " (orenji.card-images.cache.reconcile-on-startup=false)");
        }
        String dbHost = hostOfJdbcUrl(facts.datasourceUrl());
        if (dbHost == null || !LOCAL_HOSTS.contains(dbHost.toLowerCase(Locale.ROOT))) {
            refusals.add("the database must be the local PostgreSQL, not " + dbHost);
        }
        String emulator = facts.authEmulatorHost() == null ? "" : facts.authEmulatorHost().trim();
        String emulatorHost = emulator.replaceFirst(":\\d+$", "");
        if (emulator.isEmpty() || !LOCAL_HOSTS.contains(emulatorHost.toLowerCase(Locale.ROOT))) {
            refusals.add(
                    "identities must live in the local Firebase Auth emulator"
                            + " (FIREBASE_AUTH_EMULATOR_HOST=localhost:9099), not \""
                            + emulator
                            + "\"");
        }
        return refusals;
    }

    static @Nullable String hostOfJdbcUrl(@Nullable String url) {
        if (url == null) {
            return null;
        }
        Matcher matcher = JDBC_HOST.matcher(url.trim());
        return matcher.find() ? matcher.group(1) : null;
    }

    Facts facts() {
        return new Facts(
                context instanceof WebServerApplicationContext,
                Arrays.asList(environment.getActiveProfiles()),
                environment.getProperty("orenji.environment", ""),
                environment.getProperty("spring.flyway.enabled", Boolean.class, true),
                environment.getProperty("orenji.seed.enabled", Boolean.class, false),
                environment.getProperty("orenji.scheduling.enabled", Boolean.class, true),
                environment.getProperty(
                        "spring.modulith.events.republish-outstanding-events-on-restart",
                        Boolean.class,
                        false),
                environment.getProperty(
                        "orenji.card-images.cache.reconcile-on-startup", Boolean.class, true),
                environment.getProperty("spring.datasource.url", ""),
                environment.getProperty("orenji.firebase.auth-emulator-host", ""));
    }

    @Override
    public void run(ApplicationArguments args) {
        int code = execute();
        System.exit(SpringApplication.exit(context, () -> code));
    }

    /** Runs the purge (or refuses) and prints the report line; returns the exit code. */
    int execute() {
        List<String> refusals = refusals(facts());
        Map<String, Object> output = new LinkedHashMap<>();
        if (!refusals.isEmpty()) {
            refusals.forEach(reason -> log.error("Test account purge refused: {}", reason));
            output.put("refused", refusals);
            print(output);
            return EXIT_REFUSED;
        }
        Instant started = timeProvider.now();
        PurgeReport report = purge.purge();
        long pendingEvents = awaitEventListeners(started);
        output.put("report", report);
        output.put("pendingEventPublications", pendingEvents);
        print(output);
        log.info(
                "Test account purge: {} found, {} deleted, {} blocked, {} failed, {} remaining",
                report.found(),
                report.deleted(),
                report.blocked().size(),
                report.failed().size(),
                report.remaining());
        return report.failed().isEmpty() && report.remaining() == report.blocked().size()
                ? 0
                : EXIT_INCOMPLETE;
    }

    /** Waits until the asynchronous listeners of the events this run published completed. */
    private long awaitEventListeners(Instant since) {
        Instant deadline = Instant.now().plus(EVENT_WAIT);
        long pending = repository.incompleteEventPublicationsSince(since);
        while (pending > 0 && Instant.now().isBefore(deadline)) {
            try {
                Thread.sleep(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
            pending = repository.incompleteEventPublicationsSince(since);
        }
        if (pending > 0) {
            log.warn(
                    "{} event publication(s) still incomplete; the developer API republishes them"
                            + " on its next start",
                    pending);
        }
        return pending;
    }

    private void print(Map<String, Object> output) {
        System.out.println(REPORT_PREFIX + jsonMapper.writeValueAsString(output));
        System.out.flush();
    }
}
