package com.orenjitrade.api.profiles.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * JPA entity for {@code privacy_settings}. A missing row means {@link
 * PrivacySettingsView#DEFAULTS}.
 */
@Entity
@Table(name = "privacy_settings")
public class PrivacySettings {

    @Id
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "discoverable", nullable = false)
    private boolean discoverable;

    @Column(name = "show_online_status", nullable = false)
    private boolean showOnlineStatus;

    @Column(name = "show_last_active", nullable = false)
    private boolean showLastActive;

    @Enumerated(EnumType.STRING)
    @Column(name = "profile_visibility", nullable = false)
    private ProfileVisibility profileVisibility;

    @Enumerated(EnumType.STRING)
    @Column(name = "messaging_permission", nullable = false)
    private MessagingPermission messagingPermission;

    @Column(name = "wishlist_visible", nullable = false)
    private boolean wishlistVisible;

    @Column(name = "search_discoverable", nullable = false)
    private boolean searchDiscoverable;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** JPA only. */
    protected PrivacySettings() {
        this(UUID.randomUUID(), Instant.EPOCH);
    }

    /** A row holding the safe defaults. */
    public PrivacySettings(UUID userId, Instant now) {
        this.userId = userId;
        this.createdAt = now;
        this.updatedAt = now;
        apply(PrivacySettingsView.DEFAULTS, now);
    }

    public void apply(PrivacySettingsView view, Instant now) {
        this.discoverable = view.discoverable();
        this.showOnlineStatus = view.showOnlineStatus();
        this.showLastActive = view.showLastActive();
        this.profileVisibility = view.profileVisibility();
        this.messagingPermission = view.messagingPermission();
        this.wishlistVisible = view.wishlistVisible();
        this.searchDiscoverable = view.searchDiscoverable();
        this.updatedAt = now;
    }

    public PrivacySettingsView toView() {
        return new PrivacySettingsView(
                discoverable,
                showOnlineStatus,
                showLastActive,
                profileVisibility,
                messagingPermission,
                wishlistVisible,
                searchDiscoverable);
    }

    public UUID getUserId() {
        return userId;
    }
}
