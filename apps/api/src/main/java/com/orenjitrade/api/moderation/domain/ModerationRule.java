package com.orenjitrade.api.moderation.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * JPA entity for {@code moderation_rule} (ADR 0014: rules are data edited through the admin
 * console, never constants). Never leaves the moderation module.
 */
@Entity
@Table(name = "moderation_rule")
public class ModerationRule {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false)
    private ModerationRuleKind kind;

    @Column(name = "pattern", nullable = false)
    private String pattern;

    @Enumerated(EnumType.STRING)
    @Column(name = "action", nullable = false)
    private ModerationAction action;

    @Enumerated(EnumType.STRING)
    @Column(name = "scope", nullable = false)
    private ModerationScope scope;

    @Column(name = "active", nullable = false)
    private boolean active;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_by")
    private @Nullable UUID updatedBy;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** JPA only. */
    protected ModerationRule() {
        this.id = UUID.randomUUID();
        this.kind = ModerationRuleKind.BANNED_TERM;
        this.pattern = "";
        this.action = ModerationAction.FLAG;
        this.scope = ModerationScope.PROFILE;
        this.createdAt = Instant.EPOCH;
        this.updatedAt = Instant.EPOCH;
    }

    public UUID getId() {
        return id;
    }

    public ModerationRuleKind getKind() {
        return kind;
    }

    public String getPattern() {
        return pattern;
    }

    public ModerationAction getAction() {
        return action;
    }

    public ModerationScope getScope() {
        return scope;
    }

    public boolean isActive() {
        return active;
    }

    public @Nullable UUID getUpdatedBy() {
        return updatedBy;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
