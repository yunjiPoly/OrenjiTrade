package com.orenjitrade.api.donations.infra;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.seed.SeedContributor;
import com.orenjitrade.api.donations.domain.DonationRows.DonationStatus;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Seeds donations (fictional, local/dev only; stable ids {@code 00000000-0000-4000-a300-...}; fake
 * provider references, no money): collector2 gave 25.00 CAD with public thanks (on the supporters
 * list), collector5 gave 10.00 CAD without (not listed). Inserted once.
 */
@Component
public class DonationSeedContributor implements SeedContributor {

    static final UUID COLLECTOR2 = UUID.fromString("00000000-0000-4000-8000-000000000002");
    static final UUID COLLECTOR5 = UUID.fromString("00000000-0000-4000-8000-000000000005");

    private final DonationRepository repository;
    private final TimeProvider timeProvider;

    public DonationSeedContributor(DonationRepository repository, TimeProvider timeProvider) {
        this.repository = repository;
        this.timeProvider = timeProvider;
    }

    @Override
    public String name() {
        return "donations";
    }

    @Override
    public int order() {
        return ORDER_INTERACTIONS + 73;
    }

    @Override
    @Transactional
    public void seed() {
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.SECONDS);
        repository.insertSeed(
                UUID.fromString("00000000-0000-4000-a300-000000000001"),
                COLLECTOR2,
                new BigDecimal("25.00"),
                "CAD",
                FakeDonationProvider.ID,
                "fake_dn_seedcollector20001",
                DonationStatus.SUCCEEDED,
                "Keep the local trade nights going!",
                true,
                now.minus(12, ChronoUnit.DAYS));
        repository.insertSeed(
                UUID.fromString("00000000-0000-4000-a300-000000000002"),
                COLLECTOR5,
                new BigDecimal("10.00"),
                "CAD",
                FakeDonationProvider.ID,
                "fake_dn_seedcollector50001",
                DonationStatus.SUCCEEDED,
                null,
                false,
                now.minus(3, ChronoUnit.DAYS));
    }
}
