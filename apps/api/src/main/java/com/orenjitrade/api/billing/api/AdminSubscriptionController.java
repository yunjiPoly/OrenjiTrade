package com.orenjitrade.api.billing.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.billing.api.SubscriptionRequests.AdminCancelRequest;
import com.orenjitrade.api.billing.api.SubscriptionResponses.AdminSubscription;
import com.orenjitrade.api.billing.api.SubscriptionResponses.AdminSubscriptionDetail;
import com.orenjitrade.api.billing.domain.SubscriptionRows.SubscriptionRow;
import com.orenjitrade.api.billing.domain.SubscriptionService;
import com.orenjitrade.api.billing.domain.SubscriptionService.SubscriptionDetail;
import com.orenjitrade.api.billing.domain.SubscriptionStatus;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.users.domain.UserAccountService;
import com.orenjitrade.api.users.domain.UserAccountSnapshot;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

/**
 * {@code /api/v1/admin/subscriptions} (ADMIN, SUPER_ADMIN; Phase 10 contract "Admin"): the
 * subscription list, a subscription's history with its provider webhooks, and cancellation on a
 * member's behalf (audited {@code subscription.cancel}).
 */
@RestController
@RequestMapping(path = "/api/v1/admin/subscriptions", produces = MediaType.APPLICATION_JSON_VALUE)
@Validated
@Tag(name = "admin-billing", description = "Admin: subscriptions, credits, ads, donations")
public class AdminSubscriptionController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final SubscriptionService subscriptions;
    private final UserAccountService accounts;
    private final JsonMapper jsonMapper;

    public AdminSubscriptionController(
            SubscriptionService subscriptions, UserAccountService accounts, JsonMapper jsonMapper) {
        this.subscriptions = subscriptions;
        this.accounts = accounts;
        this.jsonMapper = jsonMapper;
    }

    @GetMapping
    @Operation(
            operationId = "listAdminSubscriptions",
            summary = "Subscriptions (ADMIN)",
            description = "Most recent change first; filters by status, plan code and account.")
    public PageResponse<AdminSubscription> list(
            @Parameter(description = "Status filter") @RequestParam(required = false)
                    @Nullable SubscriptionStatus status,
            @Parameter(description = "Plan code filter", example = "PREMIUM")
                    @RequestParam(required = false)
                    @Size(max = 32)
                    @Nullable String plan,
            @Parameter(description = "Account filter") @RequestParam(required = false)
                    @Nullable UUID userId,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        PageResponse<SubscriptionRow> rows = subscriptions.page(status, plan, userId, page, size);
        Map<UUID, @Nullable String> handles = new HashMap<>();
        return new PageResponse<>(
                rows.items().stream()
                        .map(
                                row ->
                                        AdminSubscription.from(
                                                row,
                                                handles.computeIfAbsent(
                                                        row.userId(), this::handleOf)))
                        .toList(),
                rows.page(),
                rows.size(),
                rows.totalItems(),
                rows.totalPages());
    }

    @GetMapping("/{id}")
    @Operation(
            operationId = "getAdminSubscription",
            summary = "A subscription with its history and webhooks (ADMIN)")
    @ApiResponse(responseCode = "200", description = "The subscription")
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public AdminSubscriptionDetail get(@PathVariable UUID id) {
        return detail(subscriptions.detail(id));
    }

    @PostMapping(path = "/{id}/cancel", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "cancelAdminSubscription",
            summary = "Cancel a member's subscription (ADMIN)",
            description =
                    "immediately=false (default): at the period end; true: now (FREE at once). An"
                            + " open checkout is abandoned. 409 when it already ended. Audited"
                            + " (subscription.cancel).")
    @ApiResponse(responseCode = "200", description = "The subscription")
    @ApiResponse(
            responseCode = "409",
            description = "CONFLICT",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public AdminSubscriptionDetail cancel(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody AdminCancelRequest body) {
        return detail(
                subscriptions.adminCancel(
                        principal,
                        id,
                        body.immediately() != null && body.immediately(),
                        body.reason()));
    }

    private AdminSubscriptionDetail detail(SubscriptionDetail detail) {
        return AdminSubscriptionDetail.from(
                detail, handleOf(detail.subscription().userId()), jsonMapper);
    }

    private @Nullable String handleOf(UUID userId) {
        return accounts.findSnapshot(userId).map(UserAccountSnapshot::handle).orElse(null);
    }
}
