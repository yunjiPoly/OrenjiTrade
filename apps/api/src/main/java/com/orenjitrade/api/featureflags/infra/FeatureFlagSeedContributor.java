package com.orenjitrade.api.featureflags.infra;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.seed.SeedContributor;
import com.orenjitrade.api.featureflags.domain.FeatureFlagKeys;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Local/dev only: switches on the flags whose flows run entirely on fake providers locally ({@code
 * protectedPayments} with {@code FakePaymentProvider}, {@code premiumPlans} with the fake billing
 * checkout, {@code credits}, {@code advertising} with internal campaigns, {@code donations} with
 * the fake donation provider) so every flow is testable without credentials. The migrations leave
 * every money feature off (V010, V105: the launch configuration); {@code mlScanning} stays off
 * everywhere (owner hold on Phase 11). Flags an admin already changed ({@code updated_by} set) are
 * left alone, so local toggles survive restarts.
 */
@Component
@Profile({"local", "dev"})
public class FeatureFlagSeedContributor implements SeedContributor {

    /** Flags enabled by the local/dev seed. */
    public static final List<String> LOCAL_ENABLED =
            List.of(
                    FeatureFlagKeys.PROTECTED_PAYMENTS,
                    FeatureFlagKeys.PREMIUM_PLANS,
                    FeatureFlagKeys.CREDITS,
                    FeatureFlagKeys.ADVERTISING,
                    FeatureFlagKeys.DONATIONS);

    /** Before the accounts: flags do not depend on any other seed. */
    static final int ORDER = 50;

    private static final Logger log = LoggerFactory.getLogger(FeatureFlagSeedContributor.class);

    private final FeatureFlagRepository repository;
    private final FeatureFlags featureFlags;
    private final TimeProvider timeProvider;

    public FeatureFlagSeedContributor(
            FeatureFlagRepository repository,
            FeatureFlags featureFlags,
            TimeProvider timeProvider) {
        this.repository = repository;
        this.featureFlags = featureFlags;
        this.timeProvider = timeProvider;
    }

    @Override
    public String name() {
        return "feature flags";
    }

    @Override
    public int order() {
        return ORDER;
    }

    @Override
    @Transactional
    public void seed() {
        Instant now = timeProvider.now();
        int changed = 0;
        for (String key : LOCAL_ENABLED) {
            if (repository.enableUnlessEditedByAdmin(key, now)) {
                changed++;
            }
        }
        featureFlags.invalidate();
        log.info("Local feature flags: {} enabled by the seed", changed);
    }
}
