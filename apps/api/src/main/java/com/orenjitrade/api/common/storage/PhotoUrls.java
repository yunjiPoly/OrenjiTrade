package com.orenjitrade.api.common.storage;

import com.orenjitrade.api.common.ApiException;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/**
 * The URLs of listing photos (an inventory item's photos, a binder's or deck core's photos): opaque
 * by the photo's own id, {@code /api/v1/public/item-images/{id}} and {@code
 * /api/v1/public/binder-images/{id}}. Their storage keys ({@code inventory/<owner
 * id>/<random>.jpg}, {@code binders/<owner id>/<random>.jpg}) stay on the server: a listing photo
 * reaches signed-out visitors, who never learn who a collector is, so its URL never carries the
 * owner's account id (stage R15, review fix 1). Like card images, the URL is absolute against the
 * request's origin while a request is being answered, else API-relative.
 */
public final class PhotoUrls {

    /** Public path of an inventory item's photos (by photo id). */
    public static final String ITEM_IMAGE_PATH = "/api/v1/public/item-images/";

    /** Public path of a binder's photos (by photo id). */
    public static final String BINDER_IMAGE_PATH = "/api/v1/public/binder-images/";

    private static final String NOT_FOUND = "The requested resource does not exist";

    private PhotoUrls() {}

    /** URL of an inventory item's photo. */
    public static String itemImage(UUID imageId) {
        return absolute(ITEM_IMAGE_PATH + imageId);
    }

    /** URL of a binder's photo. */
    public static String binderImage(UUID imageId) {
        return absolute(BINDER_IMAGE_PATH + imageId);
    }

    /**
     * The photo id of a path variable, or a plain {@code 404} for anything that is not one (the
     * routes never reveal more than the public media route does).
     */
    public static UUID idOrNotFound(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException e) {
            throw ApiException.notFound(NOT_FOUND);
        }
    }

    /** The stored photo, immutable for a year (a photo id is never reused), or a plain 404. */
    public static ResponseEntity<byte[]> serve(Optional<StoredObject> photo) {
        StoredObject object = photo.orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        return ResponseEntity.ok()
                .cacheControl(PublicMediaController.IMMUTABLE)
                .contentType(MediaType.parseMediaType(object.contentType()))
                .contentLength(object.content().length)
                .body(object.content());
    }

    private static String absolute(String path) {
        if (RequestContextHolder.getRequestAttributes() != null) {
            return ServletUriComponentsBuilder.fromCurrentContextPath()
                    .path(path)
                    .build()
                    .toUriString();
        }
        return path;
    }
}
