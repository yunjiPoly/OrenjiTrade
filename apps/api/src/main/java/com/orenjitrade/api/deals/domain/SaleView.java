package com.orenjitrade.api.deals.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.messaging.domain.SubjectKind;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A sale as its two collectors see it (stage R4, Mark as sold).
 *
 * @param id sale id (its undo)
 * @param conversationId the chat it was marked in
 * @param kind CARD or DECK_CORE
 * @param itemId the card sold (cards)
 * @param binderId the deck core sold (deck cores)
 * @param sellerId the seller
 * @param buyerId the buyer
 * @param name the card or deck core at the time of the sale
 * @param quantity copies sold
 * @param trackingNumber the optional tracking number (the two collectors only)
 * @param remaining the seller's copies left (the seller's view of a card sale)
 * @param removed the card left the seller's inventory (its last copy), or the deck core and its
 *     cards did
 * @param createdAt when it was marked
 * @param undoableUntil until when the seller can undo it (10 minutes, and while nobody rated it)
 * @param undoneAt when it was undone, {@code null} if not
 */
@Schema(name = "SaleResponse", description = "A card or deck core marked sold from a chat")
public record SaleView(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID conversationId,
        @Schema(requiredMode = RequiredMode.REQUIRED) SubjectKind kind,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS) @Nullable UUID itemId,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS) @Nullable UUID binderId,
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID sellerId,
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID buyerId,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "Ash Blossom & Joyous Spring")
                String name,
        @Schema(requiredMode = RequiredMode.REQUIRED) int quantity,
        @Schema(nullable = true, example = "7023 2109 8876 5432")
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String trackingNumber,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable Integer remaining,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean removed,
        @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
        @Schema(requiredMode = RequiredMode.REQUIRED) Instant undoableUntil,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable Instant undoneAt) {}
