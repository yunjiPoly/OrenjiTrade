package com.orenjitrade.api.offers.infra;

import com.orenjitrade.api.messaging.domain.OfferLink;
import com.orenjitrade.api.messaging.domain.OfferLinkResolver;
import com.orenjitrade.api.offers.domain.OfferService;
import com.orenjitrade.api.users.domain.DeletionParticipant;
import com.orenjitrade.api.users.domain.ExportContributor;
import java.util.Collection;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;

/**
 * The offers module's implementations of other modules' extension points: the messaging module's
 * {@link OfferLinkResolver} (OFFER_LINK and SYSTEM messages show the offer's current state), the
 * deletion participant (a deletion request withdraws the account's live negotiations; the purge
 * erases its notes and reasons, the rows stay for the other party) and the export section {@code
 * offers}.
 */
@Configuration(proxyBeanMethods = false)
public class OffersExtensions {

    @Bean
    OfferLinkResolver offerLinkResolver(OfferService offerService) {
        return new OfferLinkResolver() {
            @Override
            public Map<UUID, OfferLink> links(UUID viewerId, Collection<UUID> offerIds) {
                return offerService.links(viewerId, offerIds);
            }

            @Override
            public boolean isBetween(UUID offerId, UUID one, UUID other) {
                return offerService.isBetween(offerId, one, other);
            }
        };
    }

    @Bean
    @Order(470)
    DeletionParticipant offersDeletionParticipant(OfferService offerService) {
        return new DeletionParticipant() {
            @Override
            public String name() {
                return "offers";
            }

            @Override
            public void onDeletionRequested(UUID userId) {
                offerService.closeForDeletion(userId);
            }

            @Override
            public void purge(UUID userId) {
                offerService.purge(userId);
            }
        };
    }

    @Bean
    @Order(470)
    ExportContributor offersExportContributor(OfferService offerService) {
        return new ExportContributor() {
            @Override
            public String section() {
                return "offers";
            }

            @Override
            public @Nullable Object export(UUID userId) {
                return offerService.export(userId);
            }
        };
    }
}
