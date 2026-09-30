package com.orenjitrade.api.delisting.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.delisting.domain.DelistPolicyService;
import com.orenjitrade.api.delisting.domain.DelistPolicyService.PolicyChange;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code /api/v1/admin/delist-policies}: freshness thresholds (ADMIN, SUPER_ADMIN; audited). */
@RestController
@RequestMapping(path = "/api/v1/admin/delist-policies", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "admin-delisting", description = "Auto-delist rules (admin console)")
public class AdminDelistPolicyController {

    private final DelistPolicyService delistPolicyService;

    public AdminDelistPolicyController(DelistPolicyService delistPolicyService) {
        this.delistPolicyService = delistPolicyService;
    }

    @GetMapping
    @Operation(
            operationId = "listDelistPolicies",
            summary = "List delist policies (ADMIN)",
            description = "Freshness thresholds in days since the last owner confirmation.")
    public List<DelistPolicyResponse> list() {
        return delistPolicyService.all().stream().map(DelistPolicyResponse::from).toList();
    }

    @PutMapping(path = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateDelistPolicy",
            summary = "Change a delist policy (ADMIN)",
            description =
                    "400 unless 1 <= agingAfterDays < staleAfterDays < hiddenAfterDays <= 3650 and"
                            + " 0 <= warnBeforeHiddenDays < hiddenAfterDays. Takes effect on every"
                            + " instance at once (cache evicted) and on the next freshness job run."
                            + " Audited (`delist_policy.update`).")
    public DelistPolicyResponse update(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateDelistPolicyRequest body) {
        return DelistPolicyResponse.from(
                delistPolicyService.update(
                        actor,
                        id,
                        new PolicyChange(
                                body.name(),
                                body.agingAfterDays(),
                                body.staleAfterDays(),
                                body.hiddenAfterDays(),
                                body.warnBeforeHiddenDays(),
                                body.maxStrikes())));
    }
}
