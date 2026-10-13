package com.orenjitrade.api.location.domain;

import java.util.List;

/**
 * A platform region with its countries (ADR 0017).
 *
 * @param code stable code, e.g. {@code americas-north}
 * @param name display name, e.g. "Americas (North)"
 * @param isDefault the default region (signed-out visitors, collectors without a location)
 * @param sortOrder display order
 * @param countries its countries in display order (inactive ones included)
 */
public record RegionView(
        String code, String name, boolean isDefault, int sortOrder, List<CountryView> countries) {

    public RegionView {
        countries = List.copyOf(countries);
    }
}
