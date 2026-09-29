package com.orenjitrade.api.location.infra;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** Labels of the offline region table. */
class StaticRegionGeocoderTest {

    private final StaticRegionGeocoder geocoder = new StaticRegionGeocoder();

    @Test
    void hasAboutThirtyRegions() {
        assertThat(StaticRegionGeocoder.REGIONS).hasSizeBetween(28, 40);
        assertThat(StaticRegionGeocoder.REGIONS)
                .extracting(StaticRegionGeocoder.Region::label)
                .doesNotHaveDuplicates();
    }

    @Test
    void neighbourhoodCentroidsResolveToThemselves() {
        assertThat(geocoder.labelFor(45.522, -73.581)).isEqualTo("Plateau-Mont-Royal, Montréal");
        assertThat(geocoder.labelFor(45.524, -73.601)).isEqualTo("Mile End, Montréal");
        assertThat(geocoder.labelFor(45.458, -73.568)).isEqualTo("Verdun, Montréal");
        assertThat(geocoder.labelFor(45.483, -73.598)).isEqualTo("Westmount");
        assertThat(geocoder.labelFor(45.507, -73.554)).isEqualTo("Old Port, Montréal");
        assertThat(geocoder.labelFor(45.549, -73.577)).isEqualTo("Rosemont, Montréal");
    }

    @Test
    void pointsNearACentroidTakeTheNearestNeighbourhood() {
        // ~300 m from the Plateau centroid.
        assertThat(geocoder.labelFor(45.524, -73.578)).isEqualTo("Plateau-Mont-Royal, Montréal");
    }

    @Test
    void citiesWhenNoNeighbourhoodMatches() {
        assertThat(geocoder.labelFor(45.606, -73.712)).isEqualTo("Laval");
        assertThat(geocoder.labelFor(45.531, -73.518)).isEqualTo("Longueuil");
        assertThat(geocoder.labelFor(46.81, -71.21)).isEqualTo("Québec");
        assertThat(geocoder.labelFor(43.65, -79.38)).isEqualTo("Toronto");
        assertThat(geocoder.labelFor(49.28, -123.12)).isEqualTo("Vancouver");
    }

    @Test
    void nearAndFallbackLabels() {
        // Between Montréal and Québec, outside every radius but within 150 km of Trois-Rivières.
        assertThat(geocoder.labelFor(46.0, -72.6)).startsWith("Near ");
        // Middle of the Atlantic.
        assertThat(geocoder.labelFor(30.0, -40.0)).isEqualTo(StaticRegionGeocoder.FALLBACK_LABEL);
    }
}
