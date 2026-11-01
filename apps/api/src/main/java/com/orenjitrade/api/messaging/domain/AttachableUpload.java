package com.orenjitrade.api.messaging.domain;

import java.util.UUID;

/**
 * An upload locked for what it is being attached to (stage R11: a community post), as other modules
 * see it.
 *
 * @param id upload id (pass to {@link ImageUploadService#markConsumed})
 * @param storageKey stored object key
 * @param width pixels
 * @param height pixels
 * @param bytes size of the re-encoded JPEG
 */
public record AttachableUpload(UUID id, String storageKey, int width, int height, int bytes) {}
