package com.orenjitrade.api.inventory.domain.imports;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/** The result of a commit as {@code inventory_import.result} stores it. */
class ImportResultTest {

    private final JsonMapper mapper = JsonMapper.builder().build();

    @Test
    void aResultIsStoredAndReadWithTheCopiesThatWereNotAdded() {
        ImportResult result = new ImportResult(3, 2, 40, 6, 10_010);

        ImportResult read = mapper.readValue(mapper.writeValueAsString(result), ImportResult.class);

        assertThat(read).isEqualTo(result);
        assertThat(result.plus(1, 1, 5, 7)).isEqualTo(new ImportResult(4, 3, 45, 6, 10_017));
    }

    @Test
    void aResultStoredBeforeThatCountExistedStillReads() {
        // What V113 stored: an import committed before V114 keeps its counts.
        String stored =
                "{\"itemsCreated\":3,\"itemsMerged\":2,\"copiesAdded\":40,\"rowsImported\":6}";

        assertThat(mapper.readValue(stored, ImportResult.class))
                .isEqualTo(new ImportResult(3, 2, 40, 6, 0));
    }
}
