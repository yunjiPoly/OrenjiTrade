package com.orenjitrade.api.users.infra;

import com.orenjitrade.api.users.domain.LegalDocument;
import com.orenjitrade.api.users.domain.LegalDocumentType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LegalDocumentRepository extends JpaRepository<LegalDocument, UUID> {

    List<LegalDocument> findByCurrentTrueOrderByDocumentTypeAsc();

    Optional<LegalDocument> findByDocumentTypeAndCurrentTrue(LegalDocumentType documentType);
}
