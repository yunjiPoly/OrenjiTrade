package com.orenjitrade.api.common.storage;

import com.google.api.gax.paging.Page;
import com.google.cloud.storage.Blob;
import com.google.cloud.storage.BlobId;
import com.google.cloud.storage.BlobInfo;
import com.google.cloud.storage.Storage;
import com.google.cloud.storage.StorageException;
import com.google.cloud.storage.StorageOptions;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Predicate;
import java.util.function.Supplier;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

/**
 * Google Cloud Storage adapter (ADR 0013: Google client libraries, no Spring Cloud GCP). The
 * primary (media) instance is active only with {@code STORAGE_PROVIDER=gcs}; the card image cache
 * builds its own instance for the {@code card-images/} prefix of the media bucket (ADR 0015).
 * Credentials come from Application Default Credentials (the Cloud Run service account) unless a
 * {@link Storage} bean is present (tests); nothing is created or contacted in local development.
 * Objects are written with {@code Cache-Control: public, max-age=31536000, immutable} because every
 * key is random (media) or content-addressed (card renditions) and never rewritten with different
 * content.
 */
@Primary
@Component
@ConditionalOnProperty(
        name = "orenji.storage.provider",
        havingValue = StorageProperties.PROVIDER_GCS)
public class GcsObjectStorage implements ObjectStorage {

    static final String CACHE_CONTROL = "public, max-age=31536000, immutable";

    private final String bucket;
    private final String objectPrefix;
    private final Predicate<String> keyPolicy;
    private final Supplier<Storage> client;
    private final String publicBaseUrl;
    private @Nullable Storage storage;

    /** The media instance ({@link ObjectKeys} key syntax, bucket root). */
    @Autowired
    public GcsObjectStorage(StorageProperties properties, ObjectProvider<Storage> client) {
        this(
                requireBucket(properties.gcsBucketMedia(), "GCS_BUCKET_MEDIA"),
                "",
                ObjectKeys::isValid,
                client(client),
                properties.publicBaseUrl().isBlank()
                        ? "https://storage.googleapis.com/" + properties.gcsBucketMedia().trim()
                        : properties.publicBaseUrl());
    }

    /**
     * An instance for the objects below {@code objectPrefix} ({@code ""} or {@code "<dir>/"}) of
     * {@code bucket}, accepting the keys {@code keyPolicy} allows. The client is created lazily by
     * {@code client}, so start-up never needs Google credentials.
     */
    public GcsObjectStorage(
            String bucket,
            String objectPrefix,
            Predicate<String> keyPolicy,
            Supplier<Storage> client,
            String publicBaseUrl) {
        this.bucket = requireBucket(bucket, "bucket");
        if (!objectPrefix.isEmpty() && !objectPrefix.endsWith("/")) {
            throw new IllegalArgumentException("The object prefix must be empty or end with '/'");
        }
        this.objectPrefix = objectPrefix;
        this.keyPolicy = keyPolicy;
        this.client = client;
        String base = publicBaseUrl.trim();
        this.publicBaseUrl = base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
    }

    /** A {@link Storage} bean when one is defined (tests), else Application Default Credentials. */
    public static Supplier<Storage> client(ObjectProvider<Storage> provider) {
        return () -> {
            Storage configured = provider.getIfAvailable();
            return configured != null
                    ? configured
                    : StorageOptions.getDefaultInstance().getService();
        };
    }

    public String bucket() {
        return bucket;
    }

    public String objectPrefix() {
        return objectPrefix;
    }

    @Override
    public void put(String key, byte[] content, String contentType) {
        BlobInfo info =
                BlobInfo.newBuilder(blobId(key))
                        .setContentType(contentType)
                        .setCacheControl(CACHE_CONTROL)
                        .build();
        storage().create(info, content);
    }

    /** Uploads the file, then deletes it (an upload failure leaves the source in place). */
    @Override
    public void putFile(Path source, String key, String contentType) throws IOException {
        put(key, Files.readAllBytes(source), contentType);
        Files.deleteIfExists(source);
    }

    @Override
    public Optional<StoredObject> get(String key) {
        byte[] content;
        try {
            content = storage().readAllBytes(blobId(key));
        } catch (StorageException e) {
            if (e.getCode() == 404) {
                return Optional.empty();
            }
            throw e;
        }
        return Optional.of(
                new StoredObject(
                        content, ObjectKeys.contentTypeOf(key).orElse("application/octet-stream")));
    }

    @Override
    public boolean exists(String key) {
        return size(key).isPresent();
    }

    @Override
    public Optional<Long> size(String key) {
        @Nullable Blob blob =
                storage().get(blobId(key), Storage.BlobGetOption.fields(Storage.BlobField.SIZE));
        if (blob == null) {
            return Optional.empty();
        }
        return Optional.of(blob.getSize() == null ? 0L : blob.getSize());
    }

    @Override
    public List<ObjectSummary> list(String prefix) {
        List<ObjectSummary> objects = new ArrayList<>();
        Page<Blob> page =
                storage()
                        .list(
                                bucket,
                                Storage.BlobListOption.prefix(objectPrefix + prefix),
                                Storage.BlobListOption.fields(
                                        Storage.BlobField.NAME,
                                        Storage.BlobField.SIZE,
                                        Storage.BlobField.UPDATED));
        for (Blob blob : page.iterateAll()) {
            String name = blob.getName();
            if (name == null || !name.startsWith(objectPrefix) || name.endsWith("/")) {
                continue; // directory placeholders are not objects of ours
            }
            String key = name.substring(objectPrefix.length());
            if (key.isEmpty()) {
                continue;
            }
            @Nullable OffsetDateTime updated = blob.getUpdateTimeOffsetDateTime();
            objects.add(
                    new ObjectSummary(
                            key,
                            blob.getSize() == null ? 0L : blob.getSize(),
                            updated == null ? Instant.EPOCH : updated.toInstant()));
        }
        return objects;
    }

    @Override
    public boolean delete(String key) {
        return storage().delete(blobId(key));
    }

    @Override
    public String publicUrl(String key) {
        return publicBaseUrl + "/" + requireValid(key);
    }

    private BlobId blobId(String key) {
        return BlobId.of(bucket, objectPrefix + requireValid(key));
    }

    private String requireValid(String key) {
        if (!keyPolicy.test(key)) {
            throw new IllegalArgumentException("Invalid object key");
        }
        return key;
    }

    /** Created lazily so start-up never needs Google credentials. */
    private synchronized Storage storage() {
        if (storage == null) {
            storage = client.get();
        }
        return storage;
    }

    private static String requireBucket(String bucket, String name) {
        if (bucket == null || bucket.isBlank()) {
            throw new IllegalStateException(
                    name
                            + " (orenji.storage.gcs-bucket-media) must be set when"
                            + " STORAGE_PROVIDER=gcs");
        }
        return bucket.trim();
    }
}
