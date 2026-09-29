package com.orenjitrade.api.common.storage;

/**
 * An object read back from {@link ObjectStorage}.
 *
 * @param content raw bytes
 * @param contentType media type recorded when the object was stored (or derived from the key)
 */
public record StoredObject(byte[] content, String contentType) {}
