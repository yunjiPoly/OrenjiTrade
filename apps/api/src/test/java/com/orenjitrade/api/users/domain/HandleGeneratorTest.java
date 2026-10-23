package com.orenjitrade.api.users.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.security.SecureRandom;
import java.util.HashSet;
import java.util.Random;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class HandleGeneratorTest {

    private static final String RANDOM_FIRST_HANDLE = "^collector_[bcdfghjkmnpqrstvwxz2-9]{6}$";

    @Test
    void aFirstHandleIsCollectorAndSixRandomCharacters() {
        SecureRandom random = new SecureRandom();
        for (int i = 0; i < 2_000; i++) {
            String handle = HandleGenerator.random(random);

            assertThat(handle).matches(RANDOM_FIRST_HANDLE).hasSize(16);
            assertThat(HandleGenerator.isValid(handle)).as(handle).isTrue();
            assertThat(ReservedHandles.isReserved(handle)).as(handle).isFalse();
        }
    }

    @Test
    void theRandomPartHasNoVowelsAndNoLookAlikes() {
        assertThat(HandleGenerator.ALPHABET)
                .matches("^[a-z0-9]+$")
                .doesNotContain("a", "e", "i", "o", "u", "y", "l", "0", "1", "_");
        assertThat(HandleGenerator.ALPHABET.chars().distinct().count())
                .isEqualTo(HandleGenerator.ALPHABET.length());
    }

    @Test
    void everyCharacterOfTheAlphabetIsDrawn() {
        Random random = new Random(20261022L);
        Set<Character> drawn = new HashSet<>();
        for (int i = 0; i < 2_000; i++) {
            String handle = HandleGenerator.random(random);
            for (char c : handle.substring(HandleGenerator.PREFIX.length()).toCharArray()) {
                drawn.add(c);
            }
        }

        Set<Character> alphabet = new HashSet<>();
        for (char c : HandleGenerator.ALPHABET.toCharArray()) {
            alphabet.add(c);
        }
        assertThat(drawn).isEqualTo(alphabet);
    }

    @Test
    void drawsDifferAndTheSameSeedDrawsTheSameHandles() {
        Random random = new Random(7L);
        Set<String> handles = new HashSet<>();
        for (int i = 0; i < 1_000; i++) {
            handles.add(HandleGenerator.random(random));
        }

        assertThat(handles).hasSizeGreaterThan(995);
        assertThat(HandleGenerator.random(new Random(42L)))
                .isEqualTo(HandleGenerator.random(new Random(42L)));
    }

    @ParameterizedTest
    @CsvSource({
        "maika, true",
        "ab, false",
        "Maika, false",
        "maika-t, false",
        "abcdefghijklmnopqrstuvwxy, false",
        "abc_123, true"
    })
    void validates(String handle, boolean valid) {
        assertThat(HandleGenerator.isValid(handle)).isEqualTo(valid);
    }

    @Test
    void reservedHandlesAreRecognisedCaseInsensitively() {
        assertThat(ReservedHandles.isReserved("admin")).isTrue();
        assertThat(ReservedHandles.isReserved("ADMIN")).isTrue();
        assertThat(ReservedHandles.isReserved("orenjitrade")).isTrue();
        assertThat(ReservedHandles.isReserved("maika")).isFalse();
    }
}
