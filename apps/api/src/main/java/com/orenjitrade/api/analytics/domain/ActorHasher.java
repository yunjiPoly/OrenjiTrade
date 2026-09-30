package com.orenjitrade.api.analytics.domain;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.jspecify.annotations.Nullable;

/**
 * Pseudonymises account ids for analytics: {@code HMAC-SHA256(ANALYTICS_ACTOR_SALT, id)}, first 128
 * bits in hex. Stable (the same account always maps to the same hash, so funnels and unique counts
 * work) but not reversible without the server-side salt; raw ids and e-mails never reach an event.
 */
public final class ActorHasher {

    private static final String HMAC = "HmacSHA256";
    private static final int HEX_LENGTH = 32;

    private final SecretKeySpec key;

    public ActorHasher(String salt) {
        if (salt.isBlank()) {
            throw new IllegalArgumentException("The analytics actor salt must not be blank");
        }
        this.key = new SecretKeySpec(salt.getBytes(StandardCharsets.UTF_8), HMAC);
    }

    /** The hash of {@code id}; {@code null} for {@code null} (signed-out visitors). */
    public @Nullable String hash(@Nullable UUID id) {
        if (id == null) {
            return null;
        }
        try {
            Mac mac = Mac.getInstance(HMAC);
            mac.init(key);
            byte[] digest =
                    mac.doFinal(
                            ByteBuffer.allocate(16)
                                    .putLong(id.getMostSignificantBits())
                                    .putLong(id.getLeastSignificantBits())
                                    .array());
            return HexFormat.of().formatHex(digest).substring(0, HEX_LENGTH);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new IllegalStateException("HMAC-SHA256 unavailable", e);
        }
    }
}
