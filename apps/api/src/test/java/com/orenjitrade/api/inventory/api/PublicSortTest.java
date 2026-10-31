package com.orenjitrade.api.inventory.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.inventory.domain.InventoryChanges.PublicQuery;
import com.orenjitrade.api.inventory.domain.InventoryChanges.PublicSort;
import org.junit.jupiter.api.Test;

/** The {@code sort} of a public binder's items (web stage WD, spec 8.2's sort pill). */
class PublicSortTest {

    @Test
    void blankOrMissingIsByName() {
        assertThat(PublicInventoryController.publicSort(null)).isEqualTo(PublicSort.NAME);
        assertThat(PublicInventoryController.publicSort("  ")).isEqualTo(PublicSort.NAME);
    }

    @Test
    void theThreeOrdersReadInAnyCase() {
        assertThat(PublicInventoryController.publicSort("name")).isEqualTo(PublicSort.NAME);
        assertThat(PublicInventoryController.publicSort(" Recent ")).isEqualTo(PublicSort.RECENT);
        assertThat(PublicInventoryController.publicSort("PRICE")).isEqualTo(PublicSort.PRICE);
    }

    @Test
    void anyOtherValueIsAValidationError() {
        assertThatThrownBy(() -> PublicInventoryController.publicSort("cheapest"))
                .isInstanceOf(ApiException.class)
                .hasMessage("Validation failed");
    }

    @Test
    void theOldConstructorsKeepTheNameOrder() {
        assertThat(new PublicQuery(null, null, null, 0, 20).sort()).isEqualTo(PublicSort.NAME);
        assertThat(new PublicQuery(null, null, null, 0, 20, true).sort())
                .isEqualTo(PublicSort.NAME);
    }
}
