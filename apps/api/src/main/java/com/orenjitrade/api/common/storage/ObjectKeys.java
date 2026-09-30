package com.orenjitrade.api.common.storage;

import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Object key rules shared by every storage adapter and the public media endpoint. A key is 2 to 4
 * lower-case segments separated by {@code /}, each {@code [a-z0-9][a-z0-9_-]*}, the last one with a
 * known media extension, e.g. {@code avatars/<user-uuid>/<32 hex>.jpg}. No dots except the
 * extension, no empty segments, no traversal, at most {@value #MAX_LENGTH} characters.
 *
 * <p>Private namespaces ({@link #PRIVATE_NAMESPACES}: dispute evidence, Phase 9) and PDF documents
 * are never served by the public media route ({@link #isPublic}); their owning module serves them
 * after an authorization check.
 */
public final class ObjectKeys {

    public static final int MAX_LENGTH = 200;

    /** Namespaces whose objects are never public (served only after an authorization check). */
    public static final Set<String> PRIVATE_NAMESPACES = Set.of("disputes");

    private static final Pattern VALID =
            Pattern.compile(
                    "^[a-z0-9][a-z0-9_-]{0,63}(/[a-z0-9][a-z0-9_-]{0,63}){0,2}"
                            + "/[a-z0-9][a-z0-9_-]{0,127}\\.(jpg|png|webp|pdf)$");

    private static final Map<String, String> CONTENT_TYPES =
            Map.of(
                    "jpg",
                    "image/jpeg",
                    "png",
                    "image/png",
                    "webp",
                    "image/webp",
                    "pdf",
                    "application/pdf");

    private static final SecureRandom RANDOM = new SecureRandom();

    private ObjectKeys() {}

    public static boolean isValid(String key) {
        return key.length() <= MAX_LENGTH && VALID.matcher(key).matches();
    }

    /**
     * Whether the public media route may serve {@code key}: a valid image key outside the {@link
     * #PRIVATE_NAMESPACES}.
     */
    public static boolean isPublic(String key) {
        if (!isValid(key) || key.endsWith(".pdf")) {
            return false;
        }
        return !PRIVATE_NAMESPACES.contains(key.substring(0, key.indexOf('/')));
    }

    /** Throws {@link IllegalArgumentException} when {@code key} is not a valid object key. */
    public static String requireValid(String key) {
        if (!isValid(key)) {
            throw new IllegalArgumentException("Invalid object key");
        }
        return key;
    }

    /** Media type implied by the key's extension. */
    public static Optional<String> contentTypeOf(String key) {
        int dot = key.lastIndexOf('.');
        if (dot < 0) {
            return Optional.empty();
        }
        return Optional.ofNullable(
                CONTENT_TYPES.get(key.substring(dot + 1).toLowerCase(Locale.ROOT)));
    }

    /**
     * A fresh, unguessable key {@code <namespace>/<owner>/<32 hex>.<extension>}. Random names make
     * every stored object immutable (a replacement gets a new key), which allows long-lived
     * caching.
     */
    public static String newKey(String namespace, UUID owner, String extension) {
        byte[] random = new byte[16];
        RANDOM.nextBytes(random);
        return requireValid(
                namespace + "/" + owner + "/" + HexFormat.of().formatHex(random) + "." + extension);
    }
}
