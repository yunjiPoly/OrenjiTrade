package com.orenjitrade.api.jobs.domain;

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

/** JPA entity for {@code job_run}: one execution of an internal job. */
@Entity
@Table(name = "job_run")
public class JobRun {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "name", nullable = false, updatable = false)
    private String name;

    @Column(name = "started_at", nullable = false, updatable = false)
    private Instant startedAt;

    @Column(name = "finished_at")
    private @Nullable Instant finishedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private JobRunStatus status = JobRunStatus.RUNNING;

    /** JSON document with counters or an error summary; {@code jsonb} in PostgreSQL. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "details")
    private @Nullable String details;

    /** JPA only. */
    protected JobRun() {
        this.id = UUID.randomUUID();
        this.name = "";
        this.startedAt = Instant.EPOCH;
    }

    public JobRun(String name, Instant startedAt) {
        this.id = UUID.randomUUID();
        this.name = name;
        this.startedAt = startedAt;
    }

    public void succeed(Instant finishedAt, @Nullable String details) {
        this.status = JobRunStatus.SUCCEEDED;
        this.finishedAt = finishedAt;
        this.details = details;
    }

    public void fail(Instant finishedAt, @Nullable String details) {
        this.status = JobRunStatus.FAILED;
        this.finishedAt = finishedAt;
        this.details = details;
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public @Nullable Instant getFinishedAt() {
        return finishedAt;
    }

    public JobRunStatus getStatus() {
        return status;
    }

    public @Nullable String getDetails() {
        return details;
    }
}
