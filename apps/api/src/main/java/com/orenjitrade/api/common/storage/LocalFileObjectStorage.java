package com.orenjitrade.api.common.storage;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/**
 * Stores objects as files under a root directory. The primary (media) instance is rooted at {@code
 * orenji.storage.local-root} (default {@code ./.local-storage}, git-ignored) and served by {@code
 * GET /api/v1/public/media/{key}}; the card image cache builds its own instance rooted at {@code
 * CARD_IMAGE_CACHE_DIR} with its own key policy. The default adapter: local development needs no
 * cloud credentials.
 *
 * <p>Dot-prefixed names ({@code .upload-*.tmp} written by {@link #put}, the card cache's {@code
 * .tmp/} staging directory) are working files: {@link #list} never reports them.
 */
@Primary
@Component
@ConditionalOnProperty(
        name = "orenji.storage.provider",
        havingValue = StorageProperties.PROVIDER_LOCAL,
        matchIfMissing = true)
public class LocalFileObjectStorage implements ObjectStorage {

    static final String MEDIA_PATH = "/api/v1/public/media/";

    private static final Logger log = LoggerFactory.getLogger(LocalFileObjectStorage.class);

    private final Path root;
    private final Predicate<String> keyPolicy;
    private final String publicBaseUrl;

    /** The media instance ({@link ObjectKeys} key syntax). */
    @Autowired
    public LocalFileObjectStorage(StorageProperties properties) {
        this(Path.of(properties.localRoot()), ObjectKeys::isValid, properties.publicBaseUrl());
        log.info("Local object storage at {}", root);
    }

    /**
     * An instance rooted at {@code root} accepting the keys {@code keyPolicy} allows (every key is
     * additionally confined to the root).
     */
    public LocalFileObjectStorage(Path root, Predicate<String> keyPolicy, String publicBaseUrl) {
        this.root = root.toAbsolutePath().normalize();
        this.keyPolicy = keyPolicy;
        this.publicBaseUrl = stripTrailingSlash(publicBaseUrl);
    }

    public Path root() {
        return root;
    }

    @Override
    public void put(String key, byte[] content, String contentType) {
        Path target = resolve(key);
        try {
            Files.createDirectories(target.getParent());
            Path temp = Files.createTempFile(target.getParent(), ".upload-", ".tmp");
            try {
                Files.write(temp, content);
                move(temp, target);
            } finally {
                Files.deleteIfExists(temp);
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Could not store object", e);
        }
    }

    /** An atomic rename when the file system allows it (same volume), else a copy-and-replace. */
    @Override
    public void putFile(Path source, String key, String contentType) throws IOException {
        Path target = resolve(key);
        Files.createDirectories(target.getParent());
        move(source, target);
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
        } catch (NoSuchFileException e) {
            return Optional.empty();
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read object", e);
        }
    }

    @Override
    public boolean exists(String key) {
        return Files.isRegularFile(resolve(key));
    }

    @Override
    public Optional<Long> size(String key) {
        Path file = resolve(key);
        try {
            return Files.isRegularFile(file) ? Optional.of(Files.size(file)) : Optional.empty();
        } catch (NoSuchFileException e) {
            return Optional.empty();
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read object", e);
        }
    }

    @Override
    public List<ObjectSummary> list(String prefix) {
        List<ObjectSummary> objects = new ArrayList<>();
        if (!Files.isDirectory(root)) {
            return objects;
        }
        try {
            Files.walkFileTree(
                    root,
                    new SimpleFileVisitor<>() {
                        @Override
                        public FileVisitResult preVisitDirectory(
                                Path dir, BasicFileAttributes attrs) {
                            return !dir.equals(root) && isWorkingName(dir)
                                    ? FileVisitResult.SKIP_SUBTREE
                                    : FileVisitResult.CONTINUE;
                        }

                        @Override
                        public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                            if (attrs.isRegularFile() && !isWorkingName(file)) {
                                String key = root.relativize(file).toString().replace('\\', '/');
                                if (key.startsWith(prefix)) {
                                    objects.add(
                                            new ObjectSummary(
                                                    key,
                                                    attrs.size(),
                                                    attrs.lastModifiedTime().toInstant()));
                                }
                            }
                            return FileVisitResult.CONTINUE;
                        }

                        @Override
                        public FileVisitResult visitFileFailed(Path file, IOException exc) {
                            return FileVisitResult.CONTINUE;
                        }
                    });
        } catch (IOException e) {
            throw new UncheckedIOException("Could not list objects", e);
        }
        return objects;
    }

    @Override
    public boolean delete(String key) {
        try {
            return Files.deleteIfExists(resolve(key));
        } catch (IOException e) {
            throw new UncheckedIOException("Could not delete object", e);
        }
    }

    @Override
    public String publicUrl(String key) {
        requireValid(key);
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

    private static boolean isWorkingName(Path path) {
        Path name = path.getFileName();
        return name != null && name.toString().startsWith(".");
    }

    private static void move(Path source, Path target) throws IOException {
        try {
            Files.move(
                    source,
                    target,
                    StandardCopyOption.REPLACE_EXISTING,
                    StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private String requireValid(String key) {
        if (!keyPolicy.test(key)) {
            throw new IllegalArgumentException("Invalid object key");
        }
        return key;
    }

    /** The file of {@code key}; the key policy already excludes traversal, this double-checks. */
    private Path resolve(String key) {
        Path file = root.resolve(requireValid(key)).normalize();
        if (!file.startsWith(root) || file.equals(root)) {
            throw new IllegalArgumentException("Invalid object key");
        }
        return file;
    }

    private static String stripTrailingSlash(String url) {
        String trimmed = url.trim();
        return trimmed.endsWith("/") ? trimmed.substring(0, trimmed.length() - 1) : trimmed;
    }
}
