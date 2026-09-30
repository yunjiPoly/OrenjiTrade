package com.orenjitrade.api.cards.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import org.jspecify.annotations.Nullable;

/**
 * An image of a printing. Printings without a stored image get the server-generated placeholder.
 *
 * @param kind FRONT, BACK or ART_CROP
 * @param url absolute URL
 * @param width pixel width
 * @param height pixel height
 */
@Schema(name = "PrintingImage", description = "Image of a printing")
public record PrintingImage(
        @Schema(
                        example = "FRONT",
                        allowableValues = {"FRONT", "BACK", "ART_CROP"})
                String kind,
        String url,
        @Nullable Integer width,
        @Nullable Integer height) {}
