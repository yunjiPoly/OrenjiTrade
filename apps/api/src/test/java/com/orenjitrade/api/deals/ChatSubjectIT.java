package com.orenjitrade.api.deals;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * The card or deck core a chat is about (stage R4; owner spec 2026-10-14, sections 10 and 12
 * "Messaging and sales"): {@code POST /conversations} pins a public card or deck core of the
 * recipient (or the caller's own), one chat per pair and the latest pin wins; {@code GET
 * /conversations/{id}} and the inbox carry it; a CARD_LINK of one's own card pins it too (a private
 * card shown to that collector only); once it is no longer on offer the buyer keeps its name and
 * picture without a price. Blocked pairs, private and deleted subjects, someone else's card.
 */
class ChatSubjectIT extends AbstractDealsIT {

    @Test
    void aBuyerPinsAPublicCardAndBothSeeItWithTheirSide() {
        Collector seller = collector("r4-subject-seller");
        Collector buyer = collector("r4-subject-buyer");
        String itemId = card(seller, 3, "PUBLIC", "$32");

        JsonNode started = startAbout(buyer, seller, itemId, null, 201);
        String chatId = started.path("id").asString();
        JsonNode subject = started.path("subject");
        assertThat(subject.path("kind").asString()).isEqualTo("CARD");
        assertThat(subject.path("id").asString()).isEqualTo(itemId);
        assertThat(subject.path("ownerId").asString()).isEqualTo(seller.id().toString());
        assertThat(subject.path("name").asString()).isNotBlank();
        assertThat(subject.path("printingCode").asString()).isNotBlank();
        assertThat(subject.path("cardId").asString()).isNotBlank();
        assertThat(subject.path("askingPriceText").asString()).isEqualTo("$32");
        assertThat(subject.path("listed").asBoolean()).isTrue();
        assertThat(subject.path("sold").asBoolean()).isFalse();
        // The copies are the owner's business.
        assertThat(subject.path("copies").isNull()).isTrue();
        assertNoPrivateData(started);

        // The seller reads the same chat with their copies; the other's place is the province.
        JsonNode mine = conversation(seller, chatId, 200);
        assertThat(mine.path("subject").path("copies").asInt()).isEqualTo(3);
        assertThat(mine.path("other").path("place").path("subdivisionName").asString())
                .isEqualTo("Ontario");
        assertThat(mine.path("other").path("place").path("countryCode").asString()).isEqualTo("CA");
        assertNoPrivateData(mine);
        // The inbox carries it too, for both.
        sendText(buyer, chatId, "Is it still available?");
        for (Collector member : java.util.List.of(buyer, seller)) {
            JsonNode inbox = callJson(HttpMethod.GET, CONVERSATIONS, member.uid(), null, 200);
            JsonNode row = find(inbox, chatId);
            assertThat(row.path("subject").path("id").asString()).isEqualTo(itemId);
            assertNoPrivateData(inbox);
        }

        // One chat per pair: the same pin answers 200 with the same chat.
        JsonNode again = startAbout(buyer, seller, itemId, null, 200);
        assertThat(again.path("id").asString()).isEqualTo(chatId);
        // Without a subject the pinned card stays ("Message {handle}" on a profile).
        JsonNode plain =
                callJson(
                        HttpMethod.POST,
                        CONVERSATIONS,
                        buyer.uid(),
                        Map.of("recipientId", seller.id().toString()),
                        200);
        assertThat(plain.path("subject").path("id").asString()).isEqualTo(itemId);
    }

    @Test
    void theLatestPinWinsAndADeckCoreCanBeTheSubject() {
        Collector seller = collector("r4-latest-seller");
        Collector buyer = collector("r4-latest-buyer");
        String itemId = card(seller, 1, "PUBLIC", "$4");
        String coreId = deckCore(seller, "Moth core", "$95");
        String photo = binderPhoto(seller, coreId).path("photos").get(0).path("url").asString();

        String chatId = chatAbout(buyer, seller, itemId);
        JsonNode core = startAbout(buyer, seller, null, coreId, 200);
        assertThat(core.path("id").asString()).isEqualTo(chatId);
        JsonNode subject = core.path("subject");
        assertThat(subject.path("kind").asString()).isEqualTo("DECK_CORE");
        assertThat(subject.path("id").asString()).isEqualTo(coreId);
        assertThat(subject.path("name").asString()).isEqualTo("Moth core");
        assertThat(subject.path("askingPriceText").asString()).isEqualTo("$95");
        assertThat(subject.path("imageUrl").asString()).isEqualTo(photo);
        assertThat(subject.path("printingCode").isNull()).isTrue();
        assertThat(subject.path("listed").asBoolean()).isTrue();
        assertNoPrivateData(core);

        // Back to the card: the latest wins.
        assertThat(
                        startAbout(buyer, seller, itemId, null, 200)
                                .path("subject")
                                .path("kind")
                                .asString())
                .isEqualTo("CARD");
    }

