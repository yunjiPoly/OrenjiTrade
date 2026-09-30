package com.orenjitrade.api.admin.api;

import com.orenjitrade.api.admin.domain.AdminUserService;
import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.users.domain.AdminUserQuery;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** {@code /api/v1/admin/users}: account management for ADMIN and SUPER_ADMIN (audited). */
@RestController
@RequestMapping(path = "/api/v1/admin/users", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "admin-users", description = "Account management (admin console)")
@Validated
public class AdminUserController {

    private final AdminUserService adminUserService;

    public AdminUserController(AdminUserService adminUserService) {
        this.adminUserService = adminUserService;
    }

    @GetMapping
    @Operation(
            operationId = "listUsers",
            summary = "List accounts (ADMIN, SUPER_ADMIN)",
            description = "Newest first. `query` matches handle, email and display name.")
    public PageResponse<AdminUserSummary> list(
            @Parameter(description = "Case-insensitive substring of handle, email or display name")
                    @RequestParam(required = false)
                    @Size(max = 100)
                    @Nullable String query,
            @RequestParam(required = false) @Nullable AccountStatus status,
            @RequestParam(required = false) @Nullable Role role,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return PageResponse.from(
                adminUserService.list(new AdminUserQuery(query, status, role), page, size));
    }

    @GetMapping("/{id}")
    @Operation(
            operationId = "getUser",
            summary = "Account detail (ADMIN, SUPER_ADMIN)",
            description =
                    "Account, roles, consents, public location label (never coordinates),"
                            + " pending deletion request and recent audit entries.")
    public AdminUserDetail get(@PathVariable UUID id) {
        return adminUserService.detail(id);
    }

    @PostMapping(path = "/{id}/suspend", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "suspendUser",
            summary = "Suspend an account (ADMIN, SUPER_ADMIN)",
            description =
                    "Blocks every API call of the account (403 ACCOUNT_SUSPENDED) and disables the"
                            + " identity-provider user. Audited.")
    @ApiResponse(responseCode = "204", description = "Suspended")
    public void suspend(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable UUID id,
            @Valid @RequestBody SuspendUserRequest body) {
        adminUserService.suspend(actor, id, body.reason().trim(), body.until());
    }

    @PostMapping("/{id}/unsuspend")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "unsuspendUser",
            summary = "Lift a suspension (ADMIN, SUPER_ADMIN)",
            description = "409 when the account is not suspended. Audited.")
    @ApiResponse(responseCode = "204", description = "Unsuspended")
    public void unsuspend(@AuthenticationPrincipal AuthenticatedUser actor, @PathVariable UUID id) {
        adminUserService.unsuspend(actor, id);
    }

    @PutMapping(path = "/{id}/roles", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "updateUserRoles",
            summary = "Replace the roles of an account (ADMIN, SUPER_ADMIN)",
            description =
                    "USER is always kept. Only a SUPER_ADMIN may grant or revoke ADMIN or"
                            + " SUPER_ADMIN, and nobody can remove their own SUPER_ADMIN. Audited.")
    @ApiResponse(responseCode = "204", description = "Roles updated")
    public void updateRoles(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateRolesRequest body) {
        adminUserService.updateRoles(actor, id, body.roles());
    }
}
