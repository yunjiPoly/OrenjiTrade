package com.orenjitrade.api.search.domain;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * The pure rules of Home's feed (owner prompt of 2026-10-19, section 5): the window, the hour that
 * groups one collector's new cards into one post, the stable id of such a post and a deck core's
 * note line. The SQL of {@code FeedRepository} computes the same hour and id; {@code FeedIT} checks
 * that both agree.
 */
public final class FeedRules {

    /** At most this many card pictures in a new-cards post (the 4-column grid). */
    public static final int PREVIEWS_MAX = 4;

    /** The note line of a deck core post is at most this many characters, "…" included. */
    public static final int NOTE_LINE_MAX = 120;

    /** Posts per page when the caller names no limit, and the most a page holds. */
    public static final int DEFAULT_LIMIT = 20;

    public static final int MAX_LIMIT = 50;

    private static final long HOUR_SECONDS = 3600;

    private FeedRules() {}

    /** The oldest time a post may have: everything older than {@code days} days is left out. */
    public static Instant windowStart(Instant now, int days) {
        return now.minus(Duration.ofDays(days));
    }

    /**
     * Whether something that became public at {@code at} is in the window ending at {@code now}.
     */
    public static boolean inWindow(Instant at, Instant now, int days) {
        return at.isAfter(windowStart(now, days));
    }

    /**
     * The hour of {@code at}: whole hours since the epoch (UTC). One collector's cards that became
     * public within the same hour are one post ("listed {n} cards"); the hour is the same in every
     * time zone with a whole-hour offset, and the post keeps its id across pages.
     */
    public static long hourOf(Instant at) {
        return Math.floorDiv(at.getEpochSecond(), HOUR_SECONDS);
    }

    /**
     * The id of the new-cards post of {@code ownerId} for {@code hour}: the MD5 of {@code
     * "NEW_CARDS:<owner>:<hour>"} read as a UUID, exactly as the SQL's {@code md5(...)::uuid}.
     * Stable across pages and refreshes, whatever cards join or leave the group.
     */
    public static UUID cardsPostId(UUID ownerId, long hour) {
        try {
            byte[] digest =
                    MessageDigest.getInstance("MD5")
                            .digest(
                                    ("NEW_CARDS:" + ownerId + ":" + hour)
                                            .getBytes(StandardCharsets.UTF_8));
            ByteBuffer bytes = ByteBuffer.wrap(digest);
            return new UUID(bytes.getLong(), bytes.getLong());
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("MD5 is always available", e);
        }
    }

    /**
     * The first line of a deck core's public note, trimmed: at most {@value #NOTE_LINE_MAX}
     * characters, the last one "…" when the line was cut; {@code null} without a note.
     */
    public static @Nullable String noteFirstLine(@Nullable String note) {
        if (note == null) {
            return null;
        }
        for (String line : note.split("\\R", -1)) {
            String trimmed = line.strip();
            if (trimmed.isEmpty()) {
                continue;
            }
            if (trimmed.codePointCount(0, trimmed.length()) <= NOTE_LINE_MAX) {
                return trimmed;
            }
            int end = trimmed.offsetByCodePoints(0, NOTE_LINE_MAX - 1);
            return trimmed.substring(0, end).stripTrailing() + "…";
        }
        return null;
    }

    /** The limit of a page: the default without one, at most {@value #MAX_LIMIT}. */
    public static int limit(@Nullable Integer requested) {
        if (requested == null) {
            return DEFAULT_LIMIT;
        }
        return Math.max(1, Math.min(requested, MAX_LIMIT));
    }
}
