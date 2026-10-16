package com.orenjitrade.api.inventory.domain.imports;

import java.text.Normalizer;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * Everything the import assumes about a Collectr CSV export, in one place. OrenjiTrade never calls
 * or scrapes Collectr: the collector exports the file there and uploads it here. The real header of
 * that export is not confirmed, so nothing is read by position or by one exact title: each column
 * the import uses is found through the aliases below, compared after {@link #key} (lower-case,
 * accents and everything but letters and digits removed, so {@code "Card Number"}, {@code
 * "card_number"} and {@code "CARD-NUMBER"} are one title). When Collectr's export is confirmed, or
 * changes, this table is the only thing to edit.
 *
 * <p>Prices are never read. A price column matches no alias, and the parser only ever reads the
 * columns the aliases found: what Collectr says a card is worth is not ours to store.
 */
public final class CollectrCsvFormat {

    private static final Pattern MARKS = Pattern.compile("\\p{M}+");
    private static final Pattern NOT_ALNUM = Pattern.compile("[^a-z0-9]+");

    private CollectrCsvFormat() {}

    /** What the import reads from a row. */
    public enum Column {
        /** The card's name: the one column a file cannot do without. */
        NAME("card name"),
        /** The set: its name or its code. */
        SET("set"),
        /** The collector number, or the full printing code. */
        NUMBER("card number"),
        RARITY("rarity"),
        /** Variant, finish or edition wording ("1st Edition", "Reverse Holofoil"). */
        VARIANT("variant"),
        LANGUAGE("language"),
        CONDITION("condition"),
        QUANTITY("quantity"),
        /** The game ("Category" in Collectr's vocabulary). */
        GAME("game");

        private final String label;

        Column(String label) {
            this.label = label;
        }

        /** How the column is called in a message to the collector. */
        public String label() {
            return label;
        }
    }

    /** The columns a file must have. */
    public static final List<Column> REQUIRED = List.of(Column.NAME);

    /**
     * Header titles per column, as {@link #key} writes them, most specific first. The first title
     * of a file that matches wins; a title is only ever used for one column.
     */
    static final Map<Column, List<String>> ALIASES = aliases();

    private static Map<Column, List<String>> aliases() {
        Map<Column, List<String>> aliases = new EnumMap<>(Column.class);
        aliases.put(
                Column.NAME,
                List.of("productname", "cardname", "name", "card", "product", "itemname", "title"));
        aliases.put(
                Column.SET,
                List.of("set", "setname", "expansion", "expansionname", "setcode", "release"));
        aliases.put(
                Column.NUMBER,
                List.of(
                        "cardnumber",
                        "collectornumber",
                        "number",
                        "cardno",
                        "no",
                        "printingcode",
                        "cardcode",
                        "code"));
        aliases.put(Column.RARITY, List.of("rarity"));
        aliases.put(
                Column.VARIANT,
                List.of("variance", "variant", "printing", "finish", "foil", "version"));
        aliases.put(Column.LANGUAGE, List.of("language", "lang"));
        aliases.put(Column.CONDITION, List.of("cardcondition", "condition", "cond"));
        aliases.put(
                Column.QUANTITY, List.of("quantity", "qty", "count", "amount", "copies", "owned"));
        aliases.put(Column.GAME, List.of("category", "game", "tcg", "categoryname", "franchise"));
        return aliases;
    }

    /** The titles a message names when {@code column} was not found. */
    public static List<String> knownTitles(Column column) {
        return switch (column) {
            case NAME -> List.of("Product Name", "Card Name", "Name");
            case SET -> List.of("Set", "Set Name", "Expansion");
            case NUMBER -> List.of("Card Number", "Collector Number", "Number");
            case RARITY -> List.of("Rarity");
            case VARIANT -> List.of("Variance", "Variant", "Printing");
            case LANGUAGE -> List.of("Language");
            case CONDITION -> List.of("Card Condition", "Condition");
            case QUANTITY -> List.of("Quantity", "Qty");
            case GAME -> List.of("Category", "Game");
        };
    }

    /**
     * Where each column is in a header: the index of the first title that is one of its aliases.
     * Columns that were not found are absent; every other title of the file (prices, dates, notes,
     * anything Collectr adds later) is simply never read.
     */
    public static Map<Column, Integer> locate(List<String> header) {
        Map<Column, Integer> found = new EnumMap<>(Column.class);
        for (Column column : Column.values()) {
            List<String> aliases = ALIASES.get(column);
            int best = -1;
            int bestRank = Integer.MAX_VALUE;
            for (int index = 0; index < header.size(); index++) {
                if (found.containsValue(index)) {
                    continue;
                }
                int rank = aliases.indexOf(key(header.get(index)));
                if (rank >= 0 && rank < bestRank) {
                    best = index;
                    bestRank = rank;
                }
            }
            if (best >= 0) {
                found.put(column, best);
            }
        }
        return found;
    }

    /** A title or a value reduced to its letters and digits, lower-case and without accents. */
    public static String key(@Nullable String value) {
        if (value == null) {
            return "";
        }
        String decomposed = Normalizer.normalize(value, Normalizer.Form.NFD);
        String plain = MARKS.matcher(decomposed).replaceAll("").toLowerCase(Locale.ROOT);
        return NOT_ALNUM.matcher(plain).replaceAll("");
    }

