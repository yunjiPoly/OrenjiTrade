package com.orenjitrade.api.notifications.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * JPA entity for {@code notification_preferences}. The JSONB columns are kept as JSON text and
 * (de)serialised by {@link NotificationPreferencesService}. Never leaves the module.
 */
@Entity
@Table(name = "notification_preferences")
public class NotificationPreferences {

    @Id
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "push_enabled", nullable = false)
    private boolean pushEnabled;

    @Column(name = "email_enabled", nullable = false)
    private boolean emailEnabled;

    @Column(name = "in_app_enabled", nullable = false)
    private boolean inAppEnabled;

    @Column(name = "wishlist_alerts", nullable = false)
    private boolean wishlistAlerts;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "categories", nullable = false)
    private String categories;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "quiet_hours", nullable = false)
    private String quietHours;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** JPA only. */
    protected NotificationPreferences() {
        this.userId = UUID.randomUUID();
        this.categories = "{}";
        this.quietHours = "{}";
        this.createdAt = Instant.EPOCH;
        this.updatedAt = Instant.EPOCH;
    }

    public NotificationPreferences(UUID userId, Instant now) {
        this.userId = userId;
        this.pushEnabled = true;
        this.inAppEnabled = true;
        this.wishlistAlerts = true;
        this.categories = "{}";
        this.quietHours = "{}";
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void update(
            boolean pushEnabled,
            boolean emailEnabled,
            boolean inAppEnabled,
            String categoriesJson,
            String quietHoursJson,
            boolean wishlistAlerts,
            Instant now) {
        this.pushEnabled = pushEnabled;
        this.emailEnabled = emailEnabled;
        this.inAppEnabled = inAppEnabled;
        this.wishlistAlerts = wishlistAlerts;
        this.categories = categoriesJson;
        this.quietHours = quietHoursJson;
        this.updatedAt = now;
    }

    public UUID getUserId() {
        return userId;
    }

    public boolean isPushEnabled() {
        return pushEnabled;
    }

    public boolean isEmailEnabled() {
        return emailEnabled;
    }

    public boolean isInAppEnabled() {
        return inAppEnabled;
    }

    public boolean isWishlistAlerts() {
        return wishlistAlerts;
    }

    public String getCategories() {
        return categories;
    }

    public String getQuietHours() {
        return quietHours;
    }
}
