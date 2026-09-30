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
     */
    @Schema(name = "CreateBinderRequest", description = "A new binder")
    public record CreateBinderRequest(
            @NotBlank @Size(max = 80) @Schema(example = "Trade binder") String name,
            @Size(max = 1000) @Nullable String description,
            @Nullable BinderKind kind,
            @Nullable ListingVisibility visibility,
            @Nullable Instant publicUntil,
            @Nullable UUID coverPrintingId) {}

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
            @Schema(nullable = true) @Nullable UUID coverPrintingId) {}

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
