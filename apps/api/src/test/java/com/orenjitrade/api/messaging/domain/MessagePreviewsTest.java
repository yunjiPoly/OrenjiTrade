package com.orenjitrade.api.messaging.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class MessagePreviewsTest {

    @Test
    void textIsCollapsedAndTruncatedWithAnEllipsis() {
        assertThat(MessagePreviews.of(MessageKind.TEXT, "  Hello\n\n  there  ", null))
                .isEqualTo("Hello there");
        String longText = "word ".repeat(60);
        String preview = MessagePreviews.of(MessageKind.TEXT, longText, null);
        assertThat(preview.codePointCount(0, preview.length()))
                .isLessThanOrEqualTo(MessagePreviews.MAX);
        assertThat(preview).endsWith("…");
    }

    @Test
    void linksAndPhotosGetLabels() {
        assertThat(MessagePreviews.of(MessageKind.CARD_LINK, "", "Azure-Eyes Sky Dragon"))
                .isEqualTo("Card: Azure-Eyes Sky Dragon");
        assertThat(MessagePreviews.of(MessageKind.BINDER_LINK, "look", "Trade binder"))
                .isEqualTo("Binder: Trade binder");
        assertThat(MessagePreviews.of(MessageKind.IMAGE, "", null)).isEqualTo("Photo");
        assertThat(MessagePreviews.of(MessageKind.IMAGE, "Front", null)).isEqualTo("Photo: Front");
        assertThat(MessagePreviews.of(MessageKind.OFFER_LINK, "", null)).isEqualTo("Offer");
    }

    @Test
    void truncationNeverSplitsASurrogatePair() {
        String emoji = "🃏";
        String text = emoji.repeat(200);
        String preview = MessagePreviews.truncate(text);
        assertThat(preview.codePointCount(0, preview.length())).isEqualTo(MessagePreviews.MAX);
        assertThat(Character.isLowSurrogate(preview.charAt(preview.length() - 2))).isTrue();
    }
}
