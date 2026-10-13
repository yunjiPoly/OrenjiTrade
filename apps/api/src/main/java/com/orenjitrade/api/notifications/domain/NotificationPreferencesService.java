package com.orenjitrade.api.notifications.domain;

import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.notifications.infra.NotificationPreferencesRepository;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.ZoneId;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Notification preferences ({@code GET|PUT /api/v1/me/settings/notifications}). A missing row means
 * the defaults; unknown categories stored by a newer version are ignored when reading. The Phase 6
 * notification dispatcher reads {@link #settingsOf} before sending anything.
 */
@Service
public class NotificationPreferencesService {

    private static final Logger log = LoggerFactory.getLogger(NotificationPreferencesService.class);

    private final NotificationPreferencesRepository repository;
    private final JsonMapper jsonMapper;
    private final TimeProvider timeProvider;

    public NotificationPreferencesService(
            NotificationPreferencesRepository repository,
            JsonMapper jsonMapper,
            TimeProvider timeProvider) {
        this.repository = repository;
        this.jsonMapper = jsonMapper;
        this.timeProvider = timeProvider;
    }

    @Transactional(readOnly = true)
    public NotificationSettings settingsOf(UUID userId) {
        return repository
                .findById(userId)
                .map(this::toSettings)
                .orElseGet(NotificationSettings::defaults);
    }

    /**
     * Replaces the settings; missing categories fall back to their defaults. With {@code
     * keepWishlistAlerts} the stored wishlist alert switch is kept whatever {@code requested} says
     * (on for a collector without stored settings): a request that leaves the switch out must not
     * turn alerts back on.
     */
    @Transactional
    public NotificationSettings update(
            UUID userId, NotificationSettings requested, boolean keepWishlistAlerts) {
        validateQuietHours(requested.quietHours());
        Instant now = timeProvider.now();
        NotificationPreferences preferences =
                repository
                        .findById(userId)
                        .orElseGet(() -> repository.save(new NotificationPreferences(userId, now)));
        Map<String, ChannelPreferences> categories = new LinkedHashMap<>();
        requested
                .categories()
                .forEach((category, channels) -> categories.put(category.name(), channels));
        preferences.update(
                requested.pushEnabled(),
                requested.emailEnabled(),
                requested.inAppEnabled(),
                jsonMapper.writeValueAsString(categories),
                jsonMapper.writeValueAsString(requested.quietHours()),
                keepWishlistAlerts ? preferences.isWishlistAlerts() : requested.wishlistAlerts(),
                now);
        return toSettings(preferences);
    }

    /** Deletes the row (account deletion). */
    @Transactional
    public void purge(UUID userId) {
        repository.deleteById(userId);
    }

    private NotificationSettings toSettings(NotificationPreferences preferences) {
        Map<NotificationCategory, ChannelPreferences> categories =
                new EnumMap<>(NotificationCategory.class);
        try {
            Map<String, ChannelPreferences> stored =
                    jsonMapper.readValue(
                            preferences.getCategories(),
                            new TypeReference<Map<String, ChannelPreferences>>() {});
            stored.forEach(
                    (name, channels) -> {
                        for (NotificationCategory category : NotificationCategory.values()) {
                            if (category.name().equals(name) && channels != null) {
                                categories.put(category, channels);
                            }
                        }
                    });
        } catch (JacksonException e) {
            log.warn(
                    "Unreadable notification categories for user {}; using defaults",
                    preferences.getUserId());
        }
        QuietHours quietHours = QuietHours.DEFAULT;
        try {
            QuietHours stored = jsonMapper.readValue(preferences.getQuietHours(), QuietHours.class);
            if (stored != null
                    && stored.start() != null
                    && stored.end() != null
                    && stored.timezone() != null) {
                quietHours = stored;
            }
        } catch (JacksonException e) {
            log.warn("Unreadable quiet hours for user {}; using defaults", preferences.getUserId());
        }
        return new NotificationSettings(
                preferences.isPushEnabled(),
                preferences.isEmailEnabled(),
                preferences.isInAppEnabled(),
                categories,
                quietHours,
                preferences.isWishlistAlerts());
    }

    private static void validateQuietHours(QuietHours quietHours) {
        try {
            ZoneId.of(quietHours.timezone());
        } catch (DateTimeException e) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(
                            new ProblemFieldError(
                                    "quietHours.timezone", "must be an IANA time zone id")));
        }
    }
}
