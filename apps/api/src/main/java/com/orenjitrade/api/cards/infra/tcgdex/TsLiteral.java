package com.orenjitrade.api.cards.infra.tcgdex;

import java.math.BigDecimal;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads the data files of TCGdex's card database (TypeScript modules holding one object literal:
 * {@code const card: Card = { name: { en: "..." }, hp: 70, ... }; export default card}) without a
 * JavaScript engine: the literal is rewritten as JSON. Supported: double, single and back-quoted
 * strings (without {@code ${}} placeholders), unquoted and quoted keys, numbers, {@code true},
 * {@code false}, {@code null}, nested objects and arrays, trailing commas and comments. A bare
 * reference ({@code set: Set}, {@code serie: serie}) and {@code undefined} become {@code null}: the
 * set and serie of a card come from its folder. Anything else (spreads, calls, expressions) is
 * refused with a {@link TsLiteralException}, and that one file is skipped.
 */
final class TsLiteral {

    private static final Pattern ASSIGNMENT =
            Pattern.compile(
                    "(?m)^\\s*(?:export\\s+)?(?:const|let|var)\\s+[A-Za-z_$][\\w$]*\\s*"
                            + "(?::\\s*[A-Za-z_$][\\w$.<>\\[\\], ]*)?=\\s*\\{");
    private static final Pattern EXPORT_DEFAULT =
            Pattern.compile("(?m)^\\s*export\\s+default\\s*\\{");

    private final String source;
    private final StringBuilder out = new StringBuilder();
    private int pos;

    private TsLiteral(String source, int start) {
        this.source = source;
        this.pos = start;
    }

    /** Thrown for a file this reader cannot turn into JSON; the message is client-safe. */
    static final class TsLiteralException extends Exception {
        TsLiteralException(String message) {
            super(message);
        }
    }

    /** The JSON text of the object literal a data file assigns (or exports by default). */
    static String objectJson(String source) throws TsLiteralException {
        Matcher assignment = ASSIGNMENT.matcher(source);
        int start;
        if (assignment.find()) {
            start = assignment.end() - 1;
        } else {
            Matcher export = EXPORT_DEFAULT.matcher(source);
            if (!export.find()) {
                throw new TsLiteralException("no object literal");
            }
            start = export.end() - 1;
        }
        return toJson(source, start);
    }

    /** The JSON text of the object or array literal that starts at {@code start}. */
    static String toJson(String source, int start) throws TsLiteralException {
        TsLiteral reader = new TsLiteral(source, start);
        reader.value();
        return reader.out.toString();
    }

    // -------------------------------------------------------------------------------------

    private void value() throws TsLiteralException {
        skipBlank();
        if (pos >= source.length()) {
            throw new TsLiteralException("unexpected end");
        }
        char c = source.charAt(pos);
        if (c == '{') {
            object();
        } else if (c == '[') {
            array();
        } else if (c == '"' || c == '\'' || c == '`') {
            out.append(quote(string()));
        } else if (c == '-' || c == '+' || c == '.' || Character.isDigit(c)) {
            out.append(number());
        } else if (isIdentifierStart(c)) {
            String word = reference();
            switch (word) {
                case "true", "false", "null" -> out.append(word);
                default -> out.append("null");
            }
        } else {
            throw new TsLiteralException("unexpected '" + c + "'");
        }
    }

    private void object() throws TsLiteralException {
        pos++; // {
        out.append('{');
        boolean first = true;
        while (true) {
            skipBlank();
            if (peek() == '}') {
                pos++;
                out.append('}');
                return;
            }
            if (!first) {
                expect(',');
                skipBlank();
                if (peek() == '}') {
                    pos++;
                    out.append('}');
                    return;
                }
                out.append(',');
            }
            first = false;
            key();
            skipBlank();
            expect(':');
            out.append(':');
            value();
        }
    }

    private void array() throws TsLiteralException {
        pos++; // [
        out.append('[');
        boolean first = true;
        while (true) {
            skipBlank();
            if (peek() == ']') {
                pos++;
                out.append(']');
                return;
            }
            if (!first) {
                expect(',');
                skipBlank();
                if (peek() == ']') {
                    pos++;
                    out.append(']');
                    return;
                }
                out.append(',');
            }
            first = false;
            value();
        }
    }

    private void key() throws TsLiteralException {
        char c = peek();
        if (c == '"' || c == '\'' || c == '`') {
            out.append(quote(string()));
        } else if (Character.isDigit(c)) {
            out.append(quote(number()));
        } else if (isIdentifierStart(c)) {
            int start = pos;
            while (pos < source.length() && isIdentifierPart(source.charAt(pos))) {
                pos++;
            }
            out.append(quote(source.substring(start, pos)));
        } else if (c == '.') {
            throw new TsLiteralException("spread syntax is not supported");
        } else {
            throw new TsLiteralException("unexpected key '" + c + "'");
        }
    }

    /** An identifier, possibly dotted ({@code Set}, {@code serie.id}); calls are refused. */
    private String reference() throws TsLiteralException {
        int start = pos;
        while (pos < source.length()
                && (isIdentifierPart(source.charAt(pos)) || source.charAt(pos) == '.')) {
            pos++;
        }
        String word = source.substring(start, pos);
        skipBlank();
        if (peek() == '(') {
            throw new TsLiteralException("function calls are not supported");
        }
        return word;
    }

