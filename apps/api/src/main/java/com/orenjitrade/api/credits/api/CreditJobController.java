package com.orenjitrade.api.credits.api;

import com.orenjitrade.api.credits.api.CreditResponses.ReconcileJobResponse;
import com.orenjitrade.api.credits.domain.CreditReconciliationJob;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code POST /internal/jobs/credits-reconcile} (service token / Google OIDC, hourly). */
@RestController
@Tag(name = "internal", description = "Internal job triggers (service token / Google OIDC)")
public class CreditJobController {

    private final CreditReconciliationJob job;

    public CreditJobController(CreditReconciliationJob job) {
        this.job = job;
    }

    @PostMapping(
            path = "/internal/jobs/credits-reconcile",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "runCreditsReconcileJob",
            summary = "Compare cached credit balances with the ledger (service auth)",
            description =
                    "Hourly. Repairs cached balances that differ from SUM(amount) and reports"
                            + " accounts whose latest running balance differs from the sum (never"
                            + " edits the ledger). Records a job run.")
    public ReconcileJobResponse run() {
        Map<String, ?> details = job.run();
        return new ReconcileJobResponse(
                number(details, "accounts"),
                number(details, "cacheMismatches"),
                number(details, "ledgerMismatches"));
    }

    private static int number(Map<String, ?> details, String key) {
        Object value = details.get(key);
        return value instanceof Number number ? number.intValue() : 0;
    }
}
