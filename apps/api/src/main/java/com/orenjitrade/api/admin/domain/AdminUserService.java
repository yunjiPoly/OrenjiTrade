package com.orenjitrade.api.admin.domain;

import com.orenjitrade.api.admin.api.AdminUserDetail;
import com.orenjitrade.api.admin.api.AdminUserSummary;
import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditQueryService;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.auth.domain.IdentityAdminClient;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.users.domain.AdminUserQuery;
import com.orenjitrade.api.users.domain.AvatarUrlProvider;
import com.orenjitrade.api.users.domain.ConsentService;
import com.orenjitrade.api.users.domain.UserAccountService;
import com.orenjitrade.api.users.domain.UserAccountSnapshot;
import java.time.Instant;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Admin console operations on accounts. Every write is audited in the same transaction and, for
 * suspensions, mirrored to the identity provider (the Firebase user is disabled so sessions cannot
 * be refreshed).
 */
@Service
public class AdminUserService {

    public static final String ACTION_SUSPEND = "user.suspend";
    public static final String ACTION_UNSUSPEND = "user.unsuspend";
    public static final String ACTION_ROLES = "user.roles.update";
    static final int RECENT_AUDIT_ENTRIES = 20;

    private final UserAccountService userAccountService;
    private final ConsentService consentService;
    private final AuditService auditService;
    private final AuditQueryService auditQueryService;
    private final IdentityAdminClient identityAdminClient;
    private final ObjectProvider<AvatarUrlProvider> avatarUrlProvider;
    private final List<AdminUserDetailContributor> detailContributors;

    public AdminUserService(
            UserAccountService userAccountService,
            ConsentService consentService,
            AuditService auditService,
            AuditQueryService auditQueryService,
            IdentityAdminClient identityAdminClient,
            ObjectProvider<AvatarUrlProvider> avatarUrlProvider,
            List<AdminUserDetailContributor> detailContributors) {
        this.userAccountService = userAccountService;
        this.consentService = consentService;
        this.auditService = auditService;
        this.auditQueryService = auditQueryService;
        this.identityAdminClient = identityAdminClient;
        this.avatarUrlProvider = avatarUrlProvider;
        this.detailContributors = List.copyOf(detailContributors);
    }

    @Transactional(readOnly = true)
    public Page<AdminUserSummary> list(AdminUserQuery query, int page, int size) {
        return userAccountService.search(query, page, size).map(this::toSummary);
    }

    @Transactional(readOnly = true)
    public AdminUserDetail detail(UUID userId) {
        UserAccountSnapshot account =
                userAccountService
                        .findSnapshot(userId)
                        .orElseThrow(() -> ApiException.notFound("Account not found"));
        @Nullable String locationLabel = null;
        @Nullable DeletionRequestSummary deletionRequest = null;
        for (AdminUserDetailContributor contributor : detailContributors) {
            if (locationLabel == null) {
                locationLabel = contributor.locationLabel(userId);
            }
            if (deletionRequest == null) {
                deletionRequest = contributor.deletionRequest(userId);
            }
        }
        return new AdminUserDetail(
                toSummary(account),
                account.suspensionReason(),
                account.updatedAt(),
                account.deletedAt(),
                consentService.consentsOf(userId),
                locationLabel,
                deletionRequest,
                auditQueryService.recentForTarget(
                        AuditService.TARGET_USER, userId.toString(), RECENT_AUDIT_ENTRIES),
                account.bannedAt());
    }

