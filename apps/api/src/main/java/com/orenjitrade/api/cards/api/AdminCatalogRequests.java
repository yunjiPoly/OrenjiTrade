package com.orenjitrade.api.cards.api;

import com.orenjitrade.api.cards.domain.CatalogAdminService;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Request bodies of the admin catalog endpoints. */
public final class AdminCatalogRequests {

    private AdminCatalogRequests() {}

    /**
     * Body of {@code POST /api/v1/admin/sets} ({@code gameSlug} required) and {@code PUT
     * /api/v1/admin/sets/{id}} ({@code gameSlug} ignored; the code cannot change).
     */
    @Schema(name = "AdminSetRequest", description = "Card set creation or change")
    public record SetRequest(
            @Size(max = 32) @Schema(example = "yugioh") @Nullable String gameSlug,
            @NotBlank
                    @Pattern(
                            regexp = "^[A-Za-z0-9]{2,10}$",
                            message = "must be 2-10 letters or digits")
                    @Schema(example = "AZR")
                    String code,
            @NotBlank @Size(max = 120) String name,
            @Nullable LocalDate releaseDate,
            @Min(0) @Max(100_000) @Nullable Integer totalCards,
            @Size(max = 80) @Nullable String series,
            @Nullable Map<String, Object> metadata) {

        public CatalogAdminService.SetValues toValues() {
            return new CatalogAdminService.SetValues(
                    code,
                    name,
                    releaseDate,
                    totalCards,
                    series,
                    metadata == null ? Map.of() : metadata);
        }
    }

    /**
     * Body of {@code POST /api/v1/admin/cards} ({@code gameSlug} required) and {@code PUT
     * /api/v1/admin/cards/{id}} ({@code gameSlug} ignored). Declared metadata fields must match the
     * game's GameSchema types.
     */
    @Schema(name = "AdminCardRequest", description = "Card creation or change")
    public record CardRequest(
            @Size(max = 32) @Schema(example = "yugioh") @Nullable String gameSlug,
            @NotBlank @Size(max = 150) String name,
            @Size(max = 60) @Nullable String cardType,
            @Size(max = 60) @Nullable String subtype,
            @Size(max = 4000) @Nullable String text,
            @Nullable Map<String, Object> metadata) {

        public CatalogAdminService.CardValues toValues() {
            return new CatalogAdminService.CardValues(
                    name, cardType, subtype, text, metadata == null ? Map.of() : metadata);
        }
    }

    /**
     * Body of {@code POST /api/v1/admin/cards/{id}/printings} and {@code PUT
     * /api/v1/admin/printings/{id}}. Edition, language, finish and rarity come from the game's
     * GameSchema.
     */
    @Schema(name = "AdminPrintingRequest", description = "Printing creation or change")
    public record PrintingRequest(
            @NotNull UUID setId,
            @NotBlank @Size(max = 20) @Schema(example = "EN001") String collectorNumber,
            @Size(max = 23) @Schema(example = "AZR-EN001") @Nullable String printingCode,
            @Size(max = 40) @Schema(example = "Ultra Rare") @Nullable String rarity,
            @NotBlank @Size(max = 32) @Schema(example = "FIRST_EDITION") String edition,
            @NotBlank @Size(max = 2) @Schema(example = "en") String language,
            @NotBlank @Size(max = 32) @Schema(example = "NORMAL") String finish,
            @DecimalMin("0.00") @DecimalMax("9999999.99") @Digits(integer = 7, fraction = 2)
                    @Nullable BigDecimal marketPrice,
            @Pattern(regexp = "^[A-Z]{3}$", message = "must be an ISO 4217 code")
                    @Nullable String marketPriceCurrency,
            @Nullable Map<String, Object> metadata) {

        public CatalogAdminService.PrintingInput toInput() {
            return new CatalogAdminService.PrintingInput(
                    setId,
                    collectorNumber,
                    printingCode,
                    rarity,
                    edition,
                    language,
                    finish,
                    marketPrice,
                    marketPriceCurrency,
                    metadata == null ? Map.of() : metadata);
        }
    }
}
