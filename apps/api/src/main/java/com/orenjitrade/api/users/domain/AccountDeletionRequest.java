package com.orenjitrade.api.users.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** JPA entity for {@code account_deletion_request}. Never leaves the users module. */
@Entity
@Table(name = "account_deletion_request")
public class AccountDeletionRequest {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private DeletionRequestStatus status = DeletionRequestStatus.PENDING;

    @Column(name = "reason")
    private @Nullable String reason;

    @Column(name = "export_requested", nullable = false)
    private boolean exportRequested;

    @Column(name = "requested_at", nullable = false, updatable = false)
    private Instant requestedAt;

    @Column(name = "scheduled_for", nullable = false)
    private Instant scheduledFor;

    @Column(name = "cancelled_at")
    private @Nullable Instant cancelledAt;

    @Column(name = "completed_at")
    private @Nullable Instant completedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** JPA only. */
    protected AccountDeletionRequest() {
        this.id = UUID.randomUUID();
        this.userId = UUID.randomUUID();
        this.requestedAt = Instant.EPOCH;
        this.scheduledFor = Instant.EPOCH;
        this.createdAt = Instant.EPOCH;
        this.updatedAt = Instant.EPOCH;
    }

    public AccountDeletionRequest(
            UUID id,
            UUID userId,
            @Nullable String reason,
            boolean exportRequested,
            Instant requestedAt,
            Instant scheduledFor) {
        this.id = id;
        this.userId = userId;
        this.reason = reason;
        this.exportRequested = exportRequested;
        this.requestedAt = requestedAt;
        this.scheduledFor = scheduledFor;
        this.createdAt = requestedAt;
        this.updatedAt = requestedAt;
    }

    public void cancel(Instant now) {
        this.status = DeletionRequestStatus.CANCELLED;
        this.cancelledAt = now;
        this.updatedAt = now;
    }

    /** Marks the request done and drops the free-text reason (it may contain personal data). */
    public void complete(Instant now) {
        this.status = DeletionRequestStatus.COMPLETED;
        this.completedAt = now;
        this.reason = null;
        this.updatedAt = now;
    }

    public DeletionRequestView toView() {
        return new DeletionRequestView(
                id,
                userId,
                status,
                reason,
                exportRequested,
                requestedAt,
                scheduledFor,
                cancelledAt,
                completedAt);
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public DeletionRequestStatus getStatus() {
        return status;
    }

    public Instant getScheduledFor() {
        return scheduledFor;
    }
}
