package com.orenjitrade.api.common.seed;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Deals ship by mail (ADR 0018, spec 2026-10-14 section 11): the seed data speaks of shipping and
 * e-Transfer, never of meeting, a game store, a café or the locals. Reads the seed's own sources
 * (the JSON files of {@code db/seed} and the text of every {@link SeedContributor}), so it does not
 * depend on what other tests write into the shared database; {@code SeedIT} reads the seeded rows.
 * The fictional card catalogue ({@code db/seed/catalog}) is game text and is not read.
 */
public class SeedWordingTest {

    /**
     * Meetup wording; identifiers such as {@code meetup_reliability} or {@code buyerMeetupAt} do
     * not match.
     */
    public static final Pattern MEETUP =
            Pattern.compile(
                    "\\bmeet(s|ing|ings|up|ups)?\\b|\\bmeet up\\b|\\bin[- ]person\\b|\\bgame"
                            + " ?stores?\\b|\\bcaf[eé]s?(?!\\w)|\\blocals\\b|\\blocal"
                            + " (meetups?|pickups?|trade nights?|trades?|stores?|shops?)\\b",
                    Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    /**
     * A statement whose own words (column names such as the trades' {@code meetup}) are not text.
     */
    private static final Pattern SQL =
            Pattern.compile("\\b(INSERT INTO|SELECT|UPDATE|DELETE FROM|ON CONFLICT)\\b");

    /** The quoted values inside a statement, which are seeded text. */
    private static final Pattern SQL_VALUE = Pattern.compile("'((?:[^']|'')*)'");

    /** A parameter or column name ({@code .param("meetup", ...)}), not text. */
    private static final Pattern IDENTIFIER = Pattern.compile("[a-z][A-Za-z0-9_]*");

    private static final Path SEED_DATA = Path.of("src/main/resources/db/seed");
    private static final Path SOURCES = Path.of("src/main/java");

    @Test
    void theScannerKnowsMeetupWordingFromIdentifiers() {
        assertThat(findings("Would you take 40? I can meet at the station after work."))
                .containsExactly("meet");
        assertThat(findings("Friday locals at the game store, then the café"))
                .containsExactly("locals", "game store", "café");
        assertThat(findings("Always up for a meetup. Trades in person.")).hasSize(2);
        assertThat(findings("I can pay by e-Transfer, shipped with tracking.")).isEmpty();
        assertThat(findings("buyerMeetupAt meetup_reliability local test")).isEmpty();
        assertThat(
                        literalTexts(
                                "String sql = \"INSERT INTO trade (meetup) VALUES ('See you at the"
                                        + " café')\";"))
                .containsExactly("See you at the café");
        assertThat(literalTexts("q.param(\"meetup\", true); // meet here\nString s = \"Hi\";"))
                .containsExactly("Hi");
        assertThat(literalTexts("String b = \"\"\"\n    Ships by mail.\n    \"\"\";"))
                .containsExactly("    Ships by mail.\n    ");
    }

    @Test
    void theSeedDataFilesSayNothingAboutMeeting() throws IOException {
        JsonMapper json = JsonMapper.builder().build();
        List<String> found = new ArrayList<>();
        List<Path> files;
        try (Stream<Path> walk = Files.walk(SEED_DATA)) {
            files =
                    walk.filter(path -> path.toString().endsWith(".json"))
                            .filter(path -> !path.startsWith(SEED_DATA.resolve("catalog")))
                            .sorted()
                            .toList();
        }
        assertThat(files)
                .extracting(path -> path.getFileName().toString())
                .contains("inventory.json", "profiles.json");
        for (Path file : files) {
            List<String> texts = new ArrayList<>();
            collectTexts(json.readTree(file.toFile()), texts);
            for (String text : texts) {
                findings(text)
                        .forEach(
                                word ->
                                        found.add(
                                                file.getFileName()
                                                        + ": "
                                                        + word
                                                        + " in \""
                                                        + text
                                                        + "\""));
            }
        }
        assertThat(found).isEmpty();
    }

    @Test
    void theSeedContributorsSayNothingAboutMeeting() throws IOException {
        List<String> found = new ArrayList<>();
        List<Path> contributors;
        try (Stream<Path> walk = Files.walk(SOURCES)) {
            contributors =
                    walk.filter(path -> path.toString().endsWith(".java"))
                            .filter(SeedWordingTest::isSeedContributor)
                            .sorted()
                            .toList();
        }
        assertThat(contributors)
                .extracting(path -> path.getFileName().toString())
                .contains(
                        "MessagingSeedContributor.java",
                        "CommunitySeedContributor.java",
                        "OfferSeedContributor.java",
                        "RatingSeedContributor.java",
                        "ProfileSeedContributor.java");
        for (Path file : contributors) {
            for (String text : literalTexts(Files.readString(file, StandardCharsets.UTF_8))) {
                findings(text)
                        .forEach(
                                word ->
                                        found.add(
                                                file.getFileName()
                                                        + ": "
                                                        + word
                                                        + " in \""
                                                        + text
                                                        + "\""));
            }
        }
        assertThat(found).isEmpty();
    }

    private static boolean isSeedContributor(Path file) {
        try {
            return Files.readString(file, StandardCharsets.UTF_8)
                    .contains("implements SeedContributor");
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    /** The meetup words of a text, in order. */
    public static List<String> findings(String text) {
        List<String> words = new ArrayList<>();
        Matcher matcher = MEETUP.matcher(text);
        while (matcher.find()) {
            words.add(matcher.group());
        }
        return words;
    }

    private static void collectTexts(JsonNode node, List<String> texts) {
        if (node.isString()) {
            texts.add(node.asString());
        }
        node.forEach(child -> collectTexts(child, texts));
    }

    /**
     * The text a Java source writes: its string literals and text blocks, comments left out. A
     * statement contributes its quoted values only, and a lone identifier (a parameter or column
     * name) nothing.
     */
    static List<String> literalTexts(String source) {
        List<String> texts = new ArrayList<>();
        for (String literal : literals(source)) {
            if (SQL.matcher(literal).find()) {
                Matcher value = SQL_VALUE.matcher(literal);
                while (value.find()) {
                    texts.add(value.group(1).replace("''", "'"));
                }
            } else if (!IDENTIFIER.matcher(literal).matches()) {
                texts.add(literal);
            }
        }
        return texts;
    }

    /** The string literals and text blocks of a Java source (escapes kept as written). */
    private static List<String> literals(String source) {
        List<String> literals = new ArrayList<>();
        int i = 0;
        int length = source.length();
        while (i < length) {
            char c = source.charAt(i);
            if (source.startsWith("//", i)) {
                int end = source.indexOf('\n', i);
                i = end < 0 ? length : end + 1;
            } else if (source.startsWith("/*", i)) {
                int end = source.indexOf("*/", i + 2);
                i = end < 0 ? length : end + 2;
            } else if (source.startsWith("\"\"\"", i)) {
                int start = source.indexOf('\n', i) + 1;
                int end = source.indexOf("\"\"\"", start);
                literals.add(source.substring(start, end));
                i = end + 3;
            } else if (c == '"') {
                StringBuilder literal = new StringBuilder();
                i++;
                while (i < length && source.charAt(i) != '"') {
                    if (source.charAt(i) == '\\' && i + 1 < length) {
                        literal.append(source.charAt(i)).append(source.charAt(i + 1));
                        i += 2;
                    } else {
                        literal.append(source.charAt(i++));
                    }
                }
                literals.add(literal.toString());
                i++;
            } else if (c == '\'') {
                int end = source.charAt(i + 1) == '\\' ? source.indexOf('\'', i + 3) : i + 2;
                i = end + 1;
            } else {
                i++;
            }
        }
        return literals;
    }
}
