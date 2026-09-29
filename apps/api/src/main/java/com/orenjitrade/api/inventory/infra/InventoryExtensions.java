package com.orenjitrade.api.inventory.infra;

import com.orenjitrade.api.binders.domain.BinderContents;
import com.orenjitrade.api.inventory.domain.InventoryItemView;
import com.orenjitrade.api.inventory.domain.InventoryService;
import com.orenjitrade.api.inventory.domain.ItemImage;
import com.orenjitrade.api.inventory.domain.ItemRow;
import com.orenjitrade.api.inventory.domain.ListingReconciler;
import com.orenjitrade.api.users.domain.DeletionParticipant;
import com.orenjitrade.api.users.domain.ExportContributor;
import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;

/**
 * The inventory module's implementations of other modules' extension points: the binders' {@link
 * BinderContents}, the deletion participant (a deletion request hides the owner's public inventory
 * at once, a cancellation restores it, the purge deletes items and photos) and the owner's export
 * section {@code inventory} (private notes included: it is the owner's own data).
 */
@Configuration(proxyBeanMethods = false)
public class InventoryExtensions {

    @Bean
    BinderContents inventoryBinderContents(
            InventoryService inventoryService, ListingReconciler reconciler) {
        return new BinderContents() {
            @Override
            public Map<UUID, Stats> statsOf(Collection<UUID> binderIds, boolean publicOnly) {
                return inventoryService.binderStats(binderIds, publicOnly);
            }

            @Override
            public void confirmItems(UUID ownerId, UUID binderId, Instant now) {
                inventoryService.confirmItemsOfBinder(ownerId, binderId, now);
            }

            @Override
            public void afterBinderChange(UUID ownerId, Collection<UUID> binderIds) {
                reconciler.binders(binderIds);
            }

            @Override
            public void releaseItems(
                    UUID ownerId,
                    UUID binderId,
                    boolean deleteItems,
                    boolean keepVisibility,
                    Instant now) {
                inventoryService.releaseBinderItems(
                        ownerId, binderId, deleteItems, keepVisibility, now);
            }
        };
    }

    @Bean
    @Order(400)
    DeletionParticipant inventoryDeletionParticipant(
            InventoryService inventoryService, ListingReconciler reconciler) {
        return new DeletionParticipant() {
            @Override
            public String name() {
                return "inventory";
            }

            @Override
            public void onDeletionRequested(UUID userId) {
                reconciler.owner(userId);
            }

            @Override
            public void onDeletionCancelled(UUID userId) {
                reconciler.owner(userId);
            }

            @Override
            public void purge(UUID userId) {
                inventoryService.purge(userId);
            }
        };
    }

    @Bean
    @Order(400)
    ExportContributor inventoryExportContributor(InventoryService inventoryService) {
        return new ExportContributor() {
            @Override
            public String section() {
                return "inventory";
            }

            @Override
            public @Nullable Object export(UUID userId) {
                return inventoryService.allOf(userId).stream()
                        .map(InventoryExtensions::exportRow)
                        .toList();
            }
        };
    }

    static Map<String, @Nullable Object> exportRow(InventoryItemView view) {
        ItemRow item = view.row();
        Map<String, @Nullable Object> row = new LinkedHashMap<>();
        row.put("id", item.id());
        row.put("binderId", item.binderId());
        row.put("printingId", item.printingId());
        row.put("printingCode", view.printing().printingCode());
        row.put("card", item.cardName());
        row.put("game", item.game());
        row.put("quantity", item.quantity());
        row.put("condition", item.condition());
        row.put("language", item.language());
        row.put("edition", item.edition());
        row.put("finish", item.finish());
        row.put("askingPrice", item.askingPrice());
        row.put("currency", item.currency());
        row.put("availability", item.availability().name());
        row.put("acceptsOffers", item.acceptsOffers());
        row.put("notes", item.notes());
        row.put("publicNotes", item.publicNotes());
        row.put("visibility", item.visibility().name());
        row.put("publicUntil", item.publicUntil());
        row.put("freshness", item.freshnessState().name());
        row.put("confirmedAt", item.confirmedAt());
        row.put("createdAt", item.createdAt());
        row.put("updatedAt", item.updatedAt());
        row.put("images", view.images().stream().map(ItemImage::url).toList());
        return row;
    }
}
