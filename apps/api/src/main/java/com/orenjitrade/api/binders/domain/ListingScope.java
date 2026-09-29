package com.orenjitrade.api.binders.domain;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

/** Which binders a reconciliation of the effective public visibility covers. */
public sealed interface ListingScope {

    /** Every binder of one owner. */
    record Owner(UUID ownerId) implements ListingScope {}

    /** Some binders. */
    record Binders(List<UUID> binderIds) implements ListingScope {

        public Binders {
            binderIds = List.copyOf(binderIds);
        }

        public static Binders of(Collection<UUID> ids) {
            return new Binders(List.copyOf(ids));
        }
    }

    /** Every binder (freshness job). */
    record All() implements ListingScope {}
}
