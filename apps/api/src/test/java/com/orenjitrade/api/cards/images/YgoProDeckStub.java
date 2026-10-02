package com.orenjitrade.api.cards.images;

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
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Iterator;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Offline stand-in for the YGOPRODeck API and image host (one per test JVM, 127.0.0.1 only).
 *
 * <ul>
 *   <li>API (JDK {@link HttpServer}): {@code /api/v7/checkDBVer.php}, {@code cardinfo.php} and
 *       {@code cardsets.php} serve the fictional fixtures of {@code src/test/resources/ygoprodeck/}
 *       plus {@value #FILLER_CARDS} generated filler cards;
 *   <li>image host (a minimal HTTP/1.1 server on a raw socket, one connection per request, so a
 *       body cut short is a real dropped connection): {@code /images/cards/<id>.jpg} serves images
 *       generated in memory (smooth for the fixture cards, noisy and larger for the fillers).
 * </ul>
 *
 * Per-image behaviours (404, HTML, empty or truncated bodies, outages) are programmable; {@link
 * #reset()} restores the defaults. Tests never touch the network.
 */
public final class YgoProDeckStub {

    public static final int FILLER_CARDS = 60;
    public static final long FIRST_FILLER_ID = 900_001_001L;
    public static final int FIXTURE_CARDS = 8;
    public static final int TOTAL_CARDS = FIXTURE_CARDS + FILLER_CARDS;

    /** Artworks: 8 for the fixture cards (one card has two, one has none) + one per filler. */
    public static final int TOTAL_IMAGES = 8 + FILLER_CARDS;

    /** How the image host answers for one image id. */
    public enum Behaviour {
        OK,
        NOT_FOUND,
        HTML,
        EMPTY,
        TRUNCATED,
        SERVER_ERROR,
        SERVER_ERROR_ONCE,
        /**
         * Headers and a third of the body, then nothing until {@link #releaseStalled()} (at most 10
         * s), then the rest: a download caught mid-stream.
         */
        STALL
    }

    private static final Pattern IMAGE =
            Pattern.compile("^GET (/images/cards/([0-9]+)\\.jpg)(\\?\\S*)? HTTP/1\\.[01]$");
    private static volatile YgoProDeckStub instance;

    private final HttpServer api;
    private final ServerSocket imageHost;
    private final ExecutorService workers;
    private final String version;
    private final Path snapshotDir;
    private final byte[] cardInfo;
    private final byte[] cardSets;
    private final Map<String, byte[]> images = new ConcurrentHashMap<>();
    private final Map<String, Behaviour> behaviours = new ConcurrentHashMap<>();
    private final Map<String, String> sameAs = new ConcurrentHashMap<>();
    private final Map<String, AtomicInteger> hits = new ConcurrentHashMap<>();
    private final Map<String, String> userAgents = new ConcurrentHashMap<>();
    private final Semaphore stalled = new Semaphore(0);
    private volatile boolean apiDown;

    private YgoProDeckStub() throws IOException {
        JsonMapper mapper = JsonMapper.builder().build();
        this.version = "test-" + Long.toHexString(new Random().nextLong() & 0xffffffL);
        this.snapshotDir = Files.createTempDirectory("orenji-ygo-snapshots-");
        this.cardInfo = cardInfo(mapper);
        try (InputStream in = resource("ygoprodeck/cardsets-fixture.json")) {
            this.cardSets = in.readAllBytes();
        }
        this.workers =
                Executors.newCachedThreadPool(
                        runnable -> {
                            Thread thread = new Thread(runnable, "ygoprodeck-stub");
                            thread.setDaemon(true);
                            return thread;
                        });
        InetAddress loopback = InetAddress.getLoopbackAddress();
        this.api = HttpServer.create(new InetSocketAddress(loopback, 0), 64);
        this.api.setExecutor(workers);
        this.api.createContext("/", this::handleApi);
        this.api.start();
        this.imageHost = new ServerSocket(0, 64, loopback);
        Thread acceptor = new Thread(this::acceptImages, "ygoprodeck-stub-images");
        acceptor.setDaemon(true);
        acceptor.start();
    }

    /** The JVM-wide stub, started on first use. */
    public static synchronized YgoProDeckStub get() {
        if (instance == null) {
            try {
                instance = new YgoProDeckStub();
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
        return instance;
    }

    public String apiBaseUrl() {
        return "http://127.0.0.1:" + api.getAddress().getPort() + "/api/v7/";
    }

    public String imageHost() {
        return "http://127.0.0.1:" + imageHost.getLocalPort();
    }

    public String imageBaseUrl() {
        return imageHost() + "/images/cards/";
    }

    /** The {@code database_version} the stub announces (unique per JVM). */
    public String version() {
        return version;
    }

    public Path snapshotDir() {
        return snapshotDir;
    }

    /** Back to the defaults (every image OK, API up); counters are kept. */
    public void reset() {
        behaviours.clear();
        sameAs.clear();
        stalled.drainPermits();
        apiDown = false;
    }

    public void apiDown(boolean down) {
        this.apiDown = down;
    }

    public void behave(String imageId, Behaviour behaviour) {
        behaviours.put(imageId, behaviour);
    }

    /** Lets one {@link Behaviour#STALL} response send the rest of its body. */
    public void releaseStalled() {
        stalled.release();
    }

    /** {@code imageId} serves exactly the bytes of {@code otherId} (deduplication). */
    public void sameAs(String imageId, String otherId) {
        sameAs.put(imageId, otherId);
    }

    /** Requests received for a path ({@code /api/v7/cardinfo.php}, {@code /images/cards/1.jpg}). */
    public int hits(String path) {
        AtomicInteger count = hits.get(path);
        return count == null ? 0 : count.get();
    }

    /** Image requests received so far. */
    public int imageHits() {
        return hits.entrySet().stream()
                .filter(entry -> entry.getKey().startsWith("/images/"))
                .mapToInt(entry -> entry.getValue().get())
                .sum();
    }

    /** The last {@code User-Agent} seen on the API ({@code "api"}) and the image host. */
    public Map<String, String> userAgents() {
        return Map.copyOf(userAgents);
    }

    /** The generated bytes of an image. */
    public byte[] imageBytes(String imageId) {
        return images.computeIfAbsent(imageId, YgoProDeckStub::generate);
    }

    // -------------------------------------------------------------------------------------
    // API
    // -------------------------------------------------------------------------------------

    private void handleApi(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        hits.computeIfAbsent(path, p -> new AtomicInteger()).incrementAndGet();
        String agent = exchange.getRequestHeaders().getFirst("User-Agent");
        if (agent != null) {
            userAgents.put("api", agent);
        }
        try (exchange) {
            byte[] body;
            int status = 200;
            switch (path) {
                case "/api/v7/checkDBVer.php" ->
                        body =
                                ("[{\"database_version\":\""
                                                + version
                                                + "\",\"last_update\":\"2026-09-28 00:05:08\"}]")
                                        .getBytes(StandardCharsets.UTF_8);
                case "/api/v7/cardinfo.php" -> body = cardInfo;
                case "/api/v7/cardsets.php" -> body = cardSets;
                default -> {
                    status = 404;
                    body = "{\"error\":\"not found\"}".getBytes(StandardCharsets.UTF_8);
                }
            }
            if (apiDown) {
                status = 503;
                body = "<html>maintenance</html>".getBytes(StandardCharsets.UTF_8);
            }
            exchange.getResponseHeaders()
                    .set("Content-Type", status == 503 ? "text/html" : "application/json");
            exchange.sendResponseHeaders(status, body.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(body);
            }
        }
    }

    // -------------------------------------------------------------------------------------
    // Image host
    // -------------------------------------------------------------------------------------

    private void acceptImages() {
        while (!imageHost.isClosed()) {
            try {
                Socket socket = imageHost.accept();
                workers.execute(() -> serveImage(socket));
            } catch (IOException e) {
                return;
            }
        }
    }

    private void serveImage(Socket socket) {
        try (socket) {
            socket.setSoTimeout(10_000);
            InputStream in = socket.getInputStream();
            String requestLine = readLine(in);
            String line;
            String agent = null;
            while ((line = readLine(in)) != null && !line.isEmpty()) {
                if (line.toLowerCase(java.util.Locale.ROOT).startsWith("user-agent:")) {
                    agent = line.substring("user-agent:".length()).trim();
                }
            }
            if (agent != null) {
                userAgents.put("images", agent);
            }
            OutputStream out = socket.getOutputStream();
            Matcher matcher = requestLine == null ? null : IMAGE.matcher(requestLine);
            if (matcher == null || !matcher.matches()) {
                respond(
                        out,
                        404,
                        "text/html",
                        "<html>not found</html>".getBytes(StandardCharsets.UTF_8));
                return;
            }
            hits.computeIfAbsent(matcher.group(1), p -> new AtomicInteger()).incrementAndGet();
            String id = matcher.group(2);
            Behaviour behaviour = behaviours.getOrDefault(id, Behaviour.OK);
            switch (behaviour) {
                case NOT_FOUND ->
                        respond(
                                out,
                                404,
                                "text/html",
                                "<html>404</html>".getBytes(StandardCharsets.UTF_8));
                case HTML ->
                        respond(
                                out,
                                200,
                                "text/html; charset=utf-8",
                                "<!doctype html><html><body>Blocked</body></html>"
                                        .getBytes(StandardCharsets.UTF_8));
                case EMPTY -> respond(out, 200, "image/jpeg", new byte[0]);
                case SERVER_ERROR ->
                        respond(out, 503, "text/plain", "busy".getBytes(StandardCharsets.UTF_8));
                case SERVER_ERROR_ONCE -> {
                    behaviours.put(id, Behaviour.OK);
                    respond(out, 503, "text/plain", "busy".getBytes(StandardCharsets.UTF_8));
                }
                case TRUNCATED -> {
                    byte[] bytes = imageBytes(sameAs.getOrDefault(id, id));
                    out.write(headers(200, "image/jpeg", bytes.length));
                    out.write(bytes, 0, bytes.length / 3);
                    out.flush();
                    // The socket closes here: the client sees the connection drop mid-body.
                }
                case STALL -> {
                    byte[] bytes = imageBytes(sameAs.getOrDefault(id, id));
                    int first = bytes.length / 3;
                    out.write(headers(200, "image/jpeg", bytes.length));
                    out.write(bytes, 0, first);
                    out.flush();
                    try {
                        stalled.tryAcquire(10, TimeUnit.SECONDS);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                    out.write(bytes, first, bytes.length - first);
                    out.flush();
                }
                case OK -> respond(out, 200, "image/jpeg", imageBytes(sameAs.getOrDefault(id, id)));
            }
        } catch (IOException ignored) {
            // the client went away
        }
    }

    private static void respond(OutputStream out, int status, String type, byte[] body)
            throws IOException {
        out.write(headers(status, type, body.length));
        out.write(body);
        out.flush();
    }

    private static byte[] headers(int status, String type, long length) {
        String reason =
                switch (status) {
                    case 200 -> "OK";
                    case 404 -> "Not Found";
                    case 503 -> "Service Unavailable";
                    default -> "Status";
                };
        return ("HTTP/1.1 "
                        + status
                        + " "
                        + reason
                        + "\r\nContent-Type: "
                        + type
                        + "\r\nContent-Length: "
                        + length
                        + "\r\nConnection: close\r\n\r\n")
                .getBytes(StandardCharsets.ISO_8859_1);
    }

    private static String readLine(InputStream in) throws IOException {
        StringBuilder line = new StringBuilder();
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\n') {
                int length = line.length();
                if (length > 0 && line.charAt(length - 1) == '\r') {
                    line.setLength(length - 1);
                }
                return line.toString();
            }
            line.append((char) c);
            if (line.length() > 8192) {
                throw new IOException("header line too long");
            }
        }
        return line.length() == 0 ? null : line.toString();
    }

    // -------------------------------------------------------------------------------------
    // Fixtures
    // -------------------------------------------------------------------------------------

    private static byte[] cardInfo(JsonMapper mapper) throws IOException {
        JsonNode root;
        try (InputStream in = resource("ygoprodeck/cardinfo-fixture.json")) {
            root = mapper.readTree(in);
        }
        ArrayNode data = (ArrayNode) root.path("data");
        for (int i = 0; i < FILLER_CARDS; i++) {
            long id = FIRST_FILLER_ID + i;
            ObjectNode card = data.addObject();
            card.put("id", id);
            card.put("name", String.format("Filler Test Card %02d", i + 1));
            card.putArray("typeline").add("Warrior").add("Normal");
            card.put("type", "Normal Monster");
            card.put("humanReadableCardType", "Normal Monster");
            card.put("frameType", "normal");
            card.put("desc", "Fictional filler card " + (i + 1) + ".");
            card.put("race", "Warrior");
            card.put("atk", 1000 + i);
            card.put("def", 500 + i);
            card.put("level", 1 + (i % 12));
            card.put("attribute", "EARTH");
            ObjectNode image = card.putArray("card_images").addObject();
            image.put("id", id);
            image.put("image_url", "https://images.ygoprodeck.com/images/cards/" + id + ".jpg");
            ObjectNode set = card.putArray("card_sets").addObject();
            set.put("set_name", "Second Test Set");
            set.put("set_code", String.format("ZTS2-EN%03d", 101 + i));
            set.put("set_rarity", "Common");
            set.put("set_rarity_code", "(C)");
            set.put("set_price", "0");
        }
        return mapper.writeValueAsBytes(root);
    }

    private static InputStream resource(String name) throws IOException {
        InputStream in = YgoProDeckStub.class.getClassLoader().getResourceAsStream(name);
        if (in == null) {
            throw new IOException("Missing test resource " + name);
        }
        return in;
    }

    /**
     * A 421 × 614 JPEG (the YGOPRODeck card size): smooth shapes for fixture cards (a few KB),
     * seeded noise for fillers (a few hundred KB, so a 1 MB cache fills up quickly).
     */
    static byte[] generate(String imageId) {
        long id = Long.parseLong(imageId);
        Random random = new Random(id);
        BufferedImage image = new BufferedImage(421, 614, BufferedImage.TYPE_INT_RGB);
        if (id >= FIRST_FILLER_ID) {
            for (int y = 0; y < image.getHeight(); y++) {
                for (int x = 0; x < image.getWidth(); x++) {
                    image.setRGB(x, y, random.nextInt(0x1000000));
                }
            }
        } else {
            Graphics2D graphics = image.createGraphics();
            graphics.setColor(new Color(random.nextInt(0x1000000)));
            graphics.fillRect(0, 0, 421, 614);
            for (int i = 0; i < 6; i++) {
                graphics.setColor(new Color(random.nextInt(0x1000000)));
                graphics.fillRect(
                        random.nextInt(380),
                        random.nextInt(560),
                        40 + random.nextInt(120),
                        40 + random.nextInt(160));
            }
            graphics.dispose();
        }
        try {
            Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpeg");
            ImageWriter writer = writers.next();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (ImageOutputStream output = ImageIO.createImageOutputStream(out)) {
                writer.setOutput(output);
                ImageWriteParam param = writer.getDefaultWriteParam();
                param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
                param.setCompressionQuality(0.9f);
                writer.write(null, new IIOImage(image, null, null), param);
            } finally {
                writer.dispose();
            }
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
