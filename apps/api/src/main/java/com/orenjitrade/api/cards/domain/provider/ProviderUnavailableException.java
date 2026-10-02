package com.orenjitrade.api.cards.domain.provider;

/**
 * A provider stayed unreachable or overloaded (timeouts, connection failures, 5xx, 429) after the
 * client's retries. The message is safe to show to administrators (no URLs with credentials, no
 * stack traces).
 */
public class ProviderUnavailableException extends RuntimeException {

    public ProviderUnavailableException(String message) {
        super(message);
    }

    public ProviderUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
