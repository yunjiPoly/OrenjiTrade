package com.orenjitrade.api.common.storage;

import java.util.Optional;

/**
 * Media storage abstraction (avatars today; binder images and chat attachments later). Keys are
 * validated by {@link ObjectKeys}; implementations never interpret them as filesystem paths beyond
 * their own root. Selected by {@code orenji.storage.provider}: {@link LocalFileObjectStorage}
 * ({@code local}, default) or {@link GcsObjectStorage} ({@code gcs}).
 */
public interface ObjectStorage {

    /** Stores (or replaces) an object. */
    void put(String key, byte[] content, String contentType);

    /** The object, or empty when it does not exist. */
    Optional<StoredObject> get(String key);

    /** Deletes an object; a missing object is not an error. */
    void delete(String key);

    /** URL clients use to fetch the object. */
    String publicUrl(String key);
}
