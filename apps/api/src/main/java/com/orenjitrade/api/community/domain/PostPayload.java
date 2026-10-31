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
 * @param binder a shared public binder or deck core, while the reader can open it
 * @param photos up to 4 photos, in their order (stage R11; empty when none)
 * @param binderUnavailable {@code true} when the post shared a binder the reader can no longer open
 *     (no longer public, sold or deleted, its owner hidden or blocked with the reader in either
 *     direction): {@code binder} is absent then, so neither its name nor its owner's handle shows
 *     (stage R11 review fix 1); absent otherwise
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
                List<PostPhoto> photos,
        @Schema(
                        description =
                                "Stage R11: true when the post shared a binder the reader can no"
                                        + " longer open (no longer public, sold or deleted, its"
                                        + " owner hidden or blocked with the reader); `binder` is"
                                        + " absent then. Absent otherwise.")
                @Nullable Boolean binderUnavailable) {

    public static final PostPayload EMPTY = new PostPayload(null, null, List.of(), null);

    public PostPayload {
        photos = List.copyOf(photos);
    }
}
