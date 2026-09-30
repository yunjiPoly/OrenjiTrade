package com.orenjitrade.api.common.seed;

import java.util.Comparator;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Applies every {@link SeedContributor} in order at startup when {@code orenji.seed.enabled=true}
 * (the {@code local} and {@code dev} profiles). Idempotent: running it twice leaves the data as is.
 */
@Component
@ConditionalOnProperty(name = "orenji.seed.enabled", havingValue = "true")
public class SeedDataRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SeedDataRunner.class);

    private final List<SeedContributor> contributors;

    public SeedDataRunner(List<SeedContributor> contributors) {
        this.contributors =
                contributors.stream()
                        .sorted(Comparator.comparingInt(SeedContributor::order))
                        .toList();
    }

    @Override
    public void run(ApplicationArguments args) {
        seedAll();
    }

    /** Runs every contributor; also callable from tests and admin tooling. */
    public void seedAll() {
        long started = System.nanoTime();
        for (SeedContributor contributor : contributors) {
            log.info("Seeding {} (order {})", contributor.name(), contributor.order());
            contributor.seed();
        }
        log.info(
                "Seed complete: {} contributor(s) in {} ms",
                contributors.size(),
                (System.nanoTime() - started) / 1_000_000);
    }

    public List<SeedContributor> contributors() {
        return contributors;
    }
}
