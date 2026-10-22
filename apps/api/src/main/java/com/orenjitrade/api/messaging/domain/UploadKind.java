package com.orenjitrade.api.messaging.domain;

import com.orenjitrade.api.inventory.domain.ItemImageProcessor;
import io.swagger.v3.oas.annotations.media.Schema;

/** Purpose of an image upload ({@code POST /uploads/images}). */
@Schema(name = "UploadKind")
public enum UploadKind {
    /** Attached to a private message within one hour (8 MB at most). */
    MESSAGE(ItemImageProcessor.MAX_BYTES),
    /**
     * Inventory photos: reserved; items keep their direct upload route {@code POST
     * /inventory/items/{id}/images} (400 until an inventory flow consumes uploads).
     */
    INVENTORY(ItemImageProcessor.MAX_BYTES),
    /**
     * A photo of a community post (stage R11): attached to a post within one hour, 3 MB at most
     * (owner, 2026-10-08), up to 4 per post.
     */
    COMMUNITY(3 * 1024 * 1024);

    private final int maxBytes;

    UploadKind(int maxBytes) {
        this.maxBytes = maxBytes;
    }

    /** The largest file this kind takes, in bytes (413 PAYLOAD_TOO_LARGE above it). */
    public int maxBytes() {
        return maxBytes;
    }

    /** "8 MB", "3 MB": the limit as the refusal names it. */
    public String maxLabel() {
        return (maxBytes / (1024 * 1024)) + " MB";
    }
}