    private String number() throws TsLiteralException {
        int start = pos;
        while (pos < source.length()) {
            char c = source.charAt(pos);
            if (Character.isLetterOrDigit(c) || c == '.' || c == '_' || c == '+' || c == '-') {
                // a sign only at the start or after an exponent
                if ((c == '+' || c == '-')
                        && pos > start
                        && Character.toLowerCase(source.charAt(pos - 1)) != 'e') {
                    break;
                }
                pos++;
            } else {
                break;
            }
        }
        String text = source.substring(start, pos).replace("_", "");
        if (text.startsWith("+")) {
            text = text.substring(1);
        }
        try {
            if (text.matches("^-?0[xX][0-9a-fA-F]+$")) {
                boolean negative = text.startsWith("-");
                long value = Long.parseLong(text.substring(negative ? 3 : 2), 16);
                return Long.toString(negative ? -value : value);
            }
            return new BigDecimal(text).toString();
        } catch (NumberFormatException e) {
            throw new TsLiteralException("not a number: " + abbreviate(text));
        }
    }

    private String string() throws TsLiteralException {
        char quote = source.charAt(pos++);
        StringBuilder value = new StringBuilder();
        while (pos < source.length()) {
            char c = source.charAt(pos++);
            if (c == quote) {
                return value.toString();
            }
            if (quote == '`' && c == '$' && pos < source.length() && source.charAt(pos) == '{') {
                throw new TsLiteralException("template placeholders are not supported");
            }
            if ((c == '\n' || c == '\r') && quote != '`') {
                throw new TsLiteralException("unterminated string");
            }
            if (c != '\\') {
                value.append(c);
                continue;
            }
            if (pos >= source.length()) {
                break;
            }
            char e = source.charAt(pos++);
            switch (e) {
                case 'n' -> value.append('\n');
                case 't' -> value.append('\t');
                case 'r' -> value.append('\r');
                case 'b' -> value.append('\b');
                case 'f' -> value.append('\f');
                case 'v' -> value.append('\u000B');
                case '0' -> value.append('\0');
                case '\n' -> {
                    // line continuation
                }
                case '\r' -> {
                    if (pos < source.length() && source.charAt(pos) == '\n') {
                        pos++;
                    }
                }
                case 'x' -> value.append((char) hex(2));
                case 'u' -> {
                    if (pos < source.length() && source.charAt(pos) == '{') {
                        int close = source.indexOf('}', pos);
                        if (close < 0 || close - pos > 7) {
                            throw new TsLiteralException("bad unicode escape");
                        }
                        try {
                            value.appendCodePoint(
                                    Integer.parseInt(source.substring(pos + 1, close), 16));
                        } catch (IllegalArgumentException ex) {
                            throw new TsLiteralException("bad unicode escape");
                        }
                        pos = close + 1;
                    } else {
                        value.append((char) hex(4));
                    }
                }
                default -> value.append(e);
            }
        }
        throw new TsLiteralException("unterminated string");
    }

    private int hex(int digits) throws TsLiteralException {
        if (pos + digits > source.length()) {
            throw new TsLiteralException("bad escape");
        }
        try {
            int value = Integer.parseInt(source.substring(pos, pos + digits), 16);
            pos += digits;
            return value;
        } catch (NumberFormatException e) {
            throw new TsLiteralException("bad escape");
        }
    }

    private void skipBlank() throws TsLiteralException {
        while (pos < source.length()) {
            char c = source.charAt(pos);
            if (Character.isWhitespace(c) || c == '﻿') {
                pos++;
            } else if (c == '/' && pos + 1 < source.length() && source.charAt(pos + 1) == '/') {
                int end = source.indexOf('\n', pos);
                pos = end < 0 ? source.length() : end + 1;
            } else if (c == '/' && pos + 1 < source.length() && source.charAt(pos + 1) == '*') {
                int end = source.indexOf("*/", pos + 2);
                if (end < 0) {
                    throw new TsLiteralException("unterminated comment");
                }
                pos = end + 2;
            } else {
                return;
            }
        }
    }

    private char peek() throws TsLiteralException {
        if (pos >= source.length()) {
            throw new TsLiteralException("unexpected end");
        }
        return source.charAt(pos);
    }

    private void expect(char c) throws TsLiteralException {
        if (peek() != c) {
            throw new TsLiteralException("expected '" + c + "', found '" + peek() + "'");
        }
        pos++;
    }

    private static boolean isIdentifierStart(char c) {
        return Character.isLetter(c) || c == '_' || c == '$';
    }

    private static boolean isIdentifierPart(char c) {
        return Character.isLetterOrDigit(c) || c == '_' || c == '$';
    }

    static String quote(String value) {
        StringBuilder json = new StringBuilder(value.length() + 2).append('"');
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"' -> json.append("\\\"");
                case '\\' -> json.append("\\\\");
                case '\n' -> json.append("\\n");
                case '\r' -> json.append("\\r");
                case '\t' -> json.append("\\t");
                default -> {
                    if (c < 0x20) {
                        json.append(String.format("\\u%04x", (int) c));
                    } else {
                        json.append(c);
                    }
                }
            }
        }
        return json.append('"').toString();
    }

    private static String abbreviate(String text) {
        return text.length() > 20 ? text.substring(0, 20) + "…" : text;
    }
}
