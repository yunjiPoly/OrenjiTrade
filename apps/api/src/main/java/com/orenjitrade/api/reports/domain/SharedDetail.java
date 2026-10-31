package com.orenjitrade.api.reports.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.Locale;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * A private detail a collector shared in a chat that staff never read (spec 15.8.4, web stage WH1):
 * the shipping address and the e-Transfer email of the chat's "+" menu. The phone and the web put
 * them in the message box as {@code "Ship to:\n{address}"} and {@code "e-Transfer to {email}"}, the
 * phone after what is already typed (on a line of its own), and the collector may edit the text
 * before sending. So a message is recognised by the template anywhere in it ({@code "ship to:"}, or
 * {@code "e-transfer to"} at the start of a line), or by an email address or a phone number next to
 * the words e-Transfer or Interac. Hiding a message too many is the safe side. The reported
 * conversation sends such a message to staff as its kind only, without its text.
 */
@Schema(
        name = "SharedDetail",
        description =
                "A shipping address or an e-Transfer email shared in the chat: its text is hidden"
                        + " from staff")
public enum SharedDetail {
    SHIPPING_ADDRESS,
    ETRANSFER_EMAIL;

    /** Unicode whitespace (a no-break space too), lines anywhere in the message. */
    private static final int FLAGS = Pattern.MULTILINE | Pattern.UNICODE_CHARACTER_CLASS;

    private static final Pattern ADDRESS = Pattern.compile("\\bship\\s+to\\s*:", FLAGS);
    private static final Pattern ETRANSFER_LINE =
            Pattern.compile("^\\s*e-?\\s?transfer\\s+to\\b", FLAGS);
    private static final Pattern ETRANSFER_WORD = Pattern.compile("e-?\\s?transfer|interac", FLAGS);
    private static final Pattern EMAIL = Pattern.compile("[^\\s@]+@[^\\s@]+\\.[^\\s@]+", FLAGS);
    private static final Pattern PHONE = Pattern.compile("\\+?\\d(?:[\\s().-]?\\d){6,}", FLAGS);

    /**
     * The detail a message's text shares, or {@code null} for any other message.
     *
     * @param body the message's text (any kind: a card or a binder may carry text too)
     */
    public static @Nullable SharedDetail of(@Nullable String body) {
        if (body == null) {
            return null;
        }
        String text = body.toLowerCase(Locale.ROOT);
        if (ADDRESS.matcher(text).find()) {
            return SHIPPING_ADDRESS;
        }
        if (ETRANSFER_LINE.matcher(text).find()) {
            return ETRANSFER_EMAIL;
        }
        if (ETRANSFER_WORD.matcher(text).find()
                && (EMAIL.matcher(text).find() || PHONE.matcher(text).find())) {
            return ETRANSFER_EMAIL;
        }
        return null;
    }
}
