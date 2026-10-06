package com.orenjitrade.api.common.storage;

import java.time.Instant;

/**
 * One entry of {@link ObjectStorage#list(String)}.
 *
 * @param key key relative to the storage root / object prefix
 * @param size bytes
 * @param lastModified last modification (file mtime, object update time); {@link Instant#EPOCH}
 *     when the backend reports none
 */
public record ObjectSummary(String key, long size, Instant lastModified) {}
