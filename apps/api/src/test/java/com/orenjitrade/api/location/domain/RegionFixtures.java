package com.orenjitrade.api.location.domain;

import java.util.List;

/**
 * A small fictional region catalog for the location unit tests (the real one is seeded by V107).
 */
final class RegionFixtures {

    static final CountryView CANADA =
            new CountryView(
                    "CA",
                    "Canada",
                    "americas-north",
                    true,
                    10,
                    List.of(
                            new SubdivisionView("CA-ON", "Ontario", false),
                            new SubdivisionView("CA-QC", "Quebec", false)));

    static final CountryView PUERTO_RICO =
            new CountryView(
                    "PR",
                    "Puerto Rico",
                    "americas-north",
                    true,
                    20,
                    List.of(new SubdivisionView("PR", "Puerto Rico", true)));

    /** Present in the lists but switched off by an admin: nobody may choose it. */
    static final CountryView GREENLAND =
            new CountryView(
                    "GL",
                    "Greenland",
                    "americas-north",
                    false,
                    30,
                    List.of(new SubdivisionView("GL", "Greenland", true)));

    static final CountryView ARGENTINA =
            new CountryView(
                    "AR",
                    "Argentina",
                    "americas-south",
                    true,
                    10,
                    List.of(new SubdivisionView("AR-C", "Buenos Aires City", false)));

    static final CountryView FRANCE =
            new CountryView(
                    "FR",
                    "France",
                    "europe",
                    true,
                    10,
                    List.of(new SubdivisionView("FR-IDF", "Île-de-France", false)));

    static final List<RegionView> REGIONS =
            List.of(
                    new RegionView(
                            "americas-north",
                            "Americas (North)",
                            true,
                            10,
                            List.of(CANADA, PUERTO_RICO, GREENLAND)),
                    new RegionView(
                            "americas-south", "Americas (South)", false, 20, List.of(ARGENTINA)),
                    new RegionView("europe", "Europe", false, 30, List.of(FRANCE)));

    private RegionFixtures() {}
}
