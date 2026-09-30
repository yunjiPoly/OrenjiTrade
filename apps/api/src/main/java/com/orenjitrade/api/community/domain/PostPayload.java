package com.orenjitrade.api.community.domain;

import com.orenjitrade.api.binders.domain.BinderLink;
import com.orenjitrade.api.cards.domain.CardLink;
import io.swagger.v3.oas.annotations.media.Schema;
import org.jspecify.annotations.Nullable;

/**
 * Links attached to a community post.
 *
 * @param card a shared printing
 * @param binder a shared public binder
 */
@Schema(name = "PostPayload", description = "Links attached to a community post")
public record PostPayload(@Nullable CardLink card, @Nullable BinderLink binder) {

    public static final PostPayload EMPTY = new PostPayload(null, null);
}
