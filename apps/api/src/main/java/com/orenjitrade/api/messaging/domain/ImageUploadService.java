package com.orenjitrade.api.messaging.domain;

import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.storage.ObjectKeys;
import com.orenjitrade.api.common.storage.ObjectStorage;
import com.orenjitrade.api.inventory.domain.ItemImageProcessor;
import com.orenjitrade.api.inventory.domain.ItemImageProcessor.ImageRejectedException;
import com.orenjitrade.api.messaging.infra.ImageUploadRepository;
import com.orenjitrade.api.messaging.infra.ImageUploadRepository.UploadRow;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * {@code POST /uploads/images} (Phase 5 contract): the image is sniffed from its magic bytes (JPEG,
 * PNG, WebP), size-checked (≤ 8 MB), decompression-bomb guarded, re-encoded as a metadata-free JPEG
 * (the processor of the inventory module: EXIF/GPS stripped) and passed through the {@link
 * ImageUploadInspector} hook before it is stored; the upload must be attached to a message within
 * {@link #TTL} or the upload-cleanup job deletes it.
 */
@Service
public class ImageUploadService {

    /** How long an upload waits to be attached. */
    public static final Duration TTL = Duration.ofHours(1);

    static final String NAMESPACE = "uploads";

    private static final Logger log = LoggerFactory.getLogger(ImageUploadService.class);

    private final ImageUploadRepository repository;
    private final ItemImageProcessor processor;
    private final ImageUploadInspector inspector;
    private final ObjectStorage storage;
    private final TimeProvider timeProvider;
    private final TransactionTemplate transaction;

    public ImageUploadService(
            ImageUploadRepository repository,
            ItemImageProcessor processor,
            ImageUploadInspector inspector,
            ObjectStorage storage,
            TimeProvider timeProvider,
            PlatformTransactionManager transactionManager) {
        this.repository = repository;
        this.processor = processor;
        this.inspector = inspector;
        this.storage = storage;
        this.timeProvider = timeProvider;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    /**
     * Stores an upload. {@code 413} above 8 MB, {@code 415} for other types, {@code 400} for
     * unreadable images, the INVENTORY kind (inventory photos keep their own route) or content the
     * inspector refuses.
     */
    public ImageUploadView upload(UUID ownerId, UploadKind kind, byte[] content) {
        if (kind != UploadKind.MESSAGE) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(
                            new ProblemFieldError(
                                    "kind",
                                    "Inventory photos are uploaded with POST"
                                            + " /inventory/items/{id}/images")));
        }
        ItemImageProcessor.Processed processed;
        try {
            processed = processor.process(content);
        } catch (ImageRejectedException e) {
            throw switch (e.rejection()) {
                case TOO_LARGE -> new ApiException(ErrorCode.PAYLOAD_TOO_LARGE, e.getMessage());
                case UNSUPPORTED_TYPE ->
                        new ApiException(ErrorCode.UNSUPPORTED_MEDIA_TYPE, e.getMessage());
                case EMPTY, DIMENSIONS, UNREADABLE ->
                        ApiException.validation(
                                "Validation failed",
                                List.of(new ProblemFieldError("file", e.getMessage())));
            };
        }
        if (!inspector.accept(ownerId, kind, processed.jpeg())) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(new ProblemFieldError("file", "This image cannot be shared")));
        }
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.MICROS);
        UUID id = UUID.randomUUID();
        String key = ObjectKeys.newKey(NAMESPACE, ownerId, ItemImageProcessor.OUTPUT_EXTENSION);
        storage.put(key, processed.jpeg(), ItemImageProcessor.OUTPUT_CONTENT_TYPE);
        try {
            transaction.executeWithoutResult(
                    status ->
                            repository.insert(
                                    new UploadRow(
                                            id,
                                            ownerId,
                                            kind.name(),
                                            key,
                                            processed.width(),
                                            processed.height(),
                                            processed.jpeg().length,
                                            now)));
        } catch (RuntimeException e) {
            storage.delete(key);
            throw e;
        }
        log.info(
                "Image upload stored owner={} upload={} bytes={}",
                ownerId,
                id,
                processed.jpeg().length);
        return new ImageUploadView(
                id, storage.publicUrl(key), processed.width(), processed.height(), now.plus(TTL));
    }

    /**
     * Locks an attachable upload of the owner (same transaction as the message insert); empty when
     * unknown, of someone else, already attached or expired.
     */
    public Optional<UploadRow> lockAttachable(UUID ownerId, UUID uploadId) {
        return repository.lockPending(
                uploadId, ownerId, UploadKind.MESSAGE.name(), timeProvider.now().minus(TTL));
    }

    /** Marks an upload attached (same transaction as the message insert). */
    public void markConsumed(UUID uploadId) {
        repository.markConsumed(uploadId, timeProvider.now());
    }

    /**
     * Deletes unattached uploads older than {@link #TTL} with their stored objects.
     *
     * @return the number of uploads removed
     */
    public int cleanup(int batchSize) {
        Instant before = timeProvider.now().minus(TTL);
        int removed = 0;
        while (true) {
            List<UploadRow> expired = repository.expired(before, batchSize);
            if (expired.isEmpty()) {
                return removed;
            }
            Integer deleted =
                    transaction.execute(
                            status ->
                                    repository.deletePending(
                                            expired.stream().map(UploadRow::id).toList()));
            for (UploadRow row : expired) {
                storage.delete(row.storageKey());
            }
            removed += deleted == null ? 0 : deleted;
            if (expired.size() < batchSize) {
                return removed;
            }
        }
    }

    /** Public URL of a stored key. */
    public String urlOf(String storageKey) {
        return storage.publicUrl(storageKey);
    }
}
