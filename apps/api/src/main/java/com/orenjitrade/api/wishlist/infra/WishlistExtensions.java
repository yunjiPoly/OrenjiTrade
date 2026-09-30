package com.orenjitrade.api.wishlist.infra;

import com.orenjitrade.api.billing.domain.LimitUsageSource;
import com.orenjitrade.api.users.domain.DeletionParticipant;
import com.orenjitrade.api.users.domain.ExportContributor;
import com.orenjitrade.api.wishlist.domain.WishlistService;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;

/**
 * The wishlist module's implementations of other modules' extension points: the {@code
 * wishlist.items.max} usage ({@link LimitUsageSource}, read straight from the repository), the
 * owner's export section {@code wishlist} (with private notes) and the deletion participant.
 */
@Configuration(proxyBeanMethods = false)
public class WishlistExtensions {

    @Bean
    LimitUsageSource wishlistItemsUsageSource(WishlistRepository repository) {
        return new LimitUsageSource() {
            @Override
            public boolean supports(String limitKey) {
                return WishlistService.ITEMS_MAX.equals(limitKey);
            }

            @Override
            public long currentUsage(UUID userId, String limitKey) {
                return repository.countByOwner(userId);
            }
        };
    }

    @Bean
    @Order(450)
    DeletionParticipant wishlistDeletionParticipant(WishlistService wishlistService) {
        return new DeletionParticipant() {
            @Override
            public String name() {
                return "wishlist";
            }

            @Override
            public void purge(UUID userId) {
                wishlistService.purge(userId);
            }
        };
    }

    @Bean
    @Order(450)
    ExportContributor wishlistExportContributor(WishlistService wishlistService) {
        return new ExportContributor() {
            @Override
            public String section() {
                return "wishlist";
            }

            @Override
            public @Nullable Object export(UUID userId) {
                return wishlistService.export(userId);
            }
        };
    }
}
