package com.orenjitrade.api.cards.domain.images;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Iterator;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;
import org.jspecify.annotations.Nullable;

/**
 * Turns a downloaded artwork into the single cached rendition (ADR 0015): the type is sniffed from
 * the magic bytes (JPEG, PNG or WebP; HTML error pages, empty bodies and anything else are refused
 * whatever the {@code Content-Type} said), the dimensions are checked before decoding
 * (decompression-bomb guard), the image is scaled down to the target width (never enlarged),
 * flattened on white and re-encoded as a baseline JPEG without metadata (EXIF, ICC, comments
 * dropped). Deterministic for a given input, so re-downloads produce the same checksum.
 */
public final class CardImageProcessor {

    static final int MAX_EDGE_IN = 8192;
    static final long MAX_PIXELS = 40_000_000L;

    public static final String CONTENT_TYPE = "image/jpeg";

    private final int targetWidth;
    private final float quality;

    static {
        ImageIO.scanForPlugins();
        ImageIO.setUseCache(false);
    }

    public CardImageProcessor(int targetWidth, float quality) {
        this.targetWidth = targetWidth;
        this.quality = quality;
    }

    /** Thrown for content that is not a usable image; the message is client-safe. */
    public static final class InvalidImageException extends Exception {
        public InvalidImageException(String message) {
            super(message);
        }
    }

    /**
     * The stored rendition.
     *
     * @param jpeg encoded bytes
     * @param width pixels
     * @param height pixels
     * @param sha256 lower-case hex SHA-256 of {@code jpeg}
     */
    public record Rendition(byte[] jpeg, int width, int height, String sha256) {}

    /** Processes the downloaded file {@code raw}. */
    public Rendition process(Path raw) throws InvalidImageException, IOException {
        long size = Files.size(raw);
        if (size == 0) {
            throw new InvalidImageException("empty response body");
        }
        byte[] head = new byte[12];
        int headLength;
        try (InputStream in = Files.newInputStream(raw)) {
            headLength = in.readNBytes(head, 0, head.length);
        }
        @Nullable String format = sniff(head, headLength);
        if (format == null) {
            throw new InvalidImageException("not an image (unrecognised content)");
        }
        BufferedImage decoded = decode(raw, format);
        BufferedImage scaled = fit(decoded, targetWidth);
        byte[] jpeg = encode(scaled, quality);
        return new Rendition(jpeg, scaled.getWidth(), scaled.getHeight(), sha256(jpeg));
    }

    /** ImageIO format announced by the magic bytes, {@code null} for anything else. */
    static @Nullable String sniff(byte[] data, int length) {
        if (length >= 3
                && (data[0] & 0xff) == 0xff
                && (data[1] & 0xff) == 0xd8
                && (data[2] & 0xff) == 0xff) {
            return "jpeg";
        }
        if (length >= 8
                && (data[0] & 0xff) == 0x89
                && data[1] == 'P'
                && data[2] == 'N'
                && data[3] == 'G'
                && data[4] == 0x0d
                && data[5] == 0x0a
                && data[6] == 0x1a
                && data[7] == 0x0a) {
            return "png";
        }
        if (length >= 12
                && data[0] == 'R'
                && data[1] == 'I'
                && data[2] == 'F'
                && data[3] == 'F'
                && data[8] == 'W'
                && data[9] == 'E'
                && data[10] == 'B'
                && data[11] == 'P') {
            return "webp";
        }
        return null;
    }

    private static BufferedImage decode(Path raw, String format) throws InvalidImageException {
        Iterator<ImageReader> readers = ImageIO.getImageReadersByFormatName(format);
        if (!readers.hasNext()) {
            throw new InvalidImageException("unsupported image format");
        }
        ImageReader reader = readers.next();
        try (ImageInputStream input = ImageIO.createImageInputStream(raw.toFile())) {
            if (input == null) {
                throw new InvalidImageException("unreadable image");
            }
            reader.setInput(input, true, true);
            int width = reader.getWidth(0);
            int height = reader.getHeight(0);
            if (width <= 0
                    || height <= 0
                    || width > MAX_EDGE_IN
                    || height > MAX_EDGE_IN
                    || (long) width * height > MAX_PIXELS) {
                throw new InvalidImageException("image dimensions out of range");
            }
            BufferedImage image = reader.read(0);
            if (image == null) {
                throw new InvalidImageException("unreadable image");
            }
            return image;
        } catch (IOException | RuntimeException e) {
            throw new InvalidImageException("unreadable or truncated image");
        } finally {
            reader.dispose();
        }
    }

    /** Scales down to {@code targetWidth} (aspect ratio kept, never enlarged), RGB on white. */
    static BufferedImage fit(BufferedImage source, int targetWidth) {
        int width = source.getWidth();
        int height = source.getHeight();
        double factor = Math.min(1.0, (double) targetWidth / width);
        int outWidth = Math.max(1, (int) Math.round(width * factor));
        int outHeight = Math.max(1, (int) Math.round(height * factor));
        BufferedImage current = source;
        int currentWidth = width;
        int currentHeight = height;
        while (currentWidth / 2 >= outWidth && currentHeight / 2 >= outHeight) {
            currentWidth /= 2;
            currentHeight /= 2;
            current = scale(current, currentWidth, currentHeight);
        }
        return scale(current, outWidth, outHeight);
    }

    private static BufferedImage scale(BufferedImage source, int width, int height) {
        BufferedImage target = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = target.createGraphics();
        try {
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, width, height);
            graphics.setRenderingHint(
                    RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            graphics.setRenderingHint(
                    RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            graphics.setRenderingHint(
                    RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            graphics.drawImage(source, 0, 0, width, height, null);
        } finally {
            graphics.dispose();
        }
        return target;
    }

    /** Baseline JPEG without metadata. */
    static byte[] encode(BufferedImage image, float quality) throws IOException {
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpeg");
        if (!writers.hasNext()) {
            throw new IOException("No JPEG encoder available");
        }
        ImageWriter writer = writers.next();
        ByteArrayOutputStream out = new ByteArrayOutputStream(64 * 1024);
        try (ImageOutputStream output = ImageIO.createImageOutputStream(out)) {
            writer.setOutput(output);
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(quality);
            writer.write(null, new IIOImage(image, null, null), param);
        } finally {
            writer.dispose();
        }
        return out.toByteArray();
    }

    public static String sha256(byte[] data) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
