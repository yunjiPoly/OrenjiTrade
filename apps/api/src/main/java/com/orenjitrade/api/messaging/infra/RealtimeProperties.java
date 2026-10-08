package com.orenjitrade.api.messaging.infra;

import java.util.regex.Pattern;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code orenji.realtime.*} settings of the cross-instance realtime fan-out.
 *
 * @param channelPrefix prefix of the Redis pub/sub channel of one account ({@code
 *     <prefix><userId>}; env {@code REALTIME_CHANNEL_PREFIX}). Every instance of one deployment
 *     must use the same value. Redis pub/sub ignores the logical database, so a second stack on the
 *     same Redis server (the local E2E API next to {@code npm run dev}) needs its own prefix, or a
 *     push for a seed account (same id in every database) would reach the other stack's sessions.
 */
@ConfigurationProperties(prefix = "orenji.realtime")
public record RealtimeProperties(@DefaultValue(DEFAULT_CHANNEL_PREFIX) String channelPrefix) {

    /** Channel prefix of the deployed and the developer API. */
    public static final String DEFAULT_CHANNEL_PREFIX = "rt:user:";

    /**
     * Letters, digits and {@code : _ . -}: no glob characters (the prefix feeds a pattern topic).
     */
    private static final Pattern ALLOWED = Pattern.compile("[A-Za-z0-9:_.\\-]{1,64}");

    public RealtimeProperties {
        if (channelPrefix == null || !ALLOWED.matcher(channelPrefix).matches()) {
            throw new IllegalArgumentException(
                    "orenji.realtime.channel-prefix must be 1-64 letters, digits or ':_.-' (got \""
                            + channelPrefix
                            + "\")");
        }
    }

    /** The channel of one account. */
    public String channelOf(Object userId) {
        return channelPrefix + userId;
    }

    /** The pattern every instance subscribes to. */
    public String pattern() {
        return channelPrefix + "*";
    }
}
