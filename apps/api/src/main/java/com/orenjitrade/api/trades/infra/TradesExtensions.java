package com.orenjitrade.api.trades.infra;

import com.orenjitrade.api.offers.domain.AcceptedOffer;
import com.orenjitrade.api.offers.domain.AcceptedOfferHandler;
import com.orenjitrade.api.trades.domain.TradeService;
import com.orenjitrade.api.users.domain.DeletionParticipant;
import com.orenjitrade.api.users.domain.ExportContributor;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;

/**
 * The trades module's implementations of other modules' extension points: the offers module's
 * {@link AcceptedOfferHandler} (an acceptance opens a trade), the deletion participant (open trades
 * block the deletion with {@code OPEN_TRADE}; the purge erases the account's cancel reasons, the
 * trades stay for the other party) and the export section {@code trades}.
 */
@Configuration(proxyBeanMethods = false)
public class TradesExtensions {

    @Bean
    AcceptedOfferHandler acceptedOfferHandler(TradeService tradeService) {
        return new AcceptedOfferHandler() {
            @Override
            public UUID openTrade(AcceptedOffer offer) {
                return tradeService.open(offer);
            }

            @Override
            public Map<UUID, UUID> tradeIdsByOffer(Collection<UUID> offerIds) {
                return tradeService.tradeIdsByOffer(offerIds);
            }
        };
    }

    @Bean
    @Order(475)
    DeletionParticipant tradesDeletionParticipant(TradeService tradeService) {
        return new DeletionParticipant() {
            @Override
            public String name() {
                return "trades";
            }

            @Override
            public List<String> blockers(UUID userId) {
                return tradeService.blockers(userId);
            }

            @Override
            public void purge(UUID userId) {
                tradeService.purge(userId);
            }
        };
    }

    @Bean
    @Order(475)
    ExportContributor tradesExportContributor(TradeService tradeService) {
        return new ExportContributor() {
            @Override
            public String section() {
                return "trades";
            }

            @Override
            public @Nullable Object export(UUID userId) {
                return tradeService.export(userId);
            }
        };
    }
}
