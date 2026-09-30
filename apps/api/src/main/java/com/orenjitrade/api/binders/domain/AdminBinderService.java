package com.orenjitrade.api.binders.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.binders.domain.BinderService.AdminUnpublished;
import com.orenjitrade.api.common.ApiException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Admin console "Binders" writes (Phase 7): the admin unpublish, audited as {@value
 * #ACTION_UNPUBLISH} in the same transaction.
 */
@Service
public class AdminBinderService {

    public static final String ACTION_UNPUBLISH = "binder.unpublish";
    public static final String TARGET_BINDER = "BINDER";

    private final BinderService binders;
    private final AuditService auditService;

    public AdminBinderService(BinderService binders, AuditService auditService) {
        this.binders = binders;
        this.auditService = auditService;
    }

    /** Makes any owner's binder PRIVATE ({@code 404} for unknown binders); audited. */
    @Transactional
    public BinderView unpublish(AuthenticatedUser actor, UUID binderId, String reason) {
        AdminUnpublished result =
                binders.adminUnpublish(binderId)
                        .orElseThrow(() -> ApiException.notFound("Binder not found"));
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("ownerId", result.ownerId().toString());
        details.put("previousVisibility", result.previousVisibility().name());
        details.put("reason", reason.strip());
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                ACTION_UNPUBLISH,
                TARGET_BINDER,
                binderId.toString(),
                details);
        return binders.findAny(binderId).orElseThrow();
    }
}
