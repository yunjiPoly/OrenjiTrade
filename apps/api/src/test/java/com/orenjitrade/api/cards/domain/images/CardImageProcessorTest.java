package com.orenjitrade.api.cards.domain.images;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** The single cached rendition: content sniffing, resizing without upscaling, clean JPEG. */
class CardImageProcessorTest {

    @TempDir Path dir;

    private final CardImageProcessor processor = new CardImageProcessor(320, 0.82f);

    private Path file(String name, byte[] content) throws Exception {
        Path path = dir.resolve(name);
        Files.write(path, content);
        return path;
    }

    private static byte[] image(String format, int width, int height) throws Exception {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = image.createGraphics();
        graphics.setColor(Color.ORANGE);
        graphics.fillRect(0, 0, width, height);
        graphics.setColor(Color.BLUE);
        graphics.fillOval(width / 4, height / 4, width / 2, height / 2);
        graphics.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, format, out);
        return out.toByteArray();
    }

    @Test
    void largeImagesAreScaledToTheTargetWidthAsJpeg() throws Exception {
        CardImageProcessor.Rendition rendition =
                processor.process(file("big.png", image("png", 842, 1228)));
        assertThat(rendition.width()).isEqualTo(320);
        assertThat(rendition.height()).isEqualTo(467);
        assertThat(rendition.jpeg()[0] & 0xff).isEqualTo(0xff);
        assertThat(rendition.jpeg()[1] & 0xff).isEqualTo(0xd8);
        assertThat(new String(rendition.jpeg(), StandardCharsets.ISO_8859_1))
                .doesNotContain("Exif");
        assertThat(ImageIO.read(new ByteArrayInputStream(rendition.jpeg())).getWidth())
                .isEqualTo(320);
        assertThat(rendition.sha256())
                .isEqualTo(CardImageProcessor.sha256(rendition.jpeg()))
                .hasSize(64);
    }

    @Test
    void smallImagesAreNeverUpscaled() throws Exception {
        CardImageProcessor.Rendition rendition =
                processor.process(file("small.jpg", image("jpg", 168, 246)));
        assertThat(rendition.width()).isEqualTo(168);
        assertThat(rendition.height()).isEqualTo(246);
    }

    @Test
    void theSameInputAlwaysYieldsTheSameChecksum() throws Exception {
        byte[] source = image("jpg", 421, 614);
        assertThat(processor.process(file("a.jpg", source)).sha256())
                .isEqualTo(processor.process(file("b.jpg", source)).sha256());
    }

    @Test
    void htmlEmptyAndTruncatedContentAreRefused() throws Exception {
        assertThatThrownBy(
                        () ->
                                processor.process(
                                        file(
                                                "page.jpg",
                                                "<!doctype html><html></html>"
                                                        .getBytes(StandardCharsets.UTF_8))))
                .isInstanceOf(CardImageProcessor.InvalidImageException.class)
                .hasMessageContaining("not an image");
        assertThatThrownBy(() -> processor.process(file("empty.jpg", new byte[0])))
                .isInstanceOf(CardImageProcessor.InvalidImageException.class)
                .hasMessageContaining("empty");
        byte[] jpeg = image("jpg", 421, 614);
        byte[] truncated = java.util.Arrays.copyOf(jpeg, 40);
        assertThatThrownBy(() -> processor.process(file("cut.jpg", truncated)))
                .isInstanceOf(CardImageProcessor.InvalidImageException.class);
    }
}
