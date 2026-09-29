package com.orenjitrade.api.users.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.users.domain.HandleRules.Violation;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** Handle rules of PUT /me/profile. */
class HandleRulesTest {

    @ParameterizedTest
    @ValueSource(
            strings = {
                "abc",
                "maika",
                "maika_qc",
                "collector_2",
                "a1b",
                "abcdefghijklmnopqrstuvwx"
            })
    void acceptsValidHandles(String handle) {
        assertThat(HandleRules.check(handle)).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "",
                "ab",
                "abcdefghijklmnopqrstuvwxy",
                "has-dash",
                "has space",
                "émile",
                "a.b.c",
                "UPPER"
            })
    void rejectsBadFormats(String handle) {
        assertThat(HandleRules.check(handle)).contains(Violation.INVALID_FORMAT);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "admin",
                "support",
                "orenjitrade",
                "moderator",
                "settings",
                "deleted",
                "deleted_abc123"
            })
    void rejectsReservedHandles(String handle) {
        assertThat(HandleRules.check(handle)).contains(Violation.RESERVED);
    }

    @ParameterizedTest
    @ValueSource(strings = {"  Maika_QC ", "MAIKA_QC", "maika_qc"})
    void normalisesCaseAndWhitespace(String raw) {
        assertThat(HandleRules.normalise(raw)).isEqualTo("maika_qc");
        assertThat(HandleRules.check(HandleRules.normalise(raw))).isEmpty();
    }
}
