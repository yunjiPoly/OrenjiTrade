package com.orenjitrade.api.location.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** Snapped search centres (ADR 0004: the precise centre never reaches a query or a response). */
class SearchCentreTest {

    @Test
    void snapsToTwoDecimals() {
        SearchCentre centre = SearchCentre.snap(45.51739, -73.58914);
        assertThat(centre.lat()).isEqualTo(45.52);
        assertThat(centre.lng()).isEqualTo(-73.59);
        assertThat(SearchCentre.snap(45.525, 186.0).lng()).isEqualTo(-174.0);
        assertThat(centre).isEqualTo(SearchCentre.snap(45.5249, -73.5851));
    }

    @Test
    void exposesAGridCellAndNeverPrintsCoordinates() {
        SearchCentre centre = SearchCentre.snap(45.52, -73.58);
        assertThat(centre.gridCell())
                .isEqualTo(ApproximateLocationService.cellOf(45.52, -73.58).id());
        assertThat(centre.toString()).doesNotContain("45.52").doesNotContain("73.58");
        double km = centre.distanceKmTo(new PublicPoint(45.53, -73.58));
        assertThat(km).isBetween(1.0, 1.2);
        assertThat(DistanceBucket.KM_1_5.upperKm()).isEqualTo(5.0);
    }
}
