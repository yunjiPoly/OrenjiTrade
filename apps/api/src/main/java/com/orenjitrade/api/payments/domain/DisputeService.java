package com.orenjitrade.api.payments.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.storage.ObjectKeys;
import com.orenjitrade.api.common.storage.ObjectStorage;
import com.orenjitrade.api.common.storage.StoredObject;
import com.orenjitrade.api.inventory.domain.ItemImageProcessor;
import com.orenjitrade.api.inventory.domain.ItemImageProcessor.ImageRejectedException;
import com.orenjitrade.api.payments.domain.DisputeViews.AdminDisputeLine;
import com.orenjitrade.api.payments.domain.DisputeViews.AdminDisputeView;
import com.orenjitrade.api.payments.domain.DisputeViews.DisputeView;
import com.orenjitrade.api.payments.domain.DisputeViews.ViewerRole;
import com.orenjitrade.api.payments.domain.PaymentRows.DisputeMessageRow;
import com.orenjitrade.api.payments.domain.PaymentRows.DisputeRow;
import com.orenjitrade.api.payments.domain.PaymentRows.EvidenceRow;
import com.orenjitrade.api.payments.domain.PaymentRows.PaymentRow;
import com.orenjitrade.api.payments.events.DisputeUpdated;
import com.orenjitrade.api.payments.infra.DisputeRepository;
import com.orenjitrade.api.payments.infra.PaymentRepository;
import com.orenjitrade.api.payments.infra.ShipmentRepository;
import com.orenjitrade.api.payments.infra.WebhookEventRepository;
import com.orenjitrade.api.profiles.domain.MemberCard;
import com.orenjitrade.api.profiles.domain.MemberDirectory;
import com.orenjitrade.api.ratings.domain.RatingService;
import com.orenjitrade.api.reports.domain.ModerationHistoryService;
import com.orenjitrade.api.trades.domain.TradeEventType;
import com.orenjitrade.api.trades.domain.TradeRow;
import com.orenjitrade.api.trades.domain.TradeService;
import com.orenjitrade.api.trades.domain.TradeStatus;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

/**
 * Disputes of protected trades (Phase 9 contract): the buyer opens one while the trade is PAID or
 * SHIPPED within the dispute window (the payout is frozen, the trade DISPUTED); both parties add
 * typed evidence (TEXT, IMAGE, DOCUMENT, TRACKING; at most {@value
 * PaymentRules#MAX_EVIDENCE_PER_PARTY} each; VIDEO reserved) and messages; admins read the full
 * history, add internal notes, freeze and unfreeze the case and resolve it: BUYER (full refund,
 * trade CANCELLED), SELLER (payout, trade COMPLETED) or SPLIT (part refunded, the rest paid out,
 * trade COMPLETED). Every admin write is audited; every change appends a {@code dispute_event} and
 * publishes {@link DisputeUpdated}.
 */
@Service
public class DisputeService {

    public static final String TARGET = "DISPUTE";
    public static final String ACTION_FREEZE = "dispute.freeze";
    public static final String ACTION_UNFREEZE = "dispute.unfreeze";
    public static final String ACTION_NOTE = "dispute.note";
    public static final String ACTION_RESOLVE = "dispute.resolve";

    /** Largest evidence document (PDF). */
    public static final int MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

    static final String NAMESPACE = "disputes";
    static final String NOT_FOUND = "Dispute not found";
    static final int TEXT_MAX = 2000;

    private static final Logger log = LoggerFactory.getLogger(DisputeService.class);

    private final DisputeRepository disputes;
    private final PaymentRepository payments;
    private final ShipmentRepository shipments;
    private final WebhookEventRepository webhooks;
    private final ProtectedPaymentService paymentFlow;
    private final TradeService trades;
    private final MemberDirectory members;
    private final ModerationHistoryService histories;
    private final RatingService ratings;
    private final AuditService audit;
    private final ObjectStorage storage;
    private final ItemImageProcessor images;
    private final PaymentFeature feature;
    private final ApplicationEventPublisher events;
    private final TimeProvider timeProvider;
    private final JsonMapper jsonMapper;
    private final TransactionTemplate transaction;

