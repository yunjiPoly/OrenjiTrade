package com.orenjitrade.api.users.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.users.infra.ConsentProperties;
import com.orenjitrade.api.users.infra.LegalDocumentRepository;
import com.orenjitrade.api.users.infra.UserConsentRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Legal documents and the consents users give to them, including the 18+ attestation ({@link
 * LegalDocumentType#AGE_CONFIRMATION}): {@link #requireAgeConfirmed} is the service-layer gate
 * other modules call before a collector becomes discoverable, messages, posts in the community or
 * makes offers.
 */
@Service
public class ConsentService {

    static final int MAX_USER_AGENT_LENGTH = 512;

    /** Problem extension naming the consent to record (shared with the 428 terms problem). */
    public static final String REQUIRED_CONSENTS_PROPERTY = "requiredConsents";

    static final String AGE_CONFIRMATION_MESSAGE =
            "Confirm that you are 18 years of age or older to continue";

    private final LegalDocumentRepository legalDocuments;
    private final UserConsentRepository consents;
    private final AuditService auditService;
    private final TimeProvider timeProvider;
    private final String ipSalt;

    public ConsentService(
            LegalDocumentRepository legalDocuments,
            UserConsentRepository consents,
            AuditService auditService,
            TimeProvider timeProvider,
            ConsentProperties consentProperties) {
        this.legalDocuments = legalDocuments;
        this.consents = consents;
        this.auditService = auditService;
        this.timeProvider = timeProvider;
        this.ipSalt = consentProperties.ipSalt();
    }

    /** Every current document, for the public listing. */
    @Transactional(readOnly = true)
    public List<LegalDocumentSummary> currentDocuments() {
        return legalDocuments.findByCurrentTrueOrderByDocumentTypeAsc().stream()
                .map(
                        document ->
                                new LegalDocumentSummary(
                                        document.getDocumentType(),
                                        document.getVersion(),
                                        document.getTitle(),
                                        document.getUrl(),
                                        document.isRequiredAtRegistration()))
                .toList();
    }

    /**
     * The current versions of documents required at registration that {@code userId} has not
     * accepted yet. Empty means the user may use every route.
     */
    @Transactional(readOnly = true)
    public List<RequiredConsent> requiredConsents(UUID userId) {
        return consents.findMissingRequiredConsents(userId);
    }

    /**
     * Whether {@code userId} recorded the 18+ confirmation (any version: the attestation stays
     * valid when its wording is republished).
     */
    @Transactional(readOnly = true)
    public boolean hasConfirmedAge(UUID userId) {
        return consents.existsByUserIdAndDocumentType(userId, LegalDocumentType.AGE_CONFIRMATION);
    }

    /**
     * The service-layer 18+ gate: passes silently when the confirmation exists.
     *
     * @throws ApiException {@code 403 AGE_CONFIRMATION_REQUIRED} with the {@code requiredConsents}
     *     extension naming the current {@code AGE_CONFIRMATION} version to record
     */
    @Transactional(readOnly = true)
    public void requireAgeConfirmed(UUID userId) {
        if (hasConfirmedAge(userId)) {
            return;
        }
        ApiException problem =
                new ApiException(ErrorCode.AGE_CONFIRMATION_REQUIRED, AGE_CONFIRMATION_MESSAGE);
        legalDocuments
                .findByDocumentTypeAndCurrentTrue(LegalDocumentType.AGE_CONFIRMATION)
                .ifPresent(
                        document ->
                                problem.withProperty(
                                        REQUIRED_CONSENTS_PROPERTY,
                                        List.of(
                                                new RequiredConsent(
                                                        document.getDocumentType(),
                                                        document.getVersion()))));
        throw problem;
    }

    /** Every consent the user ever gave, newest first (admin detail, data export). */
    @Transactional(readOnly = true)
    public List<ConsentSummary> consentsOf(UUID userId) {
        return consents.findByUserIdOrderByAcceptedAtDesc(userId).stream()
                .map(
                        consent ->
                                new ConsentSummary(
                                        consent.getDocumentType(),
                                        consent.getVersion(),
                                        consent.getAcceptedAt()))
                .toList();
    }

    /**
     * Records that {@code userId} accepted {@code documentType} in {@code version}.
     *
     * @throws ApiException 404 when the document type has no current version, 409 when {@code
     *     version} is not the current one
     */
    @Transactional
    public void accept(
            UUID userId,
            LegalDocumentType documentType,
            String version,
            @Nullable String clientIp,
            @Nullable String userAgent) {
        LegalDocument current =
                legalDocuments
                        .findByDocumentTypeAndCurrentTrue(documentType)
                        .orElseThrow(
                                () ->
                                        ApiException.notFound(
                                                "No current version of " + documentType));
        if (!current.getVersion().equals(version)) {
            throw ApiException.conflict(
                    "Version "
                            + version
                            + " of "
                            + documentType
                            + " is not the current version ("
                            + current.getVersion()
                            + ")");
        }
        if (consents.existsByUserIdAndDocumentTypeAndVersion(userId, documentType, version)) {
            return; // idempotent
        }
        consents.save(
                new UserConsent(
                        userId,
                        documentType,
                        version,
                        timeProvider.now(),
                        hashIp(clientIp),
                        truncate(userAgent)));
        auditService.record(
                ActorType.USER,
                userId,
                "consent.accept",
                AuditService.TARGET_USER,
                userId.toString(),
                Map.of("documentType", documentType.name(), "version", version));
    }

    /** SHA-256 over the server salt and the address; {@code null} when the address is unknown. */
    @Nullable String hashIp(@Nullable String clientIp) {
        if (clientIp == null || clientIp.isBlank()) {
            return null;
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(ipSalt.getBytes(StandardCharsets.UTF_8));
            digest.update((byte) ':');
            digest.update(clientIp.trim().getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is mandatory in every JRE", e);
        }
    }

    private static @Nullable String truncate(@Nullable String userAgent) {
        if (userAgent == null || userAgent.isBlank()) {
            return null;
        }
        String trimmed = userAgent.trim();
        return trimmed.length() <= MAX_USER_AGENT_LENGTH
                ? trimmed
                : trimmed.substring(0, MAX_USER_AGENT_LENGTH);
    }
}
