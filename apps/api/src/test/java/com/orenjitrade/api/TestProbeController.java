package com.orenjitrade.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.billing.domain.LimitDecision;
import com.orenjitrade.api.billing.domain.LimitReachedException;
import com.orenjitrade.api.billing.domain.Limits;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import io.swagger.v3.oas.annotations.Hidden;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Test-only endpoints that exercise the platform rules through the real HTTP stack until product
 * endpoints consume them (binder views in Phase 3, radius in Phase 4, payments in Phase 9). Hidden
 * from the OpenAPI export; imported by {@link AbstractIntegrationTest} so every context has the
 * same beans.
 */
@TestComponent
@RestController
@Hidden
public class TestProbeController {

    private final Limits limits;
    private final FeatureFlags featureFlags;

    public TestProbeController(Limits limits, FeatureFlags featureFlags) {
        this.limits = limits;
        this.featureFlags = featureFlags;
    }

    /** Consumes one unit of {@code key} (429 LIMIT_REACHED when exhausted). */
    @PostMapping("/api/v1/test-probes/limits/{key}/consume")
    public LimitDecision consume(
            @AuthenticationPrincipal AuthenticatedUser user, @PathVariable String key) {
        return limits.consume(user.userId(), key);
    }

    /** Checks a requested value against a cap (429 LIMIT_REACHED when above). */
    @GetMapping("/api/v1/test-probes/limits/{key}/value")
    public LimitDecision value(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable String key,
            @RequestParam long requested) {
        LimitDecision decision = limits.checkValue(user.userId(), key, requested);
        if (!decision.allowed()) {
            throw new LimitReachedException(decision);
        }
        return decision;
    }

    /** 204 when {@code key} is on for the caller, 404 FEATURE_DISABLED otherwise. */
    @GetMapping("/api/v1/test-probes/features/{key}")
    public ResponseEntity<Void> feature(
            @AuthenticationPrincipal AuthenticatedUser user, @PathVariable String key) {
        featureFlags.require(key, user.userId());
        return ResponseEntity.noContent().build();
    }
}
