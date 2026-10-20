package com.orenjitrade.api.binders.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.binders.infra.BinderRepository.CoreFields;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.Test;

/**
 * The pure rules of deck cores (stage R3): when a public binder shows without cards, the price as
 * typed and its amount, and which binders show in public lists.
 */
class DeckCoreRulesTest {

    static BinderView binder(boolean sellsAsCore, @Nullable Instant soldAt, String priceText) {
        Instant now = Instant.parse("2026-10-15T12:00:00Z");
        return new BinderView(
                UUID.randomUUID(),
                UUID.randomUUID(),
                "Moth Queen core",
                "All NM.",
                BinderKind.DECK,
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
                priceText,
                null,
                "CAD",
                soldAt,
                UUID.randomUUID(),
                "yugioh");
    }

    static BinderDetails details(BinderView binder, long publicItems) {
        return new BinderDetails(
                binder,
                new BinderContents.Stats(publicItems, publicItems, List.of(), null),
                null,
                BinderShowcase.EMPTY);
    }

    @Test
    void aDeckCoreShowsWithoutCardsUntilItIsSold() {
        assertThat(binder(true, null, "$95").listedWithoutCards()).isTrue();
        assertThat(binder(false, null, "$95").listedWithoutCards()).isFalse();
        assertThat(binder(true, Instant.parse("2026-10-16T00:00:00Z"), "$95").listedWithoutCards())
                .as("a sold deck core is hidden (spec section 16, default 6)")
                .isFalse();
    }

    @Test
    void publicListsShowBindersWithAPublicCardAndDeckCores() {
        assertThat(PublicBinderService.shown(details(binder(false, null, null), 0))).isFalse();
        assertThat(PublicBinderService.shown(details(binder(false, null, null), 2))).isTrue();
        assertThat(PublicBinderService.shown(details(binder(true, null, null), 0))).isTrue();
    }

    @Test
    void aPlainAmountAlsoGivesTheAmountAnyOtherTextNone() {
        assertCore("$180", "180.00");
        assertCore("180", "180.00");
        assertCore("95,50 $", "95.50");
        assertCore("$ 12.5", "12.50");
        assertCore("Trade only", null);
        assertCore("85% TCG", null);
        assertCore("$180 or best offer", null);
        CoreFields none = BinderService.coreFields(false, null);
        assertThat(none.askingPriceText()).isNull();
        assertThat(none.askingPrice()).isNull();
        assertThat(none.sellsAsCore()).isFalse();
    }

    private static void assertCore(String text, @Nullable String amount) {
        CoreFields fields = BinderService.coreFields(true, text);
        assertThat(fields.sellsAsCore()).isTrue();
        assertThat(fields.askingPriceText()).isEqualTo(text);
        if (amount == null) {
            assertThat(fields.askingPrice()).as(text).isNull();
        } else {
            assertThat(fields.askingPrice()).as(text).isEqualByComparingTo(new BigDecimal(amount));
        }
    }
}
