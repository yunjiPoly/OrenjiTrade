package com.orenjitrade.api.offers.domain;

import com.orenjitrade.api.inventory.domain.InventoryItemView;
import com.orenjitrade.api.offers.domain.OfferViews.Snapshot;
import com.orenjitrade.api.offers.domain.OfferViews.SnapshotLine;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * The JSON snapshots of {@code offer_event.snapshot}: the whole proposal after an event (terms,
 * status, turn, expiry, version, parties' ids). Card names and printing codes of the buyer's cards
 * are copied so the history stays readable when an item is gone. Never private notes or locations.
 */
@Component
public class OfferSnapshots {

    private final JsonMapper jsonMapper;

    public OfferSnapshots(JsonMapper jsonMapper) {
        this.jsonMapper = jsonMapper;
    }

    /** The snapshot of a proposal; {@code items} names the buyer's cards (by item id). */
    public String write(
            OfferRow row, List<OfferTradeItemRow> tradeItems, Map<UUID, InventoryItemView> items) {
        ObjectNode node = jsonMapper.createObjectNode();
        node.put("id", row.id().toString());
        node.put("status", row.status().name());
        node.put("kind", row.kind().name());
        if (row.cashAmount() != null) {
            node.put("cashAmount", row.cashAmount().toPlainString());
            node.put("currency", row.currency());
        }
        ArrayNode lines = node.putArray("tradeItems");
        for (OfferTradeItemRow line : tradeItems) {
            ObjectNode entry = lines.addObject();
            if (line.inventoryItemId() != null) {
                entry.put("inventoryItemId", line.inventoryItemId().toString());
            }
            entry.put("quantity", line.quantity());
            @Nullable InventoryItemView item =
                    line.inventoryItemId() == null ? null : items.get(line.inventoryItemId());
            entry.put("cardName", item == null ? "" : item.row().cardName());
            if (item != null && item.printing().printingCode() != null) {
                entry.put("printingCode", item.printing().printingCode());
            }
        }
        if (row.message() != null) {
            node.put("message", row.message());
        }
        node.put("currentTurn", row.currentTurn().name());
        node.put("expiresAt", row.expiresAt().toString());
        node.put("version", row.version());
        node.put("protectionRequested", row.protectionRequested());
        if (row.itemId() != null) {
            node.put("itemId", row.itemId().toString());
        }
        node.put("sellerId", row.sellerId().toString());
        node.put("buyerId", row.buyerId().toString());
        return jsonMapper.writeValueAsString(node);
    }

    /**
     * The public form of an inventory item at offer time ({@code offer.item_snapshot}, {@code
     * offer_trade_item.item_snapshot}): catalog references, condition, price, availability and
     * public notes only (never the private notes, never a location).
     */
    public String item(InventoryItemView view) {
        ObjectNode node = jsonMapper.createObjectNode();
        node.put("id", view.row().id().toString());
        node.put("ownerId", view.row().ownerId().toString());
        node.put("cardId", view.row().cardId().toString());
        node.put("cardName", view.row().cardName());
        node.put("game", view.row().game());
        node.put("printingId", view.row().printingId().toString());
        if (view.printing().printingCode() != null) {
            node.put("printingCode", view.printing().printingCode());
        }
        node.put("setCode", view.printing().setCode());
        node.put("quantity", view.row().quantity());
        node.put("condition", view.row().condition());
        node.put("language", view.row().language());
        node.put("edition", view.row().edition());
        node.put("finish", view.row().finish());
        if (view.row().askingPrice() != null) {
            node.put("askingPrice", view.row().askingPrice().toPlainString());
        }
        node.put("currency", view.row().currency());
        node.put("availability", view.row().availability().name());
        node.put("acceptsOffers", view.row().acceptsOffers());
        node.put("publicNotes", view.row().publicNotes());
        return jsonMapper.writeValueAsString(node);
    }

    /** The card name of a stored item snapshot, if any. */
    public java.util.Optional<String> itemCardName(String itemSnapshotJson) {
        JsonNode node = jsonMapper.readTree(itemSnapshotJson);
        String name = node.path("cardName").asString("");
        return name.isBlank() ? java.util.Optional.empty() : java.util.Optional.of(name);
    }

    /** Parses a stored snapshot (missing members fall back to {@code fallback}'s values). */
    public Snapshot read(String json, OfferRow fallback) {
        JsonNode node = jsonMapper.readTree(json);
        List<SnapshotLine> lines = new ArrayList<>();
        for (JsonNode line : node.path("tradeItems")) {
            lines.add(
                    new SnapshotLine(
                            uuid(line.path("inventoryItemId")),
                            line.path("quantity").asInt(1),
                            line.path("cardName").asString(""),
                            line.hasNonNull("printingCode")
                                    ? line.path("printingCode").asString()
                                    : null));
        }
        return new Snapshot(
                enumOr(node.path("status"), OfferStatus.class, fallback.status()),
                enumOr(node.path("kind"), OfferKind.class, fallback.kind()),
                node.hasNonNull("cashAmount")
                        ? new BigDecimal(node.path("cashAmount").asString())
                        : null,
                node.hasNonNull("currency") ? node.path("currency").asString() : null,
                lines,
                node.hasNonNull("message") ? node.path("message").asString() : null,
                enumOr(node.path("currentTurn"), OfferRole.class, fallback.currentTurn()),
                node.hasNonNull("expiresAt")
                        ? Instant.parse(node.path("expiresAt").asString())
                        : fallback.expiresAt(),
                node.path("version").asInt(fallback.version()));
    }

    private static <E extends Enum<E>> E enumOr(JsonNode node, Class<E> type, E fallback) {
        if (node.isMissingNode() || node.isNull()) {
            return fallback;
        }
        try {
            return Enum.valueOf(type, node.asString());
        } catch (IllegalArgumentException e) {
            return fallback;
        }
    }

    private static @Nullable UUID uuid(JsonNode node) {
        if (node.isMissingNode() || node.isNull()) {
            return null;
        }
        try {
            return UUID.fromString(node.asString());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
