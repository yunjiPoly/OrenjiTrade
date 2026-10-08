package com.orenjitrade.api.common.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * The local adapter behind the media and card image storage: files under a root, an instance-level
 * key policy, atomic moves, listings without working files, and no path escapes the root.
 */
class LocalFileObjectStorageTest {

    @TempDir Path root;

    private LocalFileObjectStorage media() {
        return new LocalFileObjectStorage(new StorageProperties("local", root.toString(), "", ""));
    }

    @Test
    void storesReadsAndDeletesMediaObjects() {
        LocalFileObjectStorage storage = media();
        String key = ObjectKeys.newKey("avatars", java.util.UUID.randomUUID(), "jpg");
        assertThat(storage.exists(key)).isFalse();
        assertThat(storage.size(key)).isEmpty();
        assertThat(storage.get(key)).isEmpty();

        storage.put(key, new byte[] {1, 2, 3}, "image/jpeg");
        assertThat(Files.isRegularFile(root.resolve(key))).isTrue();
        assertThat(storage.exists(key)).isTrue();
        assertThat(storage.size(key)).contains(3L);
        assertThat(storage.get(key))
                .hasValueSatisfying(
                        object -> {
                            assertThat(object.content()).containsExactly(1, 2, 3);
                            assertThat(object.contentType()).isEqualTo("image/jpeg");
                        });
        assertThat(storage.publicUrl(key)).isEqualTo("/api/v1/public/media/" + key);

        assertThat(storage.delete(key)).isTrue();
        assertThat(storage.delete(key)).as("missing is not an error").isFalse();
        assertThat(storage.exists(key)).isFalse();
    }

    @Test
    void theMediaInstanceAppliesTheMediaKeySyntax() {
        LocalFileObjectStorage storage = media();
        assertThatThrownBy(() -> storage.put("../escape.jpg", new byte[1], "image/jpeg"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> storage.get("avatars/x.JPG"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> storage.delete("a/b/c/d/e.jpg"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(Files.exists(root.resolve("escape.jpg"))).isFalse();
    }

    @Test
    void aCustomInstanceUsesItsOwnPolicyAndStaysInsideItsRoot() throws Exception {
        Path cache = root.resolve("card-images");
        LocalFileObjectStorage storage =
                new LocalFileObjectStorage(
                        cache, key -> key.matches("^[a-z/]+/[A-Z0-9.]+\\.jpg$"), "");
        storage.put("yugioh/ygoprodeck/ab/CARD.1.jpg", new byte[] {9}, "image/jpeg");
        assertThat(Files.readAllBytes(cache.resolve("yugioh/ygoprodeck/ab/CARD.1.jpg")))
                .containsExactly(9);
        assertThatThrownBy(() -> storage.put("yugioh/ygoprodeck/ab/card.jpg", new byte[1], "x"))
                .as("the media syntax does not apply, the instance policy does")
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> storage.exists("../../etc/X.jpg"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(Files.exists(root.resolve("etc"))).isFalse();
    }

    @Test
    void putFileMovesTheSourceIntoPlace() throws Exception {
        LocalFileObjectStorage storage = media();
        Path source = root.resolve(".staging").resolve("upload.part");
        Files.createDirectories(source.getParent());
        Files.write(source, "rendition".getBytes(StandardCharsets.UTF_8));

        storage.putFile(source, "cards/one.jpg", "image/jpeg");
        assertThat(Files.exists(source)).as("consumed").isFalse();
        assertThat(storage.get("cards/one.jpg"))
                .hasValueSatisfying(
                        object ->
                                assertThat(new String(object.content(), StandardCharsets.UTF_8))
                                        .isEqualTo("rendition"));

        // Replacing an existing object works too (REPLACE_EXISTING).
        Files.write(source, "newer".getBytes(StandardCharsets.UTF_8));
        storage.putFile(source, "cards/one.jpg", "image/jpeg");
        assertThat(storage.size("cards/one.jpg")).contains(5L);
    }

    @Test
    void listingsSkipWorkingFilesAndIncludeStrays() throws Exception {
        LocalFileObjectStorage storage = media();
        Instant before = Instant.now().minus(5, ChronoUnit.SECONDS);
        storage.put("cards/aa/1.jpg", new byte[10], "image/jpeg");
        storage.put("cards/bb/2.jpg", new byte[20], "image/jpeg");
        storage.put("other/3.png", new byte[30], "image/png");
        // A stray file with a name the policy refuses is still listed (so an owner can remove it)…
        Files.write(root.resolve("cards/aa/STRAY.bin"), new byte[7]);
        // …but working files (dot-prefixed names and directories) never are.
        Files.createDirectories(root.resolve(".tmp"));
        Files.write(root.resolve(".tmp/abc.part"), new byte[1000]);
        Files.write(root.resolve("cards/.upload-123.tmp"), new byte[1000]);

        List<ObjectSummary> all = storage.list("");
        assertThat(all)
                .extracting(ObjectSummary::key)
                .containsExactlyInAnyOrder(
                        "cards/aa/1.jpg", "cards/bb/2.jpg", "other/3.png", "cards/aa/STRAY.bin");
        assertThat(all)
                .allSatisfy(
                        object -> {
                            assertThat(object.lastModified()).isAfter(before);
                            assertThat(object.size()).isPositive();
                        });
        assertThat(storage.list("cards/"))
                .extracting(ObjectSummary::key)
                .containsExactlyInAnyOrder(
                        "cards/aa/1.jpg", "cards/bb/2.jpg", "cards/aa/STRAY.bin");
        assertThat(storage.list("cards/aa/")).extracting(ObjectSummary::size).contains(10L, 7L);

        // The stray cannot be deleted through the media policy: the owner decides what to do.
        assertThatThrownBy(() -> storage.delete("cards/aa/STRAY.bin"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void anEmptyOrMissingRootListsNothing() {
        LocalFileObjectStorage storage =
                new LocalFileObjectStorage(root.resolve("missing"), ObjectKeys::isValid, "");
        assertThat(storage.list("")).isEmpty();
        assertThat(storage.exists("avatars/x.jpg")).isFalse();
    }
}
