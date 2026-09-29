package com.orenjitrade.api.profiles.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orenjitrade.api.profiles.domain.AvatarImageProcessor.AvatarRejectedException;
import com.orenjitrade.api.profiles.domain.AvatarImageProcessor.Rejection;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

/** Avatar validation and re-encoding. */
class AvatarImageProcessorTest {

    /** 1x1 lossless WebP (the classic browser feature-detection sample). */
    static final String WEBP_LOSSLESS_1PX = "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";

    /** 1x1 lossy WebP. */
    static final String WEBP_LOSSY_1PX = "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA";

    private final AvatarImageProcessor processor = new AvatarImageProcessor();

    @Test
    void pngIsCoverCroppedTo512SquareJpeg() throws IOException {
        // 800x400: left half red, right half blue; the centred square crop keeps both halves.
        BufferedImage source = new BufferedImage(800, 400, BufferedImage.TYPE_INT_ARGB);
        Graphics2D graphics = source.createGraphics();
        graphics.setColor(Color.RED);
        graphics.fillRect(0, 0, 400, 400);
        graphics.setColor(Color.BLUE);
        graphics.fillRect(400, 0, 400, 400);
        graphics.dispose();

        byte[] output = processor.process(encode(source, "png"));

        assertThat(AvatarImageProcessor.sniff(output)).contains(AvatarImageProcessor.Format.JPEG);
        BufferedImage result = ImageIO.read(new ByteArrayInputStream(output));
        assertThat(result.getWidth()).isEqualTo(512);
        assertThat(result.getHeight()).isEqualTo(512);
        assertThat(new Color(result.getRGB(10, 256)).getRed()).isGreaterThan(200);
        assertThat(new Color(result.getRGB(500, 256)).getBlue()).isGreaterThan(200);
    }

    @Test
    void exifAndCommentsAreStripped() throws IOException {
        BufferedImage source = new BufferedImage(600, 900, BufferedImage.TYPE_INT_RGB);
        byte[] jpeg = encode(source, "jpeg");
        byte[] withExif = insertExifSegment(jpeg, "GPS 45.5231 -73.5812 SecretCamera");
        assertThat(new String(withExif, StandardCharsets.ISO_8859_1)).contains("SecretCamera");

        byte[] output = processor.process(withExif);

        String raw = new String(output, StandardCharsets.ISO_8859_1);
        assertThat(raw)
                .doesNotContain("Exif")
                .doesNotContain("SecretCamera")
                .doesNotContain("45.5231");
        BufferedImage result = ImageIO.read(new ByteArrayInputStream(output));
        assertThat(result.getWidth()).isEqualTo(512);
        assertThat(result.getHeight()).isEqualTo(512);
    }

    @Test
    void webpIsDecodedAndUpscaled() throws IOException {
        for (String sample : new String[] {WEBP_LOSSLESS_1PX, WEBP_LOSSY_1PX}) {
            byte[] output = processor.process(Base64.getDecoder().decode(sample));
            BufferedImage result = ImageIO.read(new ByteArrayInputStream(output));
            assertThat(result.getWidth()).isEqualTo(512);
        }
    }

    @Test
    void rejectsEmptyOversizedForeignAndCorruptFiles() throws IOException {
        assertRejected(new byte[0], Rejection.EMPTY);
        assertRejected(new byte[AvatarImageProcessor.MAX_BYTES + 1], Rejection.TOO_LARGE);
        assertRejected(
                "GIF89a....".getBytes(StandardCharsets.US_ASCII), Rejection.UNSUPPORTED_TYPE);
        assertRejected("%PDF-1.7".getBytes(StandardCharsets.US_ASCII), Rejection.UNSUPPORTED_TYPE);
        byte[] truncated = new byte[64];
        truncated[0] = (byte) 0xff;
        truncated[1] = (byte) 0xd8;
        truncated[2] = (byte) 0xff;
        assertRejected(truncated, Rejection.UNREADABLE);
    }

    @Test
    void rejectsDecompressionBombsBeforeDecoding() throws IOException {
        // A PNG header announcing 20000 x 20000 pixels: refused from the header alone.
        BufferedImage tiny = new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB);
        byte[] png = encode(tiny, "png");
        // IHDR width/height live at offsets 16..23.
        writeInt(png, 16, 20_000);
        writeInt(png, 20, 20_000);
        assertRejected(png, Rejection.DIMENSIONS);
    }

    private void assertRejected(byte[] upload, Rejection expected) {
        assertThatThrownBy(() -> processor.process(upload))
                .isInstanceOf(AvatarRejectedException.class)
                .satisfies(
                        e ->
                                assertThat(((AvatarRejectedException) e).rejection())
                                        .isEqualTo(expected));
    }

    static byte[] encode(BufferedImage image, String format) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        assertThat(ImageIO.write(image, format, out)).isTrue();
        return out.toByteArray();
    }

    /** Inserts an APP1 "Exif" segment carrying {@code payload} right after the SOI marker. */
    static byte[] insertExifSegment(byte[] jpeg, String payload) {
        byte[] body = ("Exif\0\0" + payload).getBytes(StandardCharsets.ISO_8859_1);
        int length = body.length + 2;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(jpeg, 0, 2);
        out.write(0xff);
        out.write(0xe1);
        out.write((length >> 8) & 0xff);
        out.write(length & 0xff);
        out.write(body, 0, body.length);
        out.write(jpeg, 2, jpeg.length - 2);
        return out.toByteArray();
    }

    private static void writeInt(byte[] data, int offset, int value) {
        data[offset] = (byte) (value >>> 24);
        data[offset + 1] = (byte) (value >>> 16);
        data[offset + 2] = (byte) (value >>> 8);
        data[offset + 3] = (byte) value;
    }
}
