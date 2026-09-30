package com.orenjitrade.api.users.domain;

import com.orenjitrade.api.auth.domain.Role;
import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** JPA entity for {@code user_role}: one row per (user, role). */
@Entity
@Table(name = "user_role")
public class UserRole {

    @EmbeddedId private UserRoleId id;

    @MapsId("userId")
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private UserAccount user;

    @Column(name = "granted_at", nullable = false)
    private Instant grantedAt;

    @Column(name = "granted_by")
    private @Nullable UUID grantedBy;

    /** JPA only. */
    protected UserRole() {
        this.id = new UserRoleId();
        this.user = new UserAccount();
        this.grantedAt = Instant.EPOCH;
    }

    UserRole(UserAccount user, Role role, @Nullable UUID grantedBy, Instant grantedAt) {
        this.id = new UserRoleId(user.getId(), role);
        this.user = user;
        this.grantedBy = grantedBy;
        this.grantedAt = grantedAt;
    }

    public Role getRole() {
        return id.getRole();
    }

    public Instant getGrantedAt() {
        return grantedAt;
    }

    public @Nullable UUID getGrantedBy() {
        return grantedBy;
    }

    UserAccount getUser() {
        return user;
    }
}
