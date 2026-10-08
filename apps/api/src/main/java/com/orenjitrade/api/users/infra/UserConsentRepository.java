package com.orenjitrade.api.users.infra;

import com.orenjitrade.api.users.domain.LegalDocumentType;
import com.orenjitrade.api.users.domain.RequiredConsent;
import com.orenjitrade.api.users.domain.UserConsent;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserConsentRepository extends JpaRepository<UserConsent, UUID> {

    boolean existsByUserIdAndDocumentTypeAndVersion(
            UUID userId, LegalDocumentType documentType, String version);

    List<UserConsent> findByUserIdOrderByAcceptedAtDesc(UUID userId);

    /**
     * Whether the user accepted any version of {@code documentType} (attestations never expire).
     */
    boolean existsByUserIdAndDocumentType(UUID userId, LegalDocumentType documentType);

    /** Current versions of required documents without a matching consent row for the user. */
    @Query(
            """
            select new com.orenjitrade.api.users.domain.RequiredConsent(d.documentType, d.version)
            from LegalDocument d
            where d.current = true and d.requiredAtRegistration = true
              and not exists (
                  select 1 from UserConsent c
                  where c.userId = :userId
                    and c.documentType = d.documentType
                    and c.version = d.version)
            order by d.documentType
            """)
    List<RequiredConsent> findMissingRequiredConsents(@Param("userId") UUID userId);
}
