package com.orenjitrade.api.common.webhooks;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.jspecify.annotations.Nullable;

/**
 * Timestamped HMAC-SHA256 webhook signatures in the Stripe format ({@code t=<unix seconds>, v1=<hex
 * HMAC of "<t>.<payload>">}) for the Phase 10 providers (billing and donations: the fake providers'
 * {@code X-Fake-Signature} and Stripe's {@code Stripe-Signature}). The same scheme as the payments
 * module's own helper; comparison is constant-time and timestamps outside the tolerance are refused
 * (replay protection besides the event-id idempotency).
 */
public final class SignedWebhooks {

    private SignedWebhooks() {}

    /** The header value signing {@code payload} at {@code timestamp} with {@code secret}. */
    public static String header(String secret, Instant timestamp, String payload) {
        long seconds = timestamp.getEpochSecond();
        return "t=" + seconds + ",v1=" + hmacHex(secret, seconds + "." + payload);
    }

    /**
     * Verifies a signature header.
     *
     * @throws InvalidSignatureException when missing, malformed, outside the tolerance or wrong
     */
    public static void verify(
            @Nullable String header,
            String payload,
            String secret,
            Duration tolerance,
            Instant now,
            @Nullable String claimedType) {
        if (header == null || header.isBlank()) {
            throw new InvalidSignatureException("Missing signature header", claimedType);
        }
        Long timestamp = null;
        List<String> signatures = new ArrayList<>();
        for (String part : header.split(",")) {
            int equals = part.indexOf('=');
            if (equals <= 0) {
                continue;
            }
            String key = part.substring(0, equals).trim();
            String value = part.substring(equals + 1).trim();
            if (key.equals("t")) {
                try {
                    timestamp = Long.parseLong(value);
                } catch (NumberFormatException e) {
                    throw new InvalidSignatureException(
                            "Malformed signature timestamp", claimedType);
                }
            } else if (key.equals("v1")) {
                signatures.add(value);
            }
        }
        if (timestamp == null || signatures.isEmpty()) {
            throw new InvalidSignatureException("Malformed signature header", claimedType);
        }
        Instant signedAt = Instant.ofEpochSecond(timestamp);
        if (Duration.between(signedAt, now).abs().compareTo(tolerance) > 0) {
            throw new InvalidSignatureException(
                    "Signature timestamp outside the tolerance", claimedType);
        }
        byte[] expected =
                hmacHex(secret, timestamp + "." + payload).getBytes(StandardCharsets.US_ASCII);
        for (String signature : signatures) {
            if (MessageDigest.isEqual(expected, signature.getBytes(StandardCharsets.US_ASCII))) {
                return;
            }
        }
        throw new InvalidSignatureException("Signature mismatch", claimedType);
    }

    /** Lower-case hex HMAC-SHA256 of {@code message}. */
    public static String hmacHex(String secret, String message) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(message.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA256 unavailable", e);
        }
    }

    /** The webhook's signature is missing, invalid or outside the tolerance. */
    public static final class InvalidSignatureException extends RuntimeException {

        private final @Nullable String claimedType;

        public InvalidSignatureException(String message, @Nullable String claimedType) {
            super(message);
            this.claimedType = claimedType;
        }

        /** The type the unverified body claims (stored for the admin views). */
        public @Nullable String claimedType() {
            return claimedType;
        }
    }

    /** A correctly signed webhook body could not be read. */
    public static final class UnreadablePayloadException extends RuntimeException {

        public UnreadablePayloadException(String message) {
            super(message);
        }
    }
}
