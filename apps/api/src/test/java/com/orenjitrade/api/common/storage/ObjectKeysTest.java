package com.orenjitrade.api.common.storage;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** Strict object key syntax (the public media endpoint relies on it). */
class ObjectKeysTest {

    @Test
    void generatedKeysAreValidAndUnique() {
        UUID owner = UUID.randomUUID();
        String first = ObjectKeys.newKey("avatars", owner, "jpg");
        String second = ObjectKeys.newKey("avatars", owner, "jpg");
        assertThat(ObjectKeys.isValid(first)).isTrue();
        assertThat(first)
                .startsWith("avatars/" + owner + "/")
                .endsWith(".jpg")
                .isNotEqualTo(second);
        assertThat(ObjectKeys.contentTypeOf(first)).contains("image/jpeg");
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "avatars/0f8fad5b-d9cb-469f-a165-70867728950e/0123456789abcdef0123456789abcdef.jpg",
                "avatars/x.png",
                "binders/a/b/c.webp"
            })
    void acceptsWellFormedKeys(String key) {
        assertThat(ObjectKeys.isValid(key)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "",
                "file.jpg",
                "../etc/passwd.jpg",
                "avatars/../secret.jpg",
                "avatars//x.jpg",
                "/avatars/x.jpg",
                "avatars/x.jpg/",
                "avatars/x.exe",
                "avatars/x.JPG",
                "Avatars/x.jpg",
                "avatars/x.y.jpg",
                "avatars\\x.jpg",
                "avatars/x%2e.jpg",
                "a/b/c/d/e.jpg"
            })
    void rejectsEverythingElse(String key) {
        assertThat(ObjectKeys.isValid(key)).isFalse();
    }
}
