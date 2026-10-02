package com.orenjitrade.api.cards.domain.provider;

/** The provider answered 404 or 410 for an artwork: the image no longer exists at the source. */
public class ImageMissingAtSourceException extends RuntimeException {

    public ImageMissingAtSourceException(String message) {
        super(message);
    }
}
