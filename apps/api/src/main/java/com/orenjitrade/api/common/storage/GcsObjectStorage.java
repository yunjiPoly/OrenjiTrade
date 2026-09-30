package com.orenjitrade.api.common.storage;

import com.google.cloud.storage.Blob;
import com.google.cloud.storage.BlobId;
import com.google.cloud.storage.BlobInfo;
import com.google.cloud.storage.Storage;
import com.google.cloud.storage.StorageOptions;
import java.util.Optional;
import org.jspecify.annotations.Nullable;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Google Cloud Storage adapter (ADR 0013: Google client libraries, no Spring Cloud GCP), active
 * only with {@code STORAGE_PROVIDER=gcs}. Credentials come from Application Default Credentials
 * (the Cloud Run service account); nothing is created or contacted in local development. Objects
 * are written with {@code Cache-Control: public, max-age=31536000, immutable} because every key is
 * random and never rewritten with different content.
 */
@Component
@ConditionalOnProperty(
        name = "orenji.storage.provider",
        havingValue = StorageProperties.PROVIDER_GCS)
public class GcsObjectStorage implements ObjectStorage {

    static final String CACHE_CONTROL = "public, max-age=31536000, immutable";

    private final String bucket;
    private final String publicBaseUrl;
    private @Nullable Storage storage;

    public GcsObjectStorage(StorageProperties properties) {
        if (properties.gcsBucketMedia().isBlank()) {
            throw new IllegalStateException(
                    "GCS_BUCKET_MEDIA (orenji.storage.gcs-bucket-media) must be set when"
                            + " STORAGE_PROVIDER=gcs");
        }
        this.bucket = properties.gcsBucketMedia().trim();
        String base = properties.publicBaseUrl().trim();
        if (base.isEmpty()) {
            base = "https://storage.googleapis.com/" + bucket;
        }
        this.publicBaseUrl = base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
    }

    @Override
    public void put(String key, byte[] content, String contentType) {
        BlobInfo info =
                BlobInfo.newBuilder(BlobId.of(bucket, ObjectKeys.requireValid(key)))
                        .setContentType(contentType)
                        .setCacheControl(CACHE_CONTROL)
                        .build();
        storage().create(info, content);
    }

    @Override
    public Optional<StoredObject> get(String key) {
        @Nullable Blob blob = storage().get(BlobId.of(bucket, ObjectKeys.requireValid(key)));
        if (blob == null || !blob.exists()) {
            return Optional.empty();
        }
        String contentType =
                blob.getContentType() != null
                        ? blob.getContentType()
                        : ObjectKeys.contentTypeOf(key).orElse("application/octet-stream");
        return Optional.of(new StoredObject(blob.getContent(), contentType));
    }

    @Override
    public void delete(String key) {
        storage().delete(BlobId.of(bucket, ObjectKeys.requireValid(key)));
    }

    @Override
    public String publicUrl(String key) {
        return publicBaseUrl + "/" + ObjectKeys.requireValid(key);
    }

    /** Created lazily so start-up never needs Google credentials. */
    private synchronized Storage storage() {
        if (storage == null) {
            storage = StorageOptions.getDefaultInstance().getService();
        }
        return storage;
    }
}
