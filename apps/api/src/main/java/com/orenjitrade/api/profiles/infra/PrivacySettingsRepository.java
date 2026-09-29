package com.orenjitrade.api.profiles.infra;

import com.orenjitrade.api.profiles.domain.PrivacySettings;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** Repository of {@link PrivacySettings}; used only inside the profiles module. */
public interface PrivacySettingsRepository extends JpaRepository<PrivacySettings, UUID> {}
