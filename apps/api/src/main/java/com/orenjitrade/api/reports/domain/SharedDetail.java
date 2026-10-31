package com.orenjitrade.api.reports.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.Locale;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * A private detail a collector shared in a chat that staff never read (spec 15.8.4, web stage WH1):
 * the shipping address and the e-Transfer email of the chat's "+" menu. The phone and the web put
 * them in the message box as {@code "Ship to:\n{address}"} and {@code "e-Transfer to {email}"} (the
 * collector may edit the line before sending), so a message is recognised by how it starts. The
 * reported conversation sends such a message to staff as its kind only, without its text.
 */
@Schema(
        name = "SharedDetail",
        description =
                "A shipping address or an e-Transfer email shared in the chat: its text is hidden"
                        + " from staff")
public enum SharedDetail {
    SHIPPING_ADDRESS,
    ETRANSFER_EMAIL;

    private static final Pattern ADDRESS = Pattern.compile("^ship\\s+to\\s*:");
    private static final Pattern ETRANSFER = Pattern.compile("^e-?\\s?transfer\\s+to\\b");

    /**
     * The detail a message's text shares, or {@code null} for any other message.
     *
     * @param body the message's text (any kind: a card or a binder may carry text too)
     */
    public static @Nullable SharedDetail of(@Nullable String body) {
        if (body == null) {
            return null;
        }
        String start = body.strip().toLowerCase(Locale.ROOT);
        if (ADDRESS.matcher(start).find()) {
            return SHIPPING_ADDRESS;
        }
        if (ETRANSFER.matcher(start).find()) {
            return ETRANSFER_EMAIL;
        }
        return null;
    }
}
