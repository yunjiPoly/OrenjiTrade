package com.orenjitrade.api.profiles.domain;

/**
 * A collector's privacy switches (defaults filled in). Defaults favour safety: not discoverable,
 * online status hidden, profile visible to members, messages from members with a profile, wishlist
 * hidden.
 */
public record PrivacySettingsView(
        boolean discoverable,
        boolean showDistance,
        boolean showOnlineStatus,
        boolean showLastActive,
        ProfileVisibility profileVisibility,
        MessagingPermission messagingPermission,
        boolean wishlistVisible,
        boolean searchDiscoverable) {

    public static final PrivacySettingsView DEFAULTS =
            new PrivacySettingsView(
                    false,
                    true,
                    false,
                    true,
                    ProfileVisibility.MEMBERS,
                    MessagingPermission.MEMBERS_WITH_PROFILE,
                    false,
                    true);
}
