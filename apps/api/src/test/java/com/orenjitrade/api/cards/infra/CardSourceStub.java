package com.orenjitrade.api.cards.infra;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.stream.Stream;
import java.util.zip.GZIPOutputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import javax.imageio.ImageIO;
import org.jspecify.annotations.Nullable;

/**
 * Offline stand-in for Scryfall and TCGdex (one per test JVM, 127.0.0.1 only), serving the
 * hand-written fixtures in each provider's format: Scryfall's {@code /bulk-data} list, its
 * gzip-encoded "Unique Artwork" file and card images; GitHub's newest commit of
 * tcgdex/cards-database, the repository archive of {@code src/test/resources/tcgdex/} and TCGdex's
 * card images (generated in memory). Every request is recorded with its {@code User-Agent} and
 * {@code Accept} headers. Tests never touch the network.
 */
public final class CardSourceStub {

    public static final String SCRYFALL_UPDATED_AT = "2026-10-20T09:03:12.345+00:00";
    public static final String SCRYFALL_VERSION = "20261020090312";
    public static final String TCGDEX_SHA = "0123456789abcdef0123456789abcdef01234567";
    public static final String SCRYFALL_IMAGE_HOST = "https://cards.scryfall.io/";

    /** One request the stub answered. */
    public record Request(String path, @Nullable String userAgent, @Nullable String accept) {}

    private static volatile @Nullable CardSourceStub instance;

    private final HttpServer server;
    private final List<Request> requests = new CopyOnWriteArrayList<>();
    private volatile String scryfallUpdatedAt = SCRYFALL_UPDATED_AT;
    private volatile @Nullable String downloadUriOverride;
    private volatile String tcgdexSha = TCGDEX_SHA;

    private CardSourceStub() throws IOException {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.setExecutor(Executors.newFixedThreadPool(4));
        server.createContext("/", this::handle);
        server.start();
    }

    public static synchronized CardSourceStub get() {
        CardSourceStub stub = instance;
        if (stub == null) {
            try {
                stub = new CardSourceStub();
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
            instance = stub;
        }
        return stub;
    }

    public String baseUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/";
    }

    public String scryfallApi() {
        return baseUrl() + "scryfall-api/";
    }

    public String scryfallData() {
        return baseUrl() + "scryfall-data/";
    }

    public String scryfallImages() {
        return baseUrl() + "scryfall-images/";
    }

    public String githubApi() {
        return baseUrl() + "github/repos/tcgdex/cards-database/";
    }

    public String codeload() {
        return baseUrl() + "codeload/";
    }

    public String tcgdexAssets() {
        return baseUrl() + "tcgdex-assets/";
    }

    public void reset() {
        requests.clear();
        scryfallUpdatedAt = SCRYFALL_UPDATED_AT;
        downloadUriOverride = null;
        tcgdexSha = TCGDEX_SHA;
    }

    public void scryfallUpdatedAt(String updatedAt) {
        this.scryfallUpdatedAt = updatedAt;
    }

    public void downloadUri(String uri) {
        this.downloadUriOverride = uri;
    }

    public void tcgdexSha(String sha) {
        this.tcgdexSha = sha;
    }

    public List<Request> requests() {
        return List.copyOf(requests);
    }

    /** Requests whose path starts with {@code prefix} (e.g. {@code /scryfall-api/}). */
    public List<Request> requests(String prefix) {
        return requests.stream().filter(r -> r.path().startsWith(prefix)).toList();
    }

    // -------------------------------------------------------------------------------------
    // Fixtures
    // -------------------------------------------------------------------------------------

