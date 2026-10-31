package com.orenjitrade.api.moderation.domain;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * What a flag on community content shows staff (spec 15.8.3, web stage WH1): the room and the text
 * of a flagged post or reply. Implemented by the community module (which already depends on
 * moderation), so moderation reads it without depending on community. A private message's text is
 * never previewed: {@link FlagSubjectType#MESSAGE} and {@link FlagSubjectType#USER} have none.
 */
public interface FlaggedContentPreviews {

    /**
     * The previews of flagged posts or replies, by the flag's subject id; ids that are not found
     * are left out.
     *
     * @param type {@link FlagSubjectType#COMMUNITY_POST} or {@link FlagSubjectType#COMMUNITY_REPLY}
     *     (any other type answers an empty map)
     * @param subjectIds the flagged rows
     */
    Map<UUID, FlaggedContent> previews(FlagSubjectType type, Collection<UUID> subjectIds);

    /**
     * A flagged post or reply as staff read it.
     *
     * @param postId the post (a reply's post), for "Open the post"
     * @param roomSlug the room's slug ({@code americas-north-yugioh}), its address in the apps;
     *     {@code null} for an archived channel named after a city (never sent)
     * @param roomName the room's name (the game's, for a room); {@code null} for an archived
     *     channel named after a city (never sent)
     * @param regionCode the room's platform region code, {@code null} when the channel is not a
     *     platform region's (an archived channel): never a city
     * @param game the room's game slug, {@code null} for a channel without one
     * @param text the flagged text
     * @param removed whether moderators removed it already
     */
    record FlaggedContent(
            UUID postId,
            @Nullable String roomSlug,
            @Nullable String roomName,
            @Nullable String regionCode,
            @Nullable String game,
            String text,
            boolean removed) {}
}
