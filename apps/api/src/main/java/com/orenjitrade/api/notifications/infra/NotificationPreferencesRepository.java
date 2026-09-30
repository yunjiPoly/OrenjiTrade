package com.orenjitrade.api.notifications.infra;

import com.orenjitrade.api.notifications.domain.NotificationPreferences;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** Repository of {@link NotificationPreferences}; used only inside the notifications module. */
public interface NotificationPreferencesRepository
        extends JpaRepository<NotificationPreferences, UUID> {}
