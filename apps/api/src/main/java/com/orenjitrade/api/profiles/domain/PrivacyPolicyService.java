package com.orenjitrade.api.profiles.domain;

import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * The privacy matrix, in one place (pure; unit-tested exhaustively). Other modules (map search,
 * messaging, wishlist visibility) must ask this class rather than re-implementing the rules. The
 * owner always sees everything about themselves but cannot message themselves.
 */
@Component
public class PrivacyPolicyService {

    /** Whether {@code viewer} may open the profile of {@code targetId}. */
    public boolean canViewProfile(ViewerContext viewer, UUID targetId, PrivacySettingsView target) {
        if (viewer.is(targetId)) {
            return true;
        }
        return switch (target.profileVisibility()) {
            case PUBLIC -> true;
            case MEMBERS -> viewer.isMember();
            case PRIVATE -> false;
        };
    }

    public boolean canSeeLastActive(
            ViewerContext viewer, UUID targetId, PrivacySettingsView target) {
        return viewer.is(targetId)
                || (target.showLastActive() && canViewProfile(viewer, targetId, target));
    }

    public boolean canSeeOnlineStatus(
            ViewerContext viewer, UUID targetId, PrivacySettingsView target) {
        return viewer.is(targetId)
                || (target.showOnlineStatus() && canViewProfile(viewer, targetId, target));
    }

    /** Whether the target's state/province and country may be shown (discoverable collectors). */
    public boolean canSeeLocation(ViewerContext viewer, UUID targetId, PrivacySettingsView target) {
        return target.discoverable() && canViewProfile(viewer, targetId, target);
    }

    /**
     * Whether the target appears in region searches, card holder lists and the state binder lists
     * of the map for {@code viewer} (ADR 0017): only collectors who opted in to discoverability
     * ({@code discoverable}, the explicit consent to be listed with their state/province and
     * country to every visitor, signed-out ones included) and whose profile is not PRIVATE; never
     * when a block exists between them. The queries also require a location (country + subdivision)
     * and an ACTIVE account. Signed-out visitors get reduced details through the other rules of
     * this class (no last-active for MEMBERS profiles, no messaging).
     */
    public boolean canAppearOnMap(ViewerContext viewer, UUID targetId, PrivacySettingsView target) {
        if (!target.discoverable() || viewer.blocked()) {
            return false;
        }
        return viewer.is(targetId) || target.profileVisibility() != ProfileVisibility.PRIVATE;
    }

    /**
     * Whether the target appears in collector name search (handle, display name, tag text) for
     * {@code viewer}: on the map and {@code searchDiscoverable}.
     */
    public boolean canAppearInNameSearch(
            ViewerContext viewer, UUID targetId, PrivacySettingsView target) {
        return target.searchDiscoverable() && canAppearOnMap(viewer, targetId, target);
    }

    /**
     * Whether {@code viewer} may see the target's public wishlist summary (Phase 6): the owner
     * always; others only when the target shows their wishlist ({@code wishlistVisible}), may see
     * the profile and no block exists between them.
     */
    public boolean canSeeWishlist(ViewerContext viewer, UUID targetId, PrivacySettingsView target) {
        if (viewer.is(targetId)) {
            return true;
        }
        return target.wishlistVisible()
                && !viewer.blocked()
                && canViewProfile(viewer, targetId, target);
    }

    /** Whether {@code viewer} may start a private conversation with the target. */
    public boolean canMessage(ViewerContext viewer, UUID targetId, PrivacySettingsView target) {
        if (!viewer.isMember() || viewer.is(targetId) || viewer.blocked()) {
            return false;
        }
        return switch (target.messagingPermission()) {
            case EVERYONE -> true;
            case MEMBERS_WITH_PROFILE -> viewer.hasCompletedProfile();
            case NOBODY -> false;
        };
    }
}
