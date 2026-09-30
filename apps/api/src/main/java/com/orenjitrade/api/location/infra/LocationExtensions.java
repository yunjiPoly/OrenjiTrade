package com.orenjitrade.api.location.infra;

import com.orenjitrade.api.admin.domain.AdminUserDetailContributor;
import com.orenjitrade.api.location.domain.LocationService;
import com.orenjitrade.api.location.domain.MyLocationView;
import com.orenjitrade.api.users.domain.DeletionParticipant;
import com.orenjitrade.api.users.domain.ExportContributor;
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
 * The location module's implementations of other modules' extension points: the {@code
 * tradingAreaSet} onboarding flag, the admin location label (never coordinates), the deletion
 * participant and the owner's export section.
 */
@Configuration(proxyBeanMethods = false)
public class LocationExtensions {

    @Bean
    OnboardingCheck tradingAreaSetCheck(LocationService locationService) {
        return new OnboardingCheck() {
            @Override
            public OnboardingFlag flag() {
                return OnboardingFlag.TRADING_AREA_SET;
            }

            @Override
            public boolean isSatisfied(UUID userId) {
                return locationService.hasTradingArea(userId);
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

    @Bean
    @Order(300)
    DeletionParticipant locationDeletionParticipant(LocationService locationService) {
        return new DeletionParticipant() {
            @Override
            public String name() {
                return "location";
            }

            @Override
            public void onDeletionRequested(UUID userId) {
                locationService.hidePublicPoint(userId);
            }

            @Override
            public void onDeletionCancelled(UUID userId) {
                locationService.refreshPublicPoint(userId);
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
                if (mine.tradingArea() == null) {
                    return null;
                }
                Map<String, @Nullable Object> data = new LinkedHashMap<>();
                data.put("tradingArea", mine.tradingArea());
                data.put("publicPoint", mine.publicPoint());
                data.put("discoverable", mine.discoverable());
                return data;
            }
        };
    }
}
