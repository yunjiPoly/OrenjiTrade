package com.orenjitrade.api.cards.domain.provider;

import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import org.jspecify.annotations.Nullable;

/**
 * An opened artwork download ({@link CardProvider#openImage}): the response body to stream into the
 * cache and the announced length and type. Closing it releases the connection.
 *
 * @param body response body (not buffered)
 * @param contentLength announced {@code Content-Length}, {@code -1} when unknown
 * @param contentType announced {@code Content-Type}, if any (never trusted alone: the cache sniffs
 *     and decodes the bytes)
 * @param onClose releases the underlying response
 */
public record ImageDownload(
        InputStream body, long contentLength, @Nullable String contentType, Closeable onClose)
        implements Closeable {

    @Override
    public void close() throws IOException {
        try {
            body.close();
        } finally {
            onClose.close();
        }
    }
}
