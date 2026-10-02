package com.orenjitrade.api.cards.infra.images;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.DirectoryStream;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * Files of the card image cache (ADR 0015). Final renditions live at deterministic keys {@code
 * <game>/<provider>/<shard>/<providerImageId>.jpg} (shard = first two hex digits of the SHA-256 of
 * the image id, so no directory grows past a few hundred files); in-flight downloads write only
 * below {@code .tmp/}, named after their capacity reservation ({@code <reservationId>.part} for the
 * raw body, {@code <reservationId>.jpg.tmp} for the rendition) so reconciliation can tell orphans
 * from live downloads. Every path is resolved inside the cache root (no traversal).
 */
public final class CardImageFileStore {

    public static final String TEMP_DIR = ".tmp";

    private static final Pattern SEGMENT = Pattern.compile("^[a-z0-9]+(-[a-z0-9]+)*$");
    private static final Pattern IMAGE_ID = Pattern.compile("^[A-Za-z0-9._-]{1,64}$");
    private static final Pattern TEMP_NAME =
            Pattern.compile(
                    "^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\\.(part|jpg\\.tmp)$");
    private static final Pattern KEY =
            Pattern.compile("^[a-z0-9-]+/[a-z0-9-]+/[0-9a-f]{2}/[A-Za-z0-9._-]{1,64}\\.jpg$");

    private final Path root;

    public CardImageFileStore(Path root) {
        this.root = root.toAbsolutePath().normalize();
    }

    public Path root() {
        return root;
    }

    /** Creates the root and the temporary directory. */
    public void init() {
        try {
            Files.createDirectories(root.resolve(TEMP_DIR));
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot create the card image cache " + root, e);
        }
    }

    // -------------------------------------------------------------------------------------
    // Keys and paths
    // -------------------------------------------------------------------------------------

    /** Deterministic key of a provider artwork. */
    public static String keyOf(String gameSlug, String providerId, String providerImageId) {
        String game = gameSlug.toLowerCase(Locale.ROOT);
        String provider = providerId.toLowerCase(Locale.ROOT);
        if (!SEGMENT.matcher(game).matches()
                || !SEGMENT.matcher(provider).matches()
                || !IMAGE_ID.matcher(providerImageId).matches()
                || providerImageId.contains("..")) {
            throw new IllegalArgumentException("Invalid card image key components");
        }
        return game
                + "/"
                + provider
                + "/"
                + shard(providerImageId)
                + "/"
                + providerImageId
                + ".jpg";
    }

