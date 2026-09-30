package com.orenjitrade.api.config;

import static org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher.pathPattern;

import com.orenjitrade.api.auth.domain.AccountResolver;
import com.orenjitrade.api.auth.domain.IdentityTokenVerifier;
import com.orenjitrade.api.auth.domain.OidcTokenVerifier;
import com.orenjitrade.api.auth.domain.ServiceAuthentication;
import com.orenjitrade.api.auth.infra.GoogleOidcTokenVerifier;
import com.orenjitrade.api.auth.ratelimit.RateLimitFilter;
import com.orenjitrade.api.auth.ratelimit.RateLimitProperties;
import com.orenjitrade.api.auth.ratelimit.RateLimiter;
import com.orenjitrade.api.auth.web.AccountAccessFilter;
import com.orenjitrade.api.auth.web.AdminAuthorizationManager;
import com.orenjitrade.api.auth.web.BearerTokenAuthenticationFilter;
import com.orenjitrade.api.auth.web.ServiceAuthFilter;
import com.orenjitrade.api.common.ProblemDetailFactory;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.users.domain.ConsentService;
import com.orenjitrade.api.users.web.TermsEnforcementFilter;
import java.time.Duration;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Stateless API security.
 *
 * <ul>
 *   <li>No sessions, no CSRF for {@code /api/**}, {@code /internal/**} and {@code /actuator/**}
 *       (bearer tokens only).
 *   <li>CORS from {@code orenji.security.cors.allowed-origins} with credentials; {@code
 *       X-Request-Id} and the rate-limit headers are exposed to browsers.
 *   <li>Public: health probes, info, OpenAPI/Swagger (when enabled), {@code /api/v1/meta}, {@code
 *       /api/v1/public/**}, {@code /error}, the payment provider webhooks {@code
 *       /api/v1/webhooks/payments/*}, {@code /webhooks/billing/*} and {@code /webhooks/donations/*}
 *       (authenticated by their signature in the owning module), ad impressions (signed serve
 *       token) and the read-only catalog, plan and ad routes ({@link #PUBLIC_GET_PATTERNS}, GET
 *       only).
 *   <li>Filter order inside the chain: {@link BearerTokenAuthenticationFilter} and {@link
 *       ServiceAuthFilter} (authentication) → {@link AccountAccessFilter} (suspended / deletion
 *       pending) → {@link RateLimitFilter} → {@link AuthorizationFilter} (RBAC, admin MFA) → {@link
 *       TermsEnforcementFilter} (428 while consents are missing).
 *   <li>{@code /api/v1/admin/**} needs ADMIN or SUPER_ADMIN (MODERATOR is enough for {@link
 *       #MODERATOR_PATTERNS}) plus a second factor when {@code orenji.security.admin.require-mfa}
 *       is on; {@code /internal/**} needs the service token or an allowed Google OIDC identity.
 *   <li>{@code /ws} (STOMP over WebSocket, Phase 5) is open at the HTTP level: the handshake
 *       interceptor and the STOMP CONNECT interceptor of the messaging module verify the ID token
 *       (header or {@code access_token}) with the same {@link IdentityTokenVerifier}.
 *   <li>Security headers: HSTS (except local/test), nosniff, frame DENY, strict referrer policy and
 *       a deny-all permissions policy.
 *   <li>401/403 are rendered as RFC 9457 problems by the shared {@code ProblemDetailFactory}.
 * </ul>
 *
 * <p>The filters are instantiated here rather than declared as beans so Spring Boot does not also
 * register them as plain servlet filters (which would run them twice).
 */
@Configuration(proxyBeanMethods = false)
@EnableWebSecurity
@EnableMethodSecurity
@EnableConfigurationProperties(OrenjiSecurityProperties.class)
public class SecurityConfig {

    /**
     * Routes that never require authentication at the HTTP level ({@code /ws} authenticates the
     * WebSocket handshake and the STOMP CONNECT frame itself).
     */
    public static final List<String> PUBLIC_PATTERNS =
            List.of(
                    "/ws",
                    "/actuator/health/**",
                    "/actuator/info",
                    "/v3/api-docs/**",
                    "/swagger-ui/**",
                    "/swagger-ui.html",
                    "/api/v1/meta",
                    "/api/v1/public/**",
                    // Payment provider webhooks (Phase 9): authenticated by their signature.
                    "/api/v1/webhooks/payments/*",
                    // Billing and donation provider webhooks (Phase 10): signature verified.
                    "/api/v1/webhooks/billing/*",
                    "/api/v1/webhooks/donations/*",
                    // Ad impressions (Phase 10): authenticated by the signed serve token.
                    "/api/v1/ads/*/impression",
                    "/error");

    /**
     * Read-only catalog and plan routes (Phase 2 contract: "catalog reads are public"), the public
     * listings of a collector (Phase 3 contract "Public views", privacy enforced by the service)
     * and map discovery and search (Phase 4 contract: "discovery reads work for anonymous users
     * with reduced detail") that never require authentication. GET only; the same paths stay
     * protected for other methods. A bearer token is still honoured when present (viewer-specific
     * details).
     */
    public static final List<String> PUBLIC_GET_PATTERNS =
            List.of(
                    "/api/v1/games",
                    "/api/v1/games/*",
                    "/api/v1/sets",
                    "/api/v1/sets/*",
                    "/api/v1/cards",
                    "/api/v1/cards/**",
                    "/api/v1/printings/*",
                    "/api/v1/plans",
                    "/api/v1/collectors/*/binders",
                    "/api/v1/collectors/*/inventory",
                    "/api/v1/collectors/nearby",
                    "/api/v1/collectors/*/preview",
                    "/api/v1/search",
                    "/api/v1/search/**",
                    "/api/v1/ads",
                    "/api/v1/ads/*/click");

    /**
     * The moderation subset of the admin console (Phase 5 contract "Moderator"; Phase 7 RBAC:
     * MODERATOR sees Reports, Moderation, Community and Ratings): MODERATOR, ADMIN and SUPER_ADMIN.
     * Within them the services still require ADMIN for moderation-rule changes and for suspending
     * or banning through a report decision.
     */
    public static final List<String> MODERATOR_PATTERNS =
            List.of(
                    "/api/v1/admin/community/**",
                    "/api/v1/admin/moderation/**",
                    "/api/v1/admin/reports/**",
                    "/api/v1/admin/ratings/**",
                    "/api/v1/admin/references/**");

    private static final String PERMISSIONS_POLICY =
            "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(),"
                    + " microphone=(), payment=(), usb=()";

    @Bean
    SecurityFilterChain apiSecurityFilterChain(
            HttpSecurity http,
            OrenjiSecurityProperties properties,
            CorsConfigurationSource corsConfigurationSource,
            ProblemDetailAuthenticationEntryPoint authenticationEntryPoint,
            ProblemDetailAccessDeniedHandler accessDeniedHandler,
            ProblemDetailFactory problems,
            TimeProvider timeProvider,
            IdentityTokenVerifier identityTokenVerifier,
            AccountResolver accountResolver,
            ObjectProvider<OidcTokenVerifier> oidcTokenVerifier,
            ConsentService consentService,
            RateLimitProperties rateLimitProperties,
            RateLimiter rateLimiter)
            throws Exception {
        RequestMatcher[] publicMatchers =
                PUBLIC_PATTERNS.stream()
                        .map(pattern -> (RequestMatcher) pathPattern(pattern))
                        .toArray(RequestMatcher[]::new);
        RequestMatcher[] moderatorMatchers =
                MODERATOR_PATTERNS.stream()
                        .map(pattern -> (RequestMatcher) pathPattern(pattern))
                        .toArray(RequestMatcher[]::new);
        RequestMatcher[] publicGetMatchers =
                PUBLIC_GET_PATTERNS.stream()
                        .map(pattern -> (RequestMatcher) pathPattern(HttpMethod.GET, pattern))
                        .toArray(RequestMatcher[]::new);

        BearerTokenAuthenticationFilter bearerFilter =
                new BearerTokenAuthenticationFilter(
                        identityTokenVerifier, accountResolver, authenticationEntryPoint);
        ServiceAuthFilter serviceAuthFilter =
                new ServiceAuthFilter(
                        properties.serviceToken(),
                        oidcTokenVerifier.getIfAvailable(),
                        properties.internalInvokers(),
                        authenticationEntryPoint);
        AccountAccessFilter accountAccessFilter =
                new AccountAccessFilter(
                        PUBLIC_PATTERNS, PUBLIC_GET_PATTERNS, problems, timeProvider);
        RateLimitFilter rateLimitFilter =
                new RateLimitFilter(rateLimitProperties, rateLimiter, problems, timeProvider);
        TermsEnforcementFilter termsFilter =
                new TermsEnforcementFilter(consentService, problems, PUBLIC_GET_PATTERNS);

        http.csrf(
                        csrf ->
                                csrf.ignoringRequestMatchers(
                                        pathPattern("/api/**"),
                                        pathPattern("/internal/**"),
                                        pathPattern("/actuator/**")))
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .sessionManagement(
                        session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .requestCache(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .anonymous(Customizer.withDefaults())
                .headers(
                        headers -> {
                            headers.contentTypeOptions(Customizer.withDefaults());
                            headers.frameOptions(frame -> frame.deny());
                            headers.referrerPolicy(
                                    referrer ->
                                            referrer.policy(
                                                    ReferrerPolicy
                                                            .STRICT_ORIGIN_WHEN_CROSS_ORIGIN));
                            headers.permissionsPolicyHeader(
                                    policy -> policy.policy(PERMISSIONS_POLICY));
                            OrenjiSecurityProperties.Hsts hsts = properties.hsts();
                            if (hsts.enabled()) {
                                headers.httpStrictTransportSecurity(
                                        config ->
                                                config.maxAgeInSeconds(hsts.maxAgeSeconds())
                                                        .includeSubDomains(hsts.includeSubdomains())
                                                        .preload(false));
                            } else {
                                headers.httpStrictTransportSecurity(config -> config.disable());
                            }
                        })
                .addFilterBefore(bearerFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterAfter(serviceAuthFilter, BearerTokenAuthenticationFilter.class)
                .addFilterBefore(accountAccessFilter, AuthorizationFilter.class)
                .addFilterBefore(rateLimitFilter, AuthorizationFilter.class)
                .addFilterAfter(termsFilter, AuthorizationFilter.class)
                .authorizeHttpRequests(
                        authorize ->
                                authorize
                                        .requestMatchers(publicMatchers)
                                        .permitAll()
                                        .requestMatchers(publicGetMatchers)
                                        .permitAll()
                                        .requestMatchers(pathPattern("/internal/**"))
                                        .hasRole(ServiceAuthentication.ROLE)
                                        .requestMatchers(moderatorMatchers)
                                        .access(
                                                new AdminAuthorizationManager(
                                                        properties.admin().requireMfa(), true))
                                        .requestMatchers(pathPattern("/api/v1/admin/**"))
                                        .access(
                                                new AdminAuthorizationManager(
                                                        properties.admin().requireMfa()))
                                        .anyRequest()
                                        .authenticated())
                .exceptionHandling(
                        exceptions ->
                                exceptions
                                        .authenticationEntryPoint(authenticationEntryPoint)
                                        .accessDeniedHandler(accessDeniedHandler));
        return http.build();
    }

    /**
     * Google OIDC verification for {@code /internal/**}. Not created under the {@code test}
     * profile, where the integration tests register a fake instead.
     */
    @Bean
    @Profile("!test")
    OidcTokenVerifier googleOidcTokenVerifier(OrenjiSecurityProperties properties) {
        return new GoogleOidcTokenVerifier(properties.internalAudience());
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(OrenjiSecurityProperties properties) {
        CorsConfiguration configuration = new CorsConfiguration();
        for (String origin : properties.cors().allowedOrigins()) {
            if (origin.contains("*")) {
                configuration.addAllowedOriginPattern(origin);
            } else {
                configuration.addAllowedOrigin(origin);
            }
        }
        configuration.setAllowCredentials(true);
        configuration.setAllowedMethods(
                List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setExposedHeaders(
                List.of(
                        "X-Request-Id",
                        "Location",
                        "ETag",
                        "Retry-After",
                        RateLimitFilter.HEADER_LIMIT,
                        RateLimitFilter.HEADER_REMAINING));
        configuration.setMaxAge(Duration.ofHours(1));

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
