package com.orenjitrade.api.users.domain;

import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.auth.domain.Role;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Collections;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.jspecify.annotations.Nullable;

/**
 * JPA entity for {@code user_account}. Never leaves the users module: controllers and other modules
 * work with {@link UserAccountSnapshot}.
 */
@Entity
@Table(name = "user_account")
public class UserAccount {

    /** Display name of anonymised (deleted) accounts. */
    public static final String ANONYMISED_DISPLAY_NAME = "Deleted collector";

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "provider_uid", nullable = false, updatable = false)
    private String providerUid;

    @Column(name = "email")
    private @Nullable String email;

    @Column(name = "email_verified", nullable = false)
    private boolean emailVerified;

    @Column(name = "handle", nullable = false)
    private String handle;

    @Column(name = "display_name")
    private @Nullable String displayName;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private AccountStatus status = AccountStatus.ACTIVE;

    @Column(name = "suspended_until")
    private @Nullable Instant suspendedUntil;

    @Column(name = "suspension_reason")
    private @Nullable String suspensionReason;

    @Column(name = "plan_code", nullable = false)
    private String planCode = PlanCode.FREE;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "last_active_at")
    private @Nullable Instant lastActiveAt;

    @Column(name = "deleted_at")
    private @Nullable Instant deletedAt;

    @Column(name = "banned_at")
    private @Nullable Instant bannedAt;

    @OneToMany(
            mappedBy = "user",
            cascade = CascadeType.ALL,
            orphanRemoval = true,
            fetch = FetchType.LAZY)
    private Set<UserRole> roles = new HashSet<>();

    /** JPA only. */
    protected UserAccount() {
        this.id = UUID.randomUUID();
        this.providerUid = "";
        this.handle = "";
        this.createdAt = Instant.EPOCH;
        this.updatedAt = Instant.EPOCH;
    }

    public UserAccount(
            UUID id,
            String providerUid,
            @Nullable String email,
            boolean emailVerified,
            String handle,
            @Nullable String displayName,
            Instant now) {
        this.id = id;
        this.providerUid = providerUid;
        this.email = email;
        this.emailVerified = emailVerified;
        this.handle = handle;
        this.displayName = displayName;
        this.createdAt = now;
        this.updatedAt = now;
        this.lastActiveAt = now;
    }

    // --- behaviour ---------------------------------------------------------------------------

    /** Adds a role (no-op when already granted). */
    public void grantRole(Role role, @Nullable UUID grantedBy, Instant now) {
        if (!hasRole(role)) {
            roles.add(new UserRole(this, role, grantedBy, now));
            touch(now);
        }
    }

    /** Revokes a role (no-op when absent). {@link Role#USER} is never revoked. */
    public void revokeRole(Role role, Instant now) {
        if (role == Role.USER) {
            return;
        }
        if (roles.removeIf(userRole -> userRole.getRole() == role)) {
            touch(now);
        }
    }

    /** Replaces the role set; {@link Role#USER} is always kept. */
    public void replaceRoles(Set<Role> target, @Nullable UUID grantedBy, Instant now) {
        Set<Role> wanted = EnumSet.copyOf(target);
        wanted.add(Role.USER);
        for (Role role : EnumSet.allOf(Role.class)) {
            if (wanted.contains(role)) {
                grantRole(role, grantedBy, now);
            } else {
                revokeRole(role, now);
            }
        }
    }

    public boolean hasRole(Role role) {
        return roles.stream().anyMatch(userRole -> userRole.getRole() == role);
    }

    public Set<Role> roleSet() {
        Set<Role> set = roles.stream().map(UserRole::getRole).collect(Collectors.toSet());
        return set.isEmpty() ? EnumSet.noneOf(Role.class) : EnumSet.copyOf(set);
    }

    public void suspend(String reason, @Nullable Instant until, Instant now) {
        this.status = AccountStatus.SUSPENDED;
        this.suspensionReason = reason;
        this.suspendedUntil = until;
        touch(now);
    }

    public void unsuspend(Instant now) {
        this.status = AccountStatus.ACTIVE;
        this.suspensionReason = null;
        this.suspendedUntil = null;
        this.bannedAt = null;
        touch(now);
    }

    /** A ban: a suspension without end plus the ban mark (lifted by {@link #unsuspend}). */
    public void ban(String reason, Instant now) {
        suspend(reason, null, now);
        this.bannedAt = now;
    }

    /** Whether a suspension is in force at {@code now} (temporary suspensions expire). */
    public boolean isSuspendedAt(Instant now) {
        return status == AccountStatus.SUSPENDED
                && (suspendedUntil == null || suspendedUntil.isAfter(now));
    }

    /** Whether a temporary suspension has elapsed and the account should be reactivated. */
    public boolean isSuspensionExpiredAt(Instant now) {
        return status == AccountStatus.SUSPENDED
                && suspendedUntil != null
                && !suspendedUntil.isAfter(now);
    }

    public void markDeletionRequested(Instant now) {
        this.status = AccountStatus.DELETION_REQUESTED;
        touch(now);
    }

    public void reactivate(Instant now) {
        this.status = AccountStatus.ACTIVE;
        touch(now);
    }

    /** Syncs identity-provider attributes that may change between logins. */
    public boolean syncIdentity(@Nullable String email, boolean emailVerified, Instant now) {
        boolean changed = false;
        if (email != null && !email.equals(this.email)) {
            this.email = email;
            changed = true;
        }
        if (emailVerified != this.emailVerified) {
            this.emailVerified = emailVerified;
            changed = true;
        }
        if (changed) {
            touch(now);
        }
        return changed;
    }

    public void changeHandle(String handle, Instant now) {
        this.handle = handle;
        touch(now);
    }

    public void changeDisplayName(@Nullable String displayName, Instant now) {
        this.displayName = displayName;
        touch(now);
    }

    /**
     * Irreversibly strips every personal attribute (account deletion job): the row stays so that
     * consents, audit entries and ledgers keep a valid reference, but nothing identifies the person
     * any more. Only {@link Role#USER} is kept. The provider uid is kept on purpose: the job
     * deletes the identity-provider user, and an ID token issued before that (valid for up to an
     * hour) must hit this {@code DELETED} row (403) instead of provisioning a new, empty account.
     */
    public void anonymise(Instant now) {
        String compact = id.toString().replace("-", "");
        this.email = "deleted+" + id + "@anonymized.invalid";
        this.emailVerified = false;
        this.handle = "deleted_" + compact.substring(0, 16);
        this.displayName = ANONYMISED_DISPLAY_NAME;
        this.status = AccountStatus.DELETED;
        this.suspendedUntil = null;
        this.suspensionReason = null;
        this.planCode = PlanCode.FREE;
        this.lastActiveAt = null;
        this.deletedAt = now;
        roles.removeIf(userRole -> userRole.getRole() != Role.USER);
        touch(now);
    }

    public void changePlan(String planCode, Instant now) {
        this.planCode = planCode;
        touch(now);
    }

    public void recordActivity(Instant now) {
        this.lastActiveAt = now;
    }

    private void touch(Instant now) {
        this.updatedAt = now;
    }

    public UserAccountSnapshot toSnapshot() {
        return new UserAccountSnapshot(
                id,
                providerUid,
                email,
                emailVerified,
                handle,
                displayName,
                status,
                suspendedUntil,
                suspensionReason,
                planCode,
                Collections.unmodifiableSet(roleSet()),
                createdAt,
                updatedAt,
                lastActiveAt,
                deletedAt,
                bannedAt);
    }

    // --- accessors ---------------------------------------------------------------------------

    public UUID getId() {
        return id;
    }

    public String getProviderUid() {
        return providerUid;
    }

    public @Nullable String getEmail() {
        return email;
    }

    public boolean isEmailVerified() {
        return emailVerified;
    }

    public String getHandle() {
        return handle;
    }

    public @Nullable String getDisplayName() {
        return displayName;
    }

    public AccountStatus getStatus() {
        return status;
    }

    public @Nullable Instant getSuspendedUntil() {
        return suspendedUntil;
    }

    public @Nullable String getSuspensionReason() {
        return suspensionReason;
    }

    public String getPlanCode() {
        return planCode;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public @Nullable Instant getLastActiveAt() {
        return lastActiveAt;
    }

    public @Nullable Instant getDeletedAt() {
        return deletedAt;
    }

    Set<UserRole> getRoles() {
        return roles;
    }
}
