package com.orenjitrade.api.notifications.infra;

import com.orenjitrade.api.notifications.domain.PushProvider;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Default push provider ({@code PUSH_PROVIDER=log}): writes one log line per push instead of
 * contacting a push service, so local development and tests need no Firebase project. Every token
 * counts as delivered. Device tokens are never logged (only their number).
 */
public class LogPushProvider implements PushProvider {

    public static final String NAME = "log";

    private static final Logger log = LoggerFactory.getLogger("orenji.push");

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public PushResult send(PushMessage message, List<String> tokens) {
        log.info(
                "push (log provider) notification={} type={} user={} devices={} title=\"{}\"",
                message.notificationId(),
                message.type(),
                message.userId(),
                tokens.size(),
                message.title());
        return new PushResult(tokens.size(), 0, List.of());
    }
}
