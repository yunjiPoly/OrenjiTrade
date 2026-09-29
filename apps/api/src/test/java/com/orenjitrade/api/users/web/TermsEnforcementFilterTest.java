package com.orenjitrade.api.users.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.auth.domain.ServiceAuthentication;
import com.orenjitrade.api.auth.domain.UserAuthentication;
import com.orenjitrade.api.common.ProblemDetailFactory;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.users.domain.ConsentService;
import com.orenjitrade.api.users.domain.LegalDocumentType;
import com.orenjitrade.api.users.domain.RequiredConsent;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import tools.jackson.databind.json.JsonMapper;

class TermsEnforcementFilterTest {

    private static final Instant NOW = Instant.parse("2026-09-29T12:00:00Z");

    private final ConsentService consentService = mock(ConsentService.class);
    private final TermsEnforcementFilter filter =
            new TermsEnforcementFilter(
                    consentService,
                    new ProblemDetailFactory(
                            TimeProvider.fixed(NOW), JsonMapper.builder().build()));

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @ParameterizedTest
    @CsvSource({
        "/api/v1/me, false",
        "/api/v1/me/consents, false",
        "/api/v1/me/deletion-requests, false",
        "/api/v1/me/deletion-requests/123, false",
        "/api/v1/public/legal/documents, false",
        "/api/v1/meta, false",
        "/actuator/health/readiness, false",
        "/internal/jobs/ping, false",
        "/v3/api-docs, false",
        "/error, false",
        "/api/v1/me/ping, true",
        "/api/v1/me/profile, true",
        "/api/v1/me/export, true",
        "/api/v1/me/settings/privacy, true",
        "/api/v1/admin/users, true",
        "/api/v1/collectors/maika, true",
        "/api/v1/tags, true"
    })
    void exemptions(String path, boolean enforced) {
        assertThat(TermsEnforcementFilter.isEnforced(path)).as(path).isEqualTo(enforced);
    }

    @Test
    void answers428WithRequiredConsentsForAuthenticatedUser() throws Exception {
        UUID userId = UUID.randomUUID();
        authenticate(userId);
        when(consentService.requiredConsents(userId))
                .thenReturn(List.of(new RequiredConsent(LegalDocumentType.TERMS, "2026-09-01")));
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/me/ping");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(428);
        assertThat(response.getContentType()).startsWith("application/problem+json");
        assertThat(response.getContentAsString())
                .contains("\"errorCode\":\"TERMS_ACCEPTANCE_REQUIRED\"")
                .contains(
                        "\"requiredConsents\":[{\"documentType\":\"TERMS\",\"version\":\"2026-09-01\"}]")
                .contains("\"instance\":\"/api/v1/me/ping\"");
        assertThat(chain.getRequest()).as("chain not continued").isNull();
    }

    @Test
    void publicCatalogReadsAreExemptForGetOnly() throws Exception {
        TermsEnforcementFilter catalogAware =
                new TermsEnforcementFilter(
                        consentService,
                        new ProblemDetailFactory(
                                TimeProvider.fixed(NOW), JsonMapper.builder().build()),
                        List.of("/api/v1/cards", "/api/v1/cards/**"));
        authenticate(UUID.randomUUID());
        when(consentService.requiredConsents(any()))
                .thenReturn(List.of(new RequiredConsent(LegalDocumentType.TERMS, "2026-09-01")));

        MockFilterChain read = new MockFilterChain();
        catalogAware.doFilter(
                new MockHttpServletRequest("GET", "/api/v1/cards/suggest"),
                new MockHttpServletResponse(),
                read);
        assertThat(read.getRequest()).isNotNull();

        MockHttpServletResponse write = new MockHttpServletResponse();
        MockFilterChain blocked = new MockFilterChain();
        catalogAware.doFilter(new MockHttpServletRequest("POST", "/api/v1/cards"), write, blocked);
        assertThat(write.getStatus()).isEqualTo(428);
        assertThat(blocked.getRequest()).isNull();
    }

    @Test
    void passesWhenNothingIsRequired() throws Exception {
        UUID userId = UUID.randomUUID();
        authenticate(userId);
        when(consentService.requiredConsents(userId)).thenReturn(List.of());
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(
                new MockHttpServletRequest("GET", "/api/v1/me/ping"),
                new MockHttpServletResponse(),
                chain);

        assertThat(chain.getRequest()).isNotNull();
    }

    @Test
    void ignoresExemptRoutesAndNonUserPrincipals() throws Exception {
        authenticate(UUID.randomUUID());
        when(consentService.requiredConsents(any()))
                .thenReturn(List.of(new RequiredConsent(LegalDocumentType.TERMS, "2026-09-01")));
        MockFilterChain exempt = new MockFilterChain();
        filter.doFilter(
                new MockHttpServletRequest("GET", "/api/v1/me"),
                new MockHttpServletResponse(),
                exempt);
        assertThat(exempt.getRequest()).isNotNull();

        SecurityContextHolder.getContext()
                .setAuthentication(
                        new ServiceAuthentication(
                                "service-token", ServiceAuthentication.Method.SERVICE_TOKEN));
        MockFilterChain service = new MockFilterChain();
        filter.doFilter(
                new MockHttpServletRequest("GET", "/api/v1/me/ping"),
                new MockHttpServletResponse(),
                service);
        assertThat(service.getRequest()).isNotNull();

        SecurityContextHolder.clearContext();
        MockFilterChain anonymous = new MockFilterChain();
        filter.doFilter(
                new MockHttpServletRequest("GET", "/api/v1/me/ping"),
                new MockHttpServletResponse(),
                anonymous);
        assertThat(anonymous.getRequest()).isNotNull();
    }

    private static void authenticate(UUID userId) {
        AuthenticatedUser user =
                new AuthenticatedUser(
                        userId,
                        "uid",
                        "u@example.test",
                        true,
                        "handle",
                        Set.of(Role.USER),
                        AccountStatus.ACTIVE,
                        null,
                        NOW,
                        false);
        SecurityContextHolder.getContext().setAuthentication(new UserAuthentication(user));
    }
}
