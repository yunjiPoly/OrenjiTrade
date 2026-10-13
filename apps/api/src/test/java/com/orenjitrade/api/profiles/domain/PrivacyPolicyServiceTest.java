package com.orenjitrade.api.profiles.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** The privacy matrix of PrivacyPolicyService. */
class PrivacyPolicyServiceTest {

    private static final UUID TARGET = UUID.fromString("00000000-0000-4000-8000-00000000aaaa");
    private static final UUID VIEWER = UUID.fromString("00000000-0000-4000-8000-00000000bbbb");

    private final PrivacyPolicyService policy = new PrivacyPolicyService();

    private static PrivacySettingsView settings(
            ProfileVisibility visibility,
            MessagingPermission messaging,
            boolean discoverable,
            boolean showOnline,
            boolean showLastActive) {
        return new PrivacySettingsView(
                discoverable, showOnline, showLastActive, visibility, messaging, false, true);
    }

    private static ViewerContext member(boolean completedProfile) {
        return new ViewerContext(VIEWER, completedProfile, false);
    }

    @ParameterizedTest
    @CsvSource({
        // visibility, anonymous, member, owner
        "PUBLIC,  true,  true, true",
        "MEMBERS, false, true, true",
        "PRIVATE, false, false, true"
    })
    void profileVisibility(
            ProfileVisibility visibility, boolean anonymous, boolean memberView, boolean owner) {
        PrivacySettingsView target =
                settings(visibility, MessagingPermission.EVERYONE, true, true, true);
        assertThat(policy.canViewProfile(ViewerContext.ANONYMOUS, TARGET, target))
                .isEqualTo(anonymous);
        assertThat(policy.canViewProfile(member(true), TARGET, target)).isEqualTo(memberView);
        assertThat(policy.canViewProfile(new ViewerContext(TARGET, true, false), TARGET, target))
                .isEqualTo(owner);
    }

    @ParameterizedTest
    @CsvSource({
        // permission, member without profile, member with profile
        "EVERYONE,             true,  true",
        "MEMBERS_WITH_PROFILE, false, true",
        "NOBODY,               false, false"
    })
    void messagingPermission(
            MessagingPermission permission, boolean withoutProfile, boolean withProfile) {
        PrivacySettingsView target =
                settings(ProfileVisibility.MEMBERS, permission, false, false, true);
        assertThat(policy.canMessage(member(false), TARGET, target)).isEqualTo(withoutProfile);
        assertThat(policy.canMessage(member(true), TARGET, target)).isEqualTo(withProfile);
    }

    @Test
    void nobodyMessagesThemselvesAnonymousVisitorsOrAcrossBlocks() {
        PrivacySettingsView target =
                settings(ProfileVisibility.PUBLIC, MessagingPermission.EVERYONE, true, true, true);
        assertThat(policy.canMessage(new ViewerContext(TARGET, true, false), TARGET, target))
                .isFalse();
        assertThat(policy.canMessage(ViewerContext.ANONYMOUS, TARGET, target)).isFalse();
        assertThat(policy.canMessage(new ViewerContext(VIEWER, true, true), TARGET, target))
                .isFalse();
    }

    @Test
    void lastActiveAndOnlineStatusFollowTheSwitchesButTheOwnerSeesEverything() {
        PrivacySettingsView hidden =
                settings(
                        ProfileVisibility.MEMBERS,
                        MessagingPermission.EVERYONE,
                        true,
                        false,
                        false);
        PrivacySettingsView shown =
                settings(ProfileVisibility.MEMBERS, MessagingPermission.EVERYONE, true, true, true);
        assertThat(policy.canSeeLastActive(member(true), TARGET, hidden)).isFalse();
        assertThat(policy.canSeeOnlineStatus(member(true), TARGET, hidden)).isFalse();
        assertThat(policy.canSeeLastActive(member(true), TARGET, shown)).isTrue();
        assertThat(policy.canSeeOnlineStatus(member(true), TARGET, shown)).isTrue();
        ViewerContext owner = new ViewerContext(TARGET, true, false);
        assertThat(policy.canSeeLastActive(owner, TARGET, hidden)).isTrue();
        assertThat(policy.canSeeOnlineStatus(owner, TARGET, hidden)).isTrue();
    }

