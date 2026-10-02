package com.orenjitrade.api.cards.infra.http;

import com.orenjitrade.api.cards.domain.provider.ProviderRequestException;
import com.orenjitrade.api.cards.domain.provider.ProviderUnavailableException;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

/**
 * HTTP access to one catalog provider for {@code CardProvider} adapters: a {@link RestClient} on
 * the JDK client (connect/read timeouts, no redirects, descriptive {@code User-Agent}), pacing per
 * host through a {@link HostRateLimiter} and retries of transient failures through a {@link
 * RetryPolicy} (timeouts, connection errors, 5xx and 429 honouring {@code Retry-After}; never other
 * 4xx). Game-agnostic: future providers (Scryfall, PokémonTCG.io, ...) reuse it.
 */
public final class ProviderHttpClient {

    private static final Logger log = LoggerFactory.getLogger(ProviderHttpClient.class);

    private final String providerName;
    private final RestClient restClient;
    private final HostRateLimiter rateLimiter;
    private final RetryPolicy retryPolicy;
    private final Sleeper sleeper;

    public ProviderHttpClient(
            String providerName,
            String userAgent,
            Duration connectTimeout,
            Duration readTimeout,
            HostRateLimiter rateLimiter,
            RetryPolicy retryPolicy,
            Sleeper sleeper) {
        this.providerName = providerName;
        HttpClient httpClient =
                HttpClient.newBuilder()
                        .connectTimeout(connectTimeout)
                        .followRedirects(HttpClient.Redirect.NEVER)
                        .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(readTimeout);
        this.restClient =
                RestClient.builder()
                        .requestFactory(factory)
                        .defaultHeader(HttpHeaders.USER_AGENT, userAgent)
                        .build();
        this.rateLimiter = rateLimiter;
        this.retryPolicy = retryPolicy;
        this.sleeper = sleeper;
    }

    /** Reads a successful response; may throw {@link IOException} while streaming. */
    @FunctionalInterface
    public interface ResponseHandler<T> {
        T handle(ClientHttpResponse response) throws IOException;
    }

    /** A response that is still open (streamed by the caller, who must close it). */
    public record OpenResponse(
            InputStream body,
            long contentLength,
            @Nullable String contentType,
            ClientHttpResponse response) {}

    /** Non-2xx answer that is not retried (or no longer retried). */
    public static final class HttpStatusFailure extends ProviderRequestException {

        public HttpStatusFailure(String message, int status) {
            super(message, status);
        }
    }

    /**
     * {@code GET uri}; the handler reads the 2xx response, which is closed afterwards. Transport
     * failures inside the handler (a connection dropped mid-body) are retried like timeouts.
     *
     * @throws HttpStatusFailure 4xx (other than 429) or a final 3xx
     * @throws ProviderUnavailableException retries exhausted
     */
    public <T> T get(URI uri, String accept, ResponseHandler<T> handler) {
        return execute(uri, accept, handler, true);
    }

    /**
     * {@code GET uri} returning the open 2xx response (images streamed into the cache). The caller
     * closes {@link OpenResponse#response()}. Only opening the response is retried.
     */
    public OpenResponse open(URI uri, String accept) {
        return execute(
                uri,
                accept,
                response ->
                        new OpenResponse(
                                response.getBody(),
                                response.getHeaders().getContentLength(),
                                response.getHeaders().getContentType() == null
                                        ? null
                                        : response.getHeaders().getContentType().toString(),
                                response),
                false);
    }

