package com.orenjitrade.api.cards.infra.http;

import java.io.IOException;

/**
 * A provider response passed its size limit while it was being stored ({@link
 * ProviderSnapshotStore#write}). {@link ProviderHttpClient} never retries it: the same file would
 * only be downloaded again in full to fail the same way.
 */
public final class ResponseTooLargeException extends IOException {

    private static final long serialVersionUID = 1L;

    private final long maxBytes;

    public ResponseTooLargeException(long maxBytes) {
        super("Response larger than " + maxBytes + " bytes");
        this.maxBytes = maxBytes;
    }

    /** The limit that was passed, in bytes. */
    public long maxBytes() {
        return maxBytes;
    }
}
