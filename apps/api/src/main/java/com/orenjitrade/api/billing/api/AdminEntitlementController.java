package com.orenjitrade.api.billing.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.billing.domain.EntitlementView;
import com.orenjitrade.api.billing.domain.Entitlements;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** {@code /api/v1/admin/users/{id}/entitlements}: grant and revoke overrides (audited). */
@RestController
@RequestMapping(
        path = "/api/v1/admin/users/{id}/entitlements",
        produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "admin-plans", description = "Plans and usage limits (admin console)")
public class AdminEntitlementController {

    private final Entitlements entitlements;

    public AdminEntitlementController(Entitlements entitlements) {
        this.entitlements = entitlements;
    }

    @GetMapping
    @Operation(
            operationId = "listUserEntitlements",
            summary = "Entitlements of an account (ADMIN, SUPER_ADMIN)",
            description = "Active, expired and revoked entitlements, newest first.")
    public List<EntitlementView> list(@PathVariable("id") UUID userId) {
        return entitlements.history(userId);
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "grantEntitlement",
            summary = "Grant an entitlement (ADMIN, SUPER_ADMIN)",
            description =
                    "Overrides a plan limit (`value` = number or `unlimited`) or feature (`true`"
                            + " / `false`) for one account, optionally until `expiresAt`. Takes"
                            + " effect at once. Audited (`entitlement.grant`).")
    @ApiResponse(responseCode = "201", description = "Granted")
    public EntitlementView grant(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable("id") UUID userId,
            @Valid @RequestBody GrantEntitlementRequest body) {
        return entitlements.grant(
                actor, userId, body.featureKey(), body.value(), body.expiresAt(), body.note());
    }

    @DeleteMapping("/{entitlementId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "revokeEntitlement",
            summary = "Revoke an entitlement (ADMIN, SUPER_ADMIN)",
            description =
                    "404 when the entitlement does not belong to the account or is no longer"
                            + " active. Audited (`entitlement.revoke`).")
    @ApiResponse(responseCode = "204", description = "Revoked")
    public void revoke(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable("id") UUID userId,
            @PathVariable UUID entitlementId) {
        entitlements.revoke(actor, userId, entitlementId);
    }
}
