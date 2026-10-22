package com.orenjitrade.api.community.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.binders.domain.BinderLink;
import com.orenjitrade.api.binders.domain.ChatDeckCore;
import com.orenjitrade.api.messaging.domain.UploadKind;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The pure rules of stage R11's rooms: the room list's one-line preview, the upload limits per
 * kind, and how a shared binder reads in a post (deck core badge, price and picture only while
 * buyers can find it, never for an owner the reader is blocked with).
 */
class RoomRulesTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final UUID BINDER = UUID.fromString("00000000-0000-4000-8b00-000000000202");
    private static final UUID OWNER = UUID.fromString("00000000-0000-4000-8000-000000000002");

    @Test
    void thePreviewIsOneLineOfAtMost140Characters() {
        assertThat(ChannelLastPost.preview("  Looking for\n\nNibiru   in NM  "))
                .isEqualTo("Looking for Nibiru in NM");
        String exact = "a".repeat(140);
        assertThat(ChannelLastPost.preview(exact)).isEqualTo(exact);
        String cut = ChannelLastPost.preview("b".repeat(139) + " and more text after that");
        assertThat(cut).hasSize(140).endsWith("…").startsWith("bbb");
        // A word boundary space is not kept before the ellipsis.
        assertThat(ChannelLastPost.preview("c".repeat(138) + " dddd"))
                .isEqualTo("c".repeat(138) + "…");
        // An emoji is never cut in half.
        String emoji = ChannelLastPost.preview("e".repeat(138) + "😀" + "tail of the post");
        assertThat(emoji).doesNotContain("\uD83D…").endsWith("…");
        assertThat(Character.isHighSurrogate(emoji.charAt(emoji.length() - 2))).isFalse();
    }

    @Test
    void communityPhotosAreThreeMegabytesAtMost() {
        assertThat(UploadKind.COMMUNITY.maxBytes()).isEqualTo(3 * 1024 * 1024);
        assertThat(UploadKind.COMMUNITY.maxLabel()).isEqualTo("3 MB");
        assertThat(UploadKind.MESSAGE.maxBytes()).isEqualTo(8 * 1024 * 1024);
        assertThat(CommunityService.PHOTOS_MAX).isEqualTo(4);
    }

    private static JsonNode sharedBinder() {
        return JSON.readTree(
                "{\"binder\":{\"binderId\":\""
                        + BINDER
                        + "\",\"name\":\"Moth Queen core\",\"ownerHandle\":\"collector2\"}}");
    }

    private static ChatDeckCore core(boolean sellsAsCore, boolean effectivePublic, Instant soldAt) {
        return new ChatDeckCore(
                BINDER,
                OWNER,
                "Moth Queen core",
                sellsAsCore,
                "$95",
                "http://localhost/core.jpg",
                soldAt,
                effectivePublic);
    }

    private static BinderLink read(Map<UUID, ChatDeckCore> binders, Set<UUID> hidden) {
        PostPayload payload =
                CommunityService.payload(sharedBinder(), Map.of(), binders, hidden, List.of());
        assertThat(payload.binder()).isNotNull();
        return payload.binder();
    }

    @Test
    void aSharedDeckCoreShowsItsBadgePriceAndPictureOnlyWhileBuyersCanFindIt() {
        BinderLink findable = read(Map.of(BINDER, core(true, true, null)), Set.of());
        assertThat(findable.deckCore()).isTrue();
        assertThat(findable.askingPriceText()).isEqualTo("$95");
        assertThat(findable.imageUrl()).isEqualTo("http://localhost/core.jpg");
        assertThat(findable.name()).isEqualTo("Moth Queen core");
        assertThat(findable.ownerHandle()).isEqualTo("collector2");

        BinderLink plain = read(Map.of(BINDER, core(false, true, null)), Set.of());
        assertThat(plain.deckCore()).isFalse();
        assertThat(plain.askingPriceText()).isNull();
        assertThat(plain.imageUrl()).isEqualTo("http://localhost/core.jpg");

        for (BinderLink gone :
                List.of(
                        read(Map.of(BINDER, core(true, false, null)), Set.of()),
                        read(Map.of(BINDER, core(true, true, Instant.EPOCH)), Set.of()),
                        read(Map.of(BINDER, core(true, true, null)), Set.of(OWNER)),
                        read(Map.of(), Set.of()))) {
            assertThat(gone.deckCore()).isFalse();
            assertThat(gone.askingPriceText()).isNull();
            assertThat(gone.imageUrl()).isNull();
            assertThat(gone.id()).isEqualTo(BINDER);
        }
    }

    @Test
    void aPostWithoutLinksOrPhotosHasTheEmptyPayload() {
        assertThat(
                        CommunityService.payload(
                                JSON.readTree("{}"), Map.of(), Map.of(), Set.of(), List.of()))
                .isSameAs(PostPayload.EMPTY);
        PostPhoto photo = new PostPhoto("http://localhost/p.jpg", 10, 20);
        assertThat(
                        CommunityService.payload(
                                        JSON.readTree("{}"),
                                        Map.of(),
                                        Map.of(),
                                        Set.of(),
                                        List.of(photo))
                                .photos())
                .containsExactly(photo);
    }
}
