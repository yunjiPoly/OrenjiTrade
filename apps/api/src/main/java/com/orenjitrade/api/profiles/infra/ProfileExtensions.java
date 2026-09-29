package com.orenjitrade.api.profiles.infra;

import com.orenjitrade.api.profiles.domain.AvatarImageProcessor;
import com.orenjitrade.api.profiles.domain.MyProfileView;
import com.orenjitrade.api.profiles.domain.PrivacySettingsService;
import com.orenjitrade.api.profiles.domain.ProfileService;
import com.orenjitrade.api.users.domain.AvatarUrlProvider;
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
 * The profiles module's implementations of other modules' extension points: avatar URLs for {@code
 * /me} and admin views, the {@code profileComplete} and {@code interestsSet} onboarding flags, the
 * deletion participant (profile, tags, avatar, privacy settings) and the export sections {@code
 * profile} and {@code privacySettings}.
 */
@Configuration(proxyBeanMethods = false)
public class ProfileExtensions {

    @Bean
    AvatarImageProcessor avatarImageProcessor() {
        return new AvatarImageProcessor();
    }

    @Bean
    AvatarUrlProvider profileAvatarUrlProvider(ProfileService profileService) {
        return profileService::avatarUrlOf;
    }

    @Bean
    OnboardingCheck profileCompleteCheck(ProfileService profileService) {
        return new OnboardingCheck() {
            @Override
            public OnboardingFlag flag() {
                return OnboardingFlag.PROFILE_COMPLETE;
            }

            @Override
            public boolean isSatisfied(UUID userId) {
                return profileService.isComplete(userId);
            }
        };
    }

    @Bean
    OnboardingCheck interestsSetCheck(ProfileService profileService) {
        return new OnboardingCheck() {
            @Override
            public OnboardingFlag flag() {
                return OnboardingFlag.INTERESTS_SET;
            }

            @Override
            public boolean isSatisfied(UUID userId) {
                return profileService.hasInterests(userId);
            }
        };
    }

    @Bean
    @Order(200)
    DeletionParticipant profileDeletionParticipant(
            ProfileService profileService, PrivacySettingsService privacySettingsService) {
        return new DeletionParticipant() {
            @Override
            public String name() {
                return "profile";
            }

            @Override
            public void purge(UUID userId) {
                profileService.purge(userId);
                privacySettingsService.purge(userId);
            }
        };
    }

    @Bean
    @Order(200)
    ExportContributor profileExportContributor(ProfileService profileService) {
        return new ExportContributor() {
            @Override
            public String section() {
                return "profile";
            }

            @Override
            public @Nullable Object export(UUID userId) {
                MyProfileView profile = profileService.getMine(userId);
                Map<String, @Nullable Object> data = new LinkedHashMap<>();
                data.put("handle", profile.handle());
                data.put("displayName", profile.displayName());
                data.put("bio", profile.bio());
                data.put("games", profile.games());
                data.put("languages", profile.languages());
                data.put("avatarUrl", profile.avatarUrl());
                data.put(
                        "tags",
                        profile.tags().stream()
                                .map(
                                        tag ->
                                                Map.of(
                                                        "slug", tag.slug(),
                                                        "label", tag.label(),
                                                        "category", tag.category().name()))
                                .toList());
                data.put("completedAt", profile.completedAt());
                return data;
            }
        };
    }

    @Bean
    @Order(210)
    ExportContributor privacySettingsExportContributor(
            PrivacySettingsService privacySettingsService) {
        return new ExportContributor() {
            @Override
            public String section() {
                return "privacySettings";
            }

            @Override
            public @Nullable Object export(UUID userId) {
                return privacySettingsService.settingsOf(userId);
            }
        };
    }
}
