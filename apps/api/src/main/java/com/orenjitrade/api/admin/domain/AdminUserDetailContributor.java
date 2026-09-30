package com.orenjitrade.api.admin.domain;

import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Extension point for {@code GET /api/v1/admin/users/{id}}: the location module supplies the public
 * label of the collector's trading area (never coordinates, ADR 0004) and the deletion framework
 * supplies the pending request. Without implementations both fields are {@code null}.
 */
public interface AdminUserDetailContributor {

    /** Public area label such as {@code "Plateau-Mont-Royal, Montréal"}; never a coordinate. */
    default @Nullable String locationLabel(UUID userId) {
        return null;
    }

    default @Nullable DeletionRequestSummary deletionRequest(UUID userId) {
        return null;
    }
}
