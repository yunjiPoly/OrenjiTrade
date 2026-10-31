package com.orenjitrade.api.limits.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.limits.domain.LimitDecision;
import com.orenjitrade.api.limits.domain.Limits;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code GET /api/v1/me/limits}: the usage limits with the caller's usage. */
@RestController
@Tag(name = "limits", description = "Usage limits (the same for every collector)")
public class MyLimitsController {

    private final Limits limits;

    public MyLimitsController(Limits limits) {
        this.limits = limits;
    }

    @GetMapping(path = "/api/v1/me/limits", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "getMyLimits",
            summary = "The usage limits with the caller's usage",
            description =
                    "Every usage limit, the same for every collector, with the usage of the"
                            + " current window and when it resets (UTC day or month; null for"
                            + " totals and caps). `limit` null means unlimited.")
    public MyLimits myLimits(@AuthenticationPrincipal AuthenticatedUser user) {
        return new MyLimits(limits.overview(user.userId()));
    }

    /**
     * {@code GET /me/limits}.
     *
     * @param limits every usage limit with the caller's usage, by key
     */
    @Schema(name = "MyLimits", description = "The usage limits with the caller's usage")
    public record MyLimits(List<LimitDecision> limits) {}
}
