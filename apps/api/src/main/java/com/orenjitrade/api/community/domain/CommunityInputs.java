package com.orenjitrade.api.community.domain;

import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Inputs of the community service. */
public final class CommunityInputs {

    private CommunityInputs() {}

    /**
     * A new post.
     *
     * @param body text (1-2000 characters)
     * @param cardPrintingId optional shared printing
     * @param binderId optional shared public binder
     */
    public record NewPost(String body, @Nullable UUID cardPrintingId, @Nullable UUID binderId) {}

    /**
     * A channel created by a moderator.
     *
     * @param slug URL slug
     * @param name display name
     * @param kind kind
     * @param game game slug
     * @param regionLabel city
     * @param description description
     * @param postRateLimitPerHour posts per member per hour ({@code null}: 10)
     * @param sortOrder position ({@code null}: 100)
     */
    public record NewChannel(
            String slug,
            String name,
            ChannelKind kind,
            @Nullable String game,
            @Nullable String regionLabel,
            @Nullable String description,
            @Nullable Integer postRateLimitPerHour,
            @Nullable Integer sortOrder) {}

    /** Changes to a channel; {@code null} keeps a value (a blank game or city removes it). */
    public record ChannelPatch(
            @Nullable String name,
            @Nullable String description,
            @Nullable ChannelStatus status,
            @Nullable Integer postRateLimitPerHour,
            @Nullable Integer sortOrder,
            @Nullable String game,
            @Nullable String regionLabel) {}
}
