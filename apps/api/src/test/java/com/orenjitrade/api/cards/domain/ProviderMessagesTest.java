package com.orenjitrade.api.cards.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** Web stage WH2 review fix 1: a sync report never carries a provider's host, path or an id. */
class ProviderMessagesTest {

    @Test
    void dropsHostsPathsAndIds() {
        assertThat(
                        ProviderMessages.clientSafe(
                                "YGOPRODeck images.ygoprodeck.com/images/cards/46986414.jpg"
                                        + " answered HTTP 403"))
                .isEqualTo("YGOPRODeck answered HTTP 403");
        assertThat(
                        ProviderMessages.clientSafe(
                                "Scryfall https://cards.scryfall.io/normal/front/a/b.jpg?1 is"
                                        + " unavailable after 3 attempt(s) (HTTP 503)"))
                .isEqualTo("Scryfall is unavailable after 3 attempt(s) (HTTP 503)");
        assertThat(
                        ProviderMessages.clientSafe(
                                "ygoprodeck 127.0.0.1:61234/api/v7/cardinfo.php answered HTTP 500"))
                .isEqualTo("ygoprodeck answered HTTP 500");
        assertThat(
                        ProviderMessages.clientSafe(
                                "image 3f1c2a9e-5b7d-4c11-9a2e-7d0b6c1e4f20: unexpected content"
                                        + " type text/html"))
                .isEqualTo("image unexpected content type text/html");
    }

    @Test
    void keepsPlainWordsAndFillsAnEmptyMessage() {
        assertThat(ProviderMessages.clientSafe("image larger than 5242880 bytes"))
                .isEqualTo("image larger than 5242880 bytes");
        assertThat(ProviderMessages.clientSafe("connection failed (SocketException)"))
                .isEqualTo("connection failed (SocketException)");
        assertThat(ProviderMessages.clientSafe(null)).isEqualTo("the download failed");
        assertThat(ProviderMessages.clientSafe("  ")).isEqualTo("the download failed");
    }
}
