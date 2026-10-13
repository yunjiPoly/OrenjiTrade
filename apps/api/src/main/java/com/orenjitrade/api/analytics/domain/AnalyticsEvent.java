package com.orenjitrade.api.analytics.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * A schema-versioned analytics event (ARCHITECTURE.md section 8, ADR 0017). Serialised with the
 * column names of the BigQuery {@code events} table ({@code event_id}, {@code event_type}, {@code
 * event_version}, {@code occurred_at}, {@code actor_hash}, {@code region_code}, {@code
 * subdivision_code}, {@code payload}).
 *
 * <p>Privacy by construction: the actor is an HMAC ({@link ActorHasher}), never a user id or an
 * e-mail; geography is a platform region code and an ISO 3166-2 subdivision code only (never a
 * city, a coordinate or a distance); the payload accepts strings (scrubbed by {@link
 * AnalyticsText}), whole numbers, booleans and string lists, never floating-point numbers (so no
 * coordinate can slip in), and refuses location or contact keys; keys ending in {@code _hash} must
 * hold hex digests (pseudonymous ids of other accounts).
 *
 * @param eventId idempotency key
 * @param type event name, e.g. {@code search_performed}
 * @param version payload schema version
 * @param occurredAt when it happened (UTC)
 * @param actorHash pseudonymous actor, {@code null} for signed-out visitors
 * @param regionCode platform region code, e.g. {@code americas-north}
 * @param subdivisionCode ISO 3166-2 code (or a whole-country alpha-2 pseudo-subdivision)
 * @param payload event-specific attributes (no PII)
 */
@JsonInclude(JsonInclude.Include.ALWAYS)
public record AnalyticsEvent(
        @JsonProperty("event_id") UUID eventId,
        @JsonProperty("event_type") String type,
        @JsonProperty("event_version") int version,
        @JsonProperty("occurred_at") Instant occurredAt,
        @JsonProperty("actor_hash") @Nullable String actorHash,
        @JsonProperty("region_code") @Nullable String regionCode,
        @JsonProperty("subdivision_code") @Nullable String subdivisionCode,
        @JsonProperty("payload") Map<String, Object> payload) {

    /** Current payload schema version of every Phase 4 event. */
    public static final int VERSION = 1;

    static final Pattern TYPE = Pattern.compile("^[a-z][a-z0-9_.]{2,63}$");
    static final Pattern KEY = Pattern.compile("^[a-z][a-z0-9_]{0,39}$");
    static final Pattern REGION_CODE = Pattern.compile("^[a-z]+(-[a-z]+){0,3}$");
    static final Pattern SUBDIVISION_CODE = Pattern.compile("^[A-Z]{2}(-[A-Z0-9]{1,3})?$");
    static final Pattern ACTOR_HASH = Pattern.compile("^[0-9a-f]{16,64}$");

    /** Payload keys holding pseudonymous hashes ({@link ActorHasher}): validated, not scrubbed. */
    static final String HASH_SUFFIX = "_hash";

    static final int MAX_LIST = 20;

    /** Keys that would describe a precise location or contact data: always refused. */
    static final Set<String> FORBIDDEN_KEYS =
            Set.of(
                    "lat",
                    "lng",
                    "lon",
                    "latitude",
                    "longitude",
                    "coordinates",
                    "point",
                    "public_point",
                    "home_point",
                    "centre",
                    "center",
                    "trading_area",
                    "city",
                    "distance",
                    "distance_km",
                    "distance_bucket",
                    "radius",
                    "radius_km",
                    "grid_cell",
                    "geo_cell",
                    "email",
                    "phone",
                    "user_id",
                    "handle",
                    "ip");

    public AnalyticsEvent {
        if (!TYPE.matcher(type).matches()) {
            throw new IllegalArgumentException("Invalid analytics event type");
        }
        if (actorHash != null && !ACTOR_HASH.matcher(actorHash).matches()) {
            throw new IllegalArgumentException("actorHash must be a hex digest");
        }
        if (regionCode != null && !REGION_CODE.matcher(regionCode).matches()) {
            throw new IllegalArgumentException("regionCode must be a platform region code");
        }
        if (subdivisionCode != null && !SUBDIVISION_CODE.matcher(subdivisionCode).matches()) {
            throw new IllegalArgumentException("subdivisionCode must be a subdivision code");
        }
        payload = checkedPayload(payload);
    }

    /** A new event of {@code type} with a random id and the current schema version. */
    public static AnalyticsEvent of(
            String type,
            Instant occurredAt,
            @Nullable String actorHash,
            @Nullable String regionCode,
            @Nullable String subdivisionCode,
            Map<String, Object> payload) {
        return new AnalyticsEvent(
                UUID.randomUUID(),
                type,
                VERSION,
                occurredAt,
                actorHash,
                regionCode,
                subdivisionCode,
                payload);
    }

    private static Map<String, Object> checkedPayload(Map<String, Object> payload) {
        Map<String, Object> checked = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : payload.entrySet()) {
            String key = entry.getKey();
            if (!KEY.matcher(key).matches()
                    || FORBIDDEN_KEYS.contains(key.toLowerCase(Locale.ROOT))) {
                throw new IllegalArgumentException("Refused analytics payload key " + key);
            }
            Object value = entry.getValue();
            if (value == null) {
                continue;
            }
            checked.put(key, checkedValue(key, value));
        }
        return Collections.unmodifiableMap(checked);
    }

    private static Object checkedValue(String key, Object value) {
        if (key.endsWith(HASH_SUFFIX)) {
            if (!(value instanceof String hash) || !ACTOR_HASH.matcher(hash).matches()) {
                throw new IllegalArgumentException(key + " must be a hex digest");
            }
            return hash;
        }
        if (value instanceof String text) {
            String clean = AnalyticsText.sanitize(text);
            return clean == null ? "" : clean;
        }
        if (value instanceof Long || value instanceof Integer || value instanceof Boolean) {
            return value;
        }
        if (value instanceof UUID id) {
            return id.toString();
        }
        if (value instanceof Enum<?> constant) {
            return constant.name();
        }
        if (value instanceof List<?> list) {
            if (list.size() > MAX_LIST) {
                throw new IllegalArgumentException("Analytics payload list too long: " + key);
            }
            return list.stream()
                    .map(
                            element -> {
                                if (!(element instanceof String) && !(element instanceof Enum<?>)) {
                                    throw new IllegalArgumentException(
                                            "Analytics payload lists hold strings only: " + key);
                                }
                                String text =
                                        element instanceof Enum<?> constant
                                                ? constant.name()
                                                : AnalyticsText.sanitize((String) element);
                                return text == null ? "" : text;
                            })
                    .toList();
        }
        throw new IllegalArgumentException(
                "Unsupported analytics payload value for "
                        + key
                        + " (strings, whole numbers, booleans and string lists only)");
    }
}
