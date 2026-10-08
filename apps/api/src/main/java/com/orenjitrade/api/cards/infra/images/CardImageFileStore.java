package com.orenjitrade.api.cards.infra.images;

import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * Keys and temporary files of the card image cache (ADR 0015). Final renditions live behind the
 * cache's {@link com.orenjitrade.api.common.storage.ObjectStorage} (local files under the cache
 * directory, or objects under a bucket prefix in the cloud) at deterministic keys {@code
 * <game>/<provider>/<shard>/<providerImageId>.jpg} (shard = first two hex digits of the SHA-256 of
 * the image id, so no directory grows past a few hundred files); in-flight downloads always write
 * to the local directory, only below {@code .tmp/}, named after their capacity reservation ({@code
 * <reservationId>.part} for the raw body, {@code <reservationId>.jpg.tmp} for the rendition) so
 * reconciliation can tell orphans from live downloads. Every path is resolved inside the cache root
 * (no traversal).
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

    /** A path segment the storage may hold: no dot-prefixed (working) names, no traversal. */
    private static final Pattern SAFE_SEGMENT =
            Pattern.compile("^[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}$");

    static final int MAX_SAFE_KEY_LENGTH = 300;

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
    // Keys
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

    /** A key the cache itself produces ({@link #keyOf}). */
    public static boolean isValidKey(String key) {
        return KEY.matcher(key).matches() && !key.contains("..");
    }

    /**
     * Key policy of the cache's object storage: any traversal-free relative path made of plain
     * segments (so reconciliation can delete stray objects that are not valid cache keys), never a
     * dot-prefixed segment (the {@code .tmp/} staging directory and other working files).
     */
    public static boolean isSafeKey(String key) {
        if (key.isEmpty() || key.length() > MAX_SAFE_KEY_LENGTH) {
            return false;
        }
        for (String segment : key.split("/", -1)) {
            if (!SAFE_SEGMENT.matcher(segment).matches()) {
                return false;
            }
        }
        return true;
    }

    // -------------------------------------------------------------------------------------
    // Temporary files
    // -------------------------------------------------------------------------------------

    public Path rawTemp(UUID reservationId) {
        return root.resolve(TEMP_DIR).resolve(reservationId + ".part");
    }

    public Path renditionTemp(UUID reservationId) {
        return root.resolve(TEMP_DIR).resolve(reservationId + ".jpg.tmp");
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

    /**
     * Removes empty directories below the root (after clears; local storage only, where the
     * renditions share the root with {@code .tmp/}).
     */
    public void pruneEmptyDirectories() {
        if (!Files.isDirectory(root)) {
            return;
        }
        Path temp = root.resolve(TEMP_DIR);
        try {
            Files.walkFileTree(
                    root,
                    new java.nio.file.SimpleFileVisitor<>() {
                        @Override
                        public java.nio.file.FileVisitResult postVisitDirectory(
                                Path dir, IOException exc) {
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
                            return java.nio.file.FileVisitResult.CONTINUE;
                        }

                        @Override
                        public java.nio.file.FileVisitResult visitFileFailed(
                                Path file, IOException exc) {
                            return java.nio.file.FileVisitResult.CONTINUE;
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
