package com.orenjitrade.api.cards.domain;

import java.util.List;
import org.jspecify.annotations.Nullable;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/**
 * Card image URLs. Stored URLs are absolute or API-relative paths (placeholders); relative paths
 * are resolved against the origin of the current request so web and mobile clients on other origins
 * can load them. No third-party image is ever hotlinked by the local catalog.
 */
public final class CatalogImages {

    /** Path of the server-generated placeholder SVGs. */
    public static final String PLACEHOLDER_PREFIX = "/api/v1/public/placeholder-images/";

    /** Placeholder dimensions (63 x 88 mm card ratio). */
    public static final int PLACEHOLDER_WIDTH = 488;

    public static final int PLACEHOLDER_HEIGHT = 680;

    public static final String KIND_FRONT = "FRONT";

    private CatalogImages() {}

    /** API-relative path of the placeholder of a card. */
    public static String placeholderPath(String gameSlug, String cardSlug) {
        return PLACEHOLDER_PREFIX + gameSlug + "/" + cardSlug + ".svg";
    }

    /** Absolute URL for clients (relative paths get the current request's origin). */
    public static String resolve(String url) {
        if (!url.startsWith("/")) {
            return url;
        }
        if (RequestContextHolder.getRequestAttributes() != null) {
            return ServletUriComponentsBuilder.fromCurrentContextPath()
                    .path(url)
                    .build()
                    .toUriString();
        }
        return url;
    }

    /** The resolved stored URL, or the card's placeholder when there is none. */
    public static String resolveOrPlaceholder(
            @Nullable String url, String gameSlug, String cardSlug) {
        return resolve(url != null ? url : placeholderPath(gameSlug, cardSlug));
    }

    /** The images of a printing, or a single placeholder FRONT image when none is stored. */
    public static List<PrintingImage> orPlaceholder(
            List<PrintingImage> images, String gameSlug, String cardSlug) {
        if (!images.isEmpty()) {
            return images;
        }
        return List.of(
                new PrintingImage(
                        KIND_FRONT,
                        resolve(placeholderPath(gameSlug, cardSlug)),
                        PLACEHOLDER_WIDTH,
                        PLACEHOLDER_HEIGHT));
    }
}
