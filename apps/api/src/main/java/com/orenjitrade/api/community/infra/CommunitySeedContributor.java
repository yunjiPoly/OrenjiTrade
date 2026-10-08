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
 * Seeds a few fictional community posts and replies in the V041 channels (stable ids {@code
 * 00000000-0000-4000-8e00-0000000001NN} for posts and {@code ...0000000002NN} for replies), dated
 * relative to the first seed run: a meetup post with collector1's public binder, a "looking for"
 * post with a card link, a new-listings post with collector5's binder, a welcome thread and a trade
 * report. Inserted once ({@code ON CONFLICT DO NOTHING}); authors that are missing or inactive are
 * skipped.
 */
@Component
public class CommunitySeedContributor implements SeedContributor {

    static final String USER_PREFIX = "00000000-0000-4000-8000-0000000000";
    static final String CHANNEL_PREFIX = "00000000-0000-4000-8e00-0000000000";

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
        List<SeedPost> script =
                List.of(
                        new SeedPost(
                                1,
                                "11",
                                "01",
                                "Anyone going to the Friday locals in Montréal? I will bring my"
                                        + " trade binder, happy to trade before the tournament.",
                                20 * 60,
                                null,
                                "00000000-0000-4000-8b00-000000000101"),
                        new SeedPost(
                                2,
                                "05",
                                "02",
                                "Looking for this printing in near mint. I can trade Magic rares or"
                                        + " pay cash in Toronto.",
                                10 * 60,
                                "ygo-p005a",
                                null),
                        new SeedPost(
                                3,
                                "06",
                                "05",
                                "Just refreshed my binder with sealed Pokémon and a few Magic"
                                        + " foils. Offers welcome!",
                                6 * 60,
                                null,
                                "00000000-0000-4000-8b00-000000000501"),
                        new SeedPost(
                                4,
                                "08",
                                "08",
                                "Welcome to the OrenjiTrade community! Where do you like to meet"
                                        + " for trades? A busy food court works well for me.",
                                3 * 60,
                                null,
                                null),
                        new SeedPost(
                                5,
                                "07",
                                "04",
                                "Traded two Riftbound rares with a collector of my region"
                                        + " yesterday. Smooth meetup, thanks!",
                                30 * 60,
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
                                    VALUES (:id, :channelId, :authorId, :body, :hash,
                                        CAST(:payload AS jsonb), 'OK', :at)
                                    ON CONFLICT (id) DO NOTHING
                                    """)
                            .param("id", postId(post.index()))
                            .param("channelId", UUID.fromString(CHANNEL_PREFIX + post.channel()))
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
                                "I will be there! Looking for vintage staples, see you Friday.",
                                19 * 60),
                        new SeedReply(
                                2,
                                4,
                                "01",
                                "The café on Mont-Royal is my go-to, lots of tables.",
                                2 * 60),
                        new SeedReply(
                                3,
                                4,
                                "05",
                                "Metro stations with a mall are great for quick trades.",
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
