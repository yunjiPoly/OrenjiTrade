package com.orenjitrade.api.cards.infra.images;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Deterministic, traversal-proof cache paths and temporary files named after reservations. */
class CardImageFileStoreTest {

    @TempDir Path root;

    @Test
    void keysAreDeterministicAndSharded() {
        String key = CardImageFileStore.keyOf("yugioh", "ygoprodeck", "89631139");
        assertThat(key).matches("^yugioh/ygoprodeck/[0-9a-f]{2}/89631139\\.jpg$");
        assertThat(CardImageFileStore.keyOf("yugioh", "ygoprodeck", "89631139")).isEqualTo(key);
        assertThat(CardImageFileStore.isValidKey(key)).isTrue();
    }

    @Test
    void invalidComponentsAndTraversalAreRefused() {
        assertThatThrownBy(() -> CardImageFileStore.keyOf("../x", "ygoprodeck", "1"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> CardImageFileStore.keyOf("yugioh", "ygoprodeck", "../../etc"))
                .isInstanceOf(IllegalArgumentException.class);
        CardImageFileStore store = new CardImageFileStore(root);
        assertThatThrownBy(() -> store.pathOf("../outside.jpg"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> store.pathOf(".tmp/x/ab/1.jpg"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(CardImageFileStore.isValidKey("yugioh/ygoprodeck/zz/1.jpg")).isFalse();
    }

    @Test
    void temporaryFilesBelongToTheirReservation() throws Exception {
        CardImageFileStore store = new CardImageFileStore(root);
        store.init();
        UUID reservation = UUID.randomUUID();
        Files.write(store.rawTemp(reservation), new byte[10]);
        store.writeRenditionTemp(reservation, new byte[5]);
        Files.write(root.resolve(".tmp").resolve("foreign.bin"), new byte[1]);
        assertThat(store.tempFiles())
                .extracting(CardImageFileStore.TempFile::reservationId)
                .containsExactlyInAnyOrder(reservation, reservation, null);
        store.deleteTemps(reservation);
        assertThat(store.tempFiles()).hasSize(1);

        String key = CardImageFileStore.keyOf("pokemon", "pokemontcg", "sv1-1");
        Path temp = store.writeRenditionTemp(reservation, new byte[7]);
        store.moveIntoPlace(temp, key);
        assertThat(store.finalFiles()).containsEntry(key, 7L).hasSize(1);
        assertThat(store.delete(key)).isTrue();
        assertThat(store.finalFiles()).isEmpty();
    }
}
