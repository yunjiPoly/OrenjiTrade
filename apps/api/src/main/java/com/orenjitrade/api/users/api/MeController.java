package com.orenjitrade.api.users.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.users.domain.AvatarUrlProvider;
import com.orenjitrade.api.users.domain.ConsentService;
import com.orenjitrade.api.users.domain.HomeRegionProvider;
import com.orenjitrade.api.users.domain.OnboardingService;
import com.orenjitrade.api.users.domain.UserAccountService;
import com.orenjitrade.api.users.domain.UserAccountSnapshot;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code GET /api/v1/me} and {@code GET /api/v1/me/ping}: the caller's own account. */
@RestController
@RequestMapping(path = "/api/v1/me", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "me", description = "The authenticated collector's own account")
public class MeController {

    private final UserAccountService userAccountService;
    private final ConsentService consentService;
    private final OnboardingService onboardingService;
    private final ObjectProvider<AvatarUrlProvider> avatarUrlProvider;
    private final ObjectProvider<HomeRegionProvider> homeRegionProvider;
    private final TimeProvider timeProvider;

    public MeController(
            UserAccountService userAccountService,
            ConsentService consentService,
            OnboardingService onboardingService,
            ObjectProvider<AvatarUrlProvider> avatarUrlProvider,
            ObjectProvider<HomeRegionProvider> homeRegionProvider,
            TimeProvider timeProvider) {
        this.userAccountService = userAccountService;
        this.consentService = consentService;
        this.onboardingService = onboardingService;
        this.avatarUrlProvider = avatarUrlProvider;
        this.homeRegionProvider = homeRegionProvider;
        this.timeProvider = timeProvider;
    }

    @GetMapping
    @Operation(
            operationId = "getMe",
            summary = "Current account",
            description =
                    "Provisions the account on the first call. Exempt from the terms-acceptance"
                            + " check so clients can discover `requiredConsents`.")
    public MeResponse getMe(@AuthenticationPrincipal AuthenticatedUser principal) {
        UserAccountSnapshot account =
                userAccountService
                        .findSnapshot(principal.userId())
                        .orElseThrow(() -> ApiException.notFound("Account not found"));
        @Nullable AvatarUrlProvider avatars = avatarUrlProvider.getIfAvailable();
        @Nullable HomeRegionProvider regions = homeRegionProvider.getIfAvailable();
        return new MeResponse(
                account.id(),
                account.handle(),
                account.displayName(),
                account.email(),
                account.emailVerified(),
                account.roles(),
                account.status(),
                avatars == null ? null : avatars.avatarUrlOf(account.id()),
                account.createdAt(),
                account.lastActiveAt(),
                onboardingService.statusOf(account.id()),
                consentService.requiredConsents(account.id()),
                account.planCode(),
                regions == null ? null : regions.homeRegionOf(account.id()));
    }

    @GetMapping("/ping")
    @Operation(
            operationId = "pingMe",
            summary = "Authenticated connectivity check",
            description =
                    "Cheapest authenticated call: refreshes the caller's last-active timestamp and"
                            + " is subject to the terms-acceptance check like every other route.")
    public PingResponse ping() {
        return new PingResponse(true, timeProvider.now());
    }
}
