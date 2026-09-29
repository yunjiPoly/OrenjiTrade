package com.orenjitrade.api.auth.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.AccountResolver;
import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.auth.domain.ResolvedAccount;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.auth.domain.UserAuthentication;
import com.orenjitrade.api.auth.domain.VerifiedIdentity;
import com.orenjitrade.api.auth.infra.StaticIdentityTokenVerifier;
import com.orenjitrade.api.common.TimeProvider;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.AuthenticationEntryPoint;

class BearerTokenAuthenticationFilterTest {

    private static final Instant NOW = Instant.parse("2026-09-29T12:00:00Z");
    private static final UUID USER_ID = UUID.randomUUID();

    private final List<UUID> activity = new java.util.ArrayList<>();
    private final AtomicReference<AuthenticationException> rejected = new AtomicReference<>();
    private final AuthenticationEntryPoint entryPoint =
            (request, response, exception) -> {
                rejected.set(exception);
                response.setStatus(401);
            };
    private final AccountResolver resolver =
            new AccountResolver() {
                @Override
                public ResolvedAccount resolve(VerifiedIdentity identity) {
                    return new ResolvedAccount(
                            USER_ID,
                            "maika",
                            identity.email(),
                            identity.emailVerified(),
                            AccountStatus.ACTIVE,
                            null,
                            Set.of(Role.USER, Role.ADMIN));
                }

                @Override
                public void recordActivity(UUID userId) {
                    activity.add(userId);
                }
            };
    private final BearerTokenAuthenticationFilter filter =
            new BearerTokenAuthenticationFilter(
                    new StaticIdentityTokenVerifier(TimeProvider.fixed(NOW)), resolver, entryPoint);

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @ParameterizedTest
    @CsvSource(
            value = {
                "'Bearer abc', abc",
                "'bearer abc', abc",
                "'BEARER   abc  ', abc",
                "'Bearer', ''",
                "'Bearer ', ''",
                "'Basic abc', NULL",
                "'Bearerabc', NULL",
                "'', NULL",
                "NULL, NULL"
            },
            nullValues = "NULL")
    void extractsTokens(@Nullable String header, @Nullable String expected) {
        assertThat(BearerTokenAuthenticationFilter.extractToken(header)).isEqualTo(expected);
    }

    @Test
    void validTokenBuildsPrincipalWithRolesAndSessionFacts() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/me");
        request.addHeader("Authorization", "Bearer test-token:uid-1:maika@example.test:mfa");
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, new MockHttpServletResponse(), chain);

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        assertThat(authentication).isInstanceOf(UserAuthentication.class);
        AuthenticatedUser user = ((UserAuthentication) authentication).user();
        assertThat(user.userId()).isEqualTo(USER_ID);
        assertThat(user.providerUid()).isEqualTo("uid-1");
        assertThat(user.email()).isEqualTo("maika@example.test");
        assertThat(user.handle()).isEqualTo("maika");
        assertThat(user.roles()).containsExactlyInAnyOrder(Role.USER, Role.ADMIN);
        assertThat(user.secondFactorUsed()).isTrue();
        assertThat(user.authTime()).isEqualTo(NOW);
        assertThat(authentication.getAuthorities())
                .extracting(Object::toString)
                .containsExactlyInAnyOrder("ROLE_ADMIN", "ROLE_USER");
        assertThat(authentication.getName()).isEqualTo(USER_ID.toString());
        assertThat(authentication.getCredentials()).isEqualTo("");
        assertThat(activity).containsExactly(USER_ID);
        assertThat(chain.getRequest()).isNotNull();
        assertThat(rejected.get()).isNull();
    }

    @Test
    void invalidTokenIsRejectedThroughTheEntryPoint() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/me");
        request.addHeader("Authorization", "Bearer nope");
        MockFilterChain chain = new MockFilterChain();
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(rejected.get())
                .isInstanceOf(InvalidBearerTokenException.class)
                .hasMessage("The access token is invalid");
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        assertThat(chain.getRequest()).isNull();
        assertThat(activity).isEmpty();
    }

    @Test
    void missingTokenContinuesAnonymously() throws Exception {
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(
                new MockHttpServletRequest("GET", "/api/v1/me"),
                new MockHttpServletResponse(),
                chain);

        assertThat(chain.getRequest()).isNotNull();
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        assertThat(rejected.get()).isNull();
    }

    @Test
    void internalRoutesAreSkipped() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/internal/jobs/ping");
        request.addHeader("Authorization", "Bearer nope");
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, new MockHttpServletResponse(), chain);

        assertThat(chain.getRequest()).isNotNull();
        assertThat(rejected.get()).isNull();
    }
}
