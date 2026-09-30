package com.orenjitrade.api.profiles.domain;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;
import java.util.Optional;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;

/**
 * Turns an uploaded avatar into the stored rendition: the type is sniffed from the magic bytes
 * (JPEG, PNG or WebP; the client's content type is not trusted), dimensions are checked before
 * decoding (decompression-bomb guard), the image is cover-cropped to a centred square, scaled to
 * {@value #SIZE}x{@value #SIZE}, flattened on white and re-encoded as a baseline JPEG written
 * without any metadata (EXIF, GPS, ICC, comments are all dropped).
 *
 * <p>Output is JPEG rather than the WebP named in the Phase 1 contract: the JDK has no WebP encoder
 * and the TwelveMonkeys WebP plugin only decodes. The storage key carries the {@code .jpg}
 * extension, so switching the encoder later needs no data migration.
 */
public class AvatarImageProcessor {

    /** Edge length of the stored avatar in pixels. */
    public static final int SIZE = 512;

    /** Maximum upload size (bytes). */
    public static final int MAX_BYTES = 5 * 1024 * 1024;

    /** Maximum decoded edge length and pixel count accepted before decoding. */
    static final int MAX_EDGE = 8192;

    static final long MAX_PIXELS = 40_000_000L;

    static final float JPEG_QUALITY = 0.86f;

    public static final String OUTPUT_CONTENT_TYPE = "image/jpeg";
    public static final String OUTPUT_EXTENSION = "jpg";

    /** Why an upload was refused. */
    public enum Rejection {
        EMPTY,
        TOO_LARGE,
        UNSUPPORTED_TYPE,
        DIMENSIONS,
        UNREADABLE
    }

    /** Thrown for refused uploads; the message is safe to show to clients. */
    public static final class AvatarRejectedException extends RuntimeException {

        private final Rejection rejection;

        AvatarRejectedException(Rejection rejection, String message) {
            super(message);
            this.rejection = rejection;
        }

        public Rejection rejection() {
            return rejection;
        }
    }

    /** Supported input formats (ImageIO format names). */
    enum Format {
        JPEG("jpeg"),
        PNG("png"),
        WEBP("webp");

        final String imageIoName;

        Format(String imageIoName) {
            this.imageIoName = imageIoName;
        }
    }

    public AvatarImageProcessor() {
        // Registers plugins found on the application class path (the TwelveMonkeys WebP reader)
        // even when ImageIO was first initialised by another class loader (fat jar, test runners).
        ImageIO.scanForPlugins();
        ImageIO.setUseCache(false);
    }

    /**
     * @return the JPEG bytes of the 512x512 avatar
     * @throws AvatarRejectedException when the upload is empty, too big, of another type, oversized
     *     or not decodable
     */
    public byte[] process(byte[] upload) {
        if (upload.length == 0) {
            throw new AvatarRejectedException(Rejection.EMPTY, "The uploaded file is empty");
        }
        if (upload.length > MAX_BYTES) {
            throw new AvatarRejectedException(
                    Rejection.TOO_LARGE, "The avatar must be at most 5 MB");
        }
        Format format =
                sniff(upload)
                        .orElseThrow(
                                () ->
                                        new AvatarRejectedException(
                                                Rejection.UNSUPPORTED_TYPE,
                                                "The avatar must be a JPEG, PNG or WebP image"));
        BufferedImage source = decode(upload, format);
        return encodeJpeg(coverSquare(source));
    }

    /** The format announced by the file's magic bytes. */
    static Optional<Format> sniff(byte[] data) {
        if (data.length >= 3
                && (data[0] & 0xff) == 0xff
                && (data[1] & 0xff) == 0xd8
                && (data[2] & 0xff) == 0xff) {
            return Optional.of(Format.JPEG);
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
            return Optional.of(Format.PNG);
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
            return Optional.of(Format.WEBP);
        }
        return Optional.empty();
    }

    private static BufferedImage decode(byte[] data, Format format) {
        Iterator<ImageReader> readers = ImageIO.getImageReadersByFormatName(format.imageIoName);
        if (!readers.hasNext()) {
            throw new AvatarRejectedException(
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
                    || width > MAX_EDGE
                    || height > MAX_EDGE
                    || (long) width * height > MAX_PIXELS) {
                throw new AvatarRejectedException(
                        Rejection.DIMENSIONS,
                        "The image dimensions are not acceptable (at most "
                                + MAX_EDGE
                                + " pixels per side)");
            }
            BufferedImage image = reader.read(0);
            if (image == null) {
                throw unreadable();
            }
            return image;
        } catch (IOException | RuntimeException e) {
            if (e instanceof AvatarRejectedException rejected) {
                throw rejected;
            }
            throw unreadable();
        } finally {
            reader.dispose();
        }
    }

    /** Centre square crop scaled to {@value #SIZE} px, flattened onto white (RGB, no alpha). */
    static BufferedImage coverSquare(BufferedImage source) {
        int side = Math.min(source.getWidth(), source.getHeight());
        int x = (source.getWidth() - side) / 2;
        int y = (source.getHeight() - side) / 2;
        BufferedImage current = source.getSubimage(x, y, side, side);
        // Halve step by step while far above the target: much better than one bicubic pass.
        int currentSide = side;
        while (currentSide / 2 >= SIZE) {
            currentSide /= 2;
            current = scale(current, currentSide);
        }
        return scale(current, SIZE);
    }

    private static BufferedImage scale(BufferedImage source, int side) {
        BufferedImage target = new BufferedImage(side, side, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = target.createGraphics();
        try {
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, side, side);
            graphics.setRenderingHint(
                    RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            graphics.setRenderingHint(
                    RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            graphics.setRenderingHint(
                    RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            graphics.drawImage(source, 0, 0, side, side, null);
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
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(64 * 1024);
        try (ImageOutputStream output = ImageIO.createImageOutputStream(bytes)) {
            writer.setOutput(output);
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(JPEG_QUALITY);
            // No stream metadata, no image metadata: nothing from the upload survives.
            writer.write(null, new IIOImage(image, null, null), param);
        } catch (IOException e) {
            throw new IllegalStateException("Could not encode the avatar", e);
        } finally {
            writer.dispose();
        }
        return bytes.toByteArray();
    }

    private static AvatarRejectedException unreadable() {
        return new AvatarRejectedException(
                Rejection.UNREADABLE, "The image could not be read; upload a valid image file");
    }
}
