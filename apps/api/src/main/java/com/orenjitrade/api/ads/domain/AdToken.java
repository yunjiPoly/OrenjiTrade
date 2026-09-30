package com.orenjitrade.api.ads.domain;

import com.orenjitrade.api.ads.domain.AdEnums.PlacementKey;
import com.orenjitrade.api.common.webhooks.SignedWebhooks;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Signed serve tokens of served ads ({@code v1.<base64url payload>.<hex HMAC-SHA256>}): the payload
 * names the creative, the placement, the context's public grid cell, the pseudonymous viewer hash,
 * the issue time and a nonce (the serve id). {@code POST /ads/{id}/impression} and {@code GET
 * /ads/{id}/click} record at most one impression and one click per token, and only for tokens this
 * server issued within {@code maxAge} for that creative, so counters cannot be inflated by
 * replaying or forging requests. The token never carries an account id or a coordinate.
 */
public final class AdToken {

    static final String VERSION = "v1";

    private final String secret;
    private final Duration maxAge;
    private final JsonMapper jsonMapper;

    public AdToken(String secret, Duration maxAge, JsonMapper jsonMapper) {
        if (secret.isBlank()) {
            throw new IllegalArgumentException("The ad token secret must not be blank");
        }
        this.secret = secret;
        this.maxAge = maxAge;
        this.jsonMapper = jsonMapper;
    }

    /**
     * A verified token.
     *
     * @param serveId nonce (one impression and one click per serve)
     * @param creativeId the creative served
     * @param placement where it was served
     * @param geoCell public grid cell of the context
     * @param userHash pseudonymous viewer hash
     * @param issuedAt issue time
     */
    public record Serve(
            UUID serveId,
            UUID creativeId,
            PlacementKey placement,
            @Nullable String geoCell,
            @Nullable String userHash,
            Instant issuedAt) {}

    /** Issues a token for a served creative. */
    public String issue(
            UUID creativeId,
            PlacementKey placement,
            @Nullable String geoCell,
            @Nullable String userHash,
            Instant now) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("n", UUID.randomUUID().toString());
        payload.put("c", creativeId.toString());
        payload.put("p", placement.name());
        if (geoCell != null) {
            payload.put("g", geoCell);
        }
        if (userHash != null) {
            payload.put("u", userHash);
        }
        payload.put("t", now.getEpochSecond());
        String body =
                Base64.getUrlEncoder()
                        .withoutPadding()
                        .encodeToString(
                                jsonMapper
                                        .writeValueAsString(payload)
                                        .getBytes(StandardCharsets.UTF_8));
        return VERSION + "." + body + "." + SignedWebhooks.hmacHex(secret, VERSION + "." + body);
    }

    /** The serve of a valid token for {@code creativeId}, empty for anything else. */
    public Optional<Serve> verify(@Nullable String token, UUID creativeId, Instant now) {
        if (token == null || token.length() > 1000) {
            return Optional.empty();
        }
        String[] parts = token.split("\\.");
        if (parts.length != 3 || !VERSION.equals(parts[0])) {
            return Optional.empty();
        }
        byte[] expected =
                SignedWebhooks.hmacHex(secret, parts[0] + "." + parts[1])
                        .getBytes(StandardCharsets.US_ASCII);
        if (!MessageDigest.isEqual(expected, parts[2].getBytes(StandardCharsets.US_ASCII))) {
            return Optional.empty();
        }
        try {
            JsonNode payload =
                    jsonMapper.readTree(
                            new String(
                                    Base64.getUrlDecoder().decode(parts[1]),
                                    StandardCharsets.UTF_8));
            UUID creative = UUID.fromString(payload.path("c").asString());
            if (!creative.equals(creativeId)) {
                return Optional.empty();
            }
            Instant issuedAt = Instant.ofEpochSecond(payload.path("t").asLong());
            if (issuedAt.isAfter(now.plusSeconds(60)) || issuedAt.plus(maxAge).isBefore(now)) {
                return Optional.empty();
            }
            return Optional.of(
                    new Serve(
                            UUID.fromString(payload.path("n").asString()),
                            creative,
                            PlacementKey.valueOf(payload.path("p").asString()),
                            text(payload, "g"),
                            text(payload, "u"),
                            issuedAt));
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    private static @Nullable String text(JsonNode node, String field) {
        return node.path(field).isString() ? node.path(field).asString() : null;
    }
}
