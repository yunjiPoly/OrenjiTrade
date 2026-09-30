package com.orenjitrade.api.cards.domain;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Renders the card placeholder served by {@code GET
 * /api/v1/public/placeholder-images/{game}/{slug}.svg}: a card-shaped (63 x 88 mm ratio) SVG with a
 * game-coloured frame, the card name and the game name. Pure text generation: no scripts, no
 * external references, every text node XML-escaped.
 */
public final class PlaceholderSvgRenderer {

    static final int MAX_LINE = 18;
    static final int MAX_LINES = 4;

    /** Frame colours per game; unknown games get the neutral one. */
    private static final Map<String, String[]> PALETTES =
            Map.of(
                    "yugioh", new String[] {"#6b3fa0", "#f3ecfa"},
                    "pokemon", new String[] {"#d9a400", "#fff8e0"},
                    "mtg", new String[] {"#8a5a2b", "#f7efe6"},
                    "riftbound", new String[] {"#1f6f8b", "#e8f4f8"});

    private static final String[] NEUTRAL = {"#e8590c", "#fff4ec"};

    private PlaceholderSvgRenderer() {}

    public static String render(String gameSlug, String gameName, String cardName) {
        String[] palette = PALETTES.getOrDefault(gameSlug, NEUTRAL);
        String frame = palette[0];
        String fill = palette[1];
        int width = CatalogImages.PLACEHOLDER_WIDTH;
        int height = CatalogImages.PLACEHOLDER_HEIGHT;
        List<String> lines = wrap(cardName);
        StringBuilder svg = new StringBuilder(1024);
        svg.append("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"")
                .append(width)
                .append("\" height=\"")
                .append(height)
                .append("\" viewBox=\"0 0 ")
                .append(width)
                .append(' ')
                .append(height)
                .append("\" role=\"img\" aria-label=\"")
                .append(escape(cardName))
                .append("\">");
        svg.append("<title>").append(escape(cardName)).append("</title>");
        svg.append("<rect x=\"4\" y=\"4\" width=\"")
                .append(width - 8)
                .append("\" height=\"")
                .append(height - 8)
                .append("\" rx=\"24\" fill=\"")
                .append(fill)
                .append("\" stroke=\"")
                .append(frame)
                .append("\" stroke-width=\"8\"/>");
        svg.append("<rect x=\"36\" y=\"96\" width=\"")
                .append(width - 72)
                .append("\" height=\"300\" rx=\"12\" fill=\"")
                .append(frame)
                .append("\" fill-opacity=\"0.18\"/>");
        svg.append("<text x=\"")
                .append(width / 2)
                .append("\" y=\"64\" text-anchor=\"middle\" font-family=\"sans-serif\"")
                .append(" font-size=\"22\" font-weight=\"600\" fill=\"")
                .append(frame)
                .append("\">")
                .append(escape(gameName))
                .append("</text>");
        int y = 460;
        for (String line : lines) {
            svg.append("<text x=\"")
                    .append(width / 2)
                    .append("\" y=\"")
                    .append(y)
                    .append("\" text-anchor=\"middle\" font-family=\"sans-serif\"")
                    .append(" font-size=\"34\" font-weight=\"700\" fill=\"#212121\">")
                    .append(escape(line))
                    .append("</text>");
            y += 44;
        }
        svg.append("<text x=\"")
                .append(width / 2)
                .append("\" y=\"")
                .append(height - 36)
                .append("\" text-anchor=\"middle\" font-family=\"sans-serif\"")
                .append(" font-size=\"16\" fill=\"#616161\">OrenjiTrade placeholder</text>");
        svg.append("</svg>");
        return svg.toString();
    }

    /** Greedy word wrap to {@link #MAX_LINE} characters, at most {@link #MAX_LINES} lines. */
    static List<String> wrap(String text) {
        List<String> lines = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String word : text.trim().split("\\s+")) {
            String piece = word.length() > MAX_LINE ? word.substring(0, MAX_LINE - 1) + "…" : word;
            if (current.length() > 0 && current.length() + 1 + piece.length() > MAX_LINE) {
                lines.add(current.toString());
                current.setLength(0);
            }
            if (current.length() > 0) {
                current.append(' ');
            }
            current.append(piece);
        }
        if (current.length() > 0) {
            lines.add(current.toString());
        }
        if (lines.size() > MAX_LINES) {
            List<String> truncated = new ArrayList<>(lines.subList(0, MAX_LINES));
            String last = truncated.get(MAX_LINES - 1);
            truncated.set(
                    MAX_LINES - 1,
                    (last.length() >= MAX_LINE ? last.substring(0, MAX_LINE - 1) : last) + "…");
            return truncated;
        }
        return lines;
    }

    /** XML text/attribute escaping. */
    static String escape(String value) {
        StringBuilder out = new StringBuilder(value.length());
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '&' -> out.append("&amp;");
                case '<' -> out.append("&lt;");
                case '>' -> out.append("&gt;");
                case '"' -> out.append("&quot;");
                case '\'' -> out.append("&apos;");
                default -> {
                    if (c >= 0x20 || c == '\t') {
                        out.append(c);
                    }
                }
            }
        }
        return out.toString();
    }
}
