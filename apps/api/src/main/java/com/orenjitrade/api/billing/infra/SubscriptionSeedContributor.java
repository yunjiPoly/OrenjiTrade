package com.orenjitrade.api.billing.infra;

import com.orenjitrade.api.billing.domain.PlanCodes;
import com.orenjitrade.api.billing.domain.PlanRules;
import com.orenjitrade.api.billing.domain.PlanService;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.seed.SeedContributor;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Seeds the subscription of {@code premium_user} (fictional, local/dev only): an ACTIVE fake
 * subscription {@code 00000000-0000-4000-a000-000000000001} to PREMIUM for 30 days from the first
 * seeding (the account itself is seeded on the PREMIUM plan with PREMIUM_USER). Inserted once; the
 * local {@code subscriptions-period} job renews it through synthetic fake webhooks.
 */
@Component
public class SubscriptionSeedContributor implements SeedContributor {

    static final UUID PREMIUM_USER = UUID.fromString("00000000-0000-4000-8000-000000000009");
    static final UUID SUBSCRIPTION = UUID.fromString("00000000-0000-4000-a000-000000000001");

    private final SubscriptionRepository repository;
    private final PlanService plans;
    private final TimeProvider timeProvider;

    public SubscriptionSeedContributor(
            SubscriptionRepository repository, PlanService plans, TimeProvider timeProvider) {
        this.repository = repository;
        this.plans = plans;
        this.timeProvider = timeProvider;
    }

    @Override
    public String name() {
        return "subscriptions";
    }

    @Override
    public int order() {
        return ORDER_INTERACTIONS + 70;
    }

    @Override
    @Transactional
    public void seed() {
        Optional<PlanRules> premium = plans.find(PlanCodes.PREMIUM);
        if (premium.isEmpty()) {
            return;
        }
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.SECONDS);
        boolean inserted =
                repository.insertActiveIfAbsent(
                        SUBSCRIPTION,
                        PREMIUM_USER,
                        premium.get().id(),
                        FakeBillingProvider.ID,
                        "fake_sub_seedpremiumuser0001",
                        "fake_cs_seedpremiumuser0001",
                        premium.get().monthlyPrice(),
                        premium.get().currency(),
                        now,
                        now.plus(30, ChronoUnit.DAYS),
                        now);
        if (inserted) {
            repository.addEvent(
                    SUBSCRIPTION, "ACTIVATED", null, null, "{\"trigger\":\"SEED\"}", now);
        }
    }
}
