package com.orenjitrade.api.common.storage;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/**
 * Stores objects as files under {@code orenji.storage.local-root} (default {@code
 * ./.local-storage}, git-ignored), served by {@code GET /api/v1/public/media/{key}}. The default
 * adapter: local development needs no cloud credentials.
 */
@Component
@ConditionalOnProperty(
        name = "orenji.storage.provider",
        havingValue = StorageProperties.PROVIDER_LOCAL,
        matchIfMissing = true)
public class LocalFileObjectStorage implements ObjectStorage {

    static final String MEDIA_PATH = "/api/v1/public/media/";

    private static final Logger log = LoggerFactory.getLogger(LocalFileObjectStorage.class);

    private final Path root;
    private final String publicBaseUrl;

    public LocalFileObjectStorage(StorageProperties properties) {
        this.root = Path.of(properties.localRoot()).toAbsolutePath().normalize();
        this.publicBaseUrl = stripTrailingSlash(properties.publicBaseUrl());
        log.info("Local object storage at {}", root);
    }

    @Override
    public void put(String key, byte[] content, String contentType) {
        Path target = resolve(key);
        try {
            Files.createDirectories(target.getParent());
            Path temp = Files.createTempFile(target.getParent(), ".upload-", ".tmp");
            try {
                Files.write(temp, content);
                try {
                    Files.move(
                            temp,
                            target,
                            StandardCopyOption.REPLACE_EXISTING,
                            StandardCopyOption.ATOMIC_MOVE);
                } catch (AtomicMoveNotSupportedException e) {
                    Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
                }
            } finally {
                Files.deleteIfExists(temp);
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Could not store object", e);
        }
    }

    @Override
    public Optional<StoredObject> get(String key) {
        Path file = resolve(key);
        if (!Files.isRegularFile(file)) {
            return Optional.empty();
        }
        try {
            return Optional.of(
                    new StoredObject(
                            Files.readAllBytes(file),
                            ObjectKeys.contentTypeOf(key).orElse("application/octet-stream")));
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read object", e);
        }
    }

    @Override
    public void delete(String key) {
        try {
            Files.deleteIfExists(resolve(key));
        } catch (IOException e) {
            throw new UncheckedIOException("Could not delete object", e);
        }
    }

    @Override
    public String publicUrl(String key) {
        ObjectKeys.requireValid(key);
        if (!publicBaseUrl.isEmpty()) {
            return publicBaseUrl + MEDIA_PATH + key;
        }
        if (RequestContextHolder.getRequestAttributes() != null) {
            return ServletUriComponentsBuilder.fromCurrentContextPath()
                    .path(MEDIA_PATH + key)
                    .build()
                    .toUriString();
        }
        return MEDIA_PATH + key;
    }

    /** The file of {@code key}; the key syntax already excludes traversal, this double-checks. */
    private Path resolve(String key) {
        Path file = root.resolve(ObjectKeys.requireValid(key)).normalize();
        if (!file.startsWith(root)) {
            throw new IllegalArgumentException("Invalid object key");
        }
        return file;
    }

    private static String stripTrailingSlash(String url) {
        String trimmed = url.trim();
        return trimmed.endsWith("/") ? trimmed.substring(0, trimmed.length() - 1) : trimmed;
    }
}
