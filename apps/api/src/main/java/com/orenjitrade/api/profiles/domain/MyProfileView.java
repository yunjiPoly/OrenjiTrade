package com.orenjitrade.api.profiles.domain;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** The owner's view of their profile ({@code GET /api/v1/me/profile}). */
public record MyProfileView(
        UUID userId,
        String handle,
        String displayName,
        String bio,
        List<String> games,
        List<String> languages,
        @Nullable String avatarUrl,
        List<TagView> tags,
        @Nullable Instant completedAt,
        @Nullable Instant updatedAt) {}
