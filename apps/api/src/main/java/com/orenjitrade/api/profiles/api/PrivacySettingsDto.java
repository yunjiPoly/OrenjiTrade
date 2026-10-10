package com.orenjitrade.api.profiles.api;

import com.orenjitrade.api.profiles.domain.MessagingPermission;
import com.orenjitrade.api.profiles.domain.PrivacySettingsView;
import com.orenjitrade.api.profiles.domain.ProfileVisibility;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import jakarta.validation.constraints.NotNull;

/**
 * Body and response of {@code GET|PUT /api/v1/me/settings/privacy} (full replacement: every field
 * is required). Defaults favour safety.
 */
@Schema(name = "PrivacySettings", description = "Privacy settings of the caller")
public record PrivacySettingsDto(
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        description =
                                "Appear in region search, card holder lists and the state binder"
                                        + " lists of the map (default false); needs a country and a"
                                        + " state/province, 409 LOCATION_REQUIRED otherwise")
                @NotNull
                Boolean discoverable,
        @Schema(requiredMode = RequiredMode.REQUIRED, description = "Default false") @NotNull
                Boolean showOnlineStatus,
        @Schema(requiredMode = RequiredMode.REQUIRED, description = "Default true") @NotNull
                Boolean showLastActive,
        @Schema(requiredMode = RequiredMode.REQUIRED, description = "Default MEMBERS") @NotNull
                ProfileVisibility profileVisibility,
        @Schema(requiredMode = RequiredMode.REQUIRED, description = "Default MEMBERS_WITH_PROFILE")
                @NotNull
                MessagingPermission messagingPermission,
        @Schema(requiredMode = RequiredMode.REQUIRED, description = "Default false") @NotNull
                Boolean wishlistVisible,
        @Schema(requiredMode = RequiredMode.REQUIRED, description = "Default true") @NotNull
                Boolean searchDiscoverable) {

    static PrivacySettingsDto from(PrivacySettingsView view) {
        return new PrivacySettingsDto(
                view.discoverable(),
                view.showOnlineStatus(),
                view.showLastActive(),
                view.profileVisibility(),
                view.messagingPermission(),
                view.wishlistVisible(),
                view.searchDiscoverable());
    }

    PrivacySettingsView toView() {
        return new PrivacySettingsView(
                discoverable,
                showOnlineStatus,
                showLastActive,
                profileVisibility,
                messagingPermission,
                wishlistVisible,
                searchDiscoverable);
    }
}
