package com.orenjitrade.api.profiles.api;

import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Body of {@code PUT /api/v1/me/profile/tags} (full replacement, at most 12 tags in total). */
@Schema(name = "UpdateProfileTagsRequest")
public record UpdateProfileTagsRequest(
        @ArraySchema(
                        schema = @Schema(format = "uuid"),
                        maxItems = 12,
                        arraySchema = @Schema(description = "Ids of existing active tags"))
                @Size(max = 12)
                @Nullable List<@NotNull UUID> tagIds,
        @ArraySchema(
                        schema = @Schema(example = "Cube drafter", minLength = 2, maxLength = 24),
                        maxItems = 12,
                        arraySchema =
                                @Schema(
                                        description =
                                                "Free labels (2-24 characters, banned-term"
                                                        + " check); created as CUSTOM tags or"
                                                        + " matched to an existing tag with the"
                                                        + " same slug"))
                @Size(max = 12)
                @Nullable List<@NotNull String> customLabels) {}
