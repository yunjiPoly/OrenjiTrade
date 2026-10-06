package com.orenjitrade.api.common.storage;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

/**
 * Object storage abstraction: media (avatars, item photos, chat uploads, dispute evidence) and the
 * card image cache (ADR 0015). Keys are validated by the instance's key policy ({@link ObjectKeys}
 * for media); implementations never interpret them as filesystem paths beyond their own root or
 * object prefix. Selected by {@code orenji.storage.provider}: {@link LocalFileObjectStorage}
 * ({@code local}, default) or {@link GcsObjectStorage} ({@code gcs}). The media instance is the
 * primary bean; the card image cache has its own instance ({@code cardImageStorage}) rooted at its
 * own directory or bucket prefix.
 */
public interface ObjectStorage {

    /** Stores (or replaces) an object. */
    void put(String key, byte[] content, String contentType);

    /**
     * Stores (or replaces) an object from a local file and consumes the file: an atomic rename for
     * local storage, an upload followed by the deletion of the source for a cloud bucket. On
     * failure the source may still exist; the caller deletes it.
     */
    void putFile(Path source, String key, String contentType) throws IOException;

    /** The object, or empty when it does not exist. */
    Optional<StoredObject> get(String key);

    /** Whether the object exists (metadata only, the content is not read). */
    boolean exists(String key);

    /** Size of the object in bytes, empty when it does not exist. */
    Optional<Long> size(String key);

    /**
     * Every object whose key starts with {@code prefix} ({@code ""} for all), with size and last
     * modification time. Working files of the adapter or of the owner of the root (dot-prefixed
     * names) are never listed. Keys that fail the key policy (stray objects) are listed so the
     * owner can account for or remove them.
     */
    List<ObjectSummary> list(String prefix);

    /** Deletes an object; {@code true} when one existed. A missing object is not an error. */
    boolean delete(String key);

    /** URL clients use to fetch the object. */
    String publicUrl(String key);
}
