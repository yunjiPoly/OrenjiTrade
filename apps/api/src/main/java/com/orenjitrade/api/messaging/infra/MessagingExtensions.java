package com.orenjitrade.api.messaging.infra;

import com.orenjitrade.api.messaging.domain.BlockService;
import com.orenjitrade.api.messaging.domain.ImageUploadInspector;
import com.orenjitrade.api.messaging.domain.MessagingAccountData;
import com.orenjitrade.api.profiles.domain.BlockRelationProvider;
import com.orenjitrade.api.profiles.domain.PresenceProvider;
import com.orenjitrade.api.users.domain.DeletionParticipant;
import com.orenjitrade.api.users.domain.ExportContributor;
import java.util.Collection;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;

/**
 * The messaging module's implementations of other modules' extension points: blocks and realtime
 * presence for the privacy matrix of the profiles module (collector profiles, map markers and
 * previews, public binders now see real {@code isBlocked}, {@code canMessage} and {@code
 * onlineStatus}), the default image inspector, the export section {@code messaging} and the
 * deletion participant.
 */
@Configuration(proxyBeanMethods = false)
public class MessagingExtensions {

    @Bean
    BlockRelationProvider messagingBlockRelationProvider(BlockService blockService) {
        return new BlockRelationProvider() {
            @Override
            public boolean isBlocked(UUID viewerId, UUID targetId) {
                return blockService.isBlockedEitherWay(viewerId, targetId);
            }

            @Override
            public Set<UUID> blockedAmong(UUID viewerId, Collection<UUID> targetIds) {
                Set<UUID> hidden = blockService.hiddenFrom(viewerId);
                if (hidden.isEmpty()) {
                    return Set.of();
                }
                Set<UUID> blocked = new HashSet<>();
                for (UUID targetId : targetIds) {
                    if (hidden.contains(targetId)) {
                        blocked.add(targetId);
                    }
                }
                return blocked;
            }
        };
    }

    @Bean
    PresenceProvider realtimePresenceProvider(PresenceStore presenceStore) {
        return presenceStore::isOnline;
    }

    /** Accepts every re-encoded image; replace the bean to plug a scanner in. */
    @Bean
    ImageUploadInspector imageUploadInspector() {
        return (ownerId, kind, jpeg) -> true;
    }

    @Bean
    @Order(500)
    DeletionParticipant messagingDeletionParticipant(MessagingAccountData data) {
        return new DeletionParticipant() {
            @Override
            public String name() {
                return "messaging";
            }

            @Override
            public void purge(UUID userId) {
                data.purge(userId);
            }
        };
    }

    @Bean
    @Order(500)
    ExportContributor messagingExportContributor(MessagingAccountData data) {
        return new ExportContributor() {
            @Override
            public String section() {
                return "messaging";
            }

            @Override
            public @Nullable Object export(UUID userId) {
                return data.export(userId);
            }
        };
    }
}
