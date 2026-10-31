package com.orenjitrade.api.search.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.search.domain.ProvinceOrder.Place;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The province groups of "Who has this card" (stage R5), as pure Java. */
class ProvinceOrderTest {

    private static final Place QUEBEC = new Place("CA", "Canada", "CA-QC", "Quebec");
    private static final Place ONTARIO = new Place("CA", "Canada", "CA-ON", "Ontario");
    private static final Place ALBERTA = new Place("CA", "Canada", "CA-AB", "Alberta");
    private static final Place NEW_YORK = new Place("US", "United States", "US-NY", "New York");
    private static final Place CALIFORNIA = new Place("US", "United States", "US-CA", "California");
    private static final Place JALISCO = new Place("MX", "Mexico", "MX-JAL", "Jalisco");

    @Test
    void tiers() {
        assertThat(ProvinceOrder.tier("CA", "CA-QC", "CA", "CA-QC"))
                .isEqualTo(ProvinceOrder.OWN_PROVINCE);
        assertThat(ProvinceOrder.tier("CA", "CA-QC", "CA", "CA-ON"))
                .isEqualTo(ProvinceOrder.OWN_COUNTRY);
        assertThat(ProvinceOrder.tier("CA", "CA-QC", "US", "US-NY"))
                .isEqualTo(ProvinceOrder.REST_OF_REGION);
        assertThat(ProvinceOrder.tier(null, null, "CA", "CA-QC"))
                .as("a viewer without a location")
                .isEqualTo(ProvinceOrder.REST_OF_REGION);
    }

    @Test
    void ownProvinceThenOwnCountryByNameThenTheRestByCountryAndProvince() {
        List<Place> places =
                new ArrayList<>(List.of(NEW_YORK, JALISCO, ONTARIO, CALIFORNIA, QUEBEC, ALBERTA));
        places.sort(ProvinceOrder.groups("CA", "CA-QC"));
        assertThat(places).containsExactly(QUEBEC, ALBERTA, ONTARIO, JALISCO, CALIFORNIA, NEW_YORK);

        places.sort(ProvinceOrder.groups("US", "US-NY"));
        assertThat(places).containsExactly(NEW_YORK, CALIFORNIA, ALBERTA, ONTARIO, QUEBEC, JALISCO);

        places.sort(ProvinceOrder.groups(null, null));
        assertThat(places).containsExactly(ALBERTA, ONTARIO, QUEBEC, JALISCO, CALIFORNIA, NEW_YORK);
    }
}
