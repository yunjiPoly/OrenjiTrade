package com.orenjitrade.api.deals;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Mark as sold and its undo (stage R4; owner spec 2026-10-14, sections 10, 12 "Messaging and sales"
 * and 16, defaults 4 and 6; ADR 0018): only the seller of the chat's card or deck core marks it
 * sold; the copies leave the inventory (the card at 0, a deck core with its cards); a SALE
 * interaction lets both rate at once; one SYSTEM message both read, with the tracking number; the
 * buyer's in-app notification; the undo within 10 minutes and before anyone rated it puts back
 * exactly what was there. 409 when no copy is left, also for the second of two sales of the last
 * copy at once.
 */
@ExtendWith(OutputCaptureExtension.class)
class SaleIT extends AbstractDealsIT {

    @Test
    void theSellerMarksCopiesSoldAndBothSeeTheSale() {
        Collector seller = collector("r4-sale-seller");
        Collector buyer = collector("r4-sale-buyer");
        String itemId = card(seller, 3, "PUBLIC", "$32");
        String chatId = chatAbout(buyer, seller, itemId);
        sendText(buyer, chatId, "e-Transfer sent!");

        JsonNode sale = markSold(seller, chatId, 2, "  7023 2109   8876 5432 ", 201);
        assertThat(sale.path("kind").asString()).isEqualTo("CARD");
        assertThat(sale.path("itemId").asString()).isEqualTo(itemId);
        assertThat(sale.path("sellerId").asString()).isEqualTo(seller.id().toString());
        assertThat(sale.path("buyerId").asString()).isEqualTo(buyer.id().toString());
        assertThat(sale.path("quantity").asInt()).isEqualTo(2);
        assertThat(sale.path("remaining").asInt()).isEqualTo(1);
        assertThat(sale.path("removed").asBoolean()).isFalse();
        assertThat(sale.path("trackingNumber").asString()).isEqualTo("7023 2109 8876 5432");
        assertThat(sale.path("undoableUntil").asString()).isNotBlank();
        assertThat(sale.path("undoneAt").isNull()).isTrue();
        assertThat(item(seller, itemId, 200).path("quantity").asInt()).isEqualTo(1);

        // One SYSTEM message, the same for both: the phone words it per side.
        for (Collector member : List.of(seller, buyer)) {
            List<JsonNode> notices = saleMessages(member, chatId);
            assertThat(notices).hasSize(1);
            JsonNode payload = notices.get(0).path("payload").path("sale");
            assertThat(payload.path("saleId").asString()).isEqualTo(sale.path("id").asString());
            assertThat(payload.path("sellerId").asString()).isEqualTo(seller.id().toString());
            assertThat(payload.path("buyerId").asString()).isEqualTo(buyer.id().toString());
            assertThat(payload.path("trackingNumber").asString()).isEqualTo("7023 2109 8876 5432");
            assertThat(payload.path("undone").asBoolean()).isFalse();
            assertThat(notices.get(0).path("body").asString())
                    .isEqualTo(
                            seller.handle()
                                    + " marked "
                                    + payload.path("name").asString()
                                    + " as sold to "
                                    + buyer.handle()
                                    + ".");
            assertThat(notices.get(0).path("body").asString()).doesNotContain("7023");
            assertNoPrivateData(notices.get(0));
        }
        // The pinned bar says Sold for both; the inbox names the sale as the last message, read by
        // the seller who marked it and unread for the buyer.
        assertThat(conversation(seller, chatId, 200).path("subject").path("sold").asBoolean())
                .isTrue();
        JsonNode buyerView = conversation(buyer, chatId, 200);
        assertThat(buyerView.path("subject").path("sold").asBoolean()).isTrue();
        assertThat(buyerView.path("lastMessage").path("systemTopic").asString()).isEqualTo("SALE");
        assertThat(buyerView.path("lastMessage").path("sale").path("buyerId").asString())
                .isEqualTo(buyer.id().toString());
        assertThat(buyerView.path("unreadCount").asInt()).isEqualTo(1);
        assertThat(conversation(seller, chatId, 200).path("unreadCount").asInt()).isZero();

        // Both can rate each other at once.
        assertThat(saleInteractions(seller, buyer)).hasSize(1);
        assertThat(saleInteractions(buyer, seller)).hasSize(1);
        // The buyer's notification opens the chat.
        List<JsonNode> notified = notifications(buyer, "SALE_RECORDED");
        assertThat(notified).hasSize(1);
        assertThat(notified.get(0).path("title").asString())
                .startsWith(seller.handle() + " marked ")
                .endsWith(" as sold to you");
        assertThat(notified.get(0).path("data").path("deepLink").asString())
                .isEqualTo("/messages/" + chatId);
        assertThat(notified.get(0).toString()).doesNotContain("7023");
        assertThat(notifications(seller, "SALE_RECORDED")).isEmpty();
    }

