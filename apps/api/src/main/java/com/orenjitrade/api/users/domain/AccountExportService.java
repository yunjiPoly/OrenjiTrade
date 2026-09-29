package com.orenjitrade.api.users.domain;

import com.orenjitrade.api.common.TimeProvider;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Assembles the owner's data export ({@code GET /api/v1/me/export}) from every {@link
 * ExportContributor}: one section per module, in contributor order.
 */
@Service
public class AccountExportService {

    /** Version of the export document layout. */
    public static final String FORMAT_VERSION = "1";

    private final List<ExportContributor> contributors;
    private final TimeProvider timeProvider;

    public AccountExportService(List<ExportContributor> contributors, TimeProvider timeProvider) {
        this.contributors = List.copyOf(contributors);
        this.timeProvider = timeProvider;
    }

    @Transactional(readOnly = true)
    public AccountExport export(UUID userId) {
        Map<String, @Nullable Object> sections = new LinkedHashMap<>();
        for (ExportContributor contributor : contributors) {
            if (sections.containsKey(contributor.section())) {
                throw new IllegalStateException(
                        "Duplicate export section " + contributor.section());
            }
            sections.put(contributor.section(), contributor.export(userId));
        }
        return new AccountExport(FORMAT_VERSION, timeProvider.now(), userId, sections);
    }

    /**
     * The export document.
     *
     * @param formatVersion {@link #FORMAT_VERSION}
     * @param exportedAt generation time
     * @param userId the owner
     * @param sections section name to content ({@code null} when a module holds nothing)
     */
    public record AccountExport(
            String formatVersion,
            Instant exportedAt,
            UUID userId,
            Map<String, @Nullable Object> sections) {}
}