    @Test
    void locationOnlyForDiscoverableCollectors() {
        PrivacySettingsView discoverable =
                settings(
                        ProfileVisibility.MEMBERS, MessagingPermission.EVERYONE, true, false, true);
        PrivacySettingsView hidden =
                settings(
                        ProfileVisibility.MEMBERS,
                        MessagingPermission.EVERYONE,
                        false,
                        false,
                        true);
        assertThat(policy.canSeeLocation(member(true), TARGET, discoverable)).isTrue();
        assertThat(policy.canSeeLocation(member(true), TARGET, hidden)).isFalse();
        assertThat(policy.canSeeLocation(ViewerContext.ANONYMOUS, TARGET, discoverable)).isFalse();
    }

    @ParameterizedTest
    @CsvSource({
        // discoverable, visibility, anonymous, member, blocked member, owner
        "true,  PUBLIC,  true,  true,  false, true",
        "true,  MEMBERS, true,  true,  false, true",
        "true,  PRIVATE, false, false, false, true",
        "false, PUBLIC,  false, false, false, false"
    })
    void mapPresenceNeedsDiscoverabilityAndANonPrivateProfile(
            boolean discoverable,
            ProfileVisibility visibility,
            boolean anonymous,
            boolean memberView,
            boolean blockedView,
            boolean owner) {
        PrivacySettingsView target =
                settings(visibility, MessagingPermission.EVERYONE, discoverable, true, true);
        assertThat(policy.canAppearOnMap(ViewerContext.ANONYMOUS, TARGET, target))
                .isEqualTo(anonymous);
        assertThat(policy.canAppearOnMap(member(true), TARGET, target)).isEqualTo(memberView);
        assertThat(policy.canAppearOnMap(new ViewerContext(VIEWER, true, true), TARGET, target))
                .isEqualTo(blockedView);
        assertThat(policy.canAppearOnMap(new ViewerContext(TARGET, true, false), TARGET, target))
                .isEqualTo(owner);
    }

    @Test
    void nameSearchAlsoNeedsSearchDiscoverable() {
        PrivacySettingsView searchable =
                new PrivacySettingsView(
                        true,
                        false,
                        true,
                        ProfileVisibility.MEMBERS,
                        MessagingPermission.EVERYONE,
                        false,
                        true);
        PrivacySettingsView unsearchable =
                new PrivacySettingsView(
                        true,
                        false,
                        true,
                        ProfileVisibility.MEMBERS,
                        MessagingPermission.EVERYONE,
                        false,
                        false);
        assertThat(policy.canAppearInNameSearch(ViewerContext.ANONYMOUS, TARGET, searchable))
                .isTrue();
        assertThat(policy.canAppearInNameSearch(member(true), TARGET, unsearchable)).isFalse();
        assertThat(policy.canAppearOnMap(member(true), TARGET, unsearchable)).isTrue();
    }

    @Test
    void defaultsFavourSafety() {
        PrivacySettingsView defaults = PrivacySettingsView.DEFAULTS;
        assertThat(defaults.discoverable()).isFalse();
        assertThat(defaults.showOnlineStatus()).isFalse();
        assertThat(defaults.wishlistVisible()).isFalse();
        assertThat(defaults.profileVisibility()).isEqualTo(ProfileVisibility.MEMBERS);
        assertThat(defaults.messagingPermission())
                .isEqualTo(MessagingPermission.MEMBERS_WITH_PROFILE);
        assertThat(policy.canSeeLocation(member(true), TARGET, defaults)).isFalse();
        assertThat(policy.canMessage(member(false), TARGET, defaults)).isFalse();
    }
}