    @Test
    void privateDeletedOrSomeoneElsesSubjectsAreRefused() {
        Collector seller = collector("r4-refuse-seller");
        Collector buyer = collector("r4-refuse-buyer");
        Collector stranger = collector("r4-refuse-stranger");
        String privateCard = card(seller, 1, "PRIVATE", "$9");
        String deleted = card(seller, 1, "PUBLIC", "$9");
        callJson(HttpMethod.DELETE, ITEMS + "/" + deleted, seller.uid(), null, 204);
        String strangers = card(stranger, 1, "PUBLIC", "$9");
        String plainBinder =
                callJson(
                                HttpMethod.POST,
                                BINDERS,
                                seller.uid(),
                                Map.of("name", "Plain", "visibility", "PUBLIC"),
                                201)
                        .path("id")
                        .asString();
        card(seller, 1, "PUBLIC", null, plainBinder);
        String privateCore =
                callJson(
                                HttpMethod.POST,
                                BINDERS,
                                seller.uid(),
                                Map.of(
                                        "name",
                                        "Hidden core",
                                        "visibility",
                                        "PRIVATE",
                                        "sellsAsCore",
                                        true),
                                201)
                        .path("id")
                        .asString();

        // Not found: private, deleted, an unknown id; nothing is created.
        startAbout(buyer, seller, privateCard, null, 404);
        startAbout(buyer, seller, deleted, null, 404);
        startAbout(buyer, seller, java.util.UUID.randomUUID().toString(), null, 404);
        startAbout(buyer, seller, null, privateCore, 404);
        assertThat(callJson(HttpMethod.GET, CONVERSATIONS, buyer.uid(), null, 200).path("items"))
                .isEmpty();
        // Bad requests: a third collector's card, both at once, a binder that is not a deck core.
        assertThat(startAbout(buyer, seller, strangers, null, 400).path("errorCode").asString())
                .isEqualTo("VALIDATION_FAILED");
        startAbout(buyer, seller, privateCard, plainBinder, 400);
        startAbout(buyer, seller, null, plainBinder, 400);

        // The owner may pin their own private card (a seller writing to a buyer).
        JsonNode own = startAbout(seller, buyer, privateCard, null, 201);
        assertThat(own.path("subject").path("id").asString()).isEqualTo(privateCard);
        // Shared by its owner, the buyer sees it with its price while it is in the inventory.
        JsonNode seen = conversation(buyer, own.path("id").asString(), 200).path("subject");
        assertThat(seen.path("listed").asBoolean()).isTrue();
        assertThat(seen.path("askingPriceText").asString()).isEqualTo("$9");
    }

    @Test
    void aCardNoLongerOnOfferKeepsItsNameAndPictureWithoutAPrice() {
        Collector seller = collector("r4-unlisted-seller");
        Collector buyer = collector("r4-unlisted-buyer");
        String itemId = card(seller, 2, "PUBLIC", "$12");
        String chatId = chatAbout(buyer, seller, itemId);

        callJson(
                HttpMethod.PATCH,
                ITEMS + "/" + itemId,
                seller.uid(),
                Map.of("visibility", "PRIVATE"),
                200);
        JsonNode subject = conversation(buyer, chatId, 200).path("subject");
        assertThat(subject.path("listed").asBoolean()).isFalse();
        assertThat(subject.path("askingPriceText").isNull()).isTrue();
        assertThat(subject.path("name").asString()).isNotBlank();
        assertThat(subject.path("imageUrl").asString()).isNotBlank();
        // Its owner keeps everything.
        JsonNode mine = conversation(seller, chatId, 200).path("subject");
        assertThat(mine.path("askingPriceText").asString()).isEqualTo("$12");
        assertThat(mine.path("copies").asInt()).isEqualTo(2);

        // Deleted: still pinned, no longer listed, no copies for anyone.
        callJson(HttpMethod.DELETE, ITEMS + "/" + itemId, seller.uid(), null, 204);
        assertThat(conversation(buyer, chatId, 200).path("subject").path("listed").asBoolean())
                .isFalse();
        assertThat(conversation(seller, chatId, 200).path("subject").path("copies").isNull())
                .isTrue();
    }

