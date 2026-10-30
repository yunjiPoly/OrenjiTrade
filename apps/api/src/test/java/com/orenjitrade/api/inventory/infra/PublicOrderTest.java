package com.orenjitrade.api.inventory.infra;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.inventory.domain.InventoryChanges.PublicSort;
import org.junit.jupiter.api.Test;

/** Every public order is total (it ends on the item id), so cursor-less pages never overlap. */
class PublicOrderTest {

    @Test
    void eachOrderEndsOnTheItemId() {
        for (PublicSort sort : PublicSort.values()) {
            assertThat(InventoryItemRepository.publicOrder(sort)).endsWith(", i.id");
        }
    }

    @Test
    void theOrdersReadAsTheirNames() {
        assertThat(InventoryItemRepository.publicOrder(PublicSort.NAME))
                .startsWith(" ORDER BY c.normalized_name");
        assertThat(InventoryItemRepository.publicOrder(PublicSort.RECENT))
                .startsWith(" ORDER BY i.created_at DESC");
        assertThat(InventoryItemRepository.publicOrder(PublicSort.PRICE))
                .startsWith(
                        " ORDER BY i.asking_price ASC NULLS LAST, (i.asking_price_text IS NULL)");
    }
}
