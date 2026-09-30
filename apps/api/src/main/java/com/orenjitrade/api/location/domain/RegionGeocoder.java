package com.orenjitrade.api.location.domain;

/**
 * Turns a public point into a coarse, human-readable area label ({@code "Plateau-Mont-Royal,
 * Montréal"}). Implementations only ever receive public (already imprecise) points and must not
 * call external services with them.
 */
public interface RegionGeocoder {

    String labelFor(double lat, double lng);
}
