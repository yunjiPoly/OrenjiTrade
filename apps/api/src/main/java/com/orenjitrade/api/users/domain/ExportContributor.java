package com.orenjitrade.api.users.domain;

import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Extension point of {@code GET /api/v1/me/export}: every module holding personal data contributes
 * one section of the owner's export document. Sections must only contain data the owner may see
 * about themselves (never other users' private data, never {@code home_point}).
 */
public interface ExportContributor {

    /** Section name, unique across contributors (e.g. {@code profile}, {@code location}). */
    String section();

    /** JSON-serialisable content of the section; {@code null} when the module holds nothing. */
    @Nullable Object export(UUID userId);
}
