package com.orenjitrade.api.location.infra;

import com.orenjitrade.api.admin.domain.AdminUserDetailContributor;
import com.orenjitrade.api.location.domain.LocationService;
import com.orenjitrade.api.location.domain.MyLocationView;
import com.orenjitrade.api.location.domain.PublicPlace;
import com.orenjitrade.api.users.domain.DeletionParticipant;
import com.orenjitrade.api.users.domain.ExportContributor;
import com.orenjitrade.api.users.domain.HomeRegionProvider;
import com.orenjitrade.api.users.domain.OnboardingCheck;
import com.orenjitrade.api.users.domain.OnboardingFlag;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;

/**
 * The location module's implementations of other modules' extension points: the home region and the
 * {@code locationSet} onboarding flag of {@code GET /me}, the admin location label (state/province
 * + country, never the city), the deletion participant and the owner's export section (the only
 * export of the city).
 */
@Configuration(proxyBeanMethods = false)
public class LocationExtensions {

    @Bean
    HomeRegionProvider homeRegionProvider(LocationService locationService) {
        return userId -> locationService.homeRegionOf(userId).orElse(null);
    }

    @Bean
    OnboardingCheck locationSetCheck(LocationService locationService) {
        return new OnboardingCheck() {
            @Override
            public OnboardingFlag flag() {
                return OnboardingFlag.LOCATION_SET;
            }

            @Override
            public boolean isSatisfied(UUID userId) {
                return locationService.hasLocation(userId);
            }
        };
    }

    @Bean
    AdminUserDetailContributor locationLabelContributor(LocationService locationService) {
        return new AdminUserDetailContributor() {
            @Override
            public @Nullable String locationLabel(UUID userId) {
                return locationService.labelOf(userId).orElse(null);
            }
        };
    }

    /**
     * Account deletion: nothing to hide while it is pending (discovery queries skip accounts
     * pending deletion), the row is deleted by the purge.
     */
    @Bean
    @Order(300)
    DeletionParticipant locationDeletionParticipant(LocationService locationService) {
        return new DeletionParticipant() {
            @Override
            public String name() {
                return "location";
            }

            @Override
            public void purge(UUID userId) {
                locationService.purge(userId);
            }
        };
    }

    @Bean
    @Order(300)
    ExportContributor locationExportContributor(LocationService locationService) {
        return new ExportContributor() {
            @Override
            public String section() {
                return "location";
            }

            @Override
            public @Nullable Object export(UUID userId) {
                MyLocationView mine = locationService.getMine(userId);
                @Nullable PublicPlace place = mine.place();
                if (place == null) {
                    return null;
                }
                Map<String, @Nullable Object> data = new LinkedHashMap<>();
                data.put("regionCode", place.regionCode());
                data.put("countryCode", place.countryCode());
                data.put("countryName", place.countryName());
                data.put("subdivisionCode", place.subdivisionCode());
                data.put("subdivisionName", place.subdivisionName());
                data.put("city", mine.city());
                data.put("showCity", mine.showCity());
                data.put("discoverable", mine.discoverable());
                return data;
            }
        };
    }
}
