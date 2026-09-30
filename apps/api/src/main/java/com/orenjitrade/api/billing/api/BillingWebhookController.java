package com.orenjitrade.api.billing.api;

import com.orenjitrade.api.billing.api.SubscriptionResponses.WebhookReceiptResponse;
import com.orenjitrade.api.billing.domain.BillingWebhookService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code POST /api/v1/webhooks/billing/{provider}}: no bearer token; the provider's signature
 * authenticates the call. Every event is stored; duplicates answer 200 without a second change;
 * processing happens after the answer through a domain event.
 */
@RestController
@Tag(name = "webhooks", description = "Payment provider webhooks (signature verified)")
public class BillingWebhookController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final BillingWebhookService webhooks;

    public BillingWebhookController(BillingWebhookService webhooks) {
        this.webhooks = webhooks;
    }

    @PostMapping(
            path = "/api/v1/webhooks/billing/{provider}",
            consumes = MediaType.ALL_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @SecurityRequirements
    @Parameter(
            name = "X-Fake-Signature",
            in = ParameterIn.HEADER,
            description = "Signature of the fake provider (t=<unix seconds>,v1=<hex HMAC-SHA256>)",
            schema = @Schema(type = "string"))
    @Parameter(
            name = "Stripe-Signature",
            in = ParameterIn.HEADER,
            description = "Signature of Stripe (t=<unix seconds>,v1=<hex HMAC-SHA256>)",
            schema = @Schema(type = "string"))
    @Operation(
            operationId = "receiveBillingWebhook",
            summary = "Billing provider webhook",
            description =
                    "Called by the active billing provider only (fake: X-Fake-Signature; stripe:"
                        + " Stripe-Signature, HMAC-SHA256 with a 5-minute tolerance). A bad"
                        + " signature answers 400 WEBHOOK_SIGNATURE_INVALID and is stored as"
                        + " IGNORED; a verified event is stored (idempotent by the provider's event"
                        + " id: a retry answers duplicate=true) and applied after the 200"
                        + " (activation, renewal, past due, cancellation). 404 for another"
                        + " provider; 413 above 256 KB.")
    @ApiResponse(responseCode = "200", description = "Received")
    @ApiResponse(
            responseCode = "400",
            description = "WEBHOOK_SIGNATURE_INVALID, VALIDATION_FAILED (unreadable body)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND (provider)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public WebhookReceiptResponse receive(
            @Parameter(description = "fake or stripe") @PathVariable String provider,
            @RequestBody(required = false) byte[] body,
            @Parameter(hidden = true) @RequestHeader HttpHeaders headers) {
        Map<String, String> values = new LinkedHashMap<>();
        headers.forEach(
                (name, list) -> {
                    if (!list.isEmpty()) {
                        values.put(name, list.get(0));
                    }
                });
        return WebhookReceiptResponse.from(
                webhooks.receive(provider, body == null ? new byte[0] : body, values));
    }
}
