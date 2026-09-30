package com.orenjitrade.api.profiles.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.profiles.domain.MyProfileView;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Response of {@code GET|PUT /api/v1/me/profile}: the caller's own profile. */
@Schema(name = "MyProfileResponse", description = "The caller's own profile")
public record MyProfileResponse(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "maika") String handle,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "Maïka Tremblay")
                String displayName,
        @Schema(requiredMode = RequiredMode.REQUIRED) String bio,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "[\"yugioh\", \"pokemon\"]")
                List<String> games,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "[\"fr\", \"en\"]")
                List<String> languages,
        @Schema(nullable = true, format = "uri") @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String avatarUrl,
        @Schema(requiredMode = RequiredMode.REQUIRED) List<TagResponse> tags,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        description = "Whether the profile was saved at least once")
                boolean profileComplete,
        @Schema(nullable = true, format = "date-time") @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable Instant updatedAt) {

    static MyProfileResponse from(MyProfileView view) {
        return new MyProfileResponse(
                view.userId(),
                view.handle(),
                view.displayName(),
                view.bio(),
                view.games(),
                view.languages(),
                view.avatarUrl(),
                view.tags().stream().map(TagResponse::from).toList(),
                view.completedAt() != null,
                view.updatedAt());
    }
}
