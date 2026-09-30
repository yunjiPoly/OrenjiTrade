package com.orenjitrade.api.messaging.domain;

import java.util.UUID;

/**
 * Virus / image-moderation hook of {@code POST /uploads/images} (Phase 5 contract). The default
 * implementation accepts every re-encoded image (re-encoding already drops any embedded payload); a
 * scanning adapter can replace the bean later without touching the upload flow.
 */
public interface ImageUploadInspector {

    /**
     * @param ownerId uploader
     * @param kind purpose of the upload
     * @param jpeg the re-encoded image that would be stored
     * @return whether the image may be stored
     */
    boolean accept(UUID ownerId, UploadKind kind, byte[] jpeg);
}
