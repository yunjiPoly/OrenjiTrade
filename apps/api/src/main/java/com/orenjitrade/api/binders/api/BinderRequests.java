package com.orenjitrade.api.binders.api;

import com.orenjitrade.api.binders.domain.BinderKind;
import com.orenjitrade.api.binders.domain.ListingVisibility;
import com.orenjitrade.api.binders.domain.PublishMode;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Request bodies of {@code /api/v1/binders}. */
public final class BinderRequests {

    private BinderRequests() {}

    /**
     * {@code POST /binders}.
     *
     * @param name 1-80 characters
     * @param description at most 1 000 characters
     * @param kind COLLECTION when omitted
     * @param visibility PRIVATE when omitted
     * @param publicUntil required for TEMPORARILY_PUBLIC (at most 30 days ahead), ignored otherwise
     * @param coverPrintingId printing whose image is the cover
     * @param sellsAsCore "Sell as a deck core" (stage R3); false when omitted
     * @param askingPriceText the deck core's asking price as typed, at most 40 characters
     */
    @Schema(name = "CreateBinderRequest", description = "A new binder")
    public record CreateBinderRequest(
            @NotBlank @Size(max = 80) @Schema(example = "Trade binder") String name,
            @Size(max = 1000)
                    @Schema(
                            description =
                                    "At most 1 000 characters; a deck core's public note (the"
                                            + " phone caps it at 500)")
                    @Nullable String description,
            @Nullable BinderKind kind,
            @Nullable ListingVisibility visibility,
            @Nullable Instant publicUntil,
            @Nullable UUID coverPrintingId,
            @Schema(
                            description =
                                    "Sell as a deck core: one bundle with photos, one price and"
                                            + " the description as its note (false when omitted)")
                    @Nullable Boolean sellsAsCore,
            @Size(max = 60)
                    @Schema(
                            maxLength = 40,
                            example = "$180",
                            description =
                                    "The deck core's asking price as typed (at most 40 characters"
                                            + " once trimmed, one line): \"$180\", \"Trade only\"."
                                            + " A plain amount also sets askingPrice")
                    @Nullable String askingPriceText) {}

    /**
     * {@code PATCH /binders/{id}}: any subset of the fields. {@code publicUntil} and {@code
     * coverPrintingId} may be {@code null} to clear them; the others must not be {@code null}.
     */
    @Schema(
            name = "UpdateBinderRequest",
            description =
                    "Any subset of the fields; absent fields are unchanged. Making the binder"
                            + " public confirms it and its items.")
    public record UpdateBinderRequest(
            @Size(min = 1, max = 80) @Nullable String name,
            @Size(max = 1000) @Nullable String description,
            @Nullable BinderKind kind,
            @Nullable ListingVisibility visibility,
            @Schema(nullable = true) @Nullable Instant publicUntil,
            @Schema(nullable = true) @Nullable UUID coverPrintingId,
            @Schema(description = "Sell as a deck core (not null)") @Nullable Boolean sellsAsCore,
            @Size(max = 60)
                    @Schema(
                            nullable = true,
                            maxLength = 40,
                            example = "$180",
                            description =
                                    "The deck core's asking price as typed (at most 40 characters"
                                            + " once trimmed); null or blank clears it and its"
                                            + " amount")
                    @Nullable String askingPriceText,
            @Schema(
                            description =
                                    "true also confirms the binder and its cards are still"
                                            + " available, as POST /binders/{id}/confirm (the"
                                            + " phone's Save changes)")
                    @Nullable Boolean confirm) {}

    /** {@code POST /binders/{id}/publish}. */
    @Schema(name = "PublishBinderRequest", description = "How to publish a binder")
    public record PublishBinderRequest(
            @NotNull
                    @Schema(
                            description =
                                    "PUBLIC and UNTIL_DISABLED: public without an end date;"
                                        + " ONE_HOUR / ONE_DAY: TEMPORARILY_PUBLIC for 1 h / 24 h")
                    PublishMode mode) {}

    /** {@code PUT /binders/reorder}. */
    @Schema(name = "ReorderBindersRequest", description = "New order of the caller's binders")
    public record ReorderBindersRequest(
            @NotNull @Size(min = 1, max = 500) List<@NotNull UUID> binderIds) {}
}
