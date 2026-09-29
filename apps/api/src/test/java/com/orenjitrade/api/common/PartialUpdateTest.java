package com.orenjitrade.api.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orenjitrade.api.binders.domain.ListingVisibility;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** PATCH bodies: absent vs null members, typed reads and collected field errors. */
class PartialUpdateTest {

    private final JsonMapper mapper = JsonMapper.builder().build();

    private PartialUpdate of(String json) {
        JsonNode node = mapper.readTree(json);
        return PartialUpdate.of(node);
    }

    @Test
    void distinguishesAbsentFromNull() {
        PartialUpdate patch = of("{\"notes\": null, \"quantity\": 3}");
        assertThat(patch.has("notes")).isTrue();
        assertThat(patch.hasValue("notes")).isFalse();
        assertThat(patch.text("notes")).isNull();
        assertThat(patch.has("binderId")).isFalse();
        assertThat(patch.integer("quantity")).isEqualTo(3);
        patch.throwIfInvalid();
    }

    @Test
    void readsTypedValues() {
        UUID id = UUID.randomUUID();
        PartialUpdate patch =
                of(
                        "{\"id\": \""
                                + id
                                + "\", \"price\": 12.5, \"on\": true, \"at\":"
                                + " \"2026-10-01T10:00:00Z\", \"visibility\": \"public\"}");
        assertThat(patch.uuid("id")).isEqualTo(id);
        assertThat(patch.decimal("price")).isEqualByComparingTo("12.5");
        assertThat(patch.bool("on")).isTrue();
        assertThat(patch.instant("at")).isEqualTo(Instant.parse("2026-10-01T10:00:00Z"));
        assertThat(patch.enumValue("visibility", ListingVisibility.class))
                .isEqualTo(ListingVisibility.PUBLIC);
        patch.throwIfInvalid();
    }

    @Test
    void collectsTypeErrorsAndNulls() {
        PartialUpdate patch =
                of(
                        "{\"id\": \"nope\", \"quantity\": \"two\", \"on\": 1, \"at\": \"soon\","
                                + " \"visibility\": \"VISIBLE\", \"name\": null}");
        patch.uuid("id");
        patch.integer("quantity");
        patch.bool("on");
        patch.instant("at");
        patch.enumValue("visibility", ListingVisibility.class);
        patch.notNull("name");
        assertThatThrownBy(patch::throwIfInvalid)
                .isInstanceOf(ApiException.class)
                .satisfies(
                        e ->
                                assertThat(((ApiException) e).getFieldErrors())
                                        .extracting(ProblemFieldError::field)
                                        .containsExactlyInAnyOrder(
                                                "id",
                                                "quantity",
                                                "on",
                                                "at",
                                                "visibility",
                                                "name"));
    }

    @Test
    void requiresAnObject() {
        assertThatThrownBy(() -> of("[1, 2]")).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> PartialUpdate.of(null)).isInstanceOf(ApiException.class);
    }
}
