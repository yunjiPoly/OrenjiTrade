package com.orenjitrade.api.community.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.UUID;

/**
 * The newest post of a room the caller may see (stage R11, the room list): never one of a collector
 * blocked in either direction, of a suspended or deleted account, a deleted or a removed post.
 * Carries no place.
 *
 * @param id post id
 * @param authorHandle its author's handle
 * @param body its text, cut to {@value #PREVIEW_MAX} characters with "…"
 * @param createdAt when it was posted
 * @param mine whether the caller wrote it
 */
@Schema(
        name = "CommunityLastPost",
        description = "The newest post of a room the caller may see (no place)")
public record ChannelLastPost(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "collector1") String authorHandle,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        description = "The post's text, cut to 140 characters with \"…\"")
                String body,
        @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
        @Schema(requiredMode = RequiredMode.REQUIRED, description = "The caller wrote it")
                boolean mine) {

    /** Longest preview, in characters (the phone shows one line). */
    public static final int PREVIEW_MAX = 140;

    /** The text as the room list shows it: one line, at most {@link #PREVIEW_MAX} characters. */
    public static String preview(String body) {
        String line = body.strip().replaceAll("\\s+", " ");
        if (line.length() <= PREVIEW_MAX) {
            return line;
        }
        int end = PREVIEW_MAX - 1;
        if (Character.isHighSurrogate(line.charAt(end - 1))) {
            end--;
        }
        return line.substring(0, end).stripTrailing() + "…";
    }
}
