package com.orenjitrade.api.binders.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.binders.domain.BinderKind;
import com.orenjitrade.api.binders.domain.BinderView;
import com.orenjitrade.api.binders.domain.ListingVisibility;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Buyers see the price of a deck core only, exactly as typed (stage R3). */
class PublicPriceTest {

    private static BinderView binder(boolean sellsAsCore) {
        Instant now = Instant.parse("2026-10-15T12:00:00Z");
        return new BinderView(
                UUID.randomUUID(),
                UUID.randomUUID(),
                "Binder",
                "",
                BinderKind.COLLECTION,
                ListingVisibility.PUBLIC,
                null,
                0,
                null,
                0,
                FreshnessState.ACTIVE,
                now,
                now,
                now,
                now,
                true,
                sellsAsCore,
                "$180",
                new BigDecimal("180.00"),
                "CAD",
                null);
    }

    @Test
    void theTextOfADeckCoreAndNothingForAnotherBinder() {
        assertThat(PublicBinderResponses.publicPrice(binder(true))).isEqualTo("$180");
        assertThat(PublicBinderResponses.publicPrice(binder(false)))
                .as("a plain binder keeps its price for its owner only")
                .isNull();
    }
}