    static String shard(String providerImageId) {
        try {
            byte[] digest =
                    MessageDigest.getInstance("SHA-256")
                            .digest(providerImageId.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest, 0, 1);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public static boolean isValidKey(String key) {
        return KEY.matcher(key).matches() && !key.contains("..");
    }

    /** Absolute path of a final file (refuses keys outside the cache). */
    public Path pathOf(String key) {
        if (!isValidKey(key)) {
            throw new IllegalArgumentException("Invalid card image key");
        }
        Path path = root.resolve(key).normalize();
        if (!path.startsWith(root) || path.startsWith(root.resolve(TEMP_DIR))) {
            throw new IllegalArgumentException("Invalid card image key");
        }
        return path;
    }

    public Path rawTemp(UUID reservationId) {
        return root.resolve(TEMP_DIR).resolve(reservationId + ".part");
    }

    public Path renditionTemp(UUID reservationId) {
        return root.resolve(TEMP_DIR).resolve(reservationId + ".jpg.tmp");
    }

    // -------------------------------------------------------------------------------------
    // Operations
    // -------------------------------------------------------------------------------------

    public boolean exists(String key) {
        return Files.isRegularFile(pathOf(key));
    }

    /** Size of a final file, empty when missing. */
    public Optional<Long> size(String key) {
        try {
            return Optional.of(Files.size(pathOf(key)));
        } catch (NoSuchFileException e) {
            return Optional.empty();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public InputStream open(String key) throws IOException {
        return Files.newInputStream(pathOf(key));
    }

    /** Writes the rendition of a reservation into its temporary file. */
    public Path writeRenditionTemp(UUID reservationId, byte[] data) throws IOException {
        Path temp = renditionTemp(reservationId);
        Files.createDirectories(temp.getParent());
        try (OutputStream out =
                Files.newOutputStream(
                        temp,
                        StandardOpenOption.CREATE,
                        StandardOpenOption.TRUNCATE_EXISTING,
                        StandardOpenOption.WRITE)) {
            out.write(data);
        }
        return temp;
    }

    /** Moves a temporary file to its final key atomically (same file system). */
    public void moveIntoPlace(Path temp, String key) throws IOException {
        Path target = pathOf(key);
        Files.createDirectories(target.getParent());
        try {
            Files.move(
                    temp,
                    target,
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING);
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    /** Deletes a final file; {@code true} when one was removed. */
    public boolean delete(String key) {
        try {
            return Files.deleteIfExists(pathOf(key));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Deletes the temporary files of a reservation. */
    public void deleteTemps(UUID reservationId) {
        deleteQuietly(rawTemp(reservationId));
        deleteQuietly(renditionTemp(reservationId));
    }

    public static void deleteQuietly(@Nullable Path path) {
        if (path == null) {
            return;
        }
        try {
            Files.deleteIfExists(path);
        } catch (IOException e) {
            // best effort; reconciliation removes leftovers
        }
    }

    /** Final files by key with their size ({@code .tmp/} and unknown files excluded). */
    public Map<String, Long> finalFiles() {
        Map<String, Long> files = new LinkedHashMap<>();
        if (!Files.isDirectory(root)) {
            return files;
        }
        Path temp = root.resolve(TEMP_DIR);
        try {
            Files.walkFileTree(
                    root,
                    new SimpleFileVisitor<>() {
                        @Override
                        public FileVisitResult preVisitDirectory(
                                Path dir, BasicFileAttributes attrs) {
                            return dir.equals(temp)
                                    ? FileVisitResult.SKIP_SUBTREE
                                    : FileVisitResult.CONTINUE;
                        }

                        @Override
                        public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                            if (attrs.isRegularFile()) {
                                String key = root.relativize(file).toString().replace('\\', '/');
                                files.put(key, attrs.size());
                            }
                            return FileVisitResult.CONTINUE;
                        }

                        @Override
                        public FileVisitResult visitFileFailed(Path file, IOException exc) {
                            return FileVisitResult.CONTINUE;
                        }
                    });
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot scan the card image cache", e);
        }
        return files;
    }

    /** Files that are not valid final keys (stray files inside the cache tree). */
    public List<String> strayFiles(Map<String, Long> finalFiles) {
        List<String> stray = new ArrayList<>();
        finalFiles.keySet().stream().filter(key -> !isValidKey(key)).forEach(stray::add);
        return stray;
    }

    /** Deletes a stray file found by {@link #finalFiles()} (any relative path inside the root). */
    public boolean deleteRelative(String relative) {
        Path path = root.resolve(relative).normalize();
        if (!path.startsWith(root) || path.equals(root)) {
            return false;
        }
        try {
            return Files.deleteIfExists(path);
        } catch (IOException e) {
            return false;
        }
    }

    /** Whether a file found by {@link #finalFiles()} is still present. */
    public boolean existsRelative(String relative) {
        Path path = root.resolve(relative).normalize();
        return path.startsWith(root) && !path.equals(root) && Files.exists(path);
    }

    /** Temporary files with the reservation id they belong to ({@code null} for foreign names). */
    public List<TempFile> tempFiles() {
        List<TempFile> temps = new ArrayList<>();
        Path dir = root.resolve(TEMP_DIR);
        if (!Files.isDirectory(dir)) {
            return temps;
        }
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir)) {
            for (Path file : stream) {
                Matcher matcher = TEMP_NAME.matcher(file.getFileName().toString());
                long size;
                try {
                    size = Files.size(file);
                } catch (IOException e) {
                    continue;
                }
                temps.add(
                        new TempFile(
                                file,
                                matcher.matches() ? UUID.fromString(matcher.group(1)) : null,
                                size));
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot scan the card image cache", e);
        }
        return temps;
    }

    /** Removes empty directories below the root (after clears). */
    public void pruneEmptyDirectories() {
        if (!Files.isDirectory(root)) {
            return;
        }
        Path temp = root.resolve(TEMP_DIR);
        try {
            Files.walkFileTree(
                    root,
                    new SimpleFileVisitor<>() {
                        @Override
                        public FileVisitResult postVisitDirectory(Path dir, IOException exc) {
                            if (!dir.equals(root) && !dir.equals(temp)) {
                                try (DirectoryStream<Path> entries =
                                        Files.newDirectoryStream(dir)) {
                                    if (!entries.iterator().hasNext()) {
                                        Files.deleteIfExists(dir);
                                    }
                                } catch (IOException ignored) {
                                    // keep it
                                }
                            }
                            return FileVisitResult.CONTINUE;
                        }

                        @Override
                        public FileVisitResult visitFileFailed(Path file, IOException exc) {
                            return FileVisitResult.CONTINUE;
                        }
                    });
        } catch (IOException ignored) {
            // best effort
        }
    }

    /**
     * A temporary download file.
     *
     * @param path absolute path
     * @param reservationId owning reservation, {@code null} when the name is not ours
     * @param size bytes
     */
    public record TempFile(Path path, @Nullable UUID reservationId, long size) {}
}
