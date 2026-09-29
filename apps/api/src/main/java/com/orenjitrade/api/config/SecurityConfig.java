package com.orenjitrade.api.config;

import static org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher.pathPattern;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Stateless API security.
 *
 * <ul>
 *   <li>No sessions, no CSRF for {@code /api/**} and {@code /actuator/**} (bearer tokens only).
 *   <li>CORS from {@code orenji.security.cors.allowed-origins} with credentials; {@code
 *       X-Request-Id} is exposed to browsers.
 *   <li>Public: health probes, info, OpenAPI/Swagger (when enabled), {@code /api/v1/meta}, {@code
 *       /api/v1/public/**} and {@code /error}. Everything else requires an authenticated principal
 *       (the bearer token filter arrives with the auth module; until then every protected route
 *       answers 401).
 *   <li>Security headers: HSTS (except local/test), nosniff, frame DENY, strict referrer policy and
 *       a deny-all permissions policy.
 *   <li>401/403 are rendered as RFC 9457 problems by the shared {@code ProblemDetailFactory}.
 * </ul>
 */
@Configuration(proxyBeanMethods = false)
@EnableWebSecurity
@EnableMethodSecurity
@EnableConfigurationProperties(OrenjiSecurityProperties.class)
public class SecurityConfig {

    /** Routes that never require authentication. */
    static final List<String> PUBLIC_PATTERNS =
            List.of(
                    "/actuator/health/**",
                    "/actuator/info",
                    "/v3/api-docs/**",
                    "/swagger-ui/**",
                    "/swagger-ui.html",
                    "/api/v1/meta",
                    "/api/v1/public/**",
                    "/error");

    private static final String PERMISSIONS_POLICY =
            "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(),"
                    + " microphone=(), payment=(), usb=()";

    @Bean
    SecurityFilterChain apiSecurityFilterChain(
            HttpSecurity http,
            OrenjiSecurityProperties properties,
            CorsConfigurationSource corsConfigurationSource,
            ProblemDetailAuthenticationEntryPoint authenticationEntryPoint,
            ProblemDetailAccessDeniedHandler accessDeniedHandler)
            throws Exception {
        RequestMatcher[] publicMatchers =
                PUBLIC_PATTERNS.stream()
                        .map(pattern -> (RequestMatcher) pathPattern(pattern))
                        .toArray(RequestMatcher[]::new);

        http.csrf(
                        csrf ->
                                csrf.ignoringRequestMatchers(
                                        pathPattern("/api/**"), pathPattern("/actuator/**")))
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
                                    referrer -> referrer.policy(ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN));
                            headers.permissionsPolicyHeader(policy -> policy.policy(PERMISSIONS_POLICY));
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
                .authorizeHttpRequests(
                        authorize ->
                                authorize
                                        .requestMatchers(publicMatchers)
                                        .permitAll()
                                        .anyRequest()
                                        .authenticated())
                .exceptionHandling(
                        exceptions ->
                                exceptions
                                        .authenticationEntryPoint(authenticationEntryPoint)
                                        .accessDeniedHandler(accessDeniedHandler));
        return http.build();
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
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setExposedHeaders(List.of("X-Request-Id", "Location", "ETag", "Retry-After"));
        configuration.setMaxAge(Duration.ofHours(1));

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
