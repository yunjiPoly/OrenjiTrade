package com.orenjitrade.api.deals.api;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import org.jspecify.annotations.Nullable;

/** Request bodies of the deals endpoints (stage R4). */
public final class SaleRequests {

    private SaleRequests() {}

    /** {@code POST /conversations/{id}/sales}. */
    @Schema(name = "MarkSoldRequest")
    public record MarkSoldRequest(
            @Schema(
                            description =
                                    "Copies sold (1 by default; a deck core sells as one); at most"
                                            + " the copies the seller holds",
                            minimum = "1",
                            maximum = "9999")
                    @Nullable Integer quantity,
            @Schema(
                            description =
                                    "Optional tracking number of the shipment (letters, digits,"
                                            + " spaces, dots and dashes; trimmed); seen by the two"
                                            + " collectors only",
                            maxLength = 64)
                    @Size(max = 200)
                    @Nullable String trackingNumber) {}
}
