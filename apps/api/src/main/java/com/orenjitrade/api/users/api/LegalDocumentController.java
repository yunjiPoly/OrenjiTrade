package com.orenjitrade.api.users.api;

import com.orenjitrade.api.users.domain.ConsentService;
import com.orenjitrade.api.users.domain.LegalDocumentSummary;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code GET /api/v1/public/legal/documents}: the current legal documents (no auth). */
@RestController
@RequestMapping(
        path = "/api/v1/public/legal/documents",
        produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "legal", description = "Published legal documents")
public class LegalDocumentController {

    private final ConsentService consentService;

    public LegalDocumentController(ConsentService consentService) {
        this.consentService = consentService;
    }

    @GetMapping
    @Operation(operationId = "listLegalDocuments", summary = "Current legal documents (public)")
    @SecurityRequirements
    public List<LegalDocumentSummary> list() {
        return consentService.currentDocuments();
    }
}
