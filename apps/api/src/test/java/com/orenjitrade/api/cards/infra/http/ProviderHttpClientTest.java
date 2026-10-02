package com.orenjitrade.api.cards.infra.http;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orenjitrade.api.cards.domain.provider.ProviderUnavailableException;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Queue;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Pacing and retries of provider requests against a local JDK HTTP server: transient failures (5xx,
 * 429, connection errors) are retried with exponential backoff and {@code Retry-After} is honoured;
 * other 4xx answers are never retried; every request carries the User-Agent.
 */
class ProviderHttpClientTest {

    private HttpServer server;
    private final Queue<int[]> script = new ConcurrentLinkedQueue<>();
    private final AtomicInteger requests = new AtomicInteger();
    private final List<String> agents = Collections.synchronizedList(new ArrayList<>());
    private final List<Duration> sleeps = Collections.synchronizedList(new ArrayList<>());

    /** Status and Retry-After seconds (-1: none) per request, then 200. */
    private void answer(int... statusesAndRetryAfter) {
        for (int i = 0; i < statusesAndRetryAfter.length; i += 2) {
            script.add(new int[] {statusesAndRetryAfter[i], statusesAndRetryAfter[i + 1]});
        }
    }

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.createContext(
                "/",
                exchange -> {
                    requests.incrementAndGet();
                    agents.add(exchange.getRequestHeaders().getFirst("User-Agent"));
                    int[] next = script.poll();
                    int status = next == null ? 200 : next[0];
                    if (next != null && next[1] >= 0) {
                        exchange.getResponseHeaders().set("Retry-After", String.valueOf(next[1]));
                    }
                    byte[] body =
                            (status == 200 ? "{\"ok\":true}" : "no")
                                    .getBytes(StandardCharsets.UTF_8);
                    exchange.sendResponseHeaders(status, body.length);
                    try (OutputStream out = exchange.getResponseBody()) {
                        out.write(body);
                    }
                });
        server.start();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private ProviderHttpClient client(int attempts) {
        Sleeper recording = sleeps::add;
        return new ProviderHttpClient(
                "Test provider",
                "OrenjiTrade-test/1.0",
                Duration.ofSeconds(2),
                Duration.ofSeconds(5),
                new HostRateLimiter(15, System::nanoTime, recording),
                new RetryPolicy(
                        attempts,
                        Duration.ofMillis(100),
                        Duration.ofMillis(400),
                        Duration.ofSeconds(30)),
                recording);
    }

    private URI uri() {
        return URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/api/test.json");
    }

    private static String read(org.springframework.http.client.ClientHttpResponse response)
            throws IOException {
        try (InputStream in = response.getBody()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    @Test
    void serverErrorsAreRetriedWithExponentialBackoff() {
        answer(503, -1, 502, -1);
        String body = client(4).get(uri(), "application/json", ProviderHttpClientTest::read);
        assertThat(body).isEqualTo("{\"ok\":true}");
        assertThat(requests.get()).isEqualTo(3);
        assertThat(sleeps).contains(Duration.ofMillis(100), Duration.ofMillis(200));
        assertThat(agents).containsOnly("OrenjiTrade-test/1.0");
    }

    @Test
    void tooManyRequestsHonoursRetryAfter() {
        answer(429, 7);
        client(3).get(uri(), "application/json", ProviderHttpClientTest::read);
        assertThat(requests.get()).isEqualTo(2);
        assertThat(sleeps).contains(Duration.ofSeconds(7));
    }

    @Test
    void aRetryAfterBeyondTheLimitGivesUpAtOnce() {
        answer(429, 3600);
        assertThatThrownBy(
                        () ->
                                client(5)
                                        .get(
                                                uri(),
                                                "application/json",
                                                ProviderHttpClientTest::read))
                .isInstanceOf(ProviderUnavailableException.class)
                .hasMessageContaining("retry after 3600 s");
        assertThat(requests.get()).isEqualTo(1);
    }

    @Test
    void clientErrorsAreNeverRetried() {
        answer(404, -1);
        assertThatThrownBy(
                        () ->
                                client(5)
                                        .get(
                                                uri(),
                                                "application/json",
                                                ProviderHttpClientTest::read))
                .isInstanceOf(ProviderHttpClient.HttpStatusFailure.class)
                .hasMessageContaining("HTTP 404");
        answer(400, -1);
        assertThatThrownBy(
                        () ->
                                client(5)
                                        .get(
                                                uri(),
                                                "application/json",
                                                ProviderHttpClientTest::read))
                .isInstanceOf(ProviderHttpClient.HttpStatusFailure.class);
        assertThat(requests.get()).isEqualTo(2);
    }

    @Test
    void exhaustedRetriesReportTheProviderUnavailable() {
        answer(503, -1, 503, -1, 503, -1);
        assertThatThrownBy(
                        () ->
                                client(3)
                                        .get(
                                                uri(),
                                                "application/json",
                                                ProviderHttpClientTest::read))
                .isInstanceOf(ProviderUnavailableException.class)
                .hasMessageContaining("unavailable after 3 attempt(s)")
                .hasMessageContaining("HTTP 503")
                .hasMessageNotContaining("?");
        assertThat(requests.get()).isEqualTo(3);
    }

    @Test
    void connectionFailuresAreRetried() throws IOException {
        int closedPort;
        try (ServerSocket probe = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
            closedPort = probe.getLocalPort();
        }
        URI unreachable = URI.create("http://127.0.0.1:" + closedPort + "/x");
        assertThatThrownBy(
                        () ->
                                client(3)
                                        .get(
                                                unreachable,
                                                "application/json",
                                                ProviderHttpClientTest::read))
                .isInstanceOf(ProviderUnavailableException.class);
        assertThat(sleeps).hasSizeGreaterThanOrEqualTo(2);
    }

    @Test
    void retryAfterParsing() {
        assertThat(ProviderHttpClient.parseRetryAfter("5")).isEqualTo(Duration.ofSeconds(5));
        assertThat(ProviderHttpClient.parseRetryAfter("-1")).isNull();
        assertThat(ProviderHttpClient.parseRetryAfter("soon")).isNull();
        assertThat(ProviderHttpClient.parseRetryAfter(null)).isNull();
        assertThat(ProviderHttpClient.parseRetryAfter("Wed, 21 Oct 2015 07:28:00 GMT"))
                .isEqualTo(Duration.ZERO);
    }

    @Test
    void backoffDoublesUpToTheMaximum() {
        RetryPolicy policy =
                new RetryPolicy(
                        5, Duration.ofMillis(500), Duration.ofSeconds(2), Duration.ofSeconds(60));
        assertThat(policy.backoff(2)).isEqualTo(Duration.ofMillis(500));
        assertThat(policy.backoff(3)).isEqualTo(Duration.ofSeconds(1));
        assertThat(policy.backoff(4)).isEqualTo(Duration.ofSeconds(2));
        assertThat(policy.backoff(5)).isEqualTo(Duration.ofSeconds(2));
    }
}
