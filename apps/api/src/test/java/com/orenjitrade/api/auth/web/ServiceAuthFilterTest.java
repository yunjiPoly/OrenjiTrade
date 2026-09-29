package com.orenjitrade.api.auth.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.OidcIdentity;
import com.orenjitrade.api.auth.domain.OidcTokenVerifier;
import com.orenjitrade.api.auth.domain.ServiceAuthentication;
import jakarta.servlet.ServletException;
import java.io.IOException;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.AuthenticationEntryPoint;

/** Unit test of the {@code /internal/**} authentication paths with a fake OIDC verifier. */
class ServiceAuthFilterTest {

    private static final String TOKEN = "unit-service-token";
    private static final String ALLOWED = "scheduler@project.iam.gserviceaccount.com";

    private final AtomicReference<AuthenticationException> rejected = new AtomicReference<>();
    private final AuthenticationEntryPoint entryPoint =
            (request, response, exception) -> {
                rejected.set(exception);
                response.setStatus(401);
            };
    private final OidcTokenVerifier verifier =
            token ->
                    switch (token) {
                        case "good" -> Optional.of(new OidcIdentity("1", ALLOWED, true));
                        case "unverified-email" ->
                                Optional.of(new OidcIdentity("2", ALLOWED, false));
                        case "stranger" ->
                                Optional.of(new OidcIdentity("3", "stranger@example.com", true));
                        case "no-email" -> Optional.of(new OidcIdentity("4", null, false));
                        default -> Optional.empty();
                    };
    private final ServiceAuthFilter filter =
            new ServiceAuthFilter(
                    TOKEN, verifier, List.of(" " + ALLOWED.toUpperCase()), entryPoint);

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void serviceTokenAuthenticates() throws Exception {
        Authentication authentication = run("/internal/jobs/ping", TOKEN, null);

        assertThat(authentication).isInstanceOf(ServiceAuthentication.class);
        ServiceAuthentication service = (ServiceAuthentication) authentication;
        assertThat(service.getName()).isEqualTo(ServiceAuthentication.SERVICE_TOKEN_PRINCIPAL);
        assertThat(service.method()).isEqualTo(ServiceAuthentication.Method.SERVICE_TOKEN);
        assertThat(service.getAuthorities())
                .extracting(Object::toString)
                .containsExactly(ServiceAuthentication.AUTHORITY);
        assertThat(rejected.get()).isNull();
    }

    @Test
    void wrongServiceTokenIsRejected() throws Exception {
        Authentication authentication = run("/internal/jobs/ping", "wrong", null);

        assertThat(authentication).isNull();
        assertThat(rejected.get()).isInstanceOf(InvalidBearerTokenException.class);
    }

    @Test
    void oidcIdentityOfAllowedInvokerAuthenticates() throws Exception {
        Authentication authentication = run("/internal/jobs/ping", null, "good");

        assertThat(authentication).isInstanceOf(ServiceAuthentication.class);
        assertThat(authentication.getName()).isEqualTo(ALLOWED);
        assertThat(((ServiceAuthentication) authentication).method())
                .isEqualTo(ServiceAuthentication.Method.OIDC);
    }

    @Test
    void oidcIdentitiesThatAreNotAllowedAreRejected() throws Exception {
        for (String token : List.of("stranger", "unverified-email", "no-email", "garbage")) {
            rejected.set(null);
            SecurityContextHolder.clearContext();

            assertThat(run("/internal/jobs/ping", null, token)).as(token).isNull();
            assertThat(rejected.get()).as(token).isInstanceOf(InvalidBearerTokenException.class);
        }
    }

    @Test
    void withoutVerifierOidcIsRejected() throws Exception {
        ServiceAuthFilter noOidc = new ServiceAuthFilter(TOKEN, null, List.of(ALLOWED), entryPoint);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/internal/jobs/ping");
        request.addHeader("Authorization", "Bearer good");

        noOidc.doFilter(request, new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        assertThat(rejected.get()).isNotNull();
    }

    @Test
    void noCredentialsContinuesAnonymously() throws Exception {
        MockFilterChain chain = new MockFilterChain();
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/internal/jobs/ping");

        filter.doFilter(request, new MockHttpServletResponse(), chain);

        assertThat(chain.getRequest()).isNotNull();
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        assertThat(rejected.get()).isNull();
    }

    @Test
    void ignoresRoutesOutsideInternal() throws Exception {
        MockFilterChain chain = new MockFilterChain();
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/me");
        request.addHeader(ServiceAuthFilter.SERVICE_TOKEN_HEADER, TOKEN);

        filter.doFilter(request, new MockHttpServletResponse(), chain);

        assertThat(chain.getRequest()).isNotNull();
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    private @Nullable Authentication run(
            String path, @Nullable String serviceToken, @Nullable String bearer)
            throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", path);
        if (serviceToken != null) {
            request.addHeader(ServiceAuthFilter.SERVICE_TOKEN_HEADER, serviceToken);
        }
        if (bearer != null) {
            request.addHeader("Authorization", "Bearer " + bearer);
        }
        filter.doFilter(request, new MockHttpServletResponse(), new MockFilterChain());
        return SecurityContextHolder.getContext().getAuthentication();
    }
}
