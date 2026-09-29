package com.orenjitrade.api.inventory.domain;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;

/**
 * Re-encodes an uploaded item photo: the type is sniffed from the magic bytes (JPEG, PNG or WebP;
 * the client's content type is not trusted), dimensions are checked before decoding
 * (decompression-bomb guard), the image is scaled to fit {@value #MAX_EDGE_OUT} pixels on its long
 * side (never enlarged), flattened on white and written as a baseline JPEG without any metadata
 * (EXIF, GPS, ICC and comments are dropped). Same approach as the avatar processor, without the
 * square crop.
 */
@Component
public class ItemImageProcessor {

    /** Maximum upload size (bytes). */
    public static final int MAX_BYTES = 8 * 1024 * 1024;

    /** Long side of the stored rendition. */
    public static final int MAX_EDGE_OUT = 1600;

    public static final String OUTPUT_CONTENT_TYPE = "image/jpeg";
    public static final String OUTPUT_EXTENSION = "jpg";

    static final int MAX_EDGE_IN = 8192;
    static final long MAX_PIXELS = 40_000_000L;
    static final float JPEG_QUALITY = 0.86f;

    /** Why an upload was refused. */
    public enum Rejection {
        EMPTY,
        TOO_LARGE,
        UNSUPPORTED_TYPE,
        DIMENSIONS,
        UNREADABLE
    }

    /** Thrown for refused uploads; the message is safe to show to clients. */
    public static final class ImageRejectedException extends RuntimeException {

        private final Rejection rejection;

        ImageRejectedException(Rejection rejection, String message) {
            super(message);
            this.rejection = rejection;
        }

        public Rejection rejection() {
            return rejection;
        }
    }

    /**
     * The stored rendition.
     *
     * @param jpeg encoded bytes
     * @param width pixels
     * @param height pixels
     */
    public record Processed(byte[] jpeg, int width, int height) {}

    public ItemImageProcessor() {
        ImageIO.scanForPlugins();
        ImageIO.setUseCache(false);
    }

    public Processed process(byte[] upload) {
        if (upload.length == 0) {
            throw new ImageRejectedException(Rejection.EMPTY, "The uploaded file is empty");
        }
        if (upload.length > MAX_BYTES) {
            throw new ImageRejectedException(Rejection.TOO_LARGE, "The image must be at most 8 MB");
        }
        String format = sniff(upload);
        if (format == null) {
            throw new ImageRejectedException(
                    Rejection.UNSUPPORTED_TYPE, "The image must be a JPEG, PNG or WebP file");
        }
        BufferedImage scaled = fit(decode(upload, format));
        return new Processed(encodeJpeg(scaled), scaled.getWidth(), scaled.getHeight());
    }

    /** ImageIO format name announced by the magic bytes, {@code null} for anything else. */
    static @Nullable String sniff(byte[] data) {
        if (data.length >= 3
                && (data[0] & 0xff) == 0xff
                && (data[1] & 0xff) == 0xd8
                && (data[2] & 0xff) == 0xff) {
            return "jpeg";
        }
        if (data.length >= 8
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
        if (data.length >= 12
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

    private static BufferedImage decode(byte[] data, String format) {
        Iterator<ImageReader> readers = ImageIO.getImageReadersByFormatName(format);
        if (!readers.hasNext()) {
            throw new ImageRejectedException(
                    Rejection.UNSUPPORTED_TYPE, "This image format is not supported");
        }
        ImageReader reader = readers.next();
        try (ImageInputStream input =
                ImageIO.createImageInputStream(new ByteArrayInputStream(data))) {
            reader.setInput(input, true, true);
            int width = reader.getWidth(0);
            int height = reader.getHeight(0);
            if (width <= 0
                    || height <= 0
                    || width > MAX_EDGE_IN
                    || height > MAX_EDGE_IN
                    || (long) width * height > MAX_PIXELS) {
                throw new ImageRejectedException(
                        Rejection.DIMENSIONS,
                        "The image dimensions are not acceptable (at most "
                                + MAX_EDGE_IN
                                + " pixels per side)");
            }
            BufferedImage image = reader.read(0);
            if (image == null) {
                throw unreadable();
            }
            return image;
        } catch (IOException | RuntimeException e) {
            if (e instanceof ImageRejectedException rejected) {
                throw rejected;
            }
            throw unreadable();
        } finally {
            reader.dispose();
        }
    }

    /** Scales down to {@link #MAX_EDGE_OUT} on the long side, flattened onto white (RGB). */
    static BufferedImage fit(BufferedImage source) {
        int width = source.getWidth();
        int height = source.getHeight();
        double factor = Math.min(1.0, (double) MAX_EDGE_OUT / Math.max(width, height));
        int targetWidth = Math.max(1, (int) Math.round(width * factor));
        int targetHeight = Math.max(1, (int) Math.round(height * factor));
        BufferedImage current = source;
        int currentWidth = width;
        int currentHeight = height;
        // Halve step by step while far above the target: much better than one bicubic pass.
        while (currentWidth / 2 >= targetWidth && currentHeight / 2 >= targetHeight) {
            currentWidth /= 2;
            currentHeight /= 2;
            current = scale(current, currentWidth, currentHeight);
        }
        return scale(current, targetWidth, targetHeight);
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

    private static byte[] encodeJpeg(BufferedImage image) {
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpeg");
        if (!writers.hasNext()) {
            throw new IllegalStateException("No JPEG writer available");
        }
        ImageWriter writer = writers.next();
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(128 * 1024);
        try (ImageOutputStream output = ImageIO.createImageOutputStream(bytes)) {
            writer.setOutput(output);
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(JPEG_QUALITY);
            writer.write(null, new IIOImage(image, null, null), param);
        } catch (IOException e) {
            throw new IllegalStateException("Could not encode the image", e);
        } finally {
            writer.dispose();
        }
        return bytes.toByteArray();
    }

    private static ImageRejectedException unreadable() {
        return new ImageRejectedException(
                Rejection.UNREADABLE, "The image could not be read; upload a valid image file");
    }
}
