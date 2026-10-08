package com.orenjitrade.api.users.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.users.domain.ConsentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** {@code POST /api/v1/me/consents}: accept the current version of a legal document. */
@RestController
@RequestMapping(path = "/api/v1/me/consents")
@Tag(name = "me", description = "The authenticated collector's own account")
public class ConsentController {

    private final ConsentService consentService;

    public ConsentController(ConsentService consentService) {
        this.consentService = consentService;
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "acceptConsent",
            summary = "Accept a legal document version",
            description =
                    "Stores the version, the language the text was shown in (en or fr, en when"
                            + " omitted), timestamp, a salted hash of the client IP and the user"
                            + " agent. 409 when the version is not the current one.")
    @ApiResponse(responseCode = "204", description = "Consent recorded")
    public void accept(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody ConsentRequest body,
            HttpServletRequest request) {
        consentService.accept(
                principal.userId(),
                body.documentType(),
                body.version().trim(),
                request.getRemoteAddr(),
                request.getHeader(HttpHeaders.USER_AGENT),
                body.language());
    }
}
