package com.orenjitrade.api.users.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** JPA entity for {@code legal_document} (read-only from the application's point of view). */
@Entity
@Table(name = "legal_document")
public class LegalDocument {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "document_type", nullable = false, updatable = false)
    private LegalDocumentType documentType;

    @Column(name = "version", nullable = false, updatable = false)
    private String version;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "url", nullable = false)
    private String url;

    @Column(name = "required_at_registration", nullable = false)
    private boolean requiredAtRegistration;

    @Column(name = "published_at", nullable = false)
    private Instant publishedAt;

    @Column(name = "current", nullable = false)
    private boolean current;

    /** JPA only. */
    protected LegalDocument() {
        this.id = UUID.randomUUID();
        this.documentType = LegalDocumentType.TERMS;
        this.version = "";
        this.title = "";
        this.url = "";
        this.publishedAt = Instant.EPOCH;
    }

    public UUID getId() {
        return id;
    }

    public LegalDocumentType getDocumentType() {
        return documentType;
    }

    public String getVersion() {
        return version;
    }

    public String getTitle() {
        return title;
    }

    public String getUrl() {
        return url;
    }

    public boolean isRequiredAtRegistration() {
        return requiredAtRegistration;
    }

    public Instant getPublishedAt() {
        return publishedAt;
    }

    public boolean isCurrent() {
        return current;
    }
}
