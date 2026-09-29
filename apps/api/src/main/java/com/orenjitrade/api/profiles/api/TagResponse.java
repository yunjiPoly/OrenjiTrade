package com.orenjitrade.api.profiles.api;

import com.orenjitrade.api.profiles.domain.TagCategory;
import com.orenjitrade.api.profiles.domain.TagView;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.util.UUID;

/** A profile tag. */
@Schema(name = "TagResponse", description = "Profile tag")
public record TagResponse(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "local-meetups") String slug,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "Local Meetups") String label,
        @Schema(requiredMode = RequiredMode.REQUIRED) TagCategory category,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        example = "12",
                        description = "Number of profiles carrying the tag")
                int usageCount) {

    static TagResponse from(TagView view) {
        return new TagResponse(
                view.id(), view.slug(), view.label(), view.category(), view.usageCount());
    }
}
