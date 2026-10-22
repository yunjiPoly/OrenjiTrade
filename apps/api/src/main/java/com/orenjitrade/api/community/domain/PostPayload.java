package com.orenjitrade.api.community.domain;

import com.orenjitrade.api.binders.domain.BinderLink;
import com.orenjitrade.api.cards.domain.CardLink;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * Links and photos attached to a community post.
 *
 * @param card a shared printing
 * @param binder a shared public binder or deck core
 * @param photos up to 4 photos, in their order (stage R11; empty when none)
 */
@Schema(name = "PostPayload", description = "Links and photos attached to a community post")
public record PostPayload(
        @Nullable CardLink card,
        @Nullable BinderLink binder,
        @ArraySchema(
                        arraySchema =
                                @Schema(
                                        description =
                                                "Up to 4 photos in their order (stage R11);"
                                                        + " empty when none"),
                        schema = @Schema(implementation = PostPhoto.class))
                List<PostPhoto> photos) {

    public static final PostPayload EMPTY = new PostPayload(null, null, List.of());

    public PostPayload {
        photos = List.copyOf(photos);
    }
}
