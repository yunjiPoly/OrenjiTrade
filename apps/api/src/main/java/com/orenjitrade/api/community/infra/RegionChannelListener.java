package com.orenjitrade.api.community.infra;

import com.orenjitrade.api.community.domain.CommunityService;
import com.orenjitrade.api.location.domain.LocationService;
import com.orenjitrade.api.location.events.TradingAreaChangedEvent;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * Region channels appear with collectors (Phase 5 contract): when a collector's trading area puts
 * them on the map, the city of their public label gets a REGION channel unless one exists.
 * Idempotent (unique slug, existence check), so republished events are harmless. Only the region
 * label is read, never a coordinate.
 */
@Component
public class RegionChannelListener {

    private final CommunityService communityService;
    private final LocationService locationService;

    public RegionChannelListener(
            CommunityService communityService, LocationService locationService) {
        this.communityService = communityService;
        this.locationService = locationService;
    }

    @ApplicationModuleListener
    void on(TradingAreaChangedEvent event) {
        if (event.gridCell() == null) {
            return;
        }
        locationService.labelOf(event.userId()).ifPresent(communityService::ensureRegionChannel);
    }
}
