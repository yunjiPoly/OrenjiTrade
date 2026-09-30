package com.orenjitrade.api.offers.api;

import com.orenjitrade.api.offers.api.OfferResponses.OfferExpiryJobResponse;
import com.orenjitrade.api.offers.domain.OfferExpiryJob;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code POST /internal/jobs/offers-expire} (service token / Google OIDC, hourly). */
@RestController
@Tag(name = "internal", description = "Internal job triggers (service token / Google OIDC)")
public class OfferJobController {

    private final OfferExpiryJob job;

    public OfferJobController(OfferExpiryJob job) {
        this.job = job;
    }

    @PostMapping(path = "/internal/jobs/offers-expire", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "runOfferExpiryJob",
            summary = "Expire offers past their expiry (service auth)",
            description =
                    "Hourly. Live OPEN / COUNTERED proposals whose expiresAt passed become EXPIRED"
                            + " (history entry; both parties get OFFER_EXPIRED and a SYSTEM"
                            + " message). Records a job run.")
    public OfferExpiryJobResponse run() {
        return new OfferExpiryJobResponse(job.run());
    }
}
