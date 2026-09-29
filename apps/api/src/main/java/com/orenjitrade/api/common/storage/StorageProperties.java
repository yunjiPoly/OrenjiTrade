package com.orenjitrade.api.common.storage;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code orenji.storage.*}.
 *
 * @param provider {@code local} (default) or {@code gcs}
 * @param localRoot directory of {@link LocalFileObjectStorage}
 * @param publicBaseUrl origin of public media URLs; empty means "this API" for local storage (built
 *     from the current request) and {@code https://storage.googleapis.com/<bucket>} for GCS
 * @param gcsBucketMedia bucket of {@link GcsObjectStorage}
 */
@ConfigurationProperties(prefix = "orenji.storage")
public record StorageProperties(
        @DefaultValue("local") String provider,
        @DefaultValue("./.local-storage") String localRoot,
        @DefaultValue("") String publicBaseUrl,
        @DefaultValue("") String gcsBucketMedia) {

    public static final String PROVIDER_LOCAL = "local";
    public static final String PROVIDER_GCS = "gcs";
}
