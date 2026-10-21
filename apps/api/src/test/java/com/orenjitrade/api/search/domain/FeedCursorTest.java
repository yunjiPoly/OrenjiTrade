package com.orenjitrade.api.search.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orenjitrade.api.common.ApiException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * The cursor of Home's feed (R7 review F2): the last post of a page and the time the first page was
 * read, opaque and checked.
 */
class FeedCursorTest {

    private static final UUID ID = UUID.fromString("00000000-0000-4000-8000-000000000042");

    private static String base64(String text) {
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(text.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void roundTripsToTheMicrosecond() {
        Instant at = Instant.parse("2026-10-21T15:30:00.123456789Z");
        Instant asOf = Instant.parse("2026-10-21T15:31:00.987654321Z");
        FeedCursor cursor = new FeedCursor(at, ID, asOf);
        FeedCursor decoded = FeedCursor.decode(cursor.encode());
        assertThat(decoded).isEqualTo(cursor);
        assertThat(decoded.at()).isEqualTo(Instant.parse("2026-10-21T15:30:00.123456Z"));
        assertThat(decoded.asOf()).isEqualTo(Instant.parse("2026-10-21T15:31:00.987654Z"));
        assertThat(cursor.encode()).doesNotContain("=").doesNotContain("+").doesNotContain("/");
    }

    @Test
    void noCursorIsTheFirstPage() {
        assertThat(FeedCursor.decode(null)).isNull();
        assertThat(FeedCursor.decode("  ")).isNull();
    }

    @Test
    void aMalformedCursorIsRefused() {
        for (String bad :
                new String[] {
                    "not-a-cursor",
                    base64("1:" + ID),
                    base64("x:" + ID + ":1"),
                    base64("1:not-a-uuid:1"),
                    base64("1:" + ID + ":1:2"),
                    base64("1:" + ID + ":")
                }) {
            assertThatThrownBy(() -> FeedCursor.decode(bad))
                    .as(bad)
                    .isInstanceOf(ApiException.class);
        }
    }
}
