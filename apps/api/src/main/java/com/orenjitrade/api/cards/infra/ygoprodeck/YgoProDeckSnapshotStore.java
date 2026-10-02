package com.orenjitrade.api.cards.infra.ygoprodeck;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Comparator;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Raw YGOPRODeck JSON snapshots on disk (git-ignored): {@code
 * <snapshotDir>/<database_version>/{checkDBVer.json, cardinfo.json, cardsets.json}}. The provider
 * asks to store pulled data locally and keep API calls to a minimum: a version directory is written
 * once (atomically, file by file) and reused by every later import of that version.
 */
final class YgoProDeckSnapshotStore {

    static final String CHECK_DB_VER = "checkDBVer.json";
    static final String CARD_INFO = "cardinfo.json";
    static final String CARD_SETS = "cardsets.json";

    /** Version directory names (also guards against path traversal from the API answer). */
    static final Pattern VERSION = Pattern.compile("^[0-9A-Za-z][0-9A-Za-z._-]{0,31}$");

    private final Path root;

    YgoProDeckSnapshotStore(Path root) {
        this.root = root.toAbsolutePath().normalize();
    }

    Path root() {
        return root;
    }

    /** A complete snapshot of {@code version}, if one is stored. */
    Optional<Snapshot> find(String version) {
        if (!VERSION.matcher(version).matches()) {
            return Optional.empty();
        }
        Path dir = root.resolve(version);
        Snapshot snapshot = new Snapshot(version, dir);
        return snapshot.complete() ? Optional.of(snapshot) : Optional.empty();
    }

    /** The complete snapshot with the newest directory modification time. */
    Optional<Snapshot> newest() {
        if (!Files.isDirectory(root)) {
            return Optional.empty();
        }
        try (Stream<Path> dirs = Files.list(root)) {
            return dirs.filter(Files::isDirectory)
                    .map(dir -> new Snapshot(dir.getFileName().toString(), dir))
                    .filter(s -> VERSION.matcher(s.version()).matches() && s.complete())
                    .max(Comparator.comparing(YgoProDeckSnapshotStore::modified));
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot list " + root, e);
        }
    }

    /** Directory of {@code version} (created). */
    Path prepare(String version) throws IOException {
        if (!VERSION.matcher(version).matches()) {
            throw new IOException("Unexpected database version format");
        }
        Path dir = root.resolve(version).normalize();
        if (!dir.startsWith(root)) {
            throw new IOException("Unexpected database version format");
        }
        Files.createDirectories(dir);
        return dir;
    }

    /** Streams {@code body} into {@code dir/name} through a temporary file and an atomic move. */
    static long write(Path dir, String name, InputStream body, long maxBytes) throws IOException {
        Path temp = dir.resolve(name + ".part");
        long written = 0;
        try (OutputStream out = Files.newOutputStream(temp)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = body.read(buffer)) != -1) {
                written += read;
                if (written > maxBytes) {
                    throw new IOException("Response larger than " + maxBytes + " bytes");
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

    private static long modified(Snapshot snapshot) {
        try {
            return Files.getLastModifiedTime(snapshot.dir().resolve(CARD_INFO)).toMillis();
        } catch (IOException e) {
            return 0;
        }
    }

    /** One stored version. */
    record Snapshot(String version, Path dir) {

        Path checkDbVer() {
            return dir.resolve(CHECK_DB_VER);
        }

        Path cardInfo() {
            return dir.resolve(CARD_INFO);
        }

        Path cardSets() {
            return dir.resolve(CARD_SETS);
        }

        boolean complete() {
            return Files.isRegularFile(cardInfo())
                    && Files.isRegularFile(cardSets())
                    && Files.isRegularFile(checkDbVer());
        }
    }
}
