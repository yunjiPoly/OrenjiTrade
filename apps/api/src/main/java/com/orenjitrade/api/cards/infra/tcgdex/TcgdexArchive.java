package com.orenjitrade.api.cards.infra.tcgdex;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Enumeration;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import org.jspecify.annotations.Nullable;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Reads a downloaded archive of github.com/tcgdex/cards-database (a zip whose single top folder
 * holds the repository) without extracting it: the international {@code data/} folder only ({@code
 * data-asia/} holds the Asian-language cards), {@code data/<serie>.ts}, {@code
 * data/<serie>/<set>.ts} and {@code data/<serie>/<set>/<localId>.ts}. Each file is parsed on its
 * own ({@link TsLiteral}); a file that cannot be read is skipped and counted, never fatal. The
 * repository's {@code LICENSE} (MIT) is returned so its notice is kept with the copy.
 */
final class TcgdexArchive {

    static final String DATA = "data/";
    static final long MAX_FILE_BYTES = 1024 * 1024;
    static final int MAX_ENTRIES = 400_000;
    static final String UNREADABLE = "data files that could not be read skipped";

    private TcgdexArchive() {}

    /**
     * Feeds every data file of {@code zip} to {@code builder}.
     *
     * @return the repository's {@code LICENSE} text, if the archive has one
     */
    static @Nullable String read(Path zip, JsonMapper jsonMapper, TcgdexMapper.Builder builder)
            throws IOException {
        @Nullable String license = null;
        try (ZipFile file = new ZipFile(zip.toFile(), StandardCharsets.UTF_8)) {
            Enumeration<? extends ZipEntry> entries = file.entries();
            int seen = 0;
            while (entries.hasMoreElements()) {
                if (++seen > MAX_ENTRIES) {
                    throw new IOException("The archive holds too many files");
                }
                ZipEntry entry = entries.nextElement();
                if (entry.isDirectory()) {
                    continue;
                }
                String path = withoutTopFolder(entry.getName());
                if (path == null) {
                    continue;
                }
                if (path.equals("LICENSE") || path.equals("LICENSE.md")) {
                    license = readText(file, entry, 64 * 1024);
                    continue;
                }
                if (!path.startsWith(DATA) || !path.endsWith(".ts")) {
                    continue;
                }
                String[] parts = path.substring(DATA.length(), path.length() - 3).split("/");
                if (parts.length < 1 || parts.length > 3) {
                    continue;
                }
                @Nullable JsonNode node = parse(file, entry, path, jsonMapper, builder);
                if (node == null) {
                    continue;
                }
                switch (parts.length) {
                    case 1 -> builder.serie(parts[0], node);
                    case 2 -> builder.set(parts[0], parts[1], node);
                    default -> builder.card(parts[0], parts[1], parts[2], node);
                }
            }
        }
        return license;
    }

    /** {@code cards-database-<sha>/data/x.ts} → {@code data/x.ts}; null for unsafe names. */
    static @Nullable String withoutTopFolder(String name) {
        if (name.contains("..") || name.contains("\\") || name.startsWith("/")) {
            return null;
        }
        int slash = name.indexOf('/');
        return slash < 0 ? null : name.substring(slash + 1);
    }

    private static @Nullable JsonNode parse(
            ZipFile file,
            ZipEntry entry,
            String path,
            JsonMapper jsonMapper,
            TcgdexMapper.Builder builder) {
        try {
            String source = readText(file, entry, MAX_FILE_BYTES);
            if (source == null) {
                builder.warnings().add(UNREADABLE, path);
                return null;
            }
            JsonNode node = jsonMapper.readTree(TsLiteral.objectJson(source));
            return node != null && node.isObject() ? node : null;
        } catch (IOException | TsLiteral.TsLiteralException | JacksonException e) {
            builder.warnings().add(UNREADABLE, path);
            return null;
        }
    }

    private static @Nullable String readText(ZipFile file, ZipEntry entry, long maxBytes)
            throws IOException {
        if (entry.getSize() > maxBytes) {
            return null;
        }
        try (InputStream in = file.getInputStream(entry)) {
            byte[] bytes = in.readNBytes((int) maxBytes + 1);
            if (bytes.length > maxBytes) {
                return null;
            }
            return new String(bytes, StandardCharsets.UTF_8);
        }
    }
}
