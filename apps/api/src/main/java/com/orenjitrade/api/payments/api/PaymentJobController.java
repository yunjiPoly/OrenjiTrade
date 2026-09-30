package com.orenjitrade.api.payments.api;

import com.orenjitrade.api.payments.api.PaymentResponses.AutoReleaseResponse;
import com.orenjitrade.api.payments.domain.AutoReleaseJob;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code POST /internal/jobs/payments-auto-release} (service token / Google OIDC, hourly). */
@RestController
@Tag(name = "internal", description = "Internal job triggers (service token / Google OIDC)")
public class PaymentJobController {

    private final AutoReleaseJob job;

    public PaymentJobController(AutoReleaseJob job) {
        this.job = job;
    }

    @PostMapping(
            path = "/internal/jobs/payments-auto-release",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "runPaymentsAutoReleaseJob",
            summary = "Release payouts after the dispute window (service auth)",
            description =
                    "Hourly. Reminds buyers payments.release_reminder_hours before the window ends;"
                            + " SHIPPED trades whose window ended without a dispute are treated as"
                            + " received: payout released, trade COMPLETED. Nothing happens while"
                            + " payments.auto_release_enabled is false. Records a job run.")
    public AutoReleaseResponse run() {
        return AutoReleaseResponse.from(job.run());
    }
}
