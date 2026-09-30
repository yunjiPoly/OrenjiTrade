package com.orenjitrade.api.community.infra;

import com.orenjitrade.api.community.domain.CommunityService;
import com.orenjitrade.api.users.domain.DeletionParticipant;
import com.orenjitrade.api.users.domain.ExportContributor;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;

/**
 * The community module's implementations of other modules' extension points: the export section
 * {@code community} (the owner's posts and replies) and the deletion participant (posts and replies
 * deleted and their text erased).
 */
@Configuration(proxyBeanMethods = false)
public class CommunityExtensions {

    @Bean
    @Order(510)
    DeletionParticipant communityDeletionParticipant(CommunityService communityService) {
        return new DeletionParticipant() {
            @Override
            public String name() {
                return "community";
            }

            @Override
            public void purge(UUID userId) {
                communityService.purge(userId);
            }
        };
    }

    @Bean
    @Order(510)
    ExportContributor communityExportContributor(CommunityService communityService) {
        return new ExportContributor() {
            @Override
            public String section() {
                return "community";
            }

            @Override
            public @Nullable Object export(UUID userId) {
                return communityService.export(userId);
            }
        };
    }
}