    @Test
    void theLastCopyTakesTheCardOutAndTheUndoPutsBackExactlyWhatWasThere() {
        Collector seller = collector("r4-last-seller");
        Collector buyer = collector("r4-last-buyer");
        String binderId =
                callJson(
                                HttpMethod.POST,
                                BINDERS,
                                seller.uid(),
                                Map.of("name", "Trades", "visibility", "PUBLIC"),
                                201)
                        .path("id")
                        .asString();
        String itemId = card(seller, 1, "PUBLIC", "85% TCG", binderId);
        String chatId = chatAbout(buyer, seller, itemId);

        JsonNode sale = markSold(seller, chatId, null, null, 201);
        assertThat(sale.path("removed").asBoolean()).isTrue();
        assertThat(sale.path("remaining").asInt()).isZero();
        assertThat(sale.path("trackingNumber").isNull()).isTrue();
        item(seller, itemId, 404);
        // Not listed any more; a second sale of it: nothing left.
        assertThat(conversation(buyer, chatId, 200).path("subject").path("listed").asBoolean())
                .isFalse();
        assertThat(markSold(seller, chatId, 1, null, 409).path("errorCode").asString())
                .isEqualTo("NOTHING_LEFT_TO_SELL");

        // Only the seller undoes it.
        String saleId = sale.path("id").asString();
        assertThat(undo(buyer, saleId, 403).path("errorCode").asString()).isEqualTo("FORBIDDEN");
        undo(collector("r4-last-stranger"), saleId, 404);
        JsonNode undone = undo(seller, saleId, 200);
        assertThat(undone.path("undoneAt").asString()).isNotBlank();
        JsonNode back = item(seller, itemId, 200);
        assertThat(back.path("quantity").asInt()).isEqualTo(1);
        assertThat(back.path("binder").path("id").asString()).isEqualTo(binderId);
        assertThat(back.path("visibility").asString()).isEqualTo("PUBLIC");
        assertThat(back.path("askingPriceText").asString()).isEqualTo("85% TCG");
        assertThat(back.path("notes").asString()).isEqualTo(SECRET);
        // The message, the notification and the interaction are gone; the bar is back to selling.
        assertThat(saleMessages(seller, chatId)).isEmpty();
        assertThat(saleMessages(buyer, chatId)).isEmpty();
        assertThat(notifications(buyer, "SALE_RECORDED")).isEmpty();
        assertThat(saleInteractions(buyer, seller)).isEmpty();
        JsonNode bar = conversation(buyer, chatId, 200);
        assertThat(bar.path("subject").path("sold").asBoolean()).isFalse();
        assertThat(bar.path("subject").path("listed").asBoolean()).isTrue();
        assertThat(
                        bar.path("lastMessage").path("systemTopic").isMissingNode()
                                || bar.path("lastMessage").path("systemTopic").isNull())
                .isTrue();
        // A repeated undo answers the undone sale.
        assertThat(undo(seller, saleId, 200).path("undoneAt").asString())
                .isEqualTo(undone.path("undoneAt").asString());

        // Sold again later: a new sale.
        JsonNode again = markSold(seller, chatId, 1, "LX123456789CA", 201);
        assertThat(again.path("id").asString()).isNotEqualTo(saleId);
        assertThat(saleMessages(buyer, chatId)).hasSize(1);
    }

