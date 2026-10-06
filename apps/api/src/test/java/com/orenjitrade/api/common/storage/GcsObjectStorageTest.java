package com.orenjitrade.api.common.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.google.cloud.storage.Blob;
import com.google.cloud.storage.BlobId;
import com.google.cloud.storage.BlobInfo;
import com.google.cloud.storage.Storage;
import com.google.cloud.storage.contrib.nio.testing.LocalStorageHelper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;

/**
 * The Google Cloud Storage adapter against the in-memory storage of google-cloud-nio (no
 * credentials, no network): object prefix, immutable cache metadata, listings, deletions and the
 * instance key policy.
 */
class GcsObjectStorageTest {

    private static final String BUCKET = "orenjitrade-test-media";

    @TempDir Path temp;

    private Storage fake;

    @BeforeEach
    void fakeStorage() {
        fake = LocalStorageHelper.customOptions(false).getService();
    }

    private GcsObjectStorage cardImages() {
        return new GcsObjectStorage(
                BUCKET,
                "card-images/",
                key -> key.matches("^[a-z0-9/-]+/[A-Za-z0-9.]+\\.jpg$"),
                () -> fake,
                "");
    }

    @Test
    void objectsLiveUnderThePrefixWithImmutableCacheMetadata() {
        GcsObjectStorage storage = cardImages();
        storage.put("yugioh/ygoprodeck/ab/123.jpg", new byte[] {1, 2, 3}, "image/jpeg");

        Blob blob = fake.get(BlobId.of(BUCKET, "card-images/yugioh/ygoprodeck/ab/123.jpg"));
        assertThat(blob).isNotNull();
        assertThat(blob.getContentType()).isEqualTo("image/jpeg");
        assertThat(blob.getCacheControl()).isEqualTo("public, max-age=31536000, immutable");
        assertThat(blob.getContent()).containsExactly(1, 2, 3);
        assertThat(fake.get(BlobId.of(BUCKET, "yugioh/ygoprodeck/ab/123.jpg")))
                .as("never at the bucket root")
                .isNull();

        assertThat(storage.exists("yugioh/ygoprodeck/ab/123.jpg")).isTrue();
        assertThat(storage.size("yugioh/ygoprodeck/ab/123.jpg")).contains(3L);
        assertThat(storage.get("yugioh/ygoprodeck/ab/123.jpg"))
                .hasValueSatisfying(
                        object -> {
                            assertThat(object.content()).containsExactly(1, 2, 3);
                            assertThat(object.contentType()).isEqualTo("image/jpeg");
                        });
    }

    @Test
    void missingObjectsAreEmptyNotErrors() {
        GcsObjectStorage storage = cardImages();
        assertThat(storage.get("yugioh/ygoprodeck/ab/none.jpg")).isEmpty();
        assertThat(storage.exists("yugioh/ygoprodeck/ab/none.jpg")).isFalse();
        assertThat(storage.size("yugioh/ygoprodeck/ab/none.jpg")).isEmpty();
        assertThat(storage.delete("yugioh/ygoprodeck/ab/none.jpg")).isFalse();
    }

    @Test
    void listingsAreScopedToThePrefixAndStripIt() {
        GcsObjectStorage storage = cardImages();
        storage.put("yugioh/ygoprodeck/ab/1.jpg", new byte[10], "image/jpeg");
        storage.put("yugioh/ygoprodeck/cd/2.jpg", new byte[20], "image/jpeg");
        storage.put("pokemon/pokemontcg/ef/3.jpg", new byte[30], "image/jpeg");
        // Media of the same bucket (avatars) and a stray object under the prefix.
        fake.create(BlobInfo.newBuilder(BUCKET, "avatars/u/x.jpg").build(), new byte[40]);
        fake.create(BlobInfo.newBuilder(BUCKET, "card-images/STRAY.bin").build(), new byte[5]);

        List<ObjectSummary> all = storage.list("");
        assertThat(all)
                .extracting(ObjectSummary::key)
                .containsExactlyInAnyOrder(
                        "yugioh/ygoprodeck/ab/1.jpg",
                        "yugioh/ygoprodeck/cd/2.jpg",
                        "pokemon/pokemontcg/ef/3.jpg",
                        "STRAY.bin");
        assertThat(all)
                .extracting(ObjectSummary::size)
                .containsExactlyInAnyOrder(10L, 20L, 30L, 5L);
        assertThat(storage.list("yugioh/"))
                .extracting(ObjectSummary::key)
                .containsExactlyInAnyOrder(
                        "yugioh/ygoprodeck/ab/1.jpg", "yugioh/ygoprodeck/cd/2.jpg");

        assertThat(storage.delete("yugioh/ygoprodeck/ab/1.jpg")).isTrue();
        assertThat(storage.list("yugioh/")).hasSize(1);
        assertThat(fake.get(BlobId.of(BUCKET, "avatars/u/x.jpg")))
                .as("media untouched")
                .isNotNull();
    }

    @Test
    void putFileUploadsAndConsumesTheSource() throws Exception {
        GcsObjectStorage storage = cardImages();
        Path source = temp.resolve("abc.jpg.tmp");
        Files.write(source, new byte[] {7, 7});
        storage.putFile(source, "yugioh/ygoprodeck/ab/9.jpg", "image/jpeg");
        assertThat(Files.exists(source)).isFalse();
        assertThat(storage.size("yugioh/ygoprodeck/ab/9.jpg")).contains(2L);
    }

    @Test
    void theKeyPolicyIsEnforcedOnEveryOperation() {
        GcsObjectStorage storage = cardImages();
        assertThatThrownBy(() -> storage.put("../x.jpg", new byte[1], "image/jpeg"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> storage.get("avatars/x.png"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> storage.delete("STRAY.bin"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(
                        () ->
                                new GcsObjectStorage(
                                        BUCKET, "card-images", key -> true, () -> fake, ""))
                .as("a prefix must end with '/'")
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void theMediaInstanceUsesTheBucketRootAndThePublicBase() {
        DefaultListableBeanFactory beans = new DefaultListableBeanFactory();
        beans.registerSingleton("fakeStorage", fake);
        ObjectProvider<Storage> provider = beans.getBeanProvider(Storage.class);
        GcsObjectStorage media =
                new GcsObjectStorage(new StorageProperties("gcs", "", "", BUCKET), provider);
        media.put("avatars/x.jpg", new byte[3], "image/jpeg");
        assertThat(fake.get(BlobId.of(BUCKET, "avatars/x.jpg"))).isNotNull();
        assertThat(media.publicUrl("avatars/x.jpg"))
                .isEqualTo("https://storage.googleapis.com/" + BUCKET + "/avatars/x.jpg");
        assertThat(
                        new GcsObjectStorage(
                                        new StorageProperties(
                                                "gcs",
                                                "",
                                                "https://api.example/api/v1/public/media/",
                                                BUCKET),
                                        provider)
                                .publicUrl("avatars/x.jpg"))
                .isEqualTo("https://api.example/api/v1/public/media/avatars/x.jpg");
        assertThatThrownBy(
                        () ->
                                new GcsObjectStorage(
                                        new StorageProperties("gcs", "", "", " "), provider))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("GCS_BUCKET_MEDIA");
    }
}
