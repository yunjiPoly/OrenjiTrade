package com.orenjitrade.api.location.domain;

/**
 * A first-level subdivision collectors choose as their state/province (ISO 3166-2).
 *
 * @param code ISO 3166-2 code, or the alpha-2 code of a whole-country pseudo-subdivision
 * @param name English name
 * @param wholeCountry whether it stands for the whole country (labels show the country only)
 */
public record SubdivisionView(String code, String name, boolean wholeCountry) {}
