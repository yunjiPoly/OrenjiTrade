package com.orenjitrade.api.reports.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Where a report was made ({@code collector_report.context}): the collector's profile, a private
 * conversation with them, one of their community posts or one of their binders.
 *
 * @param source the surface
 * @param conversationId the conversation (source CONVERSATION)
 * @param postId the post (source POST)
 * @param binderId the binder (source BINDER)
 */
public record ReportContext(
        Source source,
        @Nullable UUID conversationId,
        @Nullable UUID postId,
        @Nullable UUID binderId) {

    public static final ReportContext PROFILE = new ReportContext(Source.PROFILE, null, null, null);

    /** Report surfaces. */
    @Schema(name = "ReportContextSource")
    public enum Source {
        PROFILE,
        CONVERSATION,
        POST,
        BINDER
    }
}
