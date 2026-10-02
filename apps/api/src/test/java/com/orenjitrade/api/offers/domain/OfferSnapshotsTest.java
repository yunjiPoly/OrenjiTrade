package com.orenjitrade.api.offers.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.offers.domain.OfferSnapshots.SnapshotCard;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/**
 * The card of a stored item snapshot (an offer whose item is gone keeps its name and picture):
 * name, game and printing, nothing for a snapshot without a card name.
 */
class OfferSnapshotsTest {

    private final OfferSnapshots snapshots = new OfferSnapshots(JsonMapper.builder().build());

    @Test
    void snapshotsNameTheirCardGameAndPrinting() {
        UUID printing = UUID.fromString("00000000-0000-4000-8e00-000000000001");
        String json =
                "{\"cardName\":\"Azure-Eyes Sky Dragon\",\"game\":\"yugioh\",\"printingId\":\""
                        + printing
                        + "\",\"quantity\":1}";
        assertThat(snapshots.itemCard(json))
                .contains(new SnapshotCard("Azure-Eyes Sky Dragon", "yugioh", printing));
        assertThat(snapshots.itemCardName(json)).contains("Azure-Eyes Sky Dragon");

        assertThat(snapshots.itemCard("{\"cardName\":\"Tidebinder\",\"printingId\":\"nope\"}"))
                .contains(new SnapshotCard("Tidebinder", null, null));
        assertThat(snapshots.itemCard("{}")).isEmpty();
        assertThat(snapshots.itemCardName("{\"cardName\":\" \"}")).isEmpty();
    }
}
