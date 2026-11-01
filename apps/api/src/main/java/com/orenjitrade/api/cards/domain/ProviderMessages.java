package com.orenjitrade.api.cards.domain;

import java.util.List;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * The words of a provider problem that a sync run's report may carry to the browser (web stage WH2
 * review fix 1): a provider's host and path ("images.ygoprodeck.com/images/cards/46986414.jpg")
 * stay server-side (ADR 0015: provider URLs never reach a browser), and no raw id reaches an admin
 * page (spec 15.2). The full message stays in the server's log.
 */
public final class ProviderMessages {

    /** A URL or a bare host (a name with a top-level domain, or an IPv4 address) and its path. */
    private static final Pattern HOST_AND_PATH =
            Pattern.compile(
                    "\\s*(?:[a-z][a-z0-9+.-]*://)?"
                            + "(?:(?:[A-Za-z0-9-]+\\.)+[A-Za-z]{2,}|\\d{1,3}(?:\\.\\d{1,3}){3}"
                            + "|localhost)(?::\\d+)?(?:/\\S*)?");

    private static final Pattern UUID =
            Pattern.compile(
                    "\\s*\\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}"
                            + "-[0-9a-fA-F]{12}\\b:?");

    private ProviderMessages() {}

    /**
     * The message without hosts, paths or ids: "YGOPRODeck images.ygoprodeck.com/images/cards/1.jpg
     * answered HTTP 403" reads "YGOPRODeck answered HTTP 403".
     *
     * @param message a provider or download problem, as logged
     */
    public static String clientSafe(@Nullable String message) {
        if (message == null || message.isBlank()) {
            return "the download failed";
        }
        String safe = HOST_AND_PATH.matcher(message).replaceAll("");
        safe = UUID.matcher(safe).replaceAll("").strip();
        return safe.isEmpty() ? "the download failed" : safe;
    }

    /**
     * A stored run as the console reads it (web stage WH2 review fix 2): its error and its report's
     * messages through {@link #clientSafe(String)}. Messages are cleaned when written since review
     * fix 1; a run saved before that (an earlier real import's failed image read "image {id}:
     * YGOPRODeck images.ygoprodeck.com/… answered HTTP 403") is cleaned here as it is read. The
     * stored row stays as it is.
     */
    public static SyncRunView safeRun(SyncRunView run) {
        @Nullable CatalogImportReport report = run.report();
        @Nullable String error = run.error();
        return new SyncRunView(
                run.id(),
                run.provider(),
                run.game(),
                run.mode(),
                run.status(),
                run.requestedBy(),
                run.createdAt(),
                run.startedAt(),
                run.finishedAt(),
                run.setsUpserted(),
                run.cardsUpserted(),
                run.printingsUpserted(),
                error == null ? null : clientSafe(error),
                run.imageMode(),
                run.imageLimit(),
                run.providerDbVersion(),
                run.phase(),
                report == null ? null : safeReport(report));
    }

    /** A stored report with its errors and warnings through {@link #clientSafe(String)}. */
    public static CatalogImportReport safeReport(CatalogImportReport report) {
        return new CatalogImportReport(
                report.provider(),
                report.providerDbVersion(),
                report.imageMode(),
                report.imageLimit(),
                report.totalCardsProcessed(),
                report.cardsCreated(),
                report.cardsUpdated(),
                report.cardsUnchanged(),
                report.cardsFailed(),
                report.setsUpserted(),
                report.printingsUpserted(),
                report.printingsSkipped(),
                report.imagesReferenced(),
                report.imagesSelected(),
                report.imagesAlreadyCached(),
                report.imagesDownloaded(),
                report.imagesDeduplicated(),
                report.imagesSkippedCacheFull(),
                report.imagesFailed(),
                report.imagesMissingAtSource(),
                report.bytesDownloaded(),
                report.cacheUsedMb(),
                report.cacheReservedMb(),
                report.cacheLimitMb(),
                report.cacheLimitReached(),
                report.durationSeconds(),
                safe(report.errors()),
                safe(report.warnings()));
    }

    private static List<String> safe(List<String> messages) {
        return messages.stream().map(ProviderMessages::clientSafe).toList();
    }
}