    @Transactional
    public void suspend(
            AuthenticatedUser actor, UUID targetId, String reason, @Nullable Instant until) {
        UserAccountSnapshot target = requireTarget(targetId);
        if (target.id().equals(actor.userId())) {
            throw ApiException.conflict("You cannot suspend your own account");
        }
        if (target.hasAnyRole(Role.ADMIN, Role.SUPER_ADMIN) && !actor.hasRole(Role.SUPER_ADMIN)) {
            throw ApiException.forbidden("Only a SUPER_ADMIN can suspend an administrator");
        }
        if (target.status() == com.orenjitrade.api.auth.domain.AccountStatus.DELETED) {
            throw ApiException.conflict("The account is deleted");
        }
        userAccountService.suspend(targetId, reason, until);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("reason", reason);
        details.put("until", until == null ? null : until.toString());
        details.put("previousStatus", target.status().name());
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                ACTION_SUSPEND,
                AuditService.TARGET_USER,
                targetId.toString(),
                withoutNulls(details));
        identityAdminClient.disableUser(target.providerUid());
    }

    @Transactional
    public void unsuspend(AuthenticatedUser actor, UUID targetId) {
        UserAccountSnapshot target = requireTarget(targetId);
        userAccountService.unsuspend(targetId);
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                ACTION_UNSUSPEND,
                AuditService.TARGET_USER,
                targetId.toString(),
                Map.of());
        identityAdminClient.enableUser(target.providerUid());
    }

    /**
     * Replaces the role set. Rules: {@code USER} is always kept; only a {@code SUPER_ADMIN} may
     * grant or revoke {@code ADMIN}/{@code SUPER_ADMIN}; nobody removes their own {@code
     * SUPER_ADMIN}.
     */
    @Transactional
    public void updateRoles(AuthenticatedUser actor, UUID targetId, Set<Role> requested) {
        UserAccountSnapshot target = requireTarget(targetId);
        Set<Role> wanted = EnumSet.noneOf(Role.class);
        wanted.addAll(requested);
        wanted.add(Role.USER);
        Set<Role> current = EnumSet.noneOf(Role.class);
        current.addAll(target.roles());

        Set<Role> changed = EnumSet.noneOf(Role.class);
        for (Role role : Role.values()) {
            if (wanted.contains(role) != current.contains(role)) {
                changed.add(role);
            }
        }
        boolean touchesPrivileged = changed.stream().anyMatch(Role::isPrivileged);
        if (touchesPrivileged && !actor.hasRole(Role.SUPER_ADMIN)) {
            throw ApiException.forbidden(
                    "Only a SUPER_ADMIN can grant or revoke ADMIN or SUPER_ADMIN");
        }
        if (target.id().equals(actor.userId())
                && current.contains(Role.SUPER_ADMIN)
                && !wanted.contains(Role.SUPER_ADMIN)) {
            throw ApiException.conflict("You cannot remove your own SUPER_ADMIN role");
        }
        if (changed.isEmpty()) {
            return;
        }
        userAccountService.replaceRoles(targetId, wanted, actor.userId());
        Map<String, Object> details = new HashMap<>();
        details.put("previousRoles", current.stream().map(Role::name).sorted().toList());
        details.put("roles", wanted.stream().map(Role::name).sorted().toList());
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                ACTION_ROLES,
                AuditService.TARGET_USER,
                targetId.toString(),
                details);
    }

    private UserAccountSnapshot requireTarget(UUID targetId) {
        return userAccountService
                .findSnapshot(targetId)
                .orElseThrow(() -> ApiException.notFound("Account not found"));
    }

    private AdminUserSummary toSummary(UserAccountSnapshot account) {
        @Nullable AvatarUrlProvider avatars = avatarUrlProvider.getIfAvailable();
        return new AdminUserSummary(
                account.id(),
                account.handle(),
                account.displayName(),
                account.email(),
                account.emailVerified(),
                account.status(),
                account.roles(),
                account.planCode(),
                avatars == null ? null : avatars.avatarUrlOf(account.id()),
                account.createdAt(),
                account.lastActiveAt(),
                account.suspendedUntil());
    }

    private static Map<String, Object> withoutNulls(Map<String, Object> map) {
        Map<String, Object> copy = new LinkedHashMap<>();
        map.forEach(
                (key, value) -> {
                    if (value != null) {
                        copy.put(key, value);
                    }
                });
        return copy;
    }
}
