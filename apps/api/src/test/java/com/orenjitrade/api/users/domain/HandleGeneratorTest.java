package com.orenjitrade.api.users.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class HandleGeneratorTest {

    @ParameterizedTest
    @CsvSource({
        "maika@example.test, maika",
        "Maïka.Tremblay@example.test, maika_tremblay",
        "devon+cards@example.test, devon_cards",
        "'  spaced out  @x.test', spaced_out",
        "a@example.test, collector_a",
        "ab@example.test, collector_ab",
        "abc@example.test, abc",
        "__leading__@example.test, leading",
        "émilie-rené@example.test, emilie_rene",
        "こんにちは@example.test, collector",
        "no-at-sign, no_at_sign",
        "'', collector",
        ", collector"
    })
    void derivesSanitisedBase(String email, String expected) {
        assertThat(HandleGenerator.baseFrom(email)).isEqualTo(expected);
    }

    @Test
    void truncatesLongLocalPartsTo24Characters() {
        String base = HandleGenerator.baseFrom("abcdefghijklmnopqrstuvwxyz0123456789@example.test");

        assertThat(base).hasSize(24).isEqualTo("abcdefghijklmnopqrstuvwx");
        assertThat(HandleGenerator.isValid(base)).isTrue();
    }

    @Test
    void suffixKeepsTheHandleWithinTheLimit() {
        String base = HandleGenerator.baseFrom("abcdefghijklmnopqrstuvwxyz@example.test");

        String suffixed = HandleGenerator.withSuffix(base, 2);
        String large = HandleGenerator.withSuffix(base, 123456);

        assertThat(suffixed).isEqualTo("abcdefghijklmnopqrstuv_2").hasSize(24);
        assertThat(large).isEqualTo("abcdefghijklmnopq_123456").hasSize(24);
        assertThat(HandleGenerator.withSuffix("maika", 3)).isEqualTo("maika_3");
        assertThat(HandleGenerator.isValid(suffixed)).isTrue();
        assertThat(HandleGenerator.isValid(large)).isTrue();
    }

    @Test
    void suffixNeverLeavesDoubleUnderscore() {
        assertThat(HandleGenerator.withSuffix("abcdefghijklmnopqrstu_x", 2))
                .isEqualTo("abcdefghijklmnopqrstu_2");
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
    void everyBaseIsValid() {
        for (String email :
                new String[] {
                    "x@y", "@", "...@a.b", "___@a.b", "a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p@a.b"
                }) {
            assertThat(HandleGenerator.isValid(HandleGenerator.baseFrom(email))).as(email).isTrue();
        }
    }

    @Test
    void reservedHandlesAreRecognisedCaseInsensitively() {
        assertThat(ReservedHandles.isReserved("admin")).isTrue();
        assertThat(ReservedHandles.isReserved("ADMIN")).isTrue();
        assertThat(ReservedHandles.isReserved("orenjitrade")).isTrue();
        assertThat(ReservedHandles.isReserved("maika")).isFalse();
    }
}
