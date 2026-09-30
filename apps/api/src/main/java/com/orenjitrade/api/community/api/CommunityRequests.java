package com.orenjitrade.api.community.api;

import com.orenjitrade.api.community.domain.ChannelKind;
import com.orenjitrade.api.community.domain.ChannelStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Request bodies of the community endpoints. */
public final class CommunityRequests {

    private CommunityRequests() {}

    /** {@code POST /community/channels/{slug}/posts}. */
    @Schema(name = "CreatePostRequest")
    public record CreatePostRequest(
            @Schema(requiredMode = RequiredMode.REQUIRED, maxLength = 2000)
                    @NotBlank
                    @Size(max = 2000)
                    String body,
            @Schema(description = "Optional shared printing") @Nullable UUID cardPrintingId,
            @Schema(description = "Optional shared public binder") @Nullable UUID binderId) {}

    /** {@code PATCH /community/posts/{id}}. */
    @Schema(name = "UpdatePostRequest")
    public record UpdatePostRequest(
            @Schema(requiredMode = RequiredMode.REQUIRED, maxLength = 2000)
                    @NotBlank
                    @Size(max = 2000)
                    String body) {}

    /** {@code POST /community/posts/{id}/replies}. */
    @Schema(name = "CreateReplyRequest")
    public record CreateReplyRequest(
            @Schema(requiredMode = RequiredMode.REQUIRED, maxLength = 1000)
                    @NotBlank
                    @Size(max = 1000)
                    String body) {}

    /** {@code POST /admin/community/posts/{id}/remove} and replies. */
    @Schema(name = "RemoveContentRequest")
    public record RemoveContentRequest(
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            maxLength = 500,
                            description = "Moderator note (audited, never shown to members)")
                    @NotBlank
                    @Size(max = 500)
                    String reason) {}

    /** {@code POST /admin/community/channels}. */
    @Schema(name = "CreateCommunityChannelRequest")
    public record CreateChannelRequest(
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            example = "quebec-pokemon",
                            maxLength = 64)
                    @NotBlank
                    @Size(max = 64)
                    String slug,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            example = "Québec / Pokémon",
                            maxLength = 80)
                    @NotBlank
                    @Size(max = 80)
                    String name,
            @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull ChannelKind kind,
            @Schema(description = "Game slug", example = "pokemon") @Size(max = 32)
                    @Nullable String game,
            @Schema(description = "City of region channels", example = "Québec") @Size(max = 120)
                    @Nullable String regionLabel,
            @Size(max = 500) @Nullable String description,
            @Schema(description = "Posts per member per hour (default 10)") @Min(1) @Max(1000)
                    @Nullable Integer postRateLimitPerHour,
            @Schema(description = "Position in lists (default 100)") @Min(0) @Max(100_000)
                    @Nullable Integer sortOrder) {}

    /** {@code PATCH /admin/community/channels/{id}}: absent fields are kept. */
    @Schema(name = "UpdateCommunityChannelRequest")
    public record UpdateChannelRequest(
            @Size(min = 1, max = 80) @Nullable String name,
            @Size(max = 500) @Nullable String description,
            @Nullable ChannelStatus status,
            @Min(1) @Max(1000) @Nullable Integer postRateLimitPerHour,
            @Min(0) @Max(100_000) @Nullable Integer sortOrder,
            @Schema(description = "Game slug; blank removes it") @Size(max = 32)
                    @Nullable String game,
            @Schema(description = "City; blank removes it") @Size(max = 120)
                    @Nullable String regionLabel) {}
}
