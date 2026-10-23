package com.orenjitrade.api.profiles.api;

import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * Body of {@code PUT /api/v1/me/profile} (full replacement of the editable fields). Stage R13:
 * {@code tags}, when present, replaces the profile tags in the same transaction (Edit profile's one
 * "Save changes"); left out, the tags stay as they are.
 */
@Schema(name = "UpdateProfileRequest")
public record UpdateProfileRequest(
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        example = "maika",
                        description =
                                "3-24 characters [a-z0-9_] (input is trimmed and lower-cased);"
                                        + " unique case-insensitively; reserved words refused (409"
                                        + " HANDLE_TAKEN)")
                @NotBlank
                @Size(max = 64)
                String handle,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "Maïka Tremblay", maxLength = 80)
                @NotBlank
                @Size(max = 80)
                String displayName,
        @Schema(nullable = true, maxLength = 500) @Size(max = 500) @Nullable String bio,
        @ArraySchema(
                        schema =
                                @Schema(
                                        example = "yugioh",
                                        description = "yugioh, pokemon, mtg or riftbound"),
                        maxItems = 16)
                @Size(max = 16)
                @Nullable List<@NotNull String> games,
        @ArraySchema(schema = @Schema(example = "fr", description = "ISO 639-1"), maxItems = 10)
                @Size(max = 10)
                @Nullable List<@NotNull String> languages,
        @Schema(
                        nullable = true,
                        description =
                                "Stage R13, optional: the profile tags, saved together with the"
                                        + " other fields (all or nothing; the rules of PUT"
                                        + " /me/profile/tags). Left out or null: the tags stay as"
                                        + " they are.")
                @Valid
                @Nullable UpdateProfileTagsRequest tags) {}
