package com.orenjitrade.api.inventory.domain.imports;

import com.orenjitrade.api.inventory.domain.imports.ImportFileException.Reason;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;

/**
 * Turns the bytes of an import file into text, or refuses them. An import file is a UTF-8 text file
 * (a byte-order mark is accepted): anything else, a binary file given a text name as much as a text
 * file in another encoding, is refused before a parser looks at it. The same idea as the content
 * sniffing of image uploads: the server decides what a file is from its content, never from its
 * name or its declared type.
 */
public final class ImportText {

    private ImportText() {}

    /**
     * The text of {@code bytes}.
     *
     * @throws ImportFileException {@link Reason#TOO_LARGE} above {@code maxBytes}, {@link
     *     Reason#EMPTY_FILE} without content, {@link Reason#NOT_TEXT} for anything that is not
     *     UTF-8 text
     */
    public static String decode(byte[] bytes, int maxBytes) {
        if (bytes.length > maxBytes) {
            throw new ImportFileException(
                    Reason.TOO_LARGE,
                    "The file is larger than " + describeBytes(maxBytes),
                    maxBytes);
        }
        int offset = 0;
        if (bytes.length >= 3
                && (bytes[0] & 0xff) == 0xef
                && (bytes[1] & 0xff) == 0xbb
                && (bytes[2] & 0xff) == 0xbf) {
            offset = 3;
        }
        String text;
        try {
            text =
                    StandardCharsets.UTF_8
                            .newDecoder()
                            .onMalformedInput(CodingErrorAction.REPORT)
                            .onUnmappableCharacter(CodingErrorAction.REPORT)
                            .decode(ByteBuffer.wrap(bytes, offset, bytes.length - offset))
                            .toString();
        } catch (CharacterCodingException e) {
            throw notText();
        }
        for (int index = 0; index < text.length(); index++) {
            char c = text.charAt(index);
            if ((c < 0x20 && c != '\t' && c != '\n' && c != '\r') || c == 0x7f) {
                throw notText();
            }
        }
        if (text.isBlank()) {
            throw new ImportFileException(Reason.EMPTY_FILE, "The file is empty");
        }
        return text;
    }

    /** {@code "100 kB"}, {@code "2 MB"}: how a size limit reads in a message. */
    public static String describeBytes(int bytes) {
        if (bytes >= 1024 * 1024 && bytes % (1024 * 1024) == 0) {
            return bytes / (1024 * 1024) + " MB";
        }
        if (bytes >= 1024) {
            return bytes / 1024 + " kB";
        }
        return bytes + " bytes";
    }

    private static ImportFileException notText() {
        return new ImportFileException(
                Reason.NOT_TEXT, "The file is not a text file in UTF-8: save it as UTF-8 text");
    }
}
