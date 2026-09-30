package com.orenjitrade.api.messaging.infra;

import com.orenjitrade.api.binders.domain.BinderLink;
import com.orenjitrade.api.binders.domain.PublicBinderService;
import com.orenjitrade.api.cards.domain.CardLink;
import com.orenjitrade.api.cards.domain.CatalogService;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.seed.SeedContributor;
import com.orenjitrade.api.messaging.domain.MessageKind;
import com.orenjitrade.api.messaging.domain.MessagePreviews;
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
 * Seeds the fictional conversation between collector1 and collector2 ({@code
 * docs/development/seed-data.md} "Interactions"): six messages about a Saturday meetup, one sharing
 * collector1's public Yu-Gi-Oh! trade binder and one a printing of it. Inserted once with stable
 * ids ({@code 00000000-0000-4000-8d00-...}) relative to the first seed run; skipped when either
 * account is missing or inactive, or when the pair already has a conversation. collector2 has not
 * read the last message yet (one unread).
 */
@Component
public class MessagingSeedContributor implements SeedContributor {

    static final UUID CONVERSATION_ID = UUID.fromString("00000000-0000-4000-8d00-000000000001");
    static final UUID COLLECTOR1 = UUID.fromString("00000000-0000-4000-8000-000000000001");
    static final UUID COLLECTOR2 = UUID.fromString("00000000-0000-4000-8000-000000000002");
    static final UUID TRADE_BINDER = UUID.fromString("00000000-0000-4000-8b00-000000000101");
    static final String SHARED_PRINTING = "ygo-p001a";

    private static final Logger log = LoggerFactory.getLogger(MessagingSeedContributor.class);

    private final JdbcClient jdbc;
    private final CatalogService catalog;
    private final PublicBinderService publicBinders;
    private final TimeProvider timeProvider;
    private final JsonMapper jsonMapper;

    public MessagingSeedContributor(
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
        return "conversations";
    }

    @Override
    public int order() {
        return ORDER_INTERACTIONS;
    }

