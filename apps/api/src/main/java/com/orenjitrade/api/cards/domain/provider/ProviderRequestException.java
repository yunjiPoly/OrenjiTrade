package com.orenjitrade.api.cards.domain.provider;

/**
 * A provider refused a request permanently (4xx other than 404/410/429, a URL outside the
 * provider's allow-list, an unexpected response shape). Never retried.
 */
public class ProviderRequestException extends RuntimeException {

    private final int status;

    public ProviderRequestException(String message, int status) {
        super(message);
        this.status = status;
    }

    /** HTTP status, {@code 0} when the request was refused before being sent. */
    public int status() {
        return status;
    }
}
