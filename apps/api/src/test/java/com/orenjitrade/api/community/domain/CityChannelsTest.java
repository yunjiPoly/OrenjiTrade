package com.orenjitrade.api.community.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.orenjitrade.api.location.domain.RegionCatalog;
import com.orenjitrade.api.location.domain.RegionView;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * What staff may read of a channel of the old model named after a city (ADR 0017, spec 15.2; web
 * stage WH1 review fixes 1 and 2): never its city label nor its slug, which names the city.
 */
class CityChannelsTest {

    private RegionCatalog regions;

    @BeforeEach
    void regions() {
        regions = mock(RegionCatalog.class);
        when(regions.region(anyString())).thenReturn(Optional.empty());
        when(regions.region("americas-north"))
                .thenReturn(
                        Optional.of(
                                new RegionView(
                                        "americas-north", "Americas (North)", true, 1, List.of())));
    }

    @Test
    void aCityLabelIsACityChannel() {
        assertThat(CityChannels.isCity("Montréal", regions)).isTrue();
        assertThat(CityChannels.isCity("americas-north", regions)).isFalse();
        assertThat(CityChannels.isCity(null, regions)).isFalse();
    }

    @Test
    void staffReadThePlatformRegionOnly() {
        assertThat(CityChannels.platformRegion("americas-north", regions))
                .isEqualTo("americas-north");
        assertThat(CityChannels.platformRegion("Montréal", regions)).isNull();
        assertThat(CityChannels.platformRegion(null, regions)).isNull();
    }

    @Test
    void staffReadANeutralSlugForACityChannel() {
        assertThat(CityChannels.staffSlug("montreal-yugioh", "Montréal", regions))
                .isEqualTo(CityChannels.ARCHIVED_SLUG)
                .isEqualTo("archived-channel");
        assertThat(CityChannels.staffSlug("americas-north-yugioh", "americas-north", regions))
                .isEqualTo("americas-north-yugioh");
        assertThat(CityChannels.staffSlug("general", null, regions)).isEqualTo("general");
    }
}
