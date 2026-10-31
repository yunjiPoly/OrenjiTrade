package com.orenjitrade.api.community.infra;

import com.orenjitrade.api.binders.domain.BinderLink;
import com.orenjitrade.api.binders.domain.PublicBinderService;
import com.orenjitrade.api.cards.domain.CardLink;
import com.orenjitrade.api.cards.domain.CatalogService;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.seed.SeedContributor;
import com.orenjitrade.api.moderation.domain.ModerationService;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Seeds a few fictional community posts and replies in the rooms of V134 (stage R11: one room per
 * platform region and game, found by slug; stable ids {@code 00000000-0000-4000-8e00-0000000001NN}
 * for posts and {@code ...0000000002NN} for replies), dated relative to the first seed run: in the
 * Yu-Gi-Oh! room of Americas (North) a trading post with collector1's public binder, a "looking
 * for" post with a card link, collector2's deck core and a question; posts in the Pokémon and Magic
 * rooms of Americas (North), Americas (South) and Europe, a welcome thread and a trade report.
 * Inserted once ({@code ON CONFLICT DO NOTHING}): a database seeded before V134 keeps its first
 * five posts in the archived channels and gains the new ones. Authors that are missing or inactive
 * are skipped. No photos (seeds hold no files).
 */
@Component
public class CommunitySeedContributor implements SeedContributor {

    static final String USER_PREFIX = "00000000-0000-4000-8000-0000000000";

    private static final Logger log = LoggerFactory.getLogger(CommunitySeedContributor.class);

    private final JdbcClient jdbc;
    private final CatalogService catalog;
    private final PublicBinderService publicBinders;
    private final TimeProvider timeProvider;
    private final JsonMapper jsonMapper;

    public CommunitySeedContributor(
            JdbcClient jdbc,
            CatalogService catalog,
            PublicBinderService publicBinders,
            TimeProvider timeProvider,
            JsonMapper jsonMapper) {
        this.jdbc = jdbc;
        this.catalog = catalog;
        this.publicBinders = publicBinders;
        this.timeProvider = timeProvider;
        this.jsonMapper = jsonMapper;
    }

    @Override
    public String name() {
        return "community";
    }

    @Override
    public int order() {
        return ORDER_INTERACTIONS + 10;
    }

