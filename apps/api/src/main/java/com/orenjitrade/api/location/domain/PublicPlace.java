package com.orenjitrade.api.location.domain;

/**
 * What other collectors may see of someone's location everywhere except their own profile page: the
 * state/province and the country, never the city (ADR 0017).
 *
 * @param regionCode platform region of the country
 * @param countryCode ISO 3166-1 alpha-2
 * @param countryName English country name
 * @param subdivisionCode ISO 3166-2 code (alpha-2 code for a whole-country pseudo-subdivision)
 * @param subdivisionName English subdivision name
 * @param wholeCountry whether the subdivision stands for the whole country
 */
public record PublicPlace(
        String regionCode,
        String countryCode,
        String countryName,
        String subdivisionCode,
        String subdivisionName,
        boolean wholeCountry) {

    /** "Quebec, Canada", or "Puerto Rico" for a whole-country pseudo-subdivision. */
    public String label() {
        return wholeCountry ? countryName : subdivisionName + ", " + countryName;
    }
}
