package com.orenjitrade.api.notifications.infra;

import com.orenjitrade.api.notifications.domain.EmailProvider;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Default email provider ({@code EMAIL_PROVIDER=log}): logs the email instead of sending it, with
 * the recipient address masked ({@code c***@orenjitrade.test}) so no address reaches the logs.
 */
public class LogEmailProvider implements EmailProvider {

    public static final String NAME = "log";

    private static final Logger log = LoggerFactory.getLogger("orenji.email");

    private final String from;

    public LogEmailProvider(String from) {
        this.from = from;
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public boolean send(EmailMessage message) {
        log.info(
                "email (log provider) notification={} type={} from={} to={} subject=\"{}\"",
                message.notificationId(),
                message.type(),
                from,
                mask(message.to()),
                message.subject());
        return true;
    }

    /** {@code collector1@orenjitrade.test} becomes {@code c***@orenjitrade.test}. */
    static String mask(String address) {
        int at = address.indexOf('@');
        if (at <= 0) {
            return "***";
        }
        return address.substring(0, 1).toLowerCase(Locale.ROOT) + "***" + address.substring(at);
    }
}
