package com.orenjitrade.api.community.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class RegionChannelsTest {

    @Test
    void theCityComesFromThePublicLabel() {
        assertThat(CommunityService.cityOf("Plateau-Mont-Royal, Montréal")).isEqualTo("Montréal");
        assertThat(CommunityService.cityOf("Downtown Montréal")).isEqualTo("Montréal");
        assertThat(CommunityService.cityOf("Laval")).isEqualTo("Laval");
        assertThat(CommunityService.cityOf("Westmount")).isEqualTo("Westmount");
        assertThat(CommunityService.cityOf("Near Toronto")).isNull();
        assertThat(CommunityService.cityOf("Approximate area")).isNull();
        assertThat(CommunityService.cityOf(null)).isNull();
        assertThat(CommunityService.cityOf("  ")).isNull();
    }

    @Test
    void regionSlugsAreAsciiAndBounded() {
        assertThat(CommunityService.regionSlug("Trois-Rivières"))
                .isEqualTo("region-trois-rivieres");
        assertThat(CommunityService.regionSlug("Québec")).isEqualTo("region-quebec");
        assertThat(CommunityService.regionSlug("Saint-Jean-sur-Richelieu  "))
                .isEqualTo("region-saint-jean-sur-richelieu");
        String longSlug = CommunityService.regionSlug("Very ".repeat(30) + "Long City");
        assertThat(longSlug).hasSizeLessThanOrEqualTo(64).doesNotEndWith("-");
        assertThat(CommunityService.SLUG.matcher(longSlug).matches()).isTrue();
    }
}
