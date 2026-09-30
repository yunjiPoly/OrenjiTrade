package com.orenjitrade.api.billing.api;

import com.orenjitrade.api.billing.api.SubscriptionResponses.PeriodJobResponse;
import com.orenjitrade.api.billing.domain.SubscriptionPeriodJob;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code POST /internal/jobs/subscriptions-period} (service token / Google OIDC, hourly). */
@RestController
@Tag(name = "internal", description = "Internal job triggers (service token / Google OIDC)")
public class BillingJobController {

    private final SubscriptionPeriodJob job;

    public BillingJobController(SubscriptionPeriodJob job) {
        this.job = job;
    }

    @PostMapping(
            path = "/internal/jobs/subscriptions-period",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "runSubscriptionsPeriodJob",
            summary = "End, renew or expire subscriptions whose period ended (service auth)",
            description =
                    "Hourly. Cancellations at the period end take effect (FREE); fake-provider"
                            + " subscriptions are renewed through a synthetic signed webhook; other"
                            + " providers' subscriptions without a renewal expire after"
                            + " orenji.billing.renewal-grace. Records a job run.")
    public PeriodJobResponse run() {
        Map<String, ?> details = job.run();
        return new PeriodJobResponse(
                number(details, "due"),
                number(details, "cancelled"),
                number(details, "renewalsRequested"),
                number(details, "expired"));
    }

    private static int number(Map<String, ?> details, String key) {
        Object value = details.get(key);
        return value instanceof Number number ? number.intValue() : 0;
    }
}
