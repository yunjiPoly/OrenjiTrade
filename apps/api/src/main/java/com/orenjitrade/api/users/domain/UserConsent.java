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

/** JPA entity for {@code user_consent}: acceptance of one legal document version by one user. */
@Entity
@Table(name = "user_consent")
public class UserConsent {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "document_type", nullable = false, updatable = false)
    private LegalDocumentType documentType;

    @Column(name = "version", nullable = false, updatable = false)
    private String version;

    @Column(name = "accepted_at", nullable = false, updatable = false)
    private Instant acceptedAt;

    @Column(name = "ip_hash", updatable = false)
    private @Nullable String ipHash;

    @Column(name = "user_agent", updatable = false)
    private @Nullable String userAgent;

    /** Language of the text shown when the consent was given ({@link ConsentLanguage}). */
    @Column(name = "language", nullable = false, updatable = false)
    private String language;

    /** JPA only. */
    protected UserConsent() {
        this.id = UUID.randomUUID();
        this.userId = new UUID(0, 0);
        this.documentType = LegalDocumentType.TERMS;
        this.version = "";
        this.acceptedAt = Instant.EPOCH;
        this.language = ConsentLanguage.ENGLISH;
    }

    public UserConsent(
            UUID userId,
            LegalDocumentType documentType,
            String version,
            Instant acceptedAt,
            @Nullable String ipHash,
            @Nullable String userAgent,
            String language) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.documentType = documentType;
        this.version = version;
        this.acceptedAt = acceptedAt;
        this.ipHash = ipHash;
        this.userAgent = userAgent;
        this.language = ConsentLanguage.normalize(language);
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public LegalDocumentType getDocumentType() {
        return documentType;
    }

    public String getVersion() {
        return version;
    }

    public Instant getAcceptedAt() {
        return acceptedAt;
    }

    public @Nullable String getIpHash() {
        return ipHash;
    }

    public @Nullable String getUserAgent() {
        return userAgent;
    }

    public String getLanguage() {
        return language;
    }
}
