package com.orenjitrade.api.users.domain;

import java.util.Locale;
import java.util.Set;

/**
 * Handles no collector may take: brand names, routes of the web app and words that would look
 * official. Checked at provisioning and, later, when a user picks a handle.
 */
public final class ReservedHandles {

    private static final Set<String> RESERVED =
            Set.of(
                    "admin",
                    "administrator",
                    "root",
                    "system",
                    "support",
                    "help",
                    "staff",
                    "moderator",
                    "mod",
                    "official",
                    "orenji",
                    "orenjitrade",
                    "api",
                    "www",
                    "app",
                    "mail",
                    "legal",
                    "terms",
                    "privacy",
                    "security",
                    "abuse",
                    "billing",
                    "payments",
                    "login",
                    "logout",
                    "register",
                    "signup",
                    "signin",
                    "settings",
                    "profile",
                    "collectors",
                    "collector",
                    "map",
                    "inventory",
                    "search",
                    "messages",
                    "wishlist",
                    "community",
                    "me",
                    "null",
                    "undefined",
                    "anonymous",
                    "deleted");

    private ReservedHandles() {}

    public static boolean isReserved(String handle) {
        return RESERVED.contains(handle.toLowerCase(Locale.ROOT));
    }
}
