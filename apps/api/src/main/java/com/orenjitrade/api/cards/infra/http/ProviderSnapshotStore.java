package com.orenjitrade.api.cards.infra.http;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.Comparator;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Raw provider downloads on disk (git-ignored), one directory per provider version holding one data
 * file: {@code <root>/<version>/<dataFile>} (Scryfall's bulk file, TCGdex's repository archive).
 * Providers ask clients to store what they pull and keep calls to a minimum: a version is written
 * once (through a temporary file and an atomic move) and reused by every later import of that
 * version. The YGOPRODeck adapter keeps its own three-file store.
 */
public final class ProviderSnapshotStore {

    /** Version directory names (also guards against path traversal from a provider answer). */
    public static final Pattern VERSION = Pattern.compile("^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$");

    private final Path root;
    private final String dataFile;

    public ProviderSnapshotStore(Path root, String dataFile) {
        this.root = root.toAbsolutePath().normalize();
        this.dataFile = dataFile;
    }

    public Path root() {
        return root;
    }

    /** A complete snapshot of {@code version}, if one is stored. */
    public Optional<Snapshot> find(String version) {
        if (!VERSION.matcher(version).matches()) {
            return Optional.empty();
        }
        Snapshot snapshot = new Snapshot(version, root.resolve(version), dataFile);
        return snapshot.complete() ? Optional.of(snapshot) : Optional.empty();
    }

    /** The complete snapshot whose data file was written last. */
    public Optional<Snapshot> newest() {
        if (!Files.isDirectory(root)) {
            return Optional.empty();
        }
        try (Stream<Path> dirs = Files.list(root)) {
            return dirs.filter(Files::isDirectory)
                    .map(dir -> new Snapshot(dir.getFileName().toString(), dir, dataFile))
                    .filter(s -> VERSION.matcher(s.version()).matches() && s.complete())
                    .max(Comparator.comparing(Snapshot::storedAt));
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot list " + root, e);
        }
    }

    /** Directory of {@code version} (created). */
    public Path prepare(String version) throws IOException {
        if (!VERSION.matcher(version).matches()) {
            throw new IOException("Unexpected provider version format");
        }
        Path dir = root.resolve(version).normalize();
        if (!dir.startsWith(root)) {
            throw new IOException("Unexpected provider version format");
        }
        Files.createDirectories(dir);
        return dir;
    }

    /**
     * Streams {@code body} into {@code dir/name} through a temporary file and an atomic move.
     *
     * @return the bytes written
     * @throws ResponseTooLargeException the body exceeded {@code maxBytes} (nothing is kept; never
     *     retried)
     * @throws IOException a read or a write failed
     */
    public static long write(Path dir, String name, InputStream body, long maxBytes)
            throws IOException {
        Path temp = dir.resolve(name + ".part");
        long written = 0;
        try (OutputStream out = Files.newOutputStream(temp)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = body.read(buffer)) != -1) {
                written += read;
                if (written > maxBytes) {
                    throw new ResponseTooLargeException(maxBytes);
                }
                out.write(buffer, 0, read);
            }
        } catch (IOException | RuntimeException e) {
            Files.deleteIfExists(temp);
            throw e;
        }
        Path target = dir.resolve(name);
        try {
            Files.move(
                    temp,
                    target,
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING);
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
        }
        return written;
    }

    /** One stored version. */
    public record Snapshot(String version, Path dir, String dataFile) {

        public Path data() {
            return dir.resolve(dataFile);
        }

        public boolean complete() {
            return Files.isRegularFile(data());
        }

        /** When the data file was written ({@link Instant#EPOCH} when unreadable). */
        public Instant storedAt() {
            try {
                return Files.getLastModifiedTime(data()).toInstant();
            } catch (IOException e) {
                return Instant.EPOCH;
            }
        }
    }
}
