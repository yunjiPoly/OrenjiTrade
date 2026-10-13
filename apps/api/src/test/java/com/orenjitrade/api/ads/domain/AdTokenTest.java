package com.orenjitrade.api.ads.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.ads.domain.AdEnums.PlacementKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/** Signed serve tokens: valid for the creative they name, within their age, never forged. */
class AdTokenTest {

    static final Instant NOW = Instant.parse("2026-09-30T12:00:00Z");

    private final AdToken tokens =
            new AdToken("unit-test-ads-secret", Duration.ofHours(24), JsonMapper.builder().build());

    @Test
    void aTokenIsValidForItsCreativeOnlyAndCarriesNoAccountId() {
        UUID creative = UUID.randomUUID();
        String hash = "0123456789abcdef0123456789abcdef";
        String token =
                tokens.issue(
                        creative, PlacementKey.MAP_PANEL, "americas-north", "CA-QC", hash, NOW);
        AdToken.Serve serve = tokens.verify(token, creative, NOW.plusSeconds(60)).orElseThrow();
        assertThat(serve.placement()).isEqualTo(PlacementKey.MAP_PANEL);
        assertThat(serve.regionCode()).isEqualTo("americas-north");
        assertThat(serve.subdivisionCode()).isEqualTo("CA-QC");
        assertThat(serve.userHash()).isEqualTo(hash);
        assertThat(tokens.issue(creative, PlacementKey.MAP_PANEL, null, null, null, NOW))
                .as("each serve gets its own nonce")
                .isNotEqualTo(
                        tokens.issue(creative, PlacementKey.MAP_PANEL, null, null, null, NOW));

        assertThat(tokens.verify(token, UUID.randomUUID(), NOW)).isEmpty();
        assertThat(tokens.verify(token, creative, NOW.plus(Duration.ofHours(25)))).isEmpty();
        assertThat(tokens.verify(null, creative, NOW)).isEmpty();
        assertThat(tokens.verify("v1.x.y", creative, NOW)).isEmpty();
    }

    @Test
    void aTamperedPayloadOrAnotherSecretIsRefused() {
        UUID creative = UUID.randomUUID();
        String token = tokens.issue(creative, PlacementKey.SEARCH_SPONSORED, null, null, null, NOW);
        String[] parts = token.split("\\.");
        String payload =
                new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8)
                        .replace("SEARCH_SPONSORED", "MAP_PANEL");
        String tampered =
                parts[0]
                        + "."
                        + Base64.getUrlEncoder()
                                .withoutPadding()
                                .encodeToString(payload.getBytes(StandardCharsets.UTF_8))
                        + "."
                        + parts[2];
        assertThat(tokens.verify(tampered, creative, NOW)).isEmpty();
        AdToken other =
                new AdToken(
                        "another-secret-value", Duration.ofHours(24), JsonMapper.builder().build());
        assertThat(other.verify(token, creative, NOW)).isEmpty();
    }
}