    @Override
    @Transactional
    public void seed() {
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.SECONDS);
        // Stage R11: one room per platform region and game (V134); the posts are spread so that
        // the Yu-Gi-Oh! room of Americas (North) reads like the mockup (a card, a deck core, a
        // binder) and every region has a room with posts. Bodies say "ships tracked" (ADR 0018).
        List<SeedPost> script =
                List.of(
                        new SeedPost(
                                1,
                                "americas-north-yugioh",
                                "01",
                                "My trade binder is updated: Yu-Gi-Oh! singles, shipped with"
                                        + " tracking. Happy to trade or sell.",
                                20 * 60,
                                null,
                                "00000000-0000-4000-8b00-000000000101"),
                        new SeedPost(
                                2,
                                "americas-north-yugioh",
                                "05",
                                "Looking for this printing in near mint. I can trade Magic rares or"
                                        + " pay cash.",
                                10 * 60,
                                "ygo-p005a",
                                null),
                        new SeedPost(
                                3,
                                "americas-north-pokemon",
                                "05",
                                "Just refreshed my binder with sealed Pokémon and a few holos."
                                        + " Offers welcome!",
                                6 * 60,
                                null,
                                null),
                        new SeedPost(
                                4,
                                "europe-yugioh",
                                "08",
                                "Welcome to the Yu-Gi-Oh! room! How do you ship your cards?"
                                        + " Toploader and a bubble mailer work well for me.",
                                3 * 60,
                                null,
                                null),
                        new SeedPost(
                                5,
                                "europe-riftbound",
                                "04",
                                "Traded two Riftbound rares with a collector of my region by"
                                        + " mail. Tracked both ways, smooth deal, thanks!",
                                30 * 60,
                                null,
                                null),
                        new SeedPost(
                                6,
                                "americas-north-yugioh",
                                "02",
                                "My Moth Queen core is up, photos in the binder. Message me if"
                                        + " you want it.",
                                4 * 60,
                                null,
                                "00000000-0000-4000-8b00-000000000202"),
                        new SeedPost(
                                7,
                                "americas-north-yugioh",
                                "02",
                                "Who is building a Moth deck? Looking for tips before I buy in.",
                                45,
                                null,
                                null),
                        new SeedPost(
                                8,
                                "americas-north-mtg",
                                "01",
                                "Bulk commons, $10 a box plus tracked shipping.",
                                2 * 24 * 60,
                                null,
                                null),
                        new SeedPost(
                                9,
                                "americas-south-pokemon",
                                "03",
                                "Anyone opening the new set this weekend? Trading duplicates by"
                                        + " mail.",
                                90,
                                null,
                                null));
        int inserted = 0;
        for (SeedPost post : script) {
            UUID authorId = UUID.fromString(USER_PREFIX + post.author());
            if (!isActive(authorId)) {
                continue;
            }
            ObjectNode payload = jsonMapper.createObjectNode();
            if (post.printingRef() != null) {
                printing(post.printingRef())
                        .flatMap(catalog::cardLink)
                        .ifPresent(card -> putCard(payload, card));
            }
            if (post.binderId() != null) {
                publicBinders
                        .binderLink(null, UUID.fromString(post.binderId()))
                        .ifPresent(binder -> putBinder(payload, binder));
            }
            inserted +=
                    jdbc.sql(
                                    """
                                    INSERT INTO community_post (id, channel_id, author_id, body,
                                        body_hash, payload, moderation_state, created_at)
                                    SELECT :id, ch.id, :authorId, :body, :hash,
                                        CAST(:payload AS jsonb), 'OK', :at
                                      FROM community_channel ch WHERE ch.slug = :channel
                                    ON CONFLICT (id) DO NOTHING
                                    """)
                            .param("id", postId(post.index()))
                            .param("channel", post.channel())
                            .param("authorId", authorId)
                            .param("body", post.body())
                            .param("hash", ModerationService.digest(post.body()))
                            .param("payload", jsonMapper.writeValueAsString(payload))
                            .param(
                                    "at",
                                    Timestamp.from(
                                            now.minus(Duration.ofMinutes(post.minutesAgo()))))
                            .update();
        }
        List<SeedReply> replies =
                List.of(
                        new SeedReply(
                                1,
                                1,
                                "03",
                                "Nice! Looking for vintage staples, sending you a message.",
                                19 * 60),
                        new SeedReply(
                                2,
                                4,
                                "01",
                                "Tracked lettermail is my go-to for singles, cheap and quick.",
                                2 * 60),
                        new SeedReply(
                                3,
                                4,
                                "05",
                                "Same here, and I ask for tracking above 20 dollars.",
                                60));
        for (SeedReply reply : replies) {
            UUID authorId = UUID.fromString(USER_PREFIX + reply.author());
            if (!isActive(authorId)) {
                continue;
            }
            jdbc.sql(
                            """
                            INSERT INTO community_reply (id, post_id, author_id, body,
                                moderation_state, created_at)
                            SELECT :id, p.id, :authorId, :body, 'OK', :at
                              FROM community_post p WHERE p.id = :postId
                            ON CONFLICT (id) DO NOTHING
                            """)
                    .param("id", replyId(reply.index()))
                    .param("postId", postId(reply.post()))
                    .param("authorId", authorId)
                    .param("body", reply.body())
                    .param("at", Timestamp.from(now.minus(Duration.ofMinutes(reply.minutesAgo()))))
                    .update();
        }
        jdbc.sql(
                        """
                        UPDATE community_post p
                           SET reply_count = (SELECT count(*) FROM community_reply r
                                               WHERE r.post_id = p.id AND r.deleted_at IS NULL
                                                 AND r.moderation_state <> 'REMOVED'),
                               last_reply_at = (SELECT max(r.created_at) FROM community_reply r
                                                 WHERE r.post_id = p.id AND r.deleted_at IS NULL
                                                   AND r.moderation_state <> 'REMOVED')
                         WHERE p.id::text LIKE '00000000-0000-4000-8e00-0000000001%'
                        """)
                .update();
        if (inserted > 0) {
            log.info("Community seed: {} post(s) inserted", inserted);
        }
    }

    static UUID postId(int index) {
        return UUID.fromString(String.format("00000000-0000-4000-8e00-0000000001%02d", index));
    }

    static UUID replyId(int index) {
        return UUID.fromString(String.format("00000000-0000-4000-8e00-0000000002%02d", index));
    }

    private static void putCard(ObjectNode payload, CardLink card) {
        ObjectNode node = payload.putObject("card");
        node.put("printingId", card.id().toString());
        node.put("cardId", card.cardId().toString());
        node.put("name", card.name());
        if (card.printingCode() != null) {
            node.put("printingCode", card.printingCode());
        }
    }

    private static void putBinder(ObjectNode payload, BinderLink binder) {
        ObjectNode node = payload.putObject("binder");
        node.put("binderId", binder.id().toString());
        node.put("name", binder.name());
        node.put("ownerHandle", binder.ownerHandle());
    }

    private Optional<UUID> printing(String ref) {
        return jdbc.sql(
                        "SELECT id FROM card_printing WHERE external_ref ->> 'provider' = 'mock'"
                                + " AND external_ref ->> 'id' = :ref")
                .param("ref", ref)
                .query(UUID.class)
                .optional();
    }

    private boolean isActive(UUID userId) {
        return jdbc.sql(
                                "SELECT count(*) FROM user_account WHERE id = :id AND status ="
                                        + " 'ACTIVE'")
                        .param("id", userId)
                        .query(Long.class)
                        .single()
                > 0;
    }

    private record SeedPost(
            int index,
            String channel,
            String author,
            String body,
            int minutesAgo,
            @Nullable String printingRef,
            @Nullable String binderId) {}

    private record SeedReply(int index, int post, String author, String body, int minutesAgo) {}
}
