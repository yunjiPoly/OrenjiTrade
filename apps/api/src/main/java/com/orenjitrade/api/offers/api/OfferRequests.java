package com.orenjitrade.api.offers.api;

import com.orenjitrade.api.offers.domain.OfferKind;
import com.orenjitrade.api.offers.domain.OfferTerms.TradeLine;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Request bodies of {@code /api/v1/offers} (Phase 8). */
public final class OfferRequests {

    private OfferRequests() {}

    /** {@code POST /offers}. */
    @Schema(name = "CreateOfferRequest")
    public record CreateOfferRequest(
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "The seller's public inventory item")
                    @NotNull
                    UUID itemId,
            @Schema(
                            description =
                                    "CASH, TRADE or MIXED; derived from cashAmount and"
                                            + " tradeItemIds when absent")
                    @Nullable OfferKind kind,
            @Schema(description = "Cash part (CASH, MIXED), 2 decimals", example = "40.00")
                    @Nullable BigDecimal cashAmount,
            @Schema(description = "ISO 4217; default: the item's currency", example = "CAD")
                    @Size(min = 3, max = 3)
                    @Nullable String currency,
            @Schema(
                            description =
                                    "The buyer's own cards in trade (TRADE, MIXED), at most 10;"
                                            + " public visibility not required")
                    @Size(max = 10)
                    @Nullable List<@Valid TradeItemRequest> tradeItemIds,
            @Schema(description = "Optional note to the seller", maxLength = 500) @Size(max = 500)
                    @Nullable String message,
            @Schema(description = "1-168, default 72", example = "72") @Min(1) @Max(168)
                    @Nullable Integer expiresInHours,
            @Schema(
                            description =
                                    "Ask for payment protection (cash offers; needs the"
                                            + " protectedPayments feature, Phase 9 flows)")
                    @Nullable Boolean protectionRequested) {

        List<TradeLine> lines() {
            return TradeItemRequest.lines(tradeItemIds);
        }
    }

    /** One of the buyer's cards. */
    @Schema(name = "OfferTradeItemRequest")
    public record TradeItemRequest(
            @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull UUID inventoryItemId,
            @Schema(description = "Copies, default 1", example = "1") @Min(1) @Max(9999)
                    @Nullable Integer quantity) {

        static List<TradeLine> lines(@Nullable List<TradeItemRequest> requests) {
            if (requests == null) {
                return List.of();
            }
            return requests.stream()
                    .map(
                            request ->
                                    new TradeLine(
                                            request.inventoryItemId(),
                                            request.quantity() == null ? 1 : request.quantity()))
                    .toList();
        }
    }

    /** {@code POST /offers/{id}/counter}. */
    @Schema(
            name = "CounterOfferRequest",
            description =
                    "Without kind, absent parts keep the current proposal's values and the kind"
                            + " follows the parts; with kind, the terms are exactly the given"
                            + " parts. The counter-offer must change the cash amount or the"
                            + " cards.")
    public record CounterOfferRequest(
            @Nullable OfferKind kind,
            @Schema(example = "45.00") @Nullable BigDecimal cashAmount,
            @Schema(example = "CAD") @Size(min = 3, max = 3) @Nullable String currency,
            @Schema(description = "The buyer's cards (always the buyer's inventory)")
                    @Size(max = 10)
                    @Nullable List<@Valid TradeItemRequest> tradeItemIds,
            @Schema(maxLength = 500) @Size(max = 500) @Nullable String message,
            @Schema(description = "1-168, default 72") @Min(1) @Max(168)
                    @Nullable Integer expiresInHours,
            @Schema(description = "The version the caller saw (409 STALE_OFFER when it changed)")
                    @Min(0)
                    @Nullable Integer version) {

        @Nullable List<TradeLine> lines() {
            return tradeItemIds == null ? null : TradeItemRequest.lines(tradeItemIds);
        }
    }

    /** {@code POST /offers/{id}/accept} (optional body). */
    @Schema(name = "AcceptOfferRequest")
    public record AcceptOfferRequest(
            @Schema(description = "The version the caller saw (409 STALE_OFFER when it changed)")
                    @Min(0)
                    @Nullable Integer version) {}

    /** {@code POST /offers/{id}/decline} and {@code /cancel} (optional body). */
    @Schema(name = "CloseOfferRequest")
    public record CloseOfferRequest(
            @Schema(description = "Optional reason shown to the other party", maxLength = 500)
                    @Size(max = 500)
                    @Nullable String reason,
            @Schema(description = "The version the caller saw (409 STALE_OFFER when it changed)")
                    @Min(0)
                    @Nullable Integer version) {}

    /** {@code PUT /me/settings/offers}. */
    @Schema(name = "UpdateOfferSettingsRequest")
    public record UpdateOfferSettingsRequest(
            @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull Boolean acceptsMixed) {}
}
