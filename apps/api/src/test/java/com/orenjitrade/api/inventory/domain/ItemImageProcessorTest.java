package com.orenjitrade.api.inventory.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orenjitrade.api.inventory.domain.ItemImageProcessor.ImageRejectedException;
import com.orenjitrade.api.inventory.domain.ItemImageProcessor.Rejection;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

/** Item photos are sniffed, bounded, scaled down and re-encoded as metadata-free JPEG. */
class ItemImageProcessorTest {

    private final ItemImageProcessor processor = new ItemImageProcessor();

    private static byte[] encode(int width, int height, String format) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int type = format.equals("png") ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB;
        ImageIO.write(new BufferedImage(width, height, type), format, out);
        return out.toByteArray();
    }

    @Test
    void largeImagesAreScaledDownKeepingTheirAspectRatio() throws IOException {
        ItemImageProcessor.Processed processed = processor.process(encode(3200, 2400, "png"));
        assertThat(processed.width()).isEqualTo(1600);
        assertThat(processed.height()).isEqualTo(1200);
        BufferedImage decoded = ImageIO.read(new ByteArrayInputStream(processed.jpeg()));
        assertThat(decoded.getWidth()).isEqualTo(1600);
        assertThat(ItemImageProcessor.sniff(processed.jpeg())).isEqualTo("jpeg");
    }

    @Test
    void smallImagesAreNeverEnlarged() throws IOException {
        ItemImageProcessor.Processed processed = processor.process(encode(300, 420, "jpeg"));
        assertThat(processed.width()).isEqualTo(300);
        assertThat(processed.height()).isEqualTo(420);
    }

    @Test
    void theOutputCarriesNoMetadataSegments() throws IOException {
        byte[] jpeg = processor.process(encode(200, 200, "jpeg")).jpeg();
        // No APP1 (EXIF/XMP) segment in the re-encoded file.
        for (int i = 0; i + 1 < jpeg.length; i++) {
            assertThat((jpeg[i] & 0xff) == 0xff && (jpeg[i + 1] & 0xff) == 0xe1)
                    .as("APP1 marker at %s", i)
                    .isFalse();
        }
    }

    @Test
    void unsupportedEmptyAndBrokenUploadsAreRejected() {
        assertThatThrownBy(() -> processor.process(new byte[0]))
                .isInstanceOf(ImageRejectedException.class)
                .extracting(e -> ((ImageRejectedException) e).rejection())
                .isEqualTo(Rejection.EMPTY);
        assertThatThrownBy(() -> processor.process("GIF89a....".getBytes()))
                .isInstanceOf(ImageRejectedException.class)
                .extracting(e -> ((ImageRejectedException) e).rejection())
                .isEqualTo(Rejection.UNSUPPORTED_TYPE);
        byte[] truncatedPng = {(byte) 0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0};
        assertThatThrownBy(() -> processor.process(truncatedPng))
                .isInstanceOf(ImageRejectedException.class)
                .extracting(e -> ((ImageRejectedException) e).rejection())
                .isEqualTo(Rejection.UNREADABLE);
        assertThatThrownBy(() -> processor.process(new byte[ItemImageProcessor.MAX_BYTES + 1]))
                .isInstanceOf(ImageRejectedException.class)
                .extracting(e -> ((ImageRejectedException) e).rejection())
                .isEqualTo(Rejection.TOO_LARGE);
    }
}
