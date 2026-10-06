package com.orenjitrade.api.cards.infra.images;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * Deterministic, traversal-proof cache keys, the storage key policy and temporary files named after
 * reservations.
 */
class CardImageFileStoreTest {

    @TempDir Path root;

    @Test
    void keysAreDeterministicAndSharded() {
        String key = CardImageFileStore.keyOf("yugioh", "ygoprodeck", "89631139");
        assertThat(key).matches("^yugioh/ygoprodeck/[0-9a-f]{2}/89631139\\.jpg$");
        assertThat(CardImageFileStore.keyOf("yugioh", "ygoprodeck", "89631139")).isEqualTo(key);
        assertThat(CardImageFileStore.isValidKey(key)).isTrue();
        assertThat(CardImageFileStore.isSafeKey(key)).isTrue();
    }

    @Test
    void invalidComponentsAndTraversalAreRefused() {
        assertThatThrownBy(() -> CardImageFileStore.keyOf("../x", "ygoprodeck", "1"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> CardImageFileStore.keyOf("yugioh", "ygoprodeck", "../../etc"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(CardImageFileStore.isValidKey("yugioh/ygoprodeck/zz/1.jpg")).isFalse();
        assertThat(CardImageFileStore.isValidKey("../outside.jpg")).isFalse();
        assertThat(CardImageFileStore.isValidKey(".tmp/x/ab/1.jpg")).isFalse();
    }

    @Test
    void theStoragePolicyAllowsStrayNamesButNeverTraversalOrWorkingFiles() {
        // Stray objects with names the cache would never produce can still be listed and deleted…
        assertThat(CardImageFileStore.isSafeKey("YUGIOH/ygoprodeck/ab/Stray.File-1.jpg")).isTrue();
        assertThat(CardImageFileStore.isSafeKey("leftover.bin")).isTrue();
        // …but nothing outside the root and nothing in the staging directory.
        assertThat(CardImageFileStore.isSafeKey("../x.jpg")).isFalse();
        assertThat(CardImageFileStore.isSafeKey("a/../x.jpg")).isFalse();
        assertThat(CardImageFileStore.isSafeKey("a/./x.jpg")).isFalse();
        assertThat(CardImageFileStore.isSafeKey("/a/x.jpg")).isFalse();
        assertThat(CardImageFileStore.isSafeKey("a//x.jpg")).isFalse();
        assertThat(CardImageFileStore.isSafeKey("a\\x.jpg")).isFalse();
        assertThat(CardImageFileStore.isSafeKey(".tmp/abc.part")).isFalse();
        assertThat(CardImageFileStore.isSafeKey("a/.hidden/x.jpg")).isFalse();
        assertThat(CardImageFileStore.isSafeKey("")).isFalse();
        assertThat(CardImageFileStore.isSafeKey("a".repeat(301))).isFalse();
    }

    @Test
    void temporaryFilesBelongToTheirReservation() throws Exception {
        CardImageFileStore store = new CardImageFileStore(root);
        store.init();
        assertThat(Files.isDirectory(root.resolve(CardImageFileStore.TEMP_DIR))).isTrue();
        UUID reservation = UUID.randomUUID();
        Files.write(store.rawTemp(reservation), new byte[10]);
        Path rendition = store.writeRenditionTemp(reservation, new byte[5]);
        assertThat(rendition.getParent()).isEqualTo(root.resolve(CardImageFileStore.TEMP_DIR));
        Files.write(root.resolve(".tmp").resolve("foreign.bin"), new byte[1]);
        assertThat(store.tempFiles())
                .extracting(CardImageFileStore.TempFile::reservationId)
                .containsExactlyInAnyOrder(reservation, reservation, null);
        assertThat(store.tempFiles())
                .filteredOn(temp -> reservation.equals(temp.reservationId()))
                .extracting(CardImageFileStore.TempFile::size)
                .containsExactlyInAnyOrder(10L, 5L);
        store.deleteTemps(reservation);
        assertThat(store.tempFiles()).hasSize(1);

        Files.createDirectories(root.resolve("yugioh/ygoprodeck/ab"));
        store.pruneEmptyDirectories();
        assertThat(Files.exists(root.resolve("yugioh"))).isFalse();
        assertThat(Files.isDirectory(root.resolve(".tmp"))).as("staging kept").isTrue();
    }
}
