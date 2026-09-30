package com.orenjitrade.api.users.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.users.events.UserProvisionedEvent;
import com.orenjitrade.api.users.events.UserRolesChangedEvent;
import com.orenjitrade.api.users.events.UserSuspendedEvent;
import com.orenjitrade.api.users.events.UserUnsuspendedEvent;
import com.orenjitrade.api.users.infra.LastActiveThrottle;
import com.orenjitrade.api.users.infra.UserAccountProvisioner;
import com.orenjitrade.api.users.infra.UserAccountRepository;
import com.orenjitrade.api.users.infra.UserAccountSpecifications;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The users module's service interface: provisioning on first login, account state, roles and admin
 * lookups. Other modules call this class (or listen to the module's events) and never touch the
 * repositories.
 */
@Service
public class UserAccountService {

    public static final String ACTION_HANDLE_CHANGE = "user.handle.change";

    static final int MAX_PROVISION_ATTEMPTS = 5;
    static final int MAX_SEQUENTIAL_SUFFIXES = 25;

    private static final Logger log = LoggerFactory.getLogger(UserAccountService.class);

    private final UserAccountRepository repository;
    private final UserAccountProvisioner provisioner;
    private final LastActiveThrottle lastActiveThrottle;
    private final AuditService auditService;
    private final TimeProvider timeProvider;
    private final ApplicationEventPublisher events;
    private final TransactionTemplate transaction;

    public UserAccountService(
            UserAccountRepository repository,
            UserAccountProvisioner provisioner,
            LastActiveThrottle lastActiveThrottle,
            AuditService auditService,
            TimeProvider timeProvider,
            ApplicationEventPublisher events,
            PlatformTransactionManager transactionManager) {
        this.repository = repository;
        this.provisioner = provisioner;
        this.lastActiveThrottle = lastActiveThrottle;
        this.auditService = auditService;
        this.timeProvider = timeProvider;
        this.events = events;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    // ---------------------------------------------------------------------------------------
    // Authentication path
    // ---------------------------------------------------------------------------------------

    /**
     * Loads the account of a verified identity, provisioning it on the first call (role {@link
     * Role#USER}, status {@link AccountStatus#ACTIVE}, handle derived from the email). Safe under
     * concurrent first requests: the insert is {@code ON CONFLICT DO NOTHING} and the row is
     * reloaded afterwards. Expired temporary suspensions are lifted here.
     */
    public UserAccountSnapshot resolve(IdentityClaims claims) {
        Optional<UserAccountSnapshot> existing = loadAndRefresh(claims);
        if (existing.isPresent()) {
            return existing.get();
        }
        provision(claims);
        return loadAndRefresh(claims)
                .orElseThrow(
                        () ->
                                new IllegalStateException(
                                        "Account vanished right after provisioning: "
                                                + claims.providerUid()));
    }

    /** Persists {@code last_active_at} at most once per {@link LastActiveThrottle#WINDOW}. */
    public void touchLastActive(UUID userId) {
        if (!lastActiveThrottle.shouldTouch(userId)) {
            return;
        }
        Instant now = timeProvider.now();
        transaction.executeWithoutResult(status -> repository.touchLastActive(userId, now));
    }

    private Optional<UserAccountSnapshot> loadAndRefresh(IdentityClaims claims) {
        return transaction.execute(
                status -> {
                    Optional<UserAccount> found =
                            repository.findWithRolesByProviderUid(claims.providerUid());
                    if (found.isEmpty()) {
                        return Optional.empty();
                    }
                    UserAccount account = found.get();
                    Instant now = timeProvider.now();
                    if (account.getStatus() == AccountStatus.DELETED) {
                        // Anonymised: a stale token must never write personal data back.
                        return Optional.of(account.toSnapshot());
                    }
                    account.syncIdentity(claims.email(), claims.emailVerified(), now);
                    if (account.isSuspensionExpiredAt(now)) {
                        account.unsuspend(now);
                        auditService.record(
                                ActorType.SYSTEM,
                                null,
                                "user.suspension.expired",
                                AuditService.TARGET_USER,
                                account.getId().toString(),
                                Map.of());
                        events.publishEvent(new UserUnsuspendedEvent(account.getId(), now));
                    }
                    return Optional.of(account.toSnapshot());
                });
    }

    private void provision(IdentityClaims claims) {
        String base = HandleGenerator.baseFrom(claims.email());
        for (int attempt = 1; attempt <= MAX_PROVISION_ATTEMPTS; attempt++) {
            String handle = pickFreeHandle(base, attempt);
            try {
                Boolean inserted =
                        transaction.execute(
                                status -> {
                                    Instant now = timeProvider.now();
                                    UUID id = UUID.randomUUID();
                                    boolean created =
                                            provisioner.insertIfAbsent(
                                                    id,
                                                    claims.providerUid(),
                                                    claims.email(),
                                                    claims.emailVerified(),
                                                    handle,
                                                    initialDisplayName(claims, handle),
                                                    now);
                                    if (created) {
                                        events.publishEvent(
                                                new UserProvisionedEvent(id, handle, now));
                                    }
                                    return created;
                                });
                if (Boolean.TRUE.equals(inserted)) {
                    log.info("Provisioned account handle={} attempt={}", handle, attempt);
                }
                return; // inserted, or somebody else inserted the same identity meanwhile
            } catch (DataIntegrityViolationException e) {
                // Almost certainly the case-insensitive handle index: pick another handle.
                log.debug(
                        "Handle collision while provisioning handle={} attempt={}",
                        handle,
                        attempt);
            }
        }
        throw new IllegalStateException(
                "Could not provision an account after " + MAX_PROVISION_ATTEMPTS + " attempts");
    }

    /**
     * The first free candidate: the base itself, then {@code base_2}, {@code base_3}, ...; after
     * {@link #MAX_SEQUENTIAL_SUFFIXES} tries (or on retries after a race) a random numeric suffix.
     */
    private String pickFreeHandle(String base, int attempt) {
        if (attempt == 1 && isFree(base)) {
            return base;
        }
        if (attempt == 1) {
            for (int n = 2; n <= MAX_SEQUENTIAL_SUFFIXES; n++) {
                String candidate = HandleGenerator.withSuffix(base, n);
                if (isFree(candidate)) {
                    return candidate;
                }
            }
        }
        for (int tries = 0; tries < 20; tries++) {
            int random = ThreadLocalRandom.current().nextInt(1000, 1_000_000);
            String candidate = HandleGenerator.withSuffix(base, random);
            if (isFree(candidate)) {
                return candidate;
            }
        }
        return HandleGenerator.withSuffix(base, ThreadLocalRandom.current().nextInt(1_000_000));
    }

    private boolean isFree(String handle) {
        return HandleGenerator.isValid(handle)
                && !ReservedHandles.isReserved(handle)
                && !repository.existsByHandleIgnoreCase(handle);
    }

    private static String initialDisplayName(IdentityClaims claims, String handle) {
        @Nullable String name = claims.displayName();
        if (name == null || name.isBlank()) {
            return handle;
        }
        String trimmed = name.trim();
        return trimmed.length() <= 80 ? trimmed : trimmed.substring(0, 80);
    }

    // ---------------------------------------------------------------------------------------
    // Lookups
    // ---------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Optional<UserAccountSnapshot> findSnapshot(UUID userId) {
        return repository.findWithRolesById(userId).map(UserAccount::toSnapshot);
    }

    /** The plan code of an account ({@code user_account.plan_code}); empty for unknown ids. */
    @Transactional(readOnly = true)
    public Optional<String> findPlanCode(UUID userId) {
        return repository.findPlanCodeById(userId);
    }

    /**
     * The account when it may act, otherwise {@code 404} (unknown) or {@code 403 ACCOUNT_SUSPENDED}
     * (suspended, deletion pending, deleted).
     */
    /** The account holding {@code handle} (case-insensitive), whatever its status. */
    @Transactional(readOnly = true)
    public Optional<UserAccountSnapshot> findByHandle(String handle) {
        return repository
                .findWithRolesByHandleIgnoreCase(HandleRules.normalise(handle))
                .map(UserAccount::toSnapshot);
    }

    @Transactional(readOnly = true)
    public UserAccountSnapshot requireActive(UUID userId) {
        UserAccountSnapshot snapshot =
                findSnapshot(userId).orElseThrow(() -> ApiException.notFound("Account not found"));
        Instant now = timeProvider.now();
        if (snapshot.isSuspendedAt(now)) {
            throw new ApiException(ErrorCode.ACCOUNT_SUSPENDED, "This account is suspended");
        }
        return switch (snapshot.status()) {
            case DELETION_REQUESTED ->
                    throw new ApiException(ErrorCode.ACCOUNT_SUSPENDED, "deletion pending");
            case DELETED ->
                    throw new ApiException(
                            ErrorCode.ACCOUNT_SUSPENDED, "This account has been deleted");
            default -> snapshot;
        };
    }

    @Transactional(readOnly = true)
    public Page<UserAccountSnapshot> search(AdminUserQuery query, int page, int size) {
        PageRequest pageable =
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt", "id"));
        return repository
                .findAll(UserAccountSpecifications.matching(query), pageable)
                .map(UserAccount::toSnapshot);
    }

    // ---------------------------------------------------------------------------------------
    // Mutations (callers audit and disable the identity-provider user as appropriate)
    // ---------------------------------------------------------------------------------------

    @Transactional
    public UserAccountSnapshot suspend(UUID userId, String reason, @Nullable Instant until) {
        UserAccount account = load(userId);
        Instant now = timeProvider.now();
        account.suspend(reason, until, now);
        events.publishEvent(new UserSuspendedEvent(userId, until, now));
        return account.toSnapshot();
    }

    /**
     * Bans the account (Phase 7 report decision): a suspension without end plus the ban mark
     * ({@code banned_at}); an admin lifts both with {@link #unsuspend}. Callers audit and disable
     * the identity-provider user.
     */
    @Transactional
    public UserAccountSnapshot ban(UUID userId, String reason) {
        UserAccount account = load(userId);
        Instant now = timeProvider.now();
        account.ban(reason, now);
        events.publishEvent(new UserSuspendedEvent(userId, null, now));
        return account.toSnapshot();
    }

    /**
     * Ids of the accounts that can receive notices right now (ACTIVE, or SUSPENDED with an elapsed
     * end), oldest first, one page at a time (admin broadcasts). {@code staffOnly} keeps the
     * accounts holding MODERATOR, ADMIN or SUPER_ADMIN.
     */
    @Transactional(readOnly = true)
    public List<UUID> reachableAccountIds(boolean staffOnly, int page, int size) {
        Instant now = timeProvider.now();
        return repository.findReachableIds(now, staffOnly, size, (long) page * size);
    }

    @Transactional
    public UserAccountSnapshot unsuspend(UUID userId) {
        UserAccount account = load(userId);
        if (account.getStatus() != AccountStatus.SUSPENDED) {
            throw ApiException.conflict("The account is not suspended");
        }
        Instant now = timeProvider.now();
        account.unsuspend(now);
        events.publishEvent(new UserUnsuspendedEvent(userId, now));
        return account.toSnapshot();
    }

    @Transactional
    public UserAccountSnapshot replaceRoles(UUID userId, Set<Role> roles, UUID grantedBy) {
        UserAccount account = load(userId);
        Set<Role> previous = account.roleSet();
        Instant now = timeProvider.now();
        account.replaceRoles(roles, grantedBy, now);
        Set<Role> current = account.roleSet();
        if (!previous.equals(current)) {
            events.publishEvent(new UserRolesChangedEvent(userId, previous, current, now));
        }
        return account.toSnapshot();
    }

    /** Status transition used by the deletion framework (later phase). */
    @Transactional
    public UserAccountSnapshot markDeletionRequested(UUID userId) {
        UserAccount account = load(userId);
        if (account.getStatus() == AccountStatus.DELETED) {
            throw ApiException.conflict("The account is already deleted");
        }
        account.markDeletionRequested(timeProvider.now());
        return account.toSnapshot();
    }

    /** Reverses {@link #markDeletionRequested} while the grace period runs. */
    @Transactional
    public UserAccountSnapshot cancelDeletionRequest(UUID userId) {
        UserAccount account = load(userId);
        if (account.getStatus() != AccountStatus.DELETION_REQUESTED) {
            throw ApiException.conflict("No deletion is pending for this account");
        }
        account.reactivate(timeProvider.now());
        return account.toSnapshot();
    }

    /**
     * Changes the caller's handle (Phase 1 contract, "Profile"). Input is trimmed and lower-cased;
     * {@code 400 VALIDATION_FAILED} when it is not 3-24 characters of {@code [a-z0-9_]}, {@code 409
     * HANDLE_TAKEN} when it is reserved or used by another account (case-insensitive). Keeping the
     * current handle is always allowed (seed staff accounts carry reserved handles). Audited.
     */
    @Transactional
    public UserAccountSnapshot changeHandle(UUID userId, String rawHandle) {
        String handle = HandleRules.normalise(rawHandle);
        if (HandleRules.check(handle).orElse(null) == HandleRules.Violation.INVALID_FORMAT) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(
                            new ProblemFieldError(
                                    "handle",
                                    "must be 3 to 24 characters: lower-case letters, digits or"
                                            + " underscores")));
        }
        UserAccount account = load(userId);
        if (account.getHandle().equals(handle)) {
            return account.toSnapshot();
        }
        if (HandleRules.check(handle).isPresent()
                || repository.existsByHandleIgnoreCaseAndIdNot(handle, userId)) {
            throw new ApiException(ErrorCode.HANDLE_TAKEN, "This handle is not available");
        }
        String previous = account.getHandle();
        account.changeHandle(handle, timeProvider.now());
        repository.flush();
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("previousHandle", previous);
        details.put("handle", handle);
        auditService.record(
                ActorType.USER,
                userId,
                ACTION_HANDLE_CHANGE,
                AuditService.TARGET_USER,
                userId.toString(),
                details);
        return account.toSnapshot();
    }

    /** Mirrors the profile display name on the account (shown by {@code /me} and admin views). */
    @Transactional
    public UserAccountSnapshot changeDisplayName(UUID userId, String displayName) {
        UserAccount account = load(userId);
        if (!displayName.equals(account.getDisplayName())) {
            account.changeDisplayName(displayName, timeProvider.now());
        }
        return account.toSnapshot();
    }

    /**
     * Irreversibly anonymises the account (deletion job): placeholder email, handle and display
     * name, status {@code DELETED}, only {@code USER} kept. Consents and audit rows stay attached.
     */
    @Transactional
    public UserAccountSnapshot anonymise(UUID userId) {
        UserAccount account = load(userId);
        account.anonymise(timeProvider.now());
        return account.toSnapshot();
    }

    @Transactional
    public UserAccountSnapshot changePlan(UUID userId, String planCode) {
        UserAccount account = load(userId);
        account.changePlan(planCode, timeProvider.now());
        return account.toSnapshot();
    }

    private UserAccount load(UUID userId) {
        return repository
                .findWithRolesById(userId)
                .orElseThrow(() -> ApiException.notFound("Account not found"));
    }
}