    private <T> T execute(URI uri, String accept, ResponseHandler<T> handler, boolean close) {
        String host = uri.getHost() == null ? "" : uri.getHost();
        String what = providerName + " " + safePath(uri);
        @Nullable String lastProblem = null;
        for (int attempt = 1; attempt <= retryPolicy.maxAttempts(); attempt++) {
            Duration wait = Duration.ZERO;
            try {
                rateLimiter.acquire(host);
                Attempt<T> result =
                        restClient
                                .get()
                                .uri(uri)
                                .header(HttpHeaders.ACCEPT, accept)
                                .exchange(
                                        (request, response) -> {
                                            int status = response.getStatusCode().value();
                                            if (status >= 200 && status < 300) {
                                                try {
                                                    T value = handler.handle(response);
                                                    if (close) {
                                                        response.close();
                                                    }
                                                    return Attempt.success(value);
                                                } catch (IOException | RuntimeException e) {
                                                    response.close();
                                                    throw e;
                                                }
                                            }
                                            @Nullable String retryAfter =
                                                    response.getHeaders()
                                                            .getFirst(HttpHeaders.RETRY_AFTER);
                                            response.close();
                                            return Attempt.failure(status, retryAfter);
                                        },
                                        false);
                if (result.success()) {
                    return result.value();
                }
                int status = result.status();
                if (status != 429 && status < 500) {
                    throw new HttpStatusFailure(what + " answered HTTP " + status, status);
                }
                lastProblem = "HTTP " + status;
                @Nullable Duration retryAfter = parseRetryAfter(result.retryAfter());
                if (retryAfter != null && retryAfter.compareTo(retryPolicy.maxRetryAfter()) > 0) {
                    throw new ProviderUnavailableException(
                            what
                                    + " asked to retry after "
                                    + retryAfter.toSeconds()
                                    + " s (HTTP "
                                    + status
                                    + "); giving up");
                }
                wait = retryAfter;
            } catch (ResourceAccessException e) {
                lastProblem = describe(e);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new ProviderUnavailableException(what + " was interrupted", e);
            }
            if (attempt == retryPolicy.maxAttempts()) {
                break;
            }
            Duration backoff = retryPolicy.backoff(attempt + 1);
            Duration delay = wait != null && wait.compareTo(backoff) > 0 ? wait : backoff;
            log.warn(
                    "{} failed ({}), attempt {}/{}; retrying in {} ms",
                    what,
                    lastProblem,
                    attempt,
                    retryPolicy.maxAttempts(),
                    delay.toMillis());
            try {
                sleeper.sleep(delay);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new ProviderUnavailableException(what + " was interrupted", e);
            }
        }
        throw new ProviderUnavailableException(
                what
                        + " is unavailable after "
                        + retryPolicy.maxAttempts()
                        + " attempt(s) ("
                        + lastProblem
                        + ")");
    }

    /** {@code Retry-After} as delta-seconds or an HTTP date; {@code null} when absent/invalid. */
    static @Nullable Duration parseRetryAfter(@Nullable String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim();
        try {
            long seconds = Long.parseLong(trimmed);
            return seconds < 0 ? null : Duration.ofSeconds(seconds);
        } catch (NumberFormatException e) {
            try {
                Instant at =
                        ZonedDateTime.parse(trimmed, DateTimeFormatter.RFC_1123_DATE_TIME)
                                .toInstant();
                Duration delta = Duration.between(Instant.now(), at);
                return delta.isNegative() ? Duration.ZERO : delta;
            } catch (DateTimeParseException ignored) {
                return null;
            }
        }
    }

    private static String describe(Exception e) {
        Throwable root = e;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        return root.getClass().getSimpleName();
    }

    /** Host and path only (no query string) for logs and client-safe messages. */
    private static String safePath(URI uri) {
        return (uri.getHost() == null ? "" : uri.getHost())
                + (uri.getPath() == null ? "" : uri.getPath());
    }

    private record Attempt<T>(
            boolean success, @Nullable T value, int status, @Nullable String retryAfter) {

        static <T> Attempt<T> success(T value) {
            return new Attempt<>(true, value, 200, null);
        }

        static <T> Attempt<T> failure(int status, @Nullable String retryAfter) {
            return new Attempt<>(false, null, status, retryAfter);
        }
    }
}