    @Override
    @Transactional
    public void seed() {
        if (!isActive(COLLECTOR1) || !isActive(COLLECTOR2)) {
            return;
        }
        boolean paired =
                jdbc.sql(
                                        "SELECT count(*) FROM conversation_pair WHERE user_low ="
                                                + " LEAST(:a, :b) AND user_high = GREATEST(:a, :b)")
                                .param("a", COLLECTOR1)
                                .param("b", COLLECTOR2)
                                .query(Long.class)
                                .single()
                        > 0;
        if (paired) {
            return;
        }
        Instant start =
                timeProvider.now().minus(Duration.ofHours(26)).truncatedTo(ChronoUnit.SECONDS);
        jdbc.sql(
                        "INSERT INTO conversation (id, kind, created_by, created_at, updated_at)"
                                + " VALUES (:id, 'DIRECT', :by, :at, :at)")
                .param("id", CONVERSATION_ID)
                .param("by", COLLECTOR2)
                .param("at", Timestamp.from(start))
                .update();
        jdbc.sql(
                        "INSERT INTO conversation_pair (user_low, user_high, conversation_id)"
                                + " VALUES (LEAST(:a, :b), GREATEST(:a, :b), :id)")
                .param("a", COLLECTOR1)
                .param("b", COLLECTOR2)
                .param("id", CONVERSATION_ID)
                .update();
        for (UUID participant : List.of(COLLECTOR1, COLLECTOR2)) {
            jdbc.sql(
                            "INSERT INTO conversation_participant (conversation_id, user_id,"
                                    + " joined_at) VALUES (:id, :userId, :at)")
                    .param("id", CONVERSATION_ID)
                    .param("userId", participant)
                    .param("at", Timestamp.from(start))
                    .update();
        }

        Optional<CardLink> card = sharedPrinting().flatMap(catalog::cardLink);
        Optional<BinderLink> binder = publicBinders.binderLink(COLLECTOR2, TRADE_BINDER);
        List<SeedMessage> script =
                List.of(
                        new SeedMessage(
                                1,
                                COLLECTOR2,
                                MessageKind.TEXT,
                                "Hi Maïka! I saw your binder on the map. Are you around the"
                                        + " Plateau this weekend?",
                                0),
                        binder.isPresent()
                                ? new SeedMessage(
                                        2,
                                        COLLECTOR1,
                                        MessageKind.BINDER_LINK,
                                        "Yes! Here is the binder, everything in it is up for"
                                                + " trade.",
                                        10)
                                : new SeedMessage(
                                        2,
                                        COLLECTOR1,
                                        MessageKind.TEXT,
                                        "Yes! Everything in my trade binder is up for trade.",
                                        10),
                        card.isPresent()
                                ? new SeedMessage(
                                        3,
                                        COLLECTOR2,
                                        MessageKind.CARD_LINK,
                                        "Is this one still available? I could trade two Magic"
                                                + " rares for it.",
                                        20)
                                : new SeedMessage(
                                        3,
                                        COLLECTOR2,
                                        MessageKind.TEXT,
                                        "Is your Azure-Eyes still available? I could trade two"
                                                + " Magic rares for it.",
                                        20),
                        new SeedMessage(
                                4,
                                COLLECTOR1,
                                MessageKind.TEXT,
                                "Still available. Would you do cash plus a trade?",
                                30),
                        new SeedMessage(
                                5,
                                COLLECTOR2,
                                MessageKind.TEXT,
                                "Sure: 20 CAD plus one of my rares. Café on Mont-Royal, Saturday"
                                        + " at 2 pm?",
                                60),
                        new SeedMessage(
                                6,
                                COLLECTOR1,
                                MessageKind.TEXT,
                                "Perfect, see you Saturday at the café!",
                                120));
        @Nullable Instant lastAt = null;
        @Nullable UUID lastId = null;
        @Nullable Instant fifthAt = null;
        @Nullable UUID fifthId = null;
        for (SeedMessage message : script) {
            UUID id = messageId(message.index());
            Instant at = start.plus(Duration.ofMinutes(message.minutesAfterStart()));
            ObjectNode payload = jsonMapper.createObjectNode();
            @Nullable String linkName = null;
            if (message.kind() == MessageKind.CARD_LINK && card.isPresent()) {
                ObjectNode node = payload.putObject("card");
                node.put("printingId", card.get().id().toString());
                node.put("cardId", card.get().cardId().toString());
                node.put("name", card.get().name());
                if (card.get().printingCode() != null) {
                    node.put("printingCode", card.get().printingCode());
                }
                linkName = card.get().name();
            } else if (message.kind() == MessageKind.BINDER_LINK && binder.isPresent()) {
                ObjectNode node = payload.putObject("binder");
                node.put("binderId", binder.get().id().toString());
                node.put("name", binder.get().name());
                node.put("ownerHandle", binder.get().ownerHandle());
                linkName = binder.get().name();
            }
            jdbc.sql(
                            """
                            INSERT INTO message (id, conversation_id, sender_id, kind, body,
                                payload, created_at, moderation_state)
                            VALUES (:id, :conversationId, :senderId, :kind, :body,
                                CAST(:payload AS jsonb), :at, 'OK')
                            ON CONFLICT (id) DO NOTHING
                            """)
                    .param("id", id)
                    .param("conversationId", CONVERSATION_ID)
                    .param("senderId", message.sender())
                    .param("kind", message.kind().name())
                    .param("body", message.body())
                    .param("payload", jsonMapper.writeValueAsString(payload))
                    .param("at", Timestamp.from(at))
                    .update();
            jdbc.sql(
                            """
                            UPDATE conversation
                               SET last_message_id = :id, last_message_at = :at,
                                   last_message_preview = :preview, last_message_kind = :kind,
                                   last_message_sender_id = :senderId, updated_at = :at
                             WHERE id = :conversationId
                            """)
                    .param("id", id)
                    .param("at", Timestamp.from(at))
                    .param("preview", MessagePreviews.of(message.kind(), message.body(), linkName))
                    .param("kind", message.kind().name())
                    .param("senderId", message.sender())
                    .param("conversationId", CONVERSATION_ID)
                    .update();
            if (message.index() == 5) {
                fifthAt = at;
                fifthId = id;
            }
            lastAt = at;
            lastId = id;
        }
        markRead(COLLECTOR1, lastAt, lastId);
        markRead(COLLECTOR2, fifthAt, fifthId);
        log.info(
                "Messaging seed: conversation collector1 <-> collector2 with {} messages",
                script.size());
    }

    static UUID messageId(int index) {
        return UUID.fromString(String.format("00000000-0000-4000-8d00-0000000001%02d", index));
    }

    private void markRead(UUID userId, @Nullable Instant at, @Nullable UUID messageId) {
        if (at == null || messageId == null) {
            return;
        }
        jdbc.sql(
                        "UPDATE conversation_participant SET last_read_at = :at,"
                                + " last_read_message_id = :messageId WHERE conversation_id = :id"
                                + " AND user_id = :userId")
                .param("at", Timestamp.from(at))
                .param("messageId", messageId)
                .param("id", CONVERSATION_ID)
                .param("userId", userId)
                .update();
    }

    private Optional<UUID> sharedPrinting() {
        return jdbc.sql(
                        "SELECT id FROM card_printing WHERE external_ref ->> 'provider' = 'mock'"
                                + " AND external_ref ->> 'id' = :ref")
                .param("ref", SHARED_PRINTING)
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

    private record SeedMessage(
            int index, UUID sender, MessageKind kind, String body, int minutesAfterStart) {}
}
