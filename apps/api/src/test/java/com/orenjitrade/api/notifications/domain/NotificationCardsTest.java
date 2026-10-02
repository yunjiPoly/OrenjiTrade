package com.orenjitrade.api.notifications.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.offers.domain.OfferCard;
import java.util.LinkedHashMap;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * The card of a notification (ADR 0015): name, game and picture are added only when known, and an
 * API-relative picture becomes absolute against the request origin when listed (unchanged outside a
 * request, e.g. realtime pushes).
 */
class NotificationCardsTest {

    private static final String PICTURE =
            "/api/v1/public/card-images/00000000-0000-4000-8d00-000000000001";

    @AfterEach
    void clearRequest() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    void addsOnlyTheKnownCardFields() {
        Map<String, @Nullable Object> data = new LinkedHashMap<>();
        NotificationCards.put(data, "Azure-Eyes Sky Dragon", "yugioh", PICTURE);
        assertThat(data)
                .containsEntry("cardName", "Azure-Eyes Sky Dragon")
                .containsEntry("game", "yugioh")
                .containsEntry("cardImageUrl", PICTURE);

        Map<String, @Nullable Object> partial = new LinkedHashMap<>();
        NotificationCards.put(partial, "Tidebinder", " ", null);
        assertThat(partial).containsOnlyKeys("cardName");

        Map<String, @Nullable Object> unknown = new LinkedHashMap<>();
        OfferCard.UNKNOWN.putInto(unknown);
        assertThat(unknown).as("an unknown card adds nothing").isEmpty();
        OfferCard.of("Azure-Eyes Sky Dragon", "yugioh", PICTURE).putInto(unknown);
        assertThat(unknown).containsEntry("cardImageUrl", PICTURE).hasSize(3);
    }

    @Test
    void relativePicturesBecomeAbsoluteOnlyInsideARequest() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("offerId", "o-1");
        data.put("cardImageUrl", PICTURE);
        assertThat(NotificationCards.forClients(data))
                .as("realtime pushes keep the API-relative path")
                .containsEntry("cardImageUrl", PICTURE);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setScheme("http");
        request.setServerName("localhost");
        request.setServerPort(8080);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        Map<String, Object> listed = NotificationCards.forClients(data);
        assertThat(listed)
                .containsEntry("cardImageUrl", "http://localhost:8080" + PICTURE)
                .containsEntry("offerId", "o-1");
        assertThat(data)
                .as("the stored data is not changed")
                .containsEntry("cardImageUrl", PICTURE);

        Map<String, Object> absolute = Map.of("cardImageUrl", "https://cdn.example/card.jpg");
        assertThat(NotificationCards.forClients(absolute)).isSameAs(absolute);
        Map<String, Object> none = Map.of("deepLink", "/wishlist/1");
        assertThat(NotificationCards.forClients(none)).isSameAs(none);
    }
}
