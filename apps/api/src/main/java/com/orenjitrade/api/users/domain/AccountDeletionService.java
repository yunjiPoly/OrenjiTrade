package com.orenjitrade.api.users.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.auth.domain.IdentityAdminClient;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.users.events.AccountDeletedEvent;
import com.orenjitrade.api.users.events.AccountDeletionCancelledEvent;
import com.orenjitrade.api.users.events.AccountDeletionRequestedEvent;
import com.orenjitrade.api.users.infra.AccountDeletionRequestRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Account deletion framework (Phase 1 contract, "Account deletion and export"):
 *
 * <ol>
 *   <li>{@link #request}: needs a fresh sign-in ({@code auth_time} within {@code
 *       orenji.account.reauth-window}), asks every {@link DeletionParticipant} for blockers ({@code
 *       409 DELETION_BLOCKED}), stores a {@code PENDING} request due after the grace period, sets
 *       the account to {@code DELETION_REQUESTED}, lets participants hide public traces and revokes
 *       every identity-provider session (signed out everywhere). The identity itself stays enabled
 *       so the owner can sign in again during the grace period, see only {@code GET /me}, their
 *       export and the deletion endpoints, and cancel.
 *   <li>{@link #cancel}: during the grace period, reverses all of the above.
 *   <li>{@link #processDue}: the {@code account-deletion} job; per due request and in its own
 *       transaction, purges every participant, anonymises the account, deletes the
 *       identity-provider user and completes the request. Consents, audit entries and ledgers are
 *       kept.
 * </ol>
 */
@Service
public class AccountDeletionService {

    public static final String ACTION_REQUEST = "account.deletion.request";
    public static final String ACTION_CANCEL = "account.deletion.cancel";
    public static final String ACTION_COMPLETE = "account.deletion.complete";
    public static final String BLOCKERS = "blockers";

    static final Set<DeletionRequestStatus> ACTIVE =
            EnumSet.of(DeletionRequestStatus.PENDING, DeletionRequestStatus.PROCESSING);

    private static final Logger log = LoggerFactory.getLogger(AccountDeletionService.class);

    private final AccountDeletionRequestRepository repository;
    private final UserAccountService userAccountService;
    private final List<DeletionParticipant> participants;
    private final AuditService auditService;
    private final IdentityAdminClient identityAdminClient;
    private final TimeProvider timeProvider;
    private final ApplicationEventPublisher events;
    private final AccountLifecycleProperties properties;
    private final TransactionTemplate transaction;

    public AccountDeletionService(
            AccountDeletionRequestRepository repository,
            UserAccountService userAccountService,
            List<DeletionParticipant> participants,
            AuditService auditService,
            IdentityAdminClient identityAdminClient,
            TimeProvider timeProvider,
            ApplicationEventPublisher events,
            AccountLifecycleProperties properties,
            PlatformTransactionManager transactionManager) {
        this.repository = repository;
        this.userAccountService = userAccountService;
        this.participants = List.copyOf(participants);
        this.auditService = auditService;
        this.identityAdminClient = identityAdminClient;
        this.timeProvider = timeProvider;
        this.events = events;
        this.properties = properties;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    // ---------------------------------------------------------------------------------------
    // Owner operations
    // ---------------------------------------------------------------------------------------

    /**
     * Requests the deletion of {@code userId}'s account.
     *
     * @param authTime when the caller last signed in with the identity provider (ID token {@code
     *     auth_time})
     * @throws ApiException {@code 401 REAUTHENTICATION_REQUIRED}, {@code 409 CONFLICT} (already
     *     pending) or {@code 409 DELETION_BLOCKED} (with the {@code blockers} extension)
     */
    @Transactional
    public DeletionRequestView request(
            UUID userId, Instant authTime, @Nullable String reason, boolean exportFirst) {
        Instant now = timeProvider.now();
        Duration window = properties.reauthWindow();
        if (authTime.isBefore(now.minus(window))) {
            throw new ApiException(
                    ErrorCode.REAUTHENTICATION_REQUIRED,
                    "Sign in again (within the last "
                            + window.toMinutes()
                            + " minutes) to delete your account");
        }
        UserAccountSnapshot account =
                userAccountService
                        .findSnapshot(userId)
                        .orElseThrow(() -> ApiException.notFound("Account not found"));
        if (account.status() == AccountStatus.DELETION_REQUESTED
                || repository.existsByUserIdAndStatusIn(userId, ACTIVE)) {
            throw ApiException.conflict("A deletion request is already pending");
        }
        if (account.status() == AccountStatus.DELETED) {
            throw ApiException.conflict("The account is already deleted");
        }
        List<String> blockers = blockersOf(userId);
        if (!blockers.isEmpty()) {
            throw new ApiException(
                            ErrorCode.DELETION_BLOCKED,
                            "The account cannot be deleted while obligations are open")
                    .withProperty(BLOCKERS, blockers);
        }
        Instant scheduledFor = now.plus(Duration.ofDays(properties.deletionGraceDays()));
        AccountDeletionRequest request =
                new AccountDeletionRequest(
                        UUID.randomUUID(),
                        userId,
                        blankToNull(reason),
                        exportFirst,
                        now,
                        scheduledFor);
        repository.saveAndFlush(request);
        userAccountService.markDeletionRequested(userId);
        participants.forEach(participant -> participant.onDeletionRequested(userId));
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("requestId", request.getId().toString());
        details.put("scheduledFor", scheduledFor.toString());
        details.put("exportRequested", exportFirst);
        auditService.record(
                ActorType.USER,
                userId,
                ACTION_REQUEST,
                AuditService.TARGET_USER,
                userId.toString(),
                details);
        events.publishEvent(
                new AccountDeletionRequestedEvent(userId, request.getId(), scheduledFor, now));
        identityAdminClient.revokeSessions(account.providerUid());
        log.info("Account deletion requested user={} request={}", userId, request.getId());
        return request.toView();
    }

    /**
     * Cancels a pending request of the caller during the grace period ({@code 404} when the request
     * is not theirs, {@code 409} when it is no longer cancellable).
     */
    @Transactional
    public void cancel(UUID userId, UUID requestId) {
        AccountDeletionRequest request =
                repository
                        .findByIdAndUserId(requestId, userId)
                        .orElseThrow(() -> ApiException.notFound("Deletion request not found"));
        Instant now = timeProvider.now();
        if (request.getStatus() != DeletionRequestStatus.PENDING
                || !request.getScheduledFor().isAfter(now)) {
            throw ApiException.conflict("The deletion request can no longer be cancelled");
        }
        request.cancel(now);
        userAccountService.cancelDeletionRequest(userId);
        participants.forEach(participant -> participant.onDeletionCancelled(userId));
        auditService.record(
                ActorType.USER,
                userId,
                ACTION_CANCEL,
                AuditService.TARGET_USER,
                userId.toString(),
                Map.of("requestId", requestId.toString()));
        events.publishEvent(new AccountDeletionCancelledEvent(userId, requestId, now));
        log.info("Account deletion cancelled user={} request={}", userId, requestId);
    }

    /** Every request of the owner, newest first. */
    @Transactional(readOnly = true)
    public List<DeletionRequestView> requestsOf(UUID userId) {
        return repository.findByUserIdOrderByRequestedAtDesc(userId).stream()
                .map(AccountDeletionRequest::toView)
                .toList();
    }

    /** The pending (or processing) request of the account, if any. */
    @Transactional(readOnly = true)
    public Optional<DeletionRequestView> activeRequestOf(UUID userId) {
        return repository
                .findFirstByUserIdAndStatusIn(userId, ACTIVE)
                .map(AccountDeletionRequest::toView);
    }

    /** Blockers reported by every participant, de-duplicated and sorted. */
    public List<String> blockersOf(UUID userId) {
        Set<String> blockers = new TreeSet<>();
        participants.forEach(participant -> blockers.addAll(participant.blockers(userId)));
        return List.copyOf(blockers);
    }

    // ---------------------------------------------------------------------------------------
    // Job
    // ---------------------------------------------------------------------------------------

    /**
     * Processes every request whose grace period is over. Each request runs in its own transaction
     * so one failure (for example the identity provider being unreachable) leaves that request
     * {@code PENDING} for the next run without blocking the others.
     */
    public DeletionJobResult processDue() {
        Instant now = timeProvider.now();
        List<UUID> due =
                transaction.execute(
                        status ->
                                repository.findDueIds(
                                        DeletionRequestStatus.PENDING,
                                        now,
                                        Limit.of(properties.deletionBatchSize())));
        int processed = 0;
        int skipped = 0;
        int failed = 0;
        for (UUID requestId : due == null ? List.<UUID>of() : due) {
            try {
                Boolean done = transaction.execute(status -> processOne(requestId, now));
                if (Boolean.TRUE.equals(done)) {
                    processed++;
                } else {
                    skipped++;
                }
            } catch (RuntimeException e) {
                failed++;
                log.error("Account deletion failed for request {}", requestId, e);
            }
        }
        return new DeletionJobResult(processed, skipped, failed);
    }

    private boolean processOne(UUID requestId, Instant now) {
        Optional<AccountDeletionRequest> locked = repository.lockDue(requestId, now);
        if (locked.isEmpty()) {
            return false; // cancelled meanwhile, or handled by another instance
        }
        AccountDeletionRequest request = locked.get();
        UUID userId = request.getUserId();
        UserAccountSnapshot account =
                userAccountService
                        .findSnapshot(userId)
                        .orElseThrow(() -> new IllegalStateException("Account vanished"));
        String providerUid = account.providerUid();
        for (DeletionParticipant participant : participants) {
            participant.purge(userId);
        }
        userAccountService.anonymise(userId);
        // Reload: a participant may have cleared the persistence context (the row lock is kept).
        repository
                .findById(requestId)
                .orElseThrow(() -> new IllegalStateException("Deletion request vanished"))
                .complete(timeProvider.now());
        repository.flush();
        auditService.record(
                ActorType.SYSTEM,
                null,
                ACTION_COMPLETE,
                AuditService.TARGET_USER,
                userId.toString(),
                Map.of(
                        "requestId",
                        requestId.toString(),
                        "participants",
                        participants.stream().map(DeletionParticipant::name).toList()));
        events.publishEvent(new AccountDeletedEvent(userId, requestId, timeProvider.now()));
        identityAdminClient.deleteUser(providerUid); // idempotent: a missing user is ignored
        log.info("Account deleted user={} request={}", userId, requestId);
        return true;
    }

    private static @Nullable String blankToNull(@Nullable String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    /**
     * Outcome of one job run.
     *
     * @param processed requests completed
     * @param skipped due requests cancelled or taken by another instance meanwhile
     * @param failed requests left pending after an error
     */
    public record DeletionJobResult(int processed, int skipped, int failed) {}
}
