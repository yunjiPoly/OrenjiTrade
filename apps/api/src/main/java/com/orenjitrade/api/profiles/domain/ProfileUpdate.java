package com.orenjitrade.api.profiles.domain;

import java.util.List;
import org.jspecify.annotations.Nullable;

/** Fields of {@code PUT /api/v1/me/profile} (already syntactically validated by the controller). */
public record ProfileUpdate(
        String handle,
        String displayName,
        @Nullable String bio,
        @Nullable List<String> games,
        @Nullable List<String> languages) {}
