package com.orenjitrade.api.cards.infra.images;

import com.google.cloud.storage.Storage;
import com.orenjitrade.api.cards.domain.images.CardImageCache;
import com.orenjitrade.api.cards.domain.images.CardImageCacheProperties;
import com.orenjitrade.api.common.storage.GcsObjectStorage;
import com.orenjitrade.api.common.storage.LocalFileObjectStorage;
import com.orenjitrade.api.common.storage.ObjectStorage;
import com.orenjitrade.api.common.storage.StorageProperties;
import java.nio.file.Path;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The object storage of the card image cache (ADR 0015): the renditions live in local files under
 * {@code CARD_IMAGE_CACHE_DIR} (one directory per database, exactly as before the cloud profile)
 * or, with the {@code gcs} provider, as objects under {@code CARD_IMAGE_OBJECT_PREFIX} (default
 * {@code card-images/}) of the media bucket (or {@code CARD_IMAGE_GCS_BUCKET}). The provider
 * follows {@code STORAGE_PROVIDER} unless {@code CARD_IMAGE_STORAGE_PROVIDER} overrides it.
 *
 * <p>Keys follow {@link CardImageFileStore#isSafeKey} rather than the media key syntax: the cache
 * generates its own deterministic keys, and reconciliation must be able to list and delete stray
 * objects. The media {@link ObjectStorage} stays the primary bean; this one is injected by name.
 */
@Configuration(proxyBeanMethods = false)
public class CardImageStorageConfig {

    private static final Logger log = LoggerFactory.getLogger(CardImageStorageConfig.class);

    @Bean(CardImageCache.STORAGE_BEAN)
    ObjectStorage cardImageStorage(
            CardImageCacheProperties cache,
            StorageProperties media,
            ObjectProvider<Storage> gcsClient) {
        String provider = cache.provider().isBlank() ? media.provider() : cache.provider();
        if (StorageProperties.PROVIDER_GCS.equals(provider)) {
            String bucket =
                    cache.gcsBucket().isBlank() ? media.gcsBucketMedia() : cache.gcsBucket();
            if (bucket.isBlank()) {
                throw new IllegalStateException(
                        "CARD_IMAGE_GCS_BUCKET (orenji.card-images.cache.gcs-bucket) or"
                                + " GCS_BUCKET_MEDIA must be set when the card image cache uses"
                                + " the gcs provider");
            }
            log.info(
                    "Card image renditions stored as objects in gs://{}/{}",
                    bucket.trim(),
                    cache.objectPrefix());
            return new GcsObjectStorage(
                    bucket.trim(),
                    cache.objectPrefix(),
                    CardImageFileStore::isSafeKey,
                    GcsObjectStorage.client(gcsClient),
                    "");
        }
        if (!StorageProperties.PROVIDER_LOCAL.equals(provider)) {
            throw new IllegalStateException(
                    "Unknown card image storage provider '" + provider + "' (local | gcs)");
        }
        Path dir = Path.of(cache.dir()).toAbsolutePath().normalize();
        log.info("Card image renditions stored as files in {}", dir);
        return new LocalFileObjectStorage(dir, CardImageFileStore::isSafeKey, "");
    }
}