    /**
     * Review fix 1, F1: the buyer pins another of the seller's listings between the seller's look
     * at the chat and the seller's Mark as sold. The sale names what the seller saw, so nothing is
     * sold until the seller looks again; a client that names nothing (the paused web) sells the
     * chat's subject as before.
     */
    @Test
    void aSaleOfTheCardTheSellerSawIsRefusedOnceTheBuyerPinnedAnother() {
        Collector seller = collector("r4-repin-seller");
        Collector buyer = collector("r4-repin-buyer");
        String itemId = card(seller, 3, "PUBLIC", "85% TCG");
        String coreId = deckCore(seller, "Lantern core", "$150");
        String chatId = chatAbout(buyer, seller, itemId);
        JsonNode seen = conversation(seller, chatId, 200).path("subject");
        assertThat(seen.path("id").asString()).isEqualTo(itemId);
        assertThat(seen.path("copies").asInt()).isEqualTo(3);

        // The buyer opens the seller's deck core without writing.
        startAbout(buyer, seller, null, coreId, 200);
        JsonNode refused = markSoldShown(seller, chatId, 2, itemId, null, 409);
        assertThat(refused.path("errorCode").asString()).isEqualTo("SUBJECT_CHANGED");
        // Nothing was sold: the card keeps its copies, the core stays on offer, no sale, no
        // message, no notification.
        assertThat(item(seller, itemId, 200).path("quantity").asInt()).isEqualTo(3);
        JsonNode core = callJson(HttpMethod.GET, BINDERS + "/" + coreId, seller.uid(), null, 200);
        assertThat(core.path("soldAt").isNull()).isTrue();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM sale WHERE conversation_id = ?",
                                UUID.fromString(chatId)))
                .isZero();
        assertThat(saleMessages(buyer, chatId)).isEmpty();
        assertThat(notifications(buyer, "SALE_RECORDED")).isEmpty();

        // Both at once is a mistake; a chat the seller saw about nothing has changed too.
        markSoldShown(seller, chatId, 1, itemId, coreId, 400);

        // The seller looks again and sells what the chat is about now.
        JsonNode now = conversation(seller, chatId, 200).path("subject");
        assertThat(now.path("kind").asString()).isEqualTo("DECK_CORE");
        JsonNode sale = markSoldShown(seller, chatId, null, null, coreId, 201);
        assertThat(sale.path("kind").asString()).isEqualTo("DECK_CORE");
        assertThat(sale.path("binderId").asString()).isEqualTo(coreId);
        assertThat(item(seller, itemId, 200).path("quantity").asInt()).isEqualTo(3);

        // The buyer goes back to the card: the core's sale does not make the card "Sold", and a
        // sale naming the core now is refused in turn.
        startAbout(buyer, seller, itemId, null, 200);
        assertThat(conversation(seller, chatId, 200).path("subject").path("sold").asBoolean())
                .isFalse();
        assertThat(
                        markSoldShown(seller, chatId, null, null, coreId, 409)
                                .path("errorCode")
                                .asString())
                .isEqualTo("SUBJECT_CHANGED");
        markSoldShown(seller, chatId, 1, itemId, null, 201);
        assertThat(item(seller, itemId, 200).path("quantity").asInt()).isEqualTo(2);
    }

    @Test
    void aSaleNamingASubjectInAChatAboutNothingIsRefused() {
        Collector seller = collector("r4-nosubject-seller");
        Collector buyer = collector("r4-nosubject-buyer");
        String itemId = card(seller, 1, "PUBLIC", "$4");
        String plain =
                callJson(
                                HttpMethod.POST,
                                CONVERSATIONS,
                                buyer.uid(),
                                Map.of("recipientId", seller.id().toString()),
                                201)
                        .path("id")
                        .asString();
        assertThat(markSoldShown(seller, plain, 1, itemId, null, 409).path("errorCode").asString())
                .isEqualTo("SUBJECT_CHANGED");
        assertThat(item(seller, itemId, 200).path("quantity").asInt()).isEqualTo(1);
    }

    @Test
    void theUndoPutsBackSoldCopiesOfACardThatKeptSome() {
        Collector seller = collector("r4-copies-seller");
        Collector buyer = collector("r4-copies-buyer");
        String itemId = card(seller, 4, "PUBLIC", "$2");
        String chatId = chatAbout(buyer, seller, itemId);
        String saleId = markSold(seller, chatId, 3, null, 201).path("id").asString();
        assertThat(item(seller, itemId, 200).path("quantity").asInt()).isEqualTo(1);
        undo(seller, saleId, 200);
        assertThat(item(seller, itemId, 200).path("quantity").asInt()).isEqualTo(4);
    }

    @Test
    void onlyTheSellerOfTheChatsSubjectMarksItSold() {
        Collector seller = collector("r4-only-seller");
        Collector buyer = collector("r4-only-buyer");
        String itemId = card(seller, 2, "PUBLIC", "$8");
        String chatId = chatAbout(buyer, seller, itemId);

        assertThat(markSold(buyer, chatId, 1, null, 403).path("errorCode").asString())
                .isEqualTo("FORBIDDEN");
        Collector stranger = collector("r4-only-stranger");
        markSold(stranger, chatId, 1, null, 404);
        assertThat(item(seller, itemId, 200).path("quantity").asInt()).isEqualTo(2);

        // A chat without a card: nothing to mark.
        Collector other = collector("r4-only-other");
        String plain =
                callJson(
                                HttpMethod.POST,
                                CONVERSATIONS,
                                seller.uid(),
                                Map.of("recipientId", other.id().toString()),
                                201)
                        .path("id")
                        .asString();
        assertThat(markSold(seller, plain, 1, null, 409).path("errorCode").asString())
                .isEqualTo("CONFLICT");

        // Copies: at least one, at most those held; the tracking number is letters and digits.
        markSold(seller, chatId, 0, null, 400);
        markSold(seller, chatId, 3, null, 400);
        markSold(seller, chatId, 1, "see https://example.com", 400);
        markSold(seller, chatId, 1, "1".repeat(65), 400);
        assertThat(item(seller, itemId, 200).path("quantity").asInt()).isEqualTo(2);

        // A blocked pair: the chat is hidden.
        callJson(
                HttpMethod.POST, "/api/v1/users/" + buyer.id() + "/block", seller.uid(), null, 200);
        markSold(seller, chatId, 1, null, 404);
    }

    @Test
    void theUndoClosesAfterTenMinutesAndOnceTheSaleIsRated() {
        Collector seller = collector("r4-window-seller");
        Collector buyer = collector("r4-window-buyer");
        String first = card(seller, 1, "PUBLIC", "$5");
        String chatId = chatAbout(buyer, seller, first);
        String late = markSold(seller, chatId, 1, null, 201).path("id").asString();

        testUsers.update(
                "UPDATE sale SET created_at = now() - interval '11 minutes' WHERE id = ?",
                UUID.fromString(late));
        JsonNode closed = undo(seller, late, 409);
        assertThat(closed.path("errorCode").asString()).isEqualTo("SALE_UNDO_CLOSED");
        assertThat(closed.path("undoableUntil").asString()).isNotBlank();

        // Rated: the buyer rated the sale at once, so it stays.
        String second = card(seller, 1, "PUBLIC", "$6");
        startAbout(buyer, seller, second, null, 200);
        String rated = markSold(seller, chatId, 1, null, 201).path("id").asString();
        List<String> interactions = saleInteractions(buyer, seller);
        assertThat(interactions).hasSize(2);
        String interactionId =
                interactions.stream()
                        .filter(
                                id ->
                                        testUsers.count(
                                                        "SELECT count(*) FROM interaction WHERE id"
                                                                + " = ? AND subject_id = ?",
                                                        UUID.fromString(id),
                                                        UUID.fromString(rated))
                                                == 1)
                        .findFirst()
                        .orElseThrow();
        callJson(
                HttpMethod.POST,
                "/api/v1/ratings",
                buyer.uid(),
                Map.of("interactionId", interactionId, "overall", 5, "shipping", 5),
                201);
        assertThat(undo(seller, rated, 409).path("errorCode").asString())
                .isEqualTo("SALE_ALREADY_RATED");
        // Nothing came back.
        item(seller, second, 404);
        assertThat(saleMessages(buyer, chatId)).hasSize(2);
    }

    @Test
    void aDeckCoreSoldLeavesSearchWithItsCardsAndComesBackOnUndo() {
        Collector seller = collector("r4-core-seller");
        Collector buyer = collector("r4-core-buyer");
        String coreId = deckCore(seller, "Snake-Eye core", "$95");
        String chatId = startAbout(buyer, seller, null, coreId, 201).path("id").asString();
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + coreId, buyer.uid(), null, 200);

        markSold(seller, chatId, 2, null, 400);
        JsonNode sale = markSold(seller, chatId, null, "1Z999AA10123456784", 201);
        assertThat(sale.path("kind").asString()).isEqualTo("DECK_CORE");
        assertThat(sale.path("binderId").asString()).isEqualTo(coreId);
        assertThat(sale.path("quantity").asInt()).isEqualTo(1);
        assertThat(sale.path("removed").asBoolean()).isTrue();
        JsonNode owned = callJson(HttpMethod.GET, BINDERS + "/" + coreId, seller.uid(), null, 200);
        assertThat(owned.path("soldAt").asString()).isNotBlank();
        assertThat(owned.path("itemCount").asInt()).isZero();
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + coreId, buyer.uid(), null, 404);
        assertThat(conversation(buyer, chatId, 200).path("subject").path("sold").asBoolean())
                .isTrue();
        assertThat(markSold(seller, chatId, null, null, 409).path("errorCode").asString())
                .isEqualTo("NOTHING_LEFT_TO_SELL");

        undo(seller, sale.path("id").asString(), 200);
        JsonNode back = callJson(HttpMethod.GET, BINDERS + "/" + coreId, seller.uid(), null, 200);
        assertThat(back.path("soldAt").isNull()).isTrue();
        assertThat(back.path("itemCount").asInt()).isEqualTo(1);
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + coreId, buyer.uid(), null, 200);
        assertThat(conversation(buyer, chatId, 200).path("subject").path("sold").asBoolean())
                .isFalse();
    }

    /**
     * Review fix 1, F3: a sold deck core leaves the owner's binder count (binders.max, the same cap
     * for everyone): the phone hides it and cannot delete it, so it must not keep a slot.
     */
    @Test
    void aSoldDeckCoreFreesItsBinderSlot() {
        Collector seller = collector("r4-slot-seller");
        Collector buyer = collector("r4-slot-buyer");
        long cap =
                testUsers.count(
                        "SELECT max_value FROM usage_limit WHERE limit_key = 'binders.max'");
        assertThat(cap).isPositive();
        String coreId = deckCore(seller, "Sold core", "$70");
        String chatId = startAbout(buyer, seller, null, coreId, 201).path("id").asString();
        markSold(seller, chatId, null, null, 201);
        assertThat(bindersMaxUsed(seller)).isZero();

        for (int index = 0; index < cap; index++) {
            callJson(
                    HttpMethod.POST,
                    BINDERS,
                    seller.uid(),
                    Map.of("name", "Binder " + index, "visibility", "PRIVATE"),
                    201);
        }
        assertThat(bindersMaxUsed(seller)).isEqualTo(cap);
        assertThat(
                        callJson(
                                        HttpMethod.POST,
                                        BINDERS,
                                        seller.uid(),
                                        Map.of("name", "One too many", "visibility", "PRIVATE"),
                                        429)
                                .path("errorCode")
                                .asString())
                .isEqualTo("LIMIT_REACHED");
    }

    private long bindersMaxUsed(Collector member) {
        for (JsonNode limit :
                callJson(HttpMethod.GET, "/api/v1/me/limits", member.uid(), null, 200)
                        .path("limits")) {
            if ("binders.max".equals(limit.path("key").asString())) {
                return limit.path("used").asLong();
            }
        }
        throw new AssertionError("binders.max is missing from /me/limits");
    }

    @Test
    void twoSalesOfTheLastCopyAtOnceSellItOnce() throws Exception {
        Collector seller = collector("r4-race-seller");
        Collector first = collector("r4-race-first");
        Collector second = collector("r4-race-second");
        String itemId = card(seller, 1, "PUBLIC", "$40");
        String chatA = chatAbout(first, seller, itemId);
        String chatB = chatAbout(second, seller, itemId);

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            CountDownLatch go = new CountDownLatch(1);
            List<Future<Integer>> results = new ArrayList<>();
            for (String chat : List.of(chatA, chatB)) {
                Callable<Integer> call =
                        () -> {
                            go.await();
                            return call(
                                            HttpMethod.POST,
                                            CONVERSATIONS + "/" + chat + "/sales",
                                            seller.uid(),
                                            Map.of("quantity", 1))
                                    .getStatus()
                                    .value();
                        };
                results.add(pool.submit(call));
            }
            go.countDown();
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> result : results) {
                statuses.add(result.get(60, TimeUnit.SECONDS));
            }
            assertThat(statuses).containsExactlyInAnyOrder(201, 409);
        } finally {
            pool.shutdownNow();
        }
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM sale WHERE inventory_item_id = ?",
                                UUID.fromString(itemId)))
                .isEqualTo(1);
    }

    @Test
    void theUndoOfACardWhoseBinderWasDeletedSinceIsClosed() {
        Collector seller = collector("r4-gone-seller");
        Collector buyer = collector("r4-gone-buyer");
        String binderId =
                callJson(
                                HttpMethod.POST,
                                BINDERS,
                                seller.uid(),
                                Map.of("name", "Gone", "visibility", "PUBLIC"),
                                201)
                        .path("id")
                        .asString();
        String itemId = card(seller, 1, "PUBLIC", "$7", binderId);
        String chatId = chatAbout(buyer, seller, itemId);
        String saleId = markSold(seller, chatId, 1, null, 201).path("id").asString();
        callJson(HttpMethod.DELETE, BINDERS + "/" + binderId, seller.uid(), null, 204);
        assertThat(undo(seller, saleId, 409).path("errorCode").asString())
                .isEqualTo("SALE_UNDO_CLOSED");
        // Nothing was half-undone: the interaction and the message stay.
        assertThat(saleInteractions(buyer, seller)).hasSize(1);
        assertThat(saleMessages(buyer, chatId)).hasSize(1);
    }

    /**
     * Owner spec 2026-10-14, section 13: tracking numbers are seen by the two collectors only and
     * never reach the logs, the analytics or the domain events (the outbox). Every path that
     * receives one is run: a card sale, a deck core sale, a refused number, a refused quantity, an
     * undo and a refused undo.
     */
    @Test
    void trackingNumbersNeverReachTheLogsOrTheEvents(CapturedOutput output) {
        Collector seller = collector("r4-track-seller");
        Collector buyer = collector("r4-track-buyer");
        String itemId = card(seller, 3, "PUBLIC", "$12");
        String chatId = chatAbout(buyer, seller, itemId);
        List<String> numbers =
                List.of(
                        "LX123456789CA",
                        "7023 2109 8876 5432",
                        "1Z999AA10123456784",
                        "RR998877665CA",
                        "TRK-REFUSED-4411");

        // Refused before anything is written: a malformed number, then too many copies.
        markSold(seller, chatId, 1, numbers.get(4) + " https://track.example", 400);
        markSold(seller, chatId, 9, numbers.get(3), 400);
        String first = markSold(seller, chatId, 1, numbers.get(0), 201).path("id").asString();
        undo(seller, first, 200);
        String second = markSold(seller, chatId, 2, numbers.get(1), 201).path("id").asString();
        undo(buyer, second, 403);

        String coreId = deckCore(seller, "Tracked core", "$60");
        String coreChat = startAbout(buyer, seller, null, coreId, 200).path("id").asString();
        assertThat(coreChat).isEqualTo(chatId);
        markSold(seller, chatId, null, numbers.get(2), 201);

        // The two collectors see it in the chat; nothing else carries it.
        assertThat(messages(buyer, chatId).toString())
                .contains(numbers.get(1))
                .contains(numbers.get(2));
        String logs = output.getAll();
        for (String number : numbers) {
            assertThat(logs).as("tracking number %s in the logs", number).doesNotContain(number);
            assertThat(
                            testUsers.count(
                                    "SELECT count(*) FROM event_publication WHERE"
                                            + " serialized_event LIKE ?",
                                    "%" + number + "%"))
                    .as("tracking number %s in a domain event", number)
                    .isZero();
            assertThat(
                            testUsers.count(
                                    "SELECT count(*) FROM notification WHERE title LIKE ? OR"
                                            + " body LIKE ? OR data::text LIKE ?",
                                    "%" + number + "%",
                                    "%" + number + "%",
                                    "%" + number + "%"))
                    .as("tracking number %s in a notification", number)
                    .isZero();
        }
    }
}
