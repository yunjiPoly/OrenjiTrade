package com.orenjitrade.api.billing.domain;

import com.orenjitrade.api.billing.domain.SubscriptionRows.SubscriptionRow;
import com.orenjitrade.api.billing.infra.BillingProperties;
import com.orenjitrade.api.billing.infra.FakeBillingProvider;
import com.orenjitrade.api.billing.infra.FakeBillingProvider.SignedWebhook;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.jobs.domain.JobRunService;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

/**
 * The {@code subscriptions-period} job ({@code POST /internal/jobs/subscriptions-period}, hourly
 * under {@code local}): for every entitling subscription whose paid period has ended,
 *
 * <ul>
 *   <li>a member cancellation at the period end takes effect (CANCELLED, FREE);
 *   <li>a fake-provider subscription is renewed by a synthetic signed {@code subscription.renewed}
 *       webhook through the regular pipeline (the fake provider never charges);
 *   <li>a real provider's subscription without a renewal webhook for {@code
 *       orenji.billing.renewal-grace} expires (EXPIRED, FREE).
 * </ul>
 *
 * Every row is handled in its own transaction; the run is recorded in {@code job_run}.
 */
@Service
public class SubscriptionPeriodJob {

    public static final String NAME = "subscriptions-period";

    static final int BATCH = 200;

    private static final Logger log = LoggerFactory.getLogger(SubscriptionPeriodJob.class);

    private final SubscriptionService subscriptions;
    private final BillingWebhookService webhooks;
    private final ObjectProvider<FakeBillingProvider> fakeProvider;
    private final BillingProperties properties;
    private final JobRunService jobRuns;
    private final TimeProvider timeProvider;

    public SubscriptionPeriodJob(
            SubscriptionService subscriptions,
            BillingWebhookService webhooks,
            ObjectProvider<FakeBillingProvider> fakeProvider,
            BillingProperties properties,
            JobRunService jobRuns,
            TimeProvider timeProvider) {
        this.subscriptions = subscriptions;
        this.webhooks = webhooks;
        this.fakeProvider = fakeProvider;
        this.properties = properties;
        this.jobRuns = jobRuns;
        this.timeProvider = timeProvider;
    }

    /** Runs the job; the details are {@code {due, cancelled, renewalsRequested, expired}}. */
    public Map<String, ?> run() {
        return jobRuns.run(NAME, this::work);
    }

    private Map<String, ?> work() {
        List<SubscriptionRow> due = subscriptions.periodEnded(BATCH);
        @Nullable FakeBillingProvider fake = fakeProvider.getIfAvailable();
        Instant graceEndedBefore = timeProvider.now().minus(properties.renewalGrace());
        int cancelled = 0;
        int renewals = 0;
        int expired = 0;
        for (SubscriptionRow row : due) {
            try {
                if (row.cancelAtPeriodEnd()) {
                    if (subscriptions.endCancelledAtPeriodEnd(row.id())) {
                        cancelled++;
                    }
                } else if (fake != null
                        && FakeBillingProvider.ID.equals(row.provider())
                        && row.providerRef() != null
                        && row.currentPeriodEnd() != null) {
                    Instant start = row.currentPeriodEnd();
                    if (!fake.periodEnd(start).isAfter(timeProvider.now())) {
                        // Long overdue (the job did not run): the new period starts now.
                        start = timeProvider.now();
                    }
                    Instant end = fake.periodEnd(start);
                    SignedWebhook webhook =
                            fake.syntheticEvent(
                                    FakeBillingProvider.SUBSCRIPTION_RENEWED,
                                    Map.of(
                                            "subscriptionRef", row.providerRef(),
                                            "periodStart", start.toString(),
                                            "periodEnd", end.toString()));
                    subscriptions.recordRenewalRequested(row.id(), end);
                    webhooks.receive(
                            FakeBillingProvider.ID,
                            webhook.payload().getBytes(StandardCharsets.UTF_8),
                            webhook.headers());
                    renewals++;
                } else if (subscriptions.expireUnrenewed(row.id(), graceEndedBefore)) {
                    expired++;
                }
            } catch (RuntimeException e) {
                log.warn(
                        "Subscription {} could not be handled by {}: {}",
                        row.id(),
                        NAME,
                        e.getClass().getSimpleName());
            }
        }
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("due", due.size());
        details.put("cancelled", cancelled);
        details.put("renewalsRequested", renewals);
        details.put("expired", expired);
        return details;
    }
}
