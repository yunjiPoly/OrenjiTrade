package com.orenjitrade.api.location.domain;

import java.util.List;

/**
 * A country of a platform region with its subdivisions (alphabetical).
 *
 * @param code ISO 3166-1 alpha-2 code ({@code XK} user-assigned for Kosovo)
 * @param name English name
 * @param regionCode the platform region it belongs to
 * @param active whether collectors may choose it (existing locations keep inactive countries)
 * @param sortOrder display order inside the region
 * @param subdivisions its subdivisions
 */
public record CountryView(
        String code,
        String name,
        String regionCode,
        boolean active,
        int sortOrder,
        List<SubdivisionView> subdivisions) {

    public CountryView {
        subdivisions = List.copyOf(subdivisions);
    }
}