    @Test
    void sharingOwnCardPinsItAndShowsItsPriceToThatCollectorOnly() {
        Collector seller = collector("r4-share-seller");
        Collector buyer = collector("r4-share-buyer");
        Collector stranger = collector("r4-share-stranger");
        String privateCard = card(seller, 1, "PRIVATE", "85% TCG");
        String chatId =
                callJson(
                                HttpMethod.POST,
                                CONVERSATIONS,
                                seller.uid(),
                                Map.of("recipientId", buyer.id().toString()),
                                201)
                        .path("id")
                        .asString();

        JsonNode shared =
                callJson(
                        HttpMethod.POST,
                        CONVERSATIONS + "/" + chatId + "/messages",
                        seller.uid(),
                        Map.of(
                                "kind",
                                "CARD_LINK",
                                "inventoryItemId",
                                privateCard,
                                "body",
                                "I have it for your wishlist. Interested?"),
                        201);
        assertThat(shared.path("payload").path("card").path("name").asString()).isNotBlank();
        assertThat(shared.path("payload").path("item").path("itemId").asString())
                .isEqualTo(privateCard);
        assertThat(shared.path("payload").path("item").path("askingPriceText").asString())
                .isEqualTo("85% TCG");
        JsonNode read = messages(buyer, chatId).path("items").get(0);
        assertThat(read.path("payload").path("item").path("askingPriceText").asString())
                .isEqualTo("85% TCG");
        assertNoPrivateData(read);
        JsonNode subject = conversation(buyer, chatId, 200).path("subject");
        assertThat(subject.path("id").asString()).isEqualTo(privateCard);
        assertThat(subject.path("ownerId").asString()).isEqualTo(seller.id().toString());
        assertThat(subject.path("listed").asBoolean()).isTrue();
        // A private card stays private for everybody else: a stranger cannot pin it.
        startAbout(stranger, seller, privateCard, null, 404);

        // Only one's own live card can be shared this way.
        String buyers = card(buyer, 1, "PUBLIC", "$1");
        callJson(
                HttpMethod.POST,
                CONVERSATIONS + "/" + chatId + "/messages",
                seller.uid(),
                Map.of("kind", "CARD_LINK", "inventoryItemId", buyers),
                400);
        callJson(
                HttpMethod.POST,
                CONVERSATIONS + "/" + chatId + "/messages",
                seller.uid(),
                Map.of(
                        "kind",
                        "CARD_LINK",
                        "inventoryItemId",
                        privateCard,
                        "cardPrintingId",
                        subject.path("printingId").asString()),
                400);
    }

    @Test
    void blockedPairsNeitherPinNorReadTheChat() {
        Collector seller = collector("r4-block-seller");
        Collector buyer = collector("r4-block-buyer");
        String itemId = card(seller, 1, "PUBLIC", "$3");
        String chatId = chatAbout(buyer, seller, itemId);
        callJson(
                HttpMethod.POST, "/api/v1/users/" + buyer.id() + "/block", seller.uid(), null, 200);

        startAbout(buyer, seller, itemId, null, 403);
        conversation(buyer, chatId, 404);
        conversation(seller, chatId, 404);
        // A participant only: nobody else reads it.
        Collector stranger = collector("r4-block-stranger");
        conversation(stranger, chatId, 404);
    }

    @Test
    void theOtherCollectorsPlaceIsShownOnlyWhileTheyAreDiscoverable() {
        Collector seller = collector("r4-place-seller");
        Collector buyer = collector("r4-place-buyer");
        String chatId = chatAbout(buyer, seller, card(seller, 1, "PUBLIC", "$2"));
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                seller.uid(),
                com.orenjitrade.api.inventory.InventoryTestSupport.privacy(false, "MEMBERS"),
                200);
        assertThat(
                        conversation(buyer, chatId, 200).path("other").path("place").isMissingNode()
                                || conversation(buyer, chatId, 200)
                                        .path("other")
                                        .path("place")
                                        .isNull())
                .isTrue();
    }

    private static JsonNode find(JsonNode page, String id) {
        for (JsonNode item : page.path("items")) {
            if (item.path("id").asString().equals(id)) {
                return item;
            }
        }
        throw new AssertionError("conversation " + id + " not listed");
    }
}
