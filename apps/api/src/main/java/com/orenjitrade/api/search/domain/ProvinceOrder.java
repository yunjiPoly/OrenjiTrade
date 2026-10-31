package com.orenjitrade.api.search.domain;

import java.util.Comparator;
import java.util.Locale;
import org.jspecify.annotations.Nullable;

/**
 * The order of the province groups of "Who has this card" ({@code GET /search/card-holders?sort=
 * province}, owner spec 2026-10-14, section 8): the viewer's own state or province first, then the
 * other states and provinces of the viewer's country, then the rest of the region, by country name
 * and then by state or province name. Inside a group, the freshest listing comes first ({@link
 * HolderSort#FRESHNESS}). Pure Java, unit-tested, mirrored by the SQL of {@code
 * CardHolderRepository}. Only the declared country and subdivision codes are compared: no
 * coordinate and no distance exists (ADR 0017).
 */
public final class ProvinceOrder {

    /** The viewer's own state or province. */
    public static final int OWN_PROVINCE = 0;

    /** Another state or province of the viewer's country. */
    public static final int OWN_COUNTRY = 1;

    /** Anywhere else in the region (or a viewer without a location). */
    public static final int REST_OF_REGION = 2;

    private ProvinceOrder() {}

    /**
     * The group tier of a holder in {@code country} / {@code subdivision} for a viewer who declared
     * {@code viewerCountry} / {@code viewerSubdivision} ({@code null} without a location).
     */
    public static int tier(
            @Nullable String viewerCountry,
            @Nullable String viewerSubdivision,
            String country,
            String subdivision) {
        if (viewerSubdivision != null && viewerSubdivision.equals(subdivision)) {
            return OWN_PROVINCE;
        }
        if (viewerCountry != null && viewerCountry.equals(country)) {
            return OWN_COUNTRY;
        }
        return REST_OF_REGION;
    }

    /**
     * A holder's place as the order sees it.
     *
     * @param countryCode ISO 3166-1 alpha-2
     * @param countryName the country's name
     * @param subdivisionCode ISO 3166-2
     * @param subdivisionName the state or province's name
     */
    public record Place(
            String countryCode,
            String countryName,
            String subdivisionCode,
            String subdivisionName) {}

    /** The order of the groups for a viewer: tier, then country name, then province name. */
    public static Comparator<Place> groups(
            @Nullable String viewerCountry, @Nullable String viewerSubdivision) {
        return Comparator.<Place>comparingInt(
                        place ->
                                tier(
                                        viewerCountry,
                                        viewerSubdivision,
                                        place.countryCode(),
                                        place.subdivisionCode()))
                .thenComparing(place -> place.countryName().toLowerCase(Locale.ROOT))
                .thenComparing(place -> place.subdivisionName().toLowerCase(Locale.ROOT))
                .thenComparing(Place::subdivisionCode);
    }
}