    /** The Scryfall fixture with its image host moved to {@code imageBase}. */
    public static byte[] scryfallFixture(String imageBase) {
        try (InputStream in = resource("/scryfall/unique-artwork-fixture.json")) {
            String json = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            return json.replace(SCRYFALL_IMAGE_HOST, imageBase).getBytes(StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public static byte[] gzip(byte[] bytes) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (GZIPOutputStream gzip = new GZIPOutputStream(out)) {
            gzip.write(bytes);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }

    /** The TCGdex fixture repository as GitHub archives it: one top folder per commit. */
    public static byte[] tcgdexArchive(String sha) {
        Path root = resourcePath("/tcgdex/cards-database");
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out, StandardCharsets.UTF_8);
                Stream<Path> files = Files.walk(root)) {
            List<Path> sorted = new ArrayList<>(files.sorted().toList());
            String top = "cards-database-" + sha + "/";
            zip.putNextEntry(new ZipEntry(top));
            zip.closeEntry();
            for (Path path : sorted) {
                String relative = root.relativize(path).toString().replace('\\', '/');
                if (relative.isEmpty()) {
                    continue;
                }
                if (Files.isDirectory(path)) {
                    zip.putNextEntry(new ZipEntry(top + relative + "/"));
                } else {
                    zip.putNextEntry(new ZipEntry(top + relative));
                    zip.write(Files.readAllBytes(path));
                }
                zip.closeEntry();
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }

    /** A small decodable card picture, different for every id. */
    public static byte[] jpeg(String id) {
        BufferedImage image = new BufferedImage(400, 560, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        int hash = id.hashCode();
        g.setColor(new Color(hash & 0xffffff));
        g.fillRect(0, 0, 400, 560);
        g.setColor(new Color(~hash & 0xffffff));
        g.fillRect(40, 60, 320, 260);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            ImageIO.write(image, "jpg", out);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }

    private static InputStream resource(String name) {
        return Objects.requireNonNull(
                CardSourceStub.class.getResourceAsStream(name), "missing test resource " + name);
    }

    private static Path resourcePath(String name) {
        try {
            return Path.of(
                    Objects.requireNonNull(
                                    CardSourceStub.class.getResource(name),
                                    "missing test resource " + name)
                            .toURI());
        } catch (URISyntaxException e) {
            throw new IllegalStateException(e);
        }
    }

    // -------------------------------------------------------------------------------------
    // Routes
    // -------------------------------------------------------------------------------------

    private void handle(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        requests.add(
                new Request(
                        path,
                        exchange.getRequestHeaders().getFirst("User-Agent"),
                        exchange.getRequestHeaders().getFirst("Accept")));
        try (exchange) {
            if (path.equals("/scryfall-api/bulk-data")) {
                String download =
                        downloadUriOverride != null
                                ? downloadUriOverride
                                : scryfallData()
                                        + "unique-artwork/unique-artwork-"
                                        + scryfallUpdatedAt
                                                .replaceAll("[^0-9]", "")
                                                .substring(0, 14)
                                        + ".json";
                String json =
                        """
                        {"object": "list", "has_more": false, "data": [
                          {"object": "bulk_data", "type": "oracle_cards",
                           "updated_at": "%1$s", "download_uri": "%2$soracle-cards/x.json"},
                          {"object": "bulk_data", "type": "unique_artwork",
                           "name": "Unique Artwork", "updated_at": "%1$s",
                           "download_uri": "%3$s", "size": 123456,
                           "content_type": "application/json", "content_encoding": "gzip"}
                        ]}
                        """
                                .formatted(scryfallUpdatedAt, scryfallData(), download);
                send(
                        exchange,
                        200,
                        "application/json",
                        null,
                        json.getBytes(StandardCharsets.UTF_8));
            } else if (path.startsWith("/scryfall-data/unique-artwork/")) {
                send(
                        exchange,
                        200,
                        "application/json",
                        "gzip",
                        gzip(scryfallFixture(scryfallImages())));
            } else if (path.startsWith("/scryfall-images/") && path.endsWith(".jpg")) {
                send(exchange, 200, "image/jpeg", null, jpeg(path));
            } else if (path.equals("/github/repos/tcgdex/cards-database/commits/master")) {
                send(
                        exchange,
                        200,
                        "application/vnd.github.sha",
                        null,
                        tcgdexSha.getBytes(StandardCharsets.US_ASCII));
            } else if (path.startsWith("/codeload/")) {
                String sha = path.substring("/codeload/".length());
                send(exchange, 200, "application/zip", null, tcgdexArchive(sha));
            } else if (path.startsWith("/tcgdex-assets/en/") && path.endsWith("/high.jpg")) {
                send(exchange, 200, "image/jpeg", null, jpeg(path));
            } else {
                send(
                        exchange,
                        404,
                        "text/plain",
                        null,
                        "not found".getBytes(StandardCharsets.UTF_8));
            }
        }
    }

    private static void send(
            HttpExchange exchange, int status, String type, @Nullable String encoding, byte[] body)
            throws IOException {
        exchange.getResponseHeaders().set("Content-Type", type);
        if (encoding != null) {
            exchange.getResponseHeaders().set("Content-Encoding", encoding);
        }
        exchange.sendResponseHeaders(status, body.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(body);
        }
    }
}
