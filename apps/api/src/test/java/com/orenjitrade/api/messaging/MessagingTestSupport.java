package com.orenjitrade.api.messaging;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Shared bodies and records of the messaging integration tests. */
public final class MessagingTestSupport {

    private MessagingTestSupport() {}

    /** A test member. */
    public record Member(String uid, UUID id, String handle) {}

    /** A profile body that completes the profile (MEMBERS_WITH_PROFILE messaging rule). */
    public static Map<String, Object> profile(String handle) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("handle", handle);
        body.put("displayName", "Collector " + handle);
        body.put("bio", "Trading cards around town");
        body.put("games", List.of("yugioh"));
        body.put("languages", List.of("en"));
        return body;
    }

    /** Privacy settings with the given messaging permission and online-status switch. */
    public static Map<String, Object> privacy(String messaging, boolean showOnlineStatus) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("discoverable", false);
        body.put("showDistance", true);
        body.put("showOnlineStatus", showOnlineStatus);
        body.put("showLastActive", true);
        body.put("profileVisibility", "MEMBERS");
        body.put("messagingPermission", messaging);
        body.put("wishlistVisible", false);
        body.put("searchDiscoverable", true);
        return body;
    }

    /** A TEXT message body. */
    public static Map<String, Object> text(String body) {
        Map<String, Object> message = new LinkedHashMap<>();
        message.put("kind", "TEXT");
        message.put("body", body);
        return message;
    }

    /** A message body of any kind. */
    public static Map<String, Object> message(
            String kind, @Nullable String body, String field, @Nullable Object value) {
        Map<String, Object> message = new LinkedHashMap<>();
        message.put("kind", kind);
        if (body != null) {
            message.put("body", body);
        }
        if (value != null) {
            message.put(field, value.toString());
        }
        return message;
    }
}
