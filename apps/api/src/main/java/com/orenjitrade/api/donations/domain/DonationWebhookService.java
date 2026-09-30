package com.orenjitrade.api.donations.domain;

import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.webhooks.SignedWebhooks.InvalidSignatureException;
import com.orenjitrade.api.common.webhooks.SignedWebhooks.UnreadablePayloadException;
import com.orenjitrade.api.donations.domain.DonationProvider.DonationEvent;
import com.orenjitrade.api.donations.domain.DonationProvider.EventKind;
import com.orenjitrade.api.donations.domain.DonationRows.DonationWebhookRow;
import com.orenjitrade.api.donations.domain.DonationRows.WebhookState;
import com.orenjitrade.api.donations.domain.DonationService.ApplyOutcome;
import com.orenjitrade.api.donations.events.DonationWebhookReceived;
import com.orenjitrade.api.donations.infra.DonationWebhookRepository;
import com.orenjitrade.api.featureflags.domain.FeatureFlagKeys;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
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
 * Donation provider webhooks ({@code POST /api/v1/webhooks/donations/{provider}}), idempotent like
 * the payment webhooks: verified through the active {@link DonationProvider}, stored in {@code
 * donation_webhook_event} (refused ones as IGNORED, then 400), deduplicated by the provider's event
 * id and applied after commit through {@link DonationWebhookReceived} and {@link
 * DonationService#apply}. 404 FEATURE_DISABLED while the {@code donations} flag is off for
 * everybody. Failures are logged with the {@code donation.webhook.failed} marker.
 */
@Service
public class DonationWebhookService {

    /** Largest accepted webhook body (bytes). */
    public static final int MAX_PAYLOAD_BYTES = 256 * 1024;

    static final String FAILED_MARKER = "donation.webhook.failed";

    private static final Logger log = LoggerFactory.getLogger(DonationWebhookService.class);

    private final DonationProvider provider;
    private final DonationWebhookRepository repository;
    private final DonationService donations;
    private final ApplicationEventPublisher events;
    private final TimeProvider timeProvider;
    private final JsonMapper jsonMapper;
    private final TransactionTemplate newTransaction;

    public DonationWebhookService(
            DonationProvider provider,
            DonationWebhookRepository repository,
            DonationService donations,
            ApplicationEventPublisher events,
            TimeProvider timeProvider,
            JsonMapper jsonMapper,
            PlatformTransactionManager transactionManager) {
        this.provider = provider;
        this.repository = repository;
        this.donations = donations;
        this.events = events;
        this.timeProvider = timeProvider;
        this.jsonMapper = jsonMapper;
        this.newTransaction = new TransactionTemplate(transactionManager);
        this.newTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /**
     * Answer of the webhook route.
     *
     * @param webhookEventId the stored row ({@code null} for a duplicate)
     * @param duplicate whether the provider already sent this event
     * @param type the provider's event type
     */
    public record Receipt(@Nullable UUID webhookEventId, boolean duplicate, String type) {}

    /**
     * Receives a webhook of {@code providerId}: 404 for another provider than the active one or
     * while the flag is off for everybody, 413 above {@link #MAX_PAYLOAD_BYTES}, 400
     * WEBHOOK_SIGNATURE_INVALID for a bad signature (stored IGNORED), 400 VALIDATION_FAILED for an
     * unreadable signed body, otherwise stored and answered.
     */
    public Receipt receive(String providerId, byte[] body, Map<String, String> headers) {
        if (!provider.providerId().equals(providerId)) {
            throw ApiException.notFound("Unknown donation provider");
        }
        if (!donations.activeForAnyone()) {
            throw FeatureFlags.disabled(FeatureFlagKeys.DONATIONS);
        }
        if (body.length > MAX_PAYLOAD_BYTES) {
            throw new ApiException(ErrorCode.PAYLOAD_TOO_LARGE, "The webhook body is too large");
        }
        String payload = new String(body, StandardCharsets.UTF_8);
        Map<String, String> normalised = new LinkedHashMap<>();
        headers.forEach((name, value) -> normalised.put(name.toLowerCase(Locale.ROOT), value));
        DonationEvent event;
        try {
            event = provider.parseWebhook(payload, normalised);
        } catch (InvalidSignatureException e) {
            UUID id =
                    newTransaction.execute(
                            status ->
                                    repository.insertIgnored(
                                            providerId,
                                            type(e.claimedType()),
                                            false,
                                            storable(payload),
                                            "INVALID_SIGNATURE",
                                            now()));
            warn(providerId, "INVALID_SIGNATURE", id);
            throw new ApiException(
                    ErrorCode.WEBHOOK_SIGNATURE_INVALID,
                    "The webhook signature could not be verified");
        } catch (UnreadablePayloadException e) {
            UUID id =
                    newTransaction.execute(
                            status ->
                                    repository.insertIgnored(
                                            providerId,
                                            "unknown",
                                            true,
                                            storable(payload),
                                            "UNREADABLE_PAYLOAD",
                                            now()));
            warn(providerId, "UNREADABLE_PAYLOAD", id);
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
                            events.publishEvent(
                                    new DonationWebhookReceived(
                                            id.get(),
                                            providerId,
                                            event.providerEventId(),
                                            event.kind().name(),
                                            event.checkoutRef(),
                                            event.failureCode(),
                                            now));
                            return new Receipt(id.get(), false, event.type());
                        });
        if (receipt == null) {
            throw new IllegalStateException("Webhook transaction returned nothing");
        }
        if (receipt.duplicate()) {
            log.info(
                    "Donation webhook {} {} received again: ignored",
                    providerId,
                    event.providerEventId());
        }
        return receipt;
    }

    /**
     * Applies a stored webhook (after commit; only RECEIVED rows are applied). A failure rolls the
     * change back and records FAILED with an error code.
     */
    public void process(DonationWebhookReceived event) {
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
                                    WebhookState.FAILED,
                                    null,
                                    code.length() <= 500 ? code : code.substring(0, 500),
                                    now()));
        }
    }

    private void apply(DonationWebhookReceived event) {
        Optional<DonationWebhookRow> row = repository.lock(event.webhookEventId());
        if (row.isEmpty() || row.get().status() != WebhookState.RECEIVED) {
            return;
        }
        EventKind kind;
        try {
            kind = EventKind.valueOf(event.kind());
        } catch (IllegalArgumentException e) {
            kind = EventKind.OTHER;
        }
        ApplyOutcome outcome =
                donations.apply(event.provider(), kind, event.checkoutRef(), event.failureCode());
        repository.finish(
                event.webhookEventId(),
                outcome.status(),
                outcome.donationId(),
                outcome.error(),
                now());
        log.info(
                "Donation webhook {} ({}) {}{}",
                event.webhookEventId(),
                kind,
                outcome.status(),
                outcome.error() == null ? "" : " " + outcome.error());
    }

    private void warn(String providerId, String reason, @Nullable UUID id) {
        log.atWarn()
                .addKeyValue("event", FAILED_MARKER)
                .addKeyValue("provider", providerId)
                .addKeyValue("reason", reason)
                .log(FAILED_MARKER + ": webhook {} refused ({})", id, reason);
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

    private Instant now() {
        return timeProvider.now().truncatedTo(ChronoUnit.MICROS);
    }
}
