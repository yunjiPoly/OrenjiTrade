package com.orenjitrade.api.cards.images;

import com.google.cloud.storage.Storage;
import com.google.cloud.storage.contrib.nio.testing.LocalStorageHelper;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

/**
 * An in-memory Google Cloud Storage (google-cloud-nio's {@code LocalStorageHelper}) picked up by
 * {@code GcsObjectStorage} instead of Application Default Credentials: the card image cache then
 * runs its real cloud pipeline without credentials, network or Docker.
 */
@TestConfiguration(proxyBeanMethods = false)
public class FakeGcsConfiguration {

    @Bean
    Storage fakeGoogleCloudStorage() {
        return LocalStorageHelper.customOptions(false).getService();
    }
}
