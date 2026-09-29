package com.orenjitrade.api.audit.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.jspecify.annotations.Nullable;

/** JPA entity for {@code audit_log}. Rows are immutable once written. */
@Entity
@Table(name = "audit_log")
public class AuditLog {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "occurred_at", nullable = false, updatable = false)
    private Instant occurredAt;

    @Column(name = "actor_user_id", updatable = false)
    private @Nullable UUID actorUserId;

    @Enumerated(EnumType.STRING)
    @Column(name = "actor_type", nullable = false, updatable = false)
    private ActorType actorType;

    @Column(name = "action", nullable = false, updatable = false)
    private String action;

    @Column(name = "target_type", nullable = false, updatable = false)
    private String targetType;

    @Column(name = "target_id", updatable = false)
    private @Nullable String targetId;

    /** JSON document (serialised by {@link AuditService}); {@code jsonb} in PostgreSQL. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "details", updatable = false)
    private @Nullable String details;

    @Column(name = "request_id", updatable = false)
    private @Nullable String requestId;

    /** JPA only. */
    protected AuditLog() {
        this.id = UUID.randomUUID();
        this.occurredAt = Instant.EPOCH;
        this.actorType = ActorType.SYSTEM;
        this.action = "";
        this.targetType = "";
    }

    public AuditLog(
            UUID id,
            Instant occurredAt,
            ActorType actorType,
            @Nullable UUID actorUserId,
            String action,
            String targetType,
            @Nullable String targetId,
            @Nullable String details,
            @Nullable String requestId) {
        this.id = id;
        this.occurredAt = occurredAt;
        this.actorType = actorType;
        this.actorUserId = actorUserId;
        this.action = action;
        this.targetType = targetType;
        this.targetId = targetId;
        this.details = details;
        this.requestId = requestId;
    }

    public UUID getId() {
        return id;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public @Nullable UUID getActorUserId() {
        return actorUserId;
    }

    public ActorType getActorType() {
        return actorType;
    }

    public String getAction() {
        return action;
    }

    public String getTargetType() {
        return targetType;
    }

    public @Nullable String getTargetId() {
        return targetId;
    }

    public @Nullable String getDetails() {
        return details;
    }

    public @Nullable String getRequestId() {
        return requestId;
    }
}