    public DisputeService(
            DisputeRepository disputes,
            PaymentRepository payments,
            ShipmentRepository shipments,
            WebhookEventRepository webhooks,
            ProtectedPaymentService paymentFlow,
            TradeService trades,
            MemberDirectory members,
            ModerationHistoryService histories,
            RatingService ratings,
            AuditService audit,
            ObjectStorage storage,
            ItemImageProcessor images,
            PaymentFeature feature,
            ApplicationEventPublisher events,
            TimeProvider timeProvider,
            JsonMapper jsonMapper,
            PlatformTransactionManager transactionManager) {
        this.disputes = disputes;
        this.payments = payments;
        this.shipments = shipments;
        this.webhooks = webhooks;
        this.paymentFlow = paymentFlow;
        this.trades = trades;
        this.members = members;
        this.histories = histories;
        this.ratings = ratings;
        this.audit = audit;
        this.storage = storage;
        this.images = images;
        this.feature = feature;
        this.events = events;
        this.timeProvider = timeProvider;
        this.jsonMapper = jsonMapper;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    /** A file attached to evidence ({@code GET /disputes/{id}/evidence/{evidenceId}/file}). */
    public record EvidenceFile(EvidenceRow evidence, StoredObject object) {}

    /**
     * A posted message with its author's card.
     *
     * @param message the stored message
     * @param author the author's card ({@code null} when unknown)
     */
    public record PostedMessage(DisputeMessageRow message, @Nullable MemberCard author) {}

    // ---------------------------------------------------------------------------------------
    // Parties
    // ---------------------------------------------------------------------------------------

    /**
     * {@code POST /trades/{id}/disputes}: the buyer of a PAID or SHIPPED protected trade opens a
     * dispute (409 DISPUTE_WINDOW_CLOSED after the window, 409 INVALID_STATE_TRANSITION in other
     * states or with a dispute already opened, 403 for the seller). The payout is frozen and the
     * trade becomes DISPUTED.
     */
    @Transactional
    public DisputeView open(UUID me, UUID tradeId, DisputeReason reason, String rawDescription) {
        TradeRow trade = paymentFlow.partyTrade(me, tradeId);
        feature.requireFor(trade.buyerId());
        if (!me.equals(trade.buyerId())) {
            throw ApiException.forbidden("Only the buyer can open a dispute");
        }
        if (!trade.protectionEnabled()
                || (trade.status() != TradeStatus.PAID && trade.status() != TradeStatus.SHIPPED)) {
            throw ProtectedPaymentService.invalidState(trade, "disputed");
        }
        String description = requireText("description", rawDescription, TEXT_MAX);
        PaymentRow payment =
                payments.lockByTrade(tradeId)
                        .filter(row -> row.status() == PaymentStatus.SECURED)
                        .orElseThrow(() -> ProtectedPaymentService.invalidState(trade, "disputed"));
        Instant now = now();
        if (trade.status() == TradeStatus.SHIPPED
                && payment.disputeWindowEndsAt() != null
                && !now.isBefore(payment.disputeWindowEndsAt())) {
            throw new ApiException(
                            ErrorCode.DISPUTE_WINDOW_CLOSED,
                            "The dispute window of this trade has ended")
                    .withProperty("disputeWindowEndsAt", payment.disputeWindowEndsAt().toString());
        }
        UUID disputeId = UUID.randomUUID();
        if (!disputes.insert(disputeId, tradeId, payment.id(), me, reason, description, now)) {
            throw ProtectedPaymentService.invalidState(trade, "disputed again");
        }
        disputes.insertEvent(disputeId, me, "OPENED", json(Map.of("reason", reason.name())), now);
        payments.setFrozen(payment.id(), true, now);
        payments.insertEvent(
                payment.id(),
                "PAYOUT_FROZEN",
                null,
                me,
                json(Map.of("disputeId", disputeId.toString())),
                now);
        Map<String, Object> tradeDetails = new LinkedHashMap<>();
        tradeDetails.put("disputeId", disputeId.toString());
        tradeDetails.put("reason", reason.name());
        trades.advance(
                tradeId,
                EnumSet.of(TradeStatus.PAID, TradeStatus.SHIPPED),
                TradeStatus.DISPUTED,
                me,
                TradeEventType.DISPUTE_OPENED,
                tradeDetails,
                now,
                "disputed");
        DisputeRow dispute = requireDispute(disputeId);
        publish(dispute, payment, "OPENED", me, ViewerRole.BUYER, null, now);
        log.info("Dispute {} opened on trade {} ({})", disputeId, tradeId, reason);
        return view(dispute, ViewerRole.BUYER);
    }

    /** {@code GET /disputes/{id}}: the two parties and admins (404 for anybody else). */
    @Transactional(readOnly = true)
    public DisputeView get(AuthenticatedUser actor, UUID disputeId) {
        Access access = access(actor, disputeId);
        return view(access.dispute(), access.role());
    }

    /**
     * {@code POST /disputes/{id}/evidence}: a party adds evidence while the dispute is OPEN or
     * UNDER_REVIEW (409 while FROZEN or resolved; 409 EVIDENCE_LIMIT_REACHED after {@value
     * PaymentRules#MAX_EVIDENCE_PER_PARTY}). TEXT needs {@code body}; TRACKING needs {@code body}
     * (tracking number and carrier) and may carry an https {@code url}; IMAGE needs a JPEG, PNG or
     * WebP file (≤ 8 MB, re-encoded without metadata); DOCUMENT a PDF (≤ 10 MB); VIDEO is reserved
     * (400).
     */
    public EvidenceRow addEvidence(
            AuthenticatedUser actor,
            UUID disputeId,
            EvidenceKind kind,
            @Nullable String rawBody,
            @Nullable String rawUrl,
            byte @Nullable [] file) {
        Access access = transaction.execute(status -> access(actor, disputeId));
        if (access == null) {
            throw ApiException.notFound(NOT_FOUND);
        }
        if (access.role() == ViewerRole.ADMIN) {
            throw ApiException.forbidden("Admins add internal notes, not evidence");
        }
        feature.requireFor(access.trade().buyerId());
        if (!kind.enabled()) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(
                            new ProblemFieldError(
                                    "kind", "VIDEO evidence is reserved and not enabled yet")));
        }
        @Nullable String body = ProtectedPaymentService.text(rawBody);
        @Nullable String url = ProtectedPaymentService.text(rawUrl);
        validateEvidence(kind, body, url, file);
        requireOpenForParties(access.dispute());
        String role = access.role().name();
        if (disputes.countEvidence(disputeId, role) >= PaymentRules.MAX_EVIDENCE_PER_PARTY) {
            throw evidenceLimit();
        }
        @Nullable String key = null;
        @Nullable String contentType = null;
        @Nullable Integer size = null;
        if (kind == EvidenceKind.IMAGE && file != null) {
            ItemImageProcessor.Processed processed;
            try {
                processed = images.process(file);
            } catch (ImageRejectedException e) {
                throw switch (e.rejection()) {
                    case TOO_LARGE -> new ApiException(ErrorCode.PAYLOAD_TOO_LARGE, e.getMessage());
                    case UNSUPPORTED_TYPE ->
                            new ApiException(ErrorCode.UNSUPPORTED_MEDIA_TYPE, e.getMessage());
                    case EMPTY, DIMENSIONS, UNREADABLE ->
                            ApiException.validation(
                                    "Validation failed",
                                    List.of(new ProblemFieldError("file", e.getMessage())));
                };
            }
            key = ObjectKeys.newKey(NAMESPACE, disputeId, ItemImageProcessor.OUTPUT_EXTENSION);
            contentType = ItemImageProcessor.OUTPUT_CONTENT_TYPE;
            size = processed.jpeg().length;
            storage.put(key, processed.jpeg(), contentType);
        } else if (kind == EvidenceKind.DOCUMENT && file != null) {
            key = ObjectKeys.newKey(NAMESPACE, disputeId, "pdf");
            contentType = "application/pdf";
            size = file.length;
            storage.put(key, file, contentType);
        }
        String storedKey = key;
        String storedType = contentType;
        Integer storedSize = size;
        try {
            EvidenceRow row =
                    transaction.execute(
                            status -> {
                                DisputeRow locked = lockDispute(disputeId);
                                requireOpenForParties(locked);
                                if (disputes.countEvidence(disputeId, role)
                                        >= PaymentRules.MAX_EVIDENCE_PER_PARTY) {
                                    throw evidenceLimit();
                                }
                                Instant now = now();
                                UUID id =
                                        disputes.insertEvidence(
                                                disputeId,
                                                actor.userId(),
                                                role,
                                                kind,
                                                body,
                                                storedKey,
                                                url,
                                                storedType,
                                                storedSize,
                                                now);
                                Map<String, Object> details = new LinkedHashMap<>();
                                details.put("evidenceId", id.toString());
                                details.put("kind", kind.name());
                                details.put("role", role);
                                disputes.insertEvent(
                                        disputeId,
                                        actor.userId(),
                                        "EVIDENCE_ADDED",
                                        json(details),
                                        now);
                                publish(
                                        locked,
                                        requirePaymentOf(locked),
                                        "EVIDENCE_ADDED",
                                        actor.userId(),
                                        access.role(),
                                        id,
                                        now);
                                return disputes.evidenceItem(disputeId, id)
                                        .orElseThrow(() -> new IllegalStateException("evidence"));
                            });
            if (row == null) {
                throw new IllegalStateException("Evidence transaction returned nothing");
            }
            log.info("Evidence {} ({}) added to dispute {}", row.id(), kind, disputeId);
            return row;
        } catch (RuntimeException e) {
            if (storedKey != null) {
                storage.delete(storedKey);
            }
            throw e;
        }
    }

    /** The file of IMAGE / DOCUMENT evidence (parties and admins; 404 otherwise). */
    @Transactional(readOnly = true)
    public EvidenceFile evidenceFile(AuthenticatedUser actor, UUID disputeId, UUID evidenceId) {
        access(actor, disputeId);
        EvidenceRow evidence =
                disputes.evidenceItem(disputeId, evidenceId)
                        .filter(row -> row.storageKey() != null)
                        .orElseThrow(() -> ApiException.notFound("Evidence file not found"));
        StoredObject object =
                storage.get(evidence.storageKey())
                        .orElseThrow(() -> ApiException.notFound("Evidence file not found"));
        return new EvidenceFile(evidence, object);
    }

    /**
     * {@code POST /disputes/{id}/messages}: the parties (not while FROZEN) and admins post in the
     * dispute thread while it waits for a decision.
     */
    @Transactional
    public PostedMessage postMessage(AuthenticatedUser actor, UUID disputeId, String rawBody) {
        Access access = access(actor, disputeId);
        if (access.role() != ViewerRole.ADMIN) {
            feature.requireFor(access.trade().buyerId());
        }
        String body = requireText("body", rawBody, TEXT_MAX);
        DisputeRow dispute = lockDispute(disputeId);
        if (!dispute.status().isOpen()) {
            throw invalidState(dispute, "discussed any more");
        }
        if (dispute.status() == DisputeStatus.FROZEN && access.role() != ViewerRole.ADMIN) {
            throw invalidState(dispute, "discussed by the parties until an admin lifts the hold");
        }
        Instant now = now();
        UUID id =
                disputes.insertMessage(disputeId, actor.userId(), access.role().name(), body, now);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("messageId", id.toString());
        details.put("role", access.role().name());
        disputes.insertEvent(disputeId, actor.userId(), "MESSAGE_POSTED", json(details), now);
        publish(
                dispute,
                requirePaymentOf(dispute),
                "MESSAGE_POSTED",
                actor.userId(),
                access.role(),
                id,
                now);
        DisputeMessageRow message =
                disputes.messages(disputeId).stream()
                        .filter(row -> row.id().equals(id))
                        .findFirst()
                        .orElseThrow(() -> new IllegalStateException("message"));
        return new PostedMessage(message, members.card(actor.userId()).orElse(null));
    }

    // ---------------------------------------------------------------------------------------
    // Admins
    // ---------------------------------------------------------------------------------------

    /** {@code GET /admin/disputes?status=}: newest first. */
    @Transactional(readOnly = true)
    public PageResponse<AdminDisputeLine> adminList(
            @Nullable DisputeStatus status, int page, int size) {
        List<DisputeRow> rows = disputes.page(status, page, size);
        Set<UUID> tradeIds = new LinkedHashSet<>();
        rows.forEach(row -> tradeIds.add(row.tradeId()));
        Map<UUID, PaymentRow> byTrade = payments.byTrades(tradeIds);
        Set<UUID> people = new LinkedHashSet<>();
        byTrade.values()
                .forEach(
                        payment -> {
                            people.add(payment.buyerId());
                            people.add(payment.sellerId());
                        });
        Map<UUID, MemberCard> cards = members.cards(people);
        List<AdminDisputeLine> lines = new ArrayList<>();
        for (DisputeRow row : rows) {
            @Nullable PaymentRow payment = byTrade.get(row.tradeId());
            lines.add(
                    new AdminDisputeLine(
                            row,
                            payment,
                            payment == null ? null : cards.get(payment.buyerId()),
                            payment == null ? null : cards.get(payment.sellerId())));
        }
        return PageResponse.of(lines, page, size, disputes.count(status));
    }

    /** {@code GET /admin/disputes/{id}}: the full history (404 for unknown ids). */
    @Transactional(readOnly = true)
    public AdminDisputeView adminGet(UUID disputeId) {
        DisputeRow dispute =
                disputes.find(disputeId).orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        DisputeView view = view(dispute, ViewerRole.ADMIN);
        UUID buyer = view.trade().buyerId();
        UUID seller = view.trade().sellerId();
        return new AdminDisputeView(
                view,
                disputes.notes(disputeId),
                trades.timelineOf(dispute.tradeId()),
                payments.events(dispute.paymentId()),
                payments.refunds(dispute.paymentId()),
                webhooks.ofPayment(dispute.paymentId()),
                histories.historyOf(buyer),
                histories.historyOf(seller),
                ratings.summaryOf(buyer),
                ratings.summaryOf(seller));
    }

    /**
     * {@code POST /admin/disputes/{id}/freeze}: OPEN or UNDER_REVIEW → FROZEN (the payout and the
     * thread are held; parties cannot add evidence or messages). An optional reason is kept as an
     * internal note. Audited.
     */
    @Transactional
    public AdminDisputeView freeze(
            AuthenticatedUser admin, UUID disputeId, @Nullable String reason) {
        DisputeRow dispute = lockDispute(disputeId);
        if (dispute.status() != DisputeStatus.OPEN
                && dispute.status() != DisputeStatus.UNDER_REVIEW) {
            throw invalidState(dispute, "frozen");
        }
        PaymentRow payment = requirePaymentOf(dispute);
        Instant now = now();
        disputes.freeze(disputeId, admin.userId(), now);
        payments.setFrozen(payment.id(), true, now);
        payments.insertEvent(
                payment.id(),
                "PAYOUT_FROZEN",
                null,
                admin.userId(),
                json(Map.of("disputeId", disputeId.toString(), "byAdmin", true)),
                now);
        @Nullable String note = ProtectedPaymentService.text(reason);
        if (note != null) {
            disputes.insertNote(
                    disputeId,
                    admin.userId(),
                    ProtectedPaymentService.truncate("Frozen: " + note, TEXT_MAX),
                    now);
        }
        disputes.insertEvent(
                disputeId,
                admin.userId(),
                "FROZEN",
                json(Map.of("previousStatus", dispute.status().name())),
                now);
        auditAction(
                admin, ACTION_FREEZE, dispute, Map.of("previousStatus", dispute.status().name()));
        publish(
                requireDispute(disputeId),
                payment,
                "FROZEN",
                admin.userId(),
                ViewerRole.ADMIN,
                null,
                now);
        return adminGet(disputeId);
    }

    /** {@code POST /admin/disputes/{id}/unfreeze}: FROZEN → UNDER_REVIEW. Audited. */
    @Transactional
    public AdminDisputeView unfreeze(AuthenticatedUser admin, UUID disputeId) {
        DisputeRow dispute = lockDispute(disputeId);
        if (dispute.status() != DisputeStatus.FROZEN) {
            throw invalidState(dispute, "unfrozen");
        }
        PaymentRow payment = requirePaymentOf(dispute);
        Instant now = now();
        disputes.setStatus(disputeId, DisputeStatus.UNDER_REVIEW, now);
        disputes.insertEvent(disputeId, admin.userId(), "UNFROZEN", "{}", now);
        auditAction(admin, ACTION_UNFREEZE, dispute, Map.of());
        publish(
                requireDispute(disputeId),
                payment,
                "UNFROZEN",
                admin.userId(),
                ViewerRole.ADMIN,
                null,
                now);
        return adminGet(disputeId);
    }

    /**
     * {@code POST /admin/disputes/{id}/notes}: an internal note (never shown to the parties); the
     * first note moves an OPEN dispute to UNDER_REVIEW. Audited (without the text).
     */
    @Transactional
    public AdminDisputeView addNote(AuthenticatedUser admin, UUID disputeId, String rawBody) {
        String body = requireText("body", rawBody, TEXT_MAX);
        DisputeRow dispute = lockDispute(disputeId);
        Instant now = now();
        UUID noteId = disputes.insertNote(disputeId, admin.userId(), body, now);
        disputes.insertEvent(
                disputeId,
                admin.userId(),
                "NOTE_ADDED",
                json(Map.of("noteId", noteId.toString())),
                now);
        if (dispute.status() == DisputeStatus.OPEN) {
            disputes.setStatus(disputeId, DisputeStatus.UNDER_REVIEW, now);
            disputes.insertEvent(disputeId, admin.userId(), "UNDER_REVIEW", "{}", now);
        }
        auditAction(admin, ACTION_NOTE, dispute, Map.of("noteId", noteId.toString()));
        return adminGet(disputeId);
    }

    /**
     * {@code POST /admin/disputes/{id}/resolve}: BUYER refunds the whole refundable amount (the
     * trade is CANCELLED); SELLER releases the payout (COMPLETED); SPLIT refunds {@code
     * refundAmount} (more than 0, less than the refundable amount) and pays the rest out minus the
     * fee on it (COMPLETED). The note is shown to both parties. Audited.
     */
    @Transactional
    public AdminDisputeView resolve(
            AuthenticatedUser admin,
            UUID disputeId,
            DisputeOutcome outcome,
            @Nullable BigDecimal refundAmount,
            String rawNote) {
        String note = requireText("note", rawNote, 1000);
        DisputeRow found =
                disputes.find(disputeId).orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        TradeRow trade =
                trades.lockForPayment(found.tradeId())
                        .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        DisputeRow dispute = lockDispute(disputeId);
        if (!dispute.status().isOpen()) {
            throw invalidState(dispute, "resolved again");
        }
        PaymentRow payment = paymentFlow.requireLocked(dispute.paymentId());
        if (payment.status() != PaymentStatus.SECURED || trade.status() != TradeStatus.DISPUTED) {
            throw ApiException.conflict("The payment of this dispute is not held any more")
                    .withProperty("currentStatus", payment.status().name());
        }
        BigDecimal refundable = payment.refundable();
        Instant now = now();
        BigDecimal refunded = BigDecimal.ZERO.setScale(2);
        String key = "refund:dispute:" + disputeId;
        switch (outcome) {
            case BUYER -> {
                if (refundAmount != null && !PaymentRules.same(refundAmount, refundable)) {
                    throw refundError(
                            "must be the whole refundable amount ("
                                    + refundable.toPlainString()
                                    + ") for BUYER");
                }
                paymentFlow.refund(
                        payment,
                        refundable,
                        "Dispute resolved in the buyer's favour",
                        "DISPUTE",
                        admin.userId(),
                        now,
                        key);
                payments.setFrozen(payment.id(), false, now);
                refunded = refundable;
            }
            case SELLER -> {
                if (refundAmount != null && refundAmount.signum() != 0) {
                    throw refundError("must be empty or 0 for SELLER");
                }
                paymentFlow.releasePayout(payment, admin.userId(), "DISPUTE_RESOLVED", now);
            }
            case SPLIT -> {
                if (!PaymentRules.validAmount(refundAmount)
                        || refundAmount.compareTo(refundable) >= 0) {
                    throw refundError(
                            "must be more than 0 and less than "
                                    + refundable.toPlainString()
                                    + " for SPLIT");
                }
                PaymentRow afterRefund =
                        paymentFlow.refund(
                                payment,
                                refundAmount,
                                "Dispute resolved with a split",
                                "DISPUTE",
                                admin.userId(),
                                now,
                                key);
                paymentFlow.releasePayout(afterRefund, admin.userId(), "DISPUTE_RESOLVED", now);
                payments.setStatus(payment.id(), PaymentStatus.PARTIALLY_REFUNDED, now);
                refunded = refundAmount.setScale(2);
            }
        }
        disputes.resolve(disputeId, outcome.status(), admin.userId(), note, refunded, now);
        PaymentRow settled = paymentFlow.requirePayment(payment.id());
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("outcome", outcome.name());
        details.put("refundAmount", refunded);
        details.put("payoutAmount", settled.payoutAmount());
        details.put("currency", payment.currency());
        disputes.insertEvent(disputeId, admin.userId(), "RESOLVED", json(details), now);
        Map<String, Object> tradeDetails = new LinkedHashMap<>();
        tradeDetails.put("disputeId", disputeId.toString());
        tradeDetails.put("outcome", outcome.name());
        tradeDetails.put("refundAmount", refunded);
        trades.recordProtectedEvent(
                trade.id(), null, TradeEventType.DISPUTE_RESOLVED, tradeDetails, now);
        if (outcome == DisputeOutcome.BUYER) {
            trades.cancelProtected(
                    trade.id(), null, "The payment was refunded to the buyer after a dispute", now);
        } else {
            trades.completeProtected(trade.id(), null, now);
        }
        Map<String, Object> auditDetails = new LinkedHashMap<>(details);
        auditDetails.put("tradeId", trade.id().toString());
        auditDetails.put("paymentId", payment.id().toString());
        auditAction(admin, ACTION_RESOLVE, dispute, auditDetails);
        publish(
                requireDispute(disputeId),
                settled,
                "RESOLVED",
                admin.userId(),
                ViewerRole.ADMIN,
                null,
                now);
        log.info("Dispute {} resolved: {} (refund {})", disputeId, outcome, refunded);
        return adminGet(disputeId);
    }

    // ---------------------------------------------------------------------------------------
    // Account data
    // ---------------------------------------------------------------------------------------

    /** Export: the disputes the account opened (its own description included). */
    @Transactional(readOnly = true)
    public List<Map<String, @Nullable Object>> export(UUID userId) {
        List<Map<String, @Nullable Object>> result = new ArrayList<>();
        for (DisputeRow row : disputes.openedBy(userId, 1000)) {
            Map<String, @Nullable Object> entry = new LinkedHashMap<>();
            entry.put("id", row.id());
            entry.put("tradeId", row.tradeId());
            entry.put("reason", row.reason().name());
            entry.put("description", row.description());
            entry.put("status", row.status().name());
            entry.put("openedAt", row.openedAt());
            entry.put("resolvedAt", row.resolvedAt());
            entry.put("refundAmount", row.refundAmount());
            result.add(entry);
        }
        return result;
    }

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

    /**
     * Who may see a dispute.
     *
     * @param dispute the dispute
     * @param trade its trade
     * @param role the viewer's role
     */
    record Access(DisputeRow dispute, TradeRow trade, ViewerRole role) {}

    private Access access(AuthenticatedUser actor, UUID disputeId) {
        DisputeRow dispute =
                disputes.find(disputeId).orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        TradeRow trade =
                trades.rows(List.of(dispute.tradeId())).values().stream()
                        .findFirst()
                        .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        ViewerRole role;
        if (actor.userId().equals(trade.buyerId())) {
            role = ViewerRole.BUYER;
        } else if (actor.userId().equals(trade.sellerId())) {
            role = ViewerRole.SELLER;
        } else if (actor.isAdmin()) {
            role = ViewerRole.ADMIN;
        } else {
            throw ApiException.notFound(NOT_FOUND);
        }
        if (role != ViewerRole.ADMIN) {
            feature.requireFor(trade.buyerId());
        }
        return new Access(dispute, trade, role);
    }

    private DisputeView view(DisputeRow dispute, ViewerRole role) {
        TradeRow trade =
                trades.rows(List.of(dispute.tradeId())).values().stream()
                        .findFirst()
                        .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        PaymentRow payment = requirePaymentOf(dispute);
        List<EvidenceRow> evidence = disputes.evidence(dispute.id());
        List<DisputeMessageRow> messages = disputes.messages(dispute.id());
        Set<UUID> people = new LinkedHashSet<>();
        people.add(trade.buyerId());
        people.add(trade.sellerId());
        messages.forEach(
                message -> {
                    if (message.authorId() != null) {
                        people.add(message.authorId());
                    }
                });
        long own = evidence.stream().filter(row -> row.partyRole().equals(role.name())).count();
        int left =
                role == ViewerRole.ADMIN
                        ? 0
                        : (int) Math.max(0, PaymentRules.MAX_EVIDENCE_PER_PARTY - own);
        boolean partyOpen =
                dispute.status() == DisputeStatus.OPEN
                        || dispute.status() == DisputeStatus.UNDER_REVIEW;
        return new DisputeView(
                dispute,
                trade,
                payment,
                shipments.byTrade(trade.id()).orElse(null),
                role,
                evidence,
                disputes.events(dispute.id()),
                messages,
                members.cards(people),
                trades.summaryText(trade),
                role != ViewerRole.ADMIN && partyOpen && left > 0,
                role == ViewerRole.ADMIN ? dispute.status().isOpen() : partyOpen,
                left);
    }

    private void validateEvidence(
            EvidenceKind kind,
            @Nullable String body,
            @Nullable String url,
            byte @Nullable [] file) {
        List<ProblemFieldError> errors = new ArrayList<>();
        if (body != null && body.length() > TEXT_MAX) {
            errors.add(new ProblemFieldError("body", "must be at most 2000 characters"));
        }
        switch (kind) {
            case TEXT -> {
                if (body == null) {
                    errors.add(new ProblemFieldError("body", "is required for TEXT evidence"));
                }
                if (url != null) {
                    errors.add(new ProblemFieldError("url", "is only accepted for TRACKING"));
                }
                if (file != null) {
                    errors.add(
                            new ProblemFieldError(
                                    "file", "is only accepted for IMAGE or DOCUMENT"));
                }
            }
            case TRACKING -> {
                if (body == null) {
                    errors.add(
                            new ProblemFieldError(
                                    "body", "is required for TRACKING evidence (number, carrier)"));
                }
                if (url != null
                        && (url.length() > 500
                                || !url.toLowerCase(Locale.ROOT).startsWith("https://"))) {
                    errors.add(new ProblemFieldError("url", "must be an https link (≤ 500)"));
                }
                if (file != null) {
                    errors.add(
                            new ProblemFieldError(
                                    "file", "is only accepted for IMAGE or DOCUMENT"));
                }
            }
            case IMAGE, DOCUMENT -> {
                if (file == null || file.length == 0) {
                    errors.add(
                            new ProblemFieldError("file", "is required for " + kind + " evidence"));
                }
                if (url != null) {
                    errors.add(new ProblemFieldError("url", "is only accepted for TRACKING"));
                }
            }
            case VIDEO -> errors.add(new ProblemFieldError("kind", "VIDEO is not enabled"));
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        if (kind == EvidenceKind.DOCUMENT && file != null) {
            if (file.length > MAX_DOCUMENT_BYTES) {
                throw new ApiException(
                        ErrorCode.PAYLOAD_TOO_LARGE, "The document must be at most 10 MB");
            }
            if (!isPdf(file)) {
                throw new ApiException(
                        ErrorCode.UNSUPPORTED_MEDIA_TYPE, "Documents must be PDF files");
            }
        }
    }

    static boolean isPdf(byte[] data) {
        return data.length >= 5
                && data[0] == '%'
                && data[1] == 'P'
                && data[2] == 'D'
                && data[3] == 'F'
                && data[4] == '-';
    }

    private static void requireOpenForParties(DisputeRow dispute) {
        if (dispute.status() != DisputeStatus.OPEN
                && dispute.status() != DisputeStatus.UNDER_REVIEW) {
            throw invalidState(
                    dispute,
                    dispute.status() == DisputeStatus.FROZEN
                            ? "given new evidence until an admin lifts the hold"
                            : "given new evidence");
        }
    }

    private static ApiException evidenceLimit() {
        return new ApiException(
                        ErrorCode.EVIDENCE_LIMIT_REACHED,
                        "Each party can add at most "
                                + PaymentRules.MAX_EVIDENCE_PER_PARTY
                                + " pieces of evidence")
                .withProperty("limit", PaymentRules.MAX_EVIDENCE_PER_PARTY);
    }

    private static ApiException invalidState(DisputeRow dispute, String action) {
        return new ApiException(
                        ErrorCode.INVALID_STATE_TRANSITION,
                        "This dispute is "
                                + describe(dispute.status())
                                + " and cannot be "
                                + action)
                .withProperty("currentStatus", dispute.status().name());
    }

    private static String describe(DisputeStatus status) {
        return switch (status) {
            case FROZEN -> "on hold";
            case RESOLVED_BUYER, RESOLVED_SELLER, RESOLVED_SPLIT -> "resolved";
            default -> status.name().toLowerCase(Locale.ROOT).replace('_', ' ');
        };
    }

    private static ApiException refundError(String message) {
        return ApiException.validation(
                "Validation failed", List.of(new ProblemFieldError("refundAmount", message)));
    }

    private static String requireText(String field, @Nullable String raw, int max) {
        @Nullable String text = ProtectedPaymentService.text(raw);
        if (text == null) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(new ProblemFieldError(field, "must not be blank")));
        }
        if (text.length() > max) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(
                            new ProblemFieldError(
                                    field, "must be at most " + max + " characters")));
        }
        return text;
    }

    private DisputeRow lockDispute(UUID disputeId) {
        return disputes.lock(disputeId).orElseThrow(() -> ApiException.notFound(NOT_FOUND));
    }

    private DisputeRow requireDispute(UUID disputeId) {
        return disputes.find(disputeId)
                .orElseThrow(() -> new IllegalStateException("Dispute vanished: " + disputeId));
    }

    private PaymentRow requirePaymentOf(DisputeRow dispute) {
        return payments.find(dispute.paymentId())
                .orElseThrow(() -> new IllegalStateException("Payment of dispute missing"));
    }

    private void auditAction(
            AuthenticatedUser admin, String action, DisputeRow dispute, Map<String, ?> extra) {
        Map<String, Object> details = new LinkedHashMap<>(extra);
        details.putIfAbsent("tradeId", dispute.tradeId().toString());
        audit.record(
                ActorType.ADMIN, admin.userId(), action, TARGET, dispute.id().toString(), details);
    }

    private void publish(
            DisputeRow dispute,
            PaymentRow payment,
            String event,
            @Nullable UUID actorId,
            @Nullable ViewerRole role,
            @Nullable UUID subjectId,
            Instant at) {
        events.publishEvent(
                new DisputeUpdated(
                        dispute.id(),
                        dispute.tradeId(),
                        event,
                        dispute.status().name(),
                        dispute.reason().name(),
                        payment.buyerId(),
                        payment.sellerId(),
                        actorId,
                        role == null ? null : role.name(),
                        subjectId,
                        at));
    }

    private String json(Map<String, ?> details) {
        return jsonMapper.writeValueAsString(details);
    }

    private Instant now() {
        return timeProvider.now().truncatedTo(ChronoUnit.MICROS);
    }
}
