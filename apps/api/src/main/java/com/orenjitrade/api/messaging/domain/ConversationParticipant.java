package com.orenjitrade.api.messaging.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.profiles.domain.CollectorProfileView.OnlineStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * The other participant of a conversation as the caller may see them (no location; presence only
 * when the participant shows their online status).
 *
 * @param id account id
 * @param handle handle
 * @param displayName display name
 * @param avatarUrl avatar
 * @param onlineStatus ONLINE / OFFLINE, HIDDEN unless the participant shows their online status
 */
@Schema(name = "ConversationParticipant", description = "The other participant of a conversation")
public record ConversationParticipant(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "collector2") String handle,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "Devon Okafor") String displayName,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String avatarUrl,
        @Schema(requiredMode = RequiredMode.REQUIRED) OnlineStatus onlineStatus) {}
