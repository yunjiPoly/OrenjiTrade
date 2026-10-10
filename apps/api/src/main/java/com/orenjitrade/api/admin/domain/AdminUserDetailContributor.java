package com.orenjitrade.api.admin.domain;

import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Extension point for {@code GET /api/v1/admin/users/{id}}: the location module supplies the
 * collector's state/province and country (never the city or a coordinate, ADR 0017) and the
 * deletion framework supplies the pending request. Without implementations both fields are {@code
 * null}.
 */
public interface AdminUserDetailContributor {

    /** Place label such as {@code "Quebec, Canada"}; never a city or a coordinate. */
    default @Nullable String locationLabel(UUID userId) {
        return null;
    }

    default @Nullable DeletionRequestSummary deletionRequest(UUID userId) {
        return null;
    }
}
