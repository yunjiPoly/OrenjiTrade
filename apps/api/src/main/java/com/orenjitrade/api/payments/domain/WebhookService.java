package com.orenjitrade.api.payments.domain;

import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.payments.domain.PaymentProvider.SellerAccountStatus;
import com.orenjitrade.api.payments.domain.PaymentProvider.WebhookEvent;
import com.orenjitrade.api.payments.domain.PaymentProvider.WebhookKind;
import com.orenjitrade.api.payments.domain.PaymentProvider.WebhookPayloadException;
import com.orenjitrade.api.payments.domain.PaymentProvider.WebhookSignatureException;
import com.orenjitrade.api.payments.domain.PaymentRows.WebhookEventRow;
import com.orenjitrade.api.payments.events.PaymentWebhookReceived;
import com.orenjitrade.api.payments.infra.WebhookEventRepository;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Provider webhooks (Phase 9 contract "Webhooks"): {@link #receive} verifies the signature through
 * the active {@link PaymentProvider}, stores every event in {@code payment_webhook_event} (invalid
 * signatures as IGNORED, then 400), deduplicates by the provider's event id (a retry answers 200
 * without a second change) and publishes {@link PaymentWebhookReceived} in the same transaction;
 * {@link #process} applies it after commit in its own transaction and records PROCESSED, IGNORED or
 * FAILED. Failures are logged with the {@code payment.webhook.failed} marker.
 */
@Service
public class WebhookService {

    /** Largest accepted webhook body (bytes). */
    public static final int MAX_PAYLOAD_BYTES = 256 * 1024;

    static final String FAILED_MARKER = "payment.webhook.failed";

    private static final Logger log = LoggerFactory.getLogger(WebhookService.class);

    private final PaymentProvider provider;
    private final PaymentFeature feature;
    private final WebhookEventRepository repository;
    private final ProtectedPaymentService payments;
    private final SellerAccountService sellers;
    private final ApplicationEventPublisher events;
    private final TimeProvider timeProvider;
    private final JsonMapper jsonMapper;
    private final TransactionTemplate newTransaction;

    public WebhookService(
            PaymentProvider provider,
            PaymentFeature feature,
            WebhookEventRepository repository,
            ProtectedPaymentService payments,
            SellerAccountService sellers,
            ApplicationEventPublisher events,
            TimeProvider timeProvider,
            JsonMapper jsonMapper,
            PlatformTransactionManager transactionManager) {
        this.provider = provider;
        this.feature = feature;
        this.repository = repository;
        this.payments = payments;
        this.sellers = sellers;
        this.events = events;
        this.timeProvider = timeProvider;
        this.jsonMapper = jsonMapper;
        this.newTransaction = new TransactionTemplate(transactionManager);
        this.newTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /**
     * Answer of {@code POST /webhooks/payments/{provider}}.
     *
     * @param webhookEventId the stored row ({@code null} for a duplicate)
     * @param duplicate whether the provider already sent this event
     * @param type the provider's event type
     */
    public record Receipt(@Nullable UUID webhookEventId, boolean duplicate, String type) {}

    /**
     * Receives a webhook of {@code providerId}: 404 for another provider than the active one, 404
     * FEATURE_DISABLED while the flag is off for everybody, 413 above {@link #MAX_PAYLOAD_BYTES},
     * 400 WEBHOOK_SIGNATURE_INVALID for a bad signature (stored IGNORED), otherwise stored and
     * answered at once.
     */
    public Receipt receive(String providerId, byte[] body, Map<String, String> headers) {
        if (!provider.providerId().equals(providerId)) {
            throw ApiException.notFound("Unknown payment provider");
        }
        feature.requireActive();
        if (body.length > MAX_PAYLOAD_BYTES) {
            throw new ApiException(ErrorCode.PAYLOAD_TOO_LARGE, "The webhook body is too large");
        }
        String payload = new String(body, StandardCharsets.UTF_8);
        Map<String, String> normalised = new LinkedHashMap<>();
        headers.forEach((name, value) -> normalised.put(name.toLowerCase(Locale.ROOT), value));
        WebhookEvent event;
        try {
            event = provider.parseWebhook(payload, normalised);
        } catch (WebhookSignatureException e) {
            UUID id =
                    newTransaction.execute(
                            status ->
                                    repository.insertRejected(
                                            providerId,
                                            type(e.claimedType()),
                                            storable(payload),
                                            "INVALID_SIGNATURE",
                                            now()));
            log.atWarn()
                    .addKeyValue("event", FAILED_MARKER)
                    .addKeyValue("provider", providerId)
                    .addKeyValue("reason", "INVALID_SIGNATURE")
                    .log(FAILED_MARKER + ": webhook {} refused (invalid signature)", id);
            throw new ApiException(
                    ErrorCode.WEBHOOK_SIGNATURE_INVALID,
                    "The webhook signature could not be verified");
        } catch (WebhookPayloadException e) {
            UUID id =
                    newTransaction.execute(
                            status ->
                                    repository.insertUnreadable(
                                            providerId,
                                            "unknown",
                                            storable(payload),
                                            "UNREADABLE_PAYLOAD",
                                            now()));
            log.atWarn()
                    .addKeyValue("event", FAILED_MARKER)
                    .addKeyValue("provider", providerId)
                    .addKeyValue("reason", "UNREADABLE_PAYLOAD")
                    .log(FAILED_MARKER + ": webhook {} refused (unreadable body)", id);
            throw ApiException.validation(
                    "Validation failed",
                    List.of(new ProblemFieldError("body", "The webhook body could not be read")));
        }
        Receipt receipt =
                newTransaction.execute(
                        status -> {
                            Instant now = now();
                            Optional<UUID> id =
                                    repository.insertVerified(
                                            providerId,
                                            event.providerEventId(),
                                            type(event.type()),
                                            storable(payload),
                                            now);
                            if (id.isEmpty()) {
                                return new Receipt(null, true, event.type());
                            }
                            SellerAccountStatus account = event.account();
                            events.publishEvent(
                                    new PaymentWebhookReceived(
                                            id.get(),
                                            providerId,
                                            event.providerEventId(),
                                            event.kind().name(),
                                            event.paymentRef(),
                                            event.accountRef(),
                                            account == null ? null : account.status().name(),
                                            account != null && account.payoutsEnabled(),
                                            event.refundRef(),
                                            event.failureCode(),
                                            now));
                            return new Receipt(id.get(), false, event.type());
                        });
        if (receipt == null) {
            throw new IllegalStateException("Webhook transaction returned nothing");
        }
        if (receipt.duplicate()) {
            log.info(
                    "Payment webhook {} {} received again: ignored",
                    providerId,
                    event.providerEventId());
        }
        return receipt;
    }

    /**
     * Applies a stored webhook (after commit, idempotent: only RECEIVED rows are applied). A
     * failure rolls the change back and records FAILED with an error code.
     */
    public void process(PaymentWebhookReceived event) {
        try {
            newTransaction.executeWithoutResult(status -> apply(event));
        } catch (RuntimeException e) {
            String code =
                    e instanceof ApiException api
                            ? api.getErrorCode().name()
                            : e.getClass().getSimpleName();
            log.atError()
                    .addKeyValue("event", FAILED_MARKER)
                    .addKeyValue("provider", event.provider())
                    .addKeyValue("reason", code)
                    .log(
                            FAILED_MARKER + ": webhook {} ({}) could not be processed ({})",
                            event.webhookEventId(),
                            event.kind(),
                            code);
            newTransaction.executeWithoutResult(
                    status ->
                            repository.finish(
                                    event.webhookEventId(),
                                    WebhookStatus.FAILED,
                                    null,
                                    truncate(code),
                                    now()));
        }
    }

    private void apply(PaymentWebhookReceived event) {
        Optional<WebhookEventRow> row = repository.lock(event.webhookEventId());
        if (row.isEmpty() || row.get().status() != WebhookStatus.RECEIVED) {
            return;
        }
        WebhookKind kind;
        try {
            kind = WebhookKind.valueOf(event.kind());
        } catch (IllegalArgumentException e) {
            kind = WebhookKind.OTHER;
        }
        String eventId = event.providerEventId();
        WebhookOutcome outcome =
                switch (kind) {
                    case PAYMENT_SECURED ->
                            event.paymentRef() == null
                                    ? WebhookOutcome.ignored(null, "MISSING_REFERENCE")
                                    : payments.onSecured(eventId, event.paymentRef());
                    case PAYMENT_FAILED ->
                            event.paymentRef() == null
                                    ? WebhookOutcome.ignored(null, "MISSING_REFERENCE")
                                    : payments.onFailed(
                                            eventId, event.paymentRef(), event.failureCode());
                    case REFUND_SUCCEEDED, REFUND_FAILED ->
                            event.refundRef() == null
                                    ? WebhookOutcome.ignored(null, "MISSING_REFERENCE")
                                    : payments.onRefundResult(
                                            eventId,
                                            event.refundRef(),
                                            kind == WebhookKind.REFUND_SUCCEEDED);
                    case PAYOUT_PAID ->
                            event.paymentRef() == null
                                    ? WebhookOutcome.ignored(null, "MISSING_REFERENCE")
                                    : payments.onPayoutPaid(eventId, event.paymentRef());
                    case SELLER_ACCOUNT_UPDATED -> sellerAccount(event);
                    case OTHER -> WebhookOutcome.ignored(null, "UNHANDLED_TYPE");
                };
        repository.finish(
                event.webhookEventId(),
                outcome.status(),
                outcome.paymentId(),
                outcome.error(),
                now());
        log.info(
                "Payment webhook {} ({}) {}{}",
                event.webhookEventId(),
                kind,
                outcome.status(),
                outcome.error() == null ? "" : " " + outcome.error());
    }

    private WebhookOutcome sellerAccount(PaymentWebhookReceived event) {
        if (event.accountRef() == null || event.accountStatus() == null) {
            return WebhookOutcome.ignored(null, "MISSING_REFERENCE");
        }
        SellerAccountState state;
        try {
            state = SellerAccountState.valueOf(event.accountStatus());
        } catch (IllegalArgumentException e) {
            return WebhookOutcome.ignored(null, "UNKNOWN_ACCOUNT_STATUS");
        }
        return sellers.providerUpdate(
                        event.accountRef(), new SellerAccountStatus(state, event.payoutsEnabled()))
                ? WebhookOutcome.processed(null)
                : WebhookOutcome.ignored(null, "UNKNOWN_ACCOUNT");
    }

    /** The body as JSON for the {@code payload} column (a marker object when it is not JSON). */
    String storable(String payload) {
        try {
            JsonNode node = jsonMapper.readTree(payload);
            if (node != null && (node.isObject() || node.isArray())) {
                return payload;
            }
        } catch (RuntimeException e) {
            // not JSON: store a marker instead
        }
        Map<String, Object> marker = new LinkedHashMap<>();
        marker.put("unparsable", true);
        marker.put("length", payload.length());
        return jsonMapper.writeValueAsString(marker);
    }

    private static String type(@Nullable String type) {
        if (type == null || type.isBlank()) {
            return "unknown";
        }
        String trimmed = type.trim();
        return trimmed.length() <= 100 ? trimmed : trimmed.substring(0, 100);
    }

    private static String truncate(String value) {
        return value.length() <= 500 ? value : value.substring(0, 500);
    }

    private Instant now() {
        return timeProvider.now().truncatedTo(ChronoUnit.MICROS);
    }
}