    // ---------------------------------------------------------------------------------------
    // Values
    // ---------------------------------------------------------------------------------------

    private static final Map<String, String> CONDITIONS = conditions();

    private static Map<String, String> conditions() {
        Map<String, String> map = new LinkedHashMap<>();
        for (String key : List.of("mint", "m", "gemmint")) {
            map.put(key, "MINT");
        }
        for (String key : List.of("nearmint", "nm", "nearmintormint", "nmm", "nearmintmint")) {
            map.put(key, "NEAR_MINT");
        }
        for (String key :
                List.of(
                        "lightlyplayed",
                        "lp",
                        "lightplayed",
                        "slightlyplayed",
                        "sp",
                        "excellent")) {
            map.put(key, "LIGHTLY_PLAYED");
        }
        for (String key : List.of("moderatelyplayed", "mp", "played", "good")) {
            map.put(key, "MODERATELY_PLAYED");
        }
        for (String key : List.of("heavilyplayed", "hp", "poor")) {
            map.put(key, "HEAVILY_PLAYED");
        }
        for (String key : List.of("damaged", "dmg", "d")) {
            map.put(key, "DAMAGED");
        }
        return map;
    }

    /** The condition code a value means ({@code "Near Mint"}, {@code "LP"}); empty when unknown. */
    public static Optional<String> condition(@Nullable String value) {
        return Optional.ofNullable(CONDITIONS.get(key(value)));
    }

    private static final Map<String, String> LANGUAGES = languages();

    private static Map<String, String> languages() {
        Map<String, String> map = new LinkedHashMap<>();
        put(map, "en", "english", "en", "eng");
        put(map, "fr", "french", "fr", "fra", "francais");
        put(map, "de", "german", "de", "deu", "ger", "deutsch");
        put(map, "it", "italian", "it", "ita", "italiano");
        put(map, "es", "spanish", "es", "spa", "esp", "espanol");
        put(map, "pt", "portuguese", "pt", "por", "portugues");
        put(map, "ja", "japanese", "ja", "jp", "jpn");
        put(map, "ko", "korean", "ko", "kr", "kor");
        put(
                map,
                "zh",
                "chinese",
                "zh",
                "cn",
                "simplifiedchinese",
                "traditionalchinese",
                "schinese",
                "tchinese");
        return map;
    }

    /** The ISO 639-1 code a value means ({@code "English"}, {@code "JP"}); empty when unknown. */
    public static Optional<String> language(@Nullable String value) {
        return Optional.ofNullable(LANGUAGES.get(key(value)));
    }

    /**
     * The edition a variant wording names ({@code "1st Edition"}, {@code "Unlimited"}, {@code
     * "Limited Edition"}), as the code of {@code GameSchema.editions}; empty when it names none.
     */
    public static Optional<String> edition(@Nullable String variant) {
        String key = key(variant);
        if (key.contains("1stedition") || key.contains("firstedition") || key.equals("1st")) {
            return Optional.of("FIRST_EDITION");
        }
        if (key.contains("unlimited")) {
            return Optional.of("UNLIMITED");
        }
        if (key.contains("limited")) {
            return Optional.of("LIMITED");
        }
        return Optional.empty();
    }

    /**
     * The finish a variant wording names ({@code "Reverse Holofoil"}, {@code "Foil"}, {@code
     * "Normal"}), as the code of {@code GameSchema.finishes}; empty when it names none.
     */
    public static Optional<String> finish(@Nullable String variant) {
        String key = key(variant);
        if (key.contains("reverse")) {
            return Optional.of("REVERSE_HOLO");
        }
        if (key.contains("holo")) {
            return Optional.of("HOLO");
        }
        if (key.contains("etched")) {
            return Optional.of("ETCHED");
        }
        if (key.contains("nonfoil") || key.contains("normal") || key.contains("regular")) {
            return Optional.of("NORMAL");
        }
        if (key.contains("foil")) {
            return Optional.of("FOIL");
        }
        return Optional.empty();
    }

    private static final Map<String, String> GAMES = games();

    private static Map<String, String> games() {
        Map<String, String> map = new LinkedHashMap<>();
        put(map, "yugioh", "yugioh", "ygo", "yugiohtcg", "yugiohtradingcardgame");
        put(map, "pokemon", "pokemon", "pokemontcg", "pokemontradingcardgame", "ptcg");
        put(map, "mtg", "mtg", "magic", "magicthegathering");
        put(map, "riftbound", "riftbound", "riftboundtcg", "riftboundleagueoflegendstcg");
        return map;
    }

    /**
     * The game slug a category wording usually means ({@code "Yu-Gi-Oh!"}, {@code "Magic: The
     * Gathering"}); empty when it is none of the spellings known here. The games themselves are
     * data: the caller also compares the wording with the slug and the names of every active game,
     * and a slug returned here only counts when that game is active.
     */
    public static Optional<String> game(@Nullable String value) {
        return Optional.ofNullable(GAMES.get(key(value)));
    }

    private static void put(Map<String, String> map, String code, String... keys) {
        for (String key : keys) {
            map.put(key, code);
        }
    }
}
