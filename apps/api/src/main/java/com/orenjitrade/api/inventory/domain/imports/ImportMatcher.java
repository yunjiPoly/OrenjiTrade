package com.orenjitrade.api.inventory.domain.imports;

import com.orenjitrade.api.cards.domain.CatalogCardRef;
import com.orenjitrade.api.cards.domain.CatalogPrintingRef;
import com.orenjitrade.api.cards.domain.CatalogText;
import com.orenjitrade.api.games.domain.GameSchema;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * Matches the rows of a parsed import file to the catalog. Pure: the catalog rows it needs were
 * looked up before, in a handful of grouped queries ({@link #passcodes}, {@link #nameKeys} and
 * {@link #printingCodes} say what to look up), so a file of a thousand rows costs the same number
 * of queries as a file of ten.
 *
 * <p>A row is never guessed: it gets a printing only when it fits exactly one, it asks the
 * collector when it fits one card and several printings, and it is reported when it fits nothing.
 * "The most recent printing" follows the same care: where the most recent set holds a card in
 * several editions or finishes, the plain copy is taken and marked as an assumption (the copy that
 * claims least, as the condition of a row whose file names none), and where even that does not
 * decide, none is taken.
 */
public final class ImportMatcher {

    /** Most suggested printings a row keeps (beyond that the suggestion narrows nothing). */
    public static final int SUGGESTED_MAX = 50;

    /** Copies one inventory item can hold ({@code InventoryService.QUANTITY_MAX}). */
    public static final int QUANTITY_MAX = 9999;

    /** The condition of a game that has no vocabulary of its own (the item form's default). */
    static final String FALLBACK_CONDITION = "NEAR_MINT";

    /**
     * The edition and the finish of a plain copy: what the catalog gives a printing nothing more is
     * known about (the provider mappers write these two codes), and of two copies of one printing
     * the one that claims least.
     */
    static final String PLAIN_EDITION = "UNLIMITED";

    static final String PLAIN_FINISH = "NORMAL";

    private static final Pattern PARENTHESES = Pattern.compile("\\s*[(\\[][^()\\[\\]]*[)\\]]\\s*$");
    private static final Pattern QUANTITY = Pattern.compile("^[xX]?\\s*([0-9]{1,9})(?:[.,]0+)?$");

    private ImportMatcher() {}

    /**
     * What the catalog knows about the things a file names.
     *
     * @param cardsByPasscode YDK: cards by provider id
     * @param cardsByArtwork YDK: cards by provider artwork id (alternate artworks)
     * @param cardsByName CSV: cards by normalised name
     * @param printingsByCode CSV: printings by printing code
     * @param printingsByCard the printings of every card above, most recent set first
     * @param games the active games' vocabularies, by slug
     * @param gameKeys the active games by the {@link CollectrCsvFormat#key} of their slug and names
     */
    public record Catalog(
            Map<String, CatalogCardRef> cardsByPasscode,
            Map<String, CatalogCardRef> cardsByArtwork,
            Map<String, List<CatalogCardRef>> cardsByName,
            Map<String, List<CatalogPrintingRef>> printingsByCode,
            Map<UUID, List<CatalogPrintingRef>> printingsByCard,
            Map<String, GameSchema> games,
            Map<String, String> gameKeys) {}

    // ---------------------------------------------------------------------------------------
    // What to look up
    // ---------------------------------------------------------------------------------------

    /** The passcodes of a deck. */
    public static List<String> passcodes(YdkParser.Deck deck) {
        return deck.entries().stream().map(YdkParser.Entry::passcode).toList();
    }

    /**
     * The normalised names a row can be found under: the name as written and, when it ends with a
     * remark in brackets ("Mirrorblade Knight (Alternate Art)"), the name without it.
     */
    public static List<String> nameKeys(String name) {
        Set<String> keys = new LinkedHashSet<>();
        String full = CatalogText.normalise(name);
        if (!full.isEmpty()) {
            keys.add(full);
        }
        String bare = PARENTHESES.matcher(name).replaceFirst("");
        if (!bare.equals(name) && !bare.isBlank()) {
            keys.add(CatalogText.normalise(bare));
        }
        return List.copyOf(keys);
    }

    /** The printing code a row's number is, when it is written as one ({@code AZR-EN001}). */
    public static Optional<String> printingCode(@Nullable String number) {
        return CatalogText.asPrintingCode(number);
    }

    // ---------------------------------------------------------------------------------------
    // YDK
    // ---------------------------------------------------------------------------------------

    /** One row per passcode of the deck, in file order. */
    public static List<ImportDraftRow> ydk(YdkParser.Deck deck, Catalog catalog) {
        List<ImportDraftRow> rows = new ArrayList<>();
        int position = 0;
        for (YdkParser.Entry entry : deck.entries()) {
            @Nullable CatalogCardRef card = catalog.cardsByPasscode().get(entry.passcode());
            if (card == null) {
                // An alternate artwork has a passcode of its own: the provider lists it as an
                // artwork of the card, not as a card.
                card = catalog.cardsByArtwork().get(entry.passcode());
            }
            List<CatalogPrintingRef> printings =
                    card == null
                            ? List.of()
                            : catalog.printingsByCard().getOrDefault(card.id(), List.of());
            @Nullable UnmatchedReason reason =
                    card == null
                            ? UnmatchedReason.UNKNOWN_PASSCODE
                            : printings.isEmpty() ? UnmatchedReason.NO_PRINTING : null;
            boolean matched = card != null && reason == null;
            // A deck file names no printing: only a card with a single printing needs no choice.
            @Nullable UUID printingId =
                    matched && printings.size() == 1 ? printings.get(0).id() : null;
            rows.add(
                    new ImportDraftRow(
                            position++,
                            entry.passcode(),
                            null,
                            null,
                            null,
                            null,
                            entry.main(),
                            entry.extra(),
                            entry.side(),
                            Math.min(entry.total(), QUANTITY_MAX),
                            matched ? card.id() : null,
                            matched ? card.game() : null,
                            reason,
                            matched ? printings.size() : 0,
                            List.of(),
                            printingId,
                            printingId == null ? null : PrintingChoice.AUTO,
                            matched ? defaultCondition(catalog.games().get(card.game())) : null,
                            ConditionSource.DEFAULT,
                            null,
                            null));
        }
        return rows;
    }

    // ---------------------------------------------------------------------------------------
    // Collectr CSV
    // ---------------------------------------------------------------------------------------

    /**
     * One row per row of the sheet, in file order.
     *
     * @param defaultGame the game of rows that name none ({@code null}: any active game)
     */
    public static List<ImportDraftRow> csv(
            CollectrCsvParser.Sheet sheet, @Nullable String defaultGame, Catalog catalog) {
        List<ImportDraftRow> rows = new ArrayList<>();
        int position = 0;
        for (CollectrCsvParser.Row row : sheet.rows()) {
            rows.add(csvRow(position++, row, defaultGame, catalog));
        }
        return rows;
    }

    private static ImportDraftRow csvRow(
            int position,
            CollectrCsvParser.Row row,
            @Nullable String defaultGame,
            Catalog catalog) {
        int quantity = quantity(row.quantity());
        @Nullable String game = defaultGame;
        if (row.game() != null) {
            game = game(row.game(), catalog).orElse(null);
            if (game == null) {
                // What the file said, as written: its copies too.
                return unmatched(position, row, quantity, UnmatchedReason.UNKNOWN_GAME);
            }
        }
        if (quantity < 1) {
            return unmatched(position, row, 0, UnmatchedReason.INVALID_QUANTITY);
        }

        Optional<CatalogCardRef> found = card(row, game, catalog);
        if (found.isEmpty()) {
            boolean several = !namedCards(row, game, catalog).isEmpty();
            return unmatched(
                    position,
                    row,
                    quantity,
                    several ? UnmatchedReason.AMBIGUOUS_CARD : UnmatchedReason.UNKNOWN_CARD);
        }
        CatalogCardRef card = found.get();
        List<CatalogPrintingRef> all = catalog.printingsByCard().getOrDefault(card.id(), List.of());
        if (all.isEmpty()) {
            return unmatched(position, row, quantity, UnmatchedReason.NO_PRINTING);
        }
        @Nullable GameSchema schema = catalog.games().get(card.game());

        // What identifies a printing: the set, the number, the rarity. A row that says one of
        // them and fits no printing with it contradicts the catalog: nothing is preselected.
        List<CatalogPrintingRef> candidates = all;
        boolean contradicted = false;
        for (Predicate<CatalogPrintingRef> filter : identityFilters(row)) {
            List<CatalogPrintingRef> narrowed = candidates.stream().filter(filter).toList();
            if (narrowed.isEmpty()) {
                contradicted = true;
                candidates = all;
                break;
            }
            candidates = narrowed;
        }
        // What belongs to the copy as much as to the printing: language, edition, finish. They
        // narrow when a printing has them; when none has, the item itself carries them.
        @Nullable String language = CollectrCsvFormat.language(row.language()).orElse(null);
        @Nullable String edition =
                CollectrCsvFormat.edition(row.variant())
                        .filter(code -> schema == null || schema.editions().contains(code))
                        .orElse(null);
        @Nullable String finish = CollectrCsvFormat.finish(row.variant()).orElse(null);
        if (!contradicted) {
            List<CatalogPrintingRef> identified = candidates;
            candidates = narrowWhenPossible(candidates, language, CatalogPrintingRef::language);
            candidates = narrowWhenPossible(candidates, edition, CatalogPrintingRef::edition);
            if (finish != null && !anyHas(candidates, finish, CatalogPrintingRef::finish)) {
                // An item carries the language and the edition of its copy, but its finish is
                // its printing's: a finish none of these printings has cannot be honoured, so
                // nothing is preselected ("Foil" would silently become a normal copy).
                contradicted = true;
                candidates = identified;
            } else {
                candidates = narrowWhenPossible(candidates, finish, CatalogPrintingRef::finish);
            }
        }
        @Nullable UUID printingId =
                !contradicted && candidates.size() == 1 ? candidates.get(0).id() : null;
        List<UUID> suggested =
                printingId == null && candidates.size() < all.size()
                        ? candidates.stream()
                                .limit(SUGGESTED_MAX)
                                .map(CatalogPrintingRef::id)
                                .toList()
                        : List.of();

        Optional<String> condition =
                CollectrCsvFormat.condition(row.condition())
                        .filter(
                                code ->
                                        schema == null
                                                || schema.conditions().isEmpty()
                                                || schema.conditions().contains(code));
        return new ImportDraftRow(
                position,
                null,
                row.name(),
                row.set(),
                row.number(),
                row.rarity(),
                null,
                null,
                null,
                quantity,
                card.id(),
                card.game(),
                null,
                all.size(),
                suggested,
                printingId,
                printingId == null ? null : PrintingChoice.AUTO,
                condition.orElseGet(() -> defaultCondition(schema)),
                condition.isPresent() ? ConditionSource.FILE : ConditionSource.DEFAULT,
                language,
                edition);
    }

    /**
     * The one card a row is: by its name (in its game), told apart by its set and number when the
     * name belongs to several cards; by its printing code when the name is spelled differently in
     * the catalog. Empty when nothing fits, or when several cards do.
     */
    private static Optional<CatalogCardRef> card(
            CollectrCsvParser.Row row, @Nullable String game, Catalog catalog) {
        List<CatalogCardRef> named = namedCards(row, game, catalog);
        if (named.size() == 1) {
            return Optional.of(named.get(0));
        }
        if (named.size() > 1) {
            List<Predicate<CatalogPrintingRef>> filters = identityFilters(row);
            if (filters.isEmpty()) {
                return Optional.empty();
            }
            List<CatalogCardRef> fitting =
                    named.stream()
                            .filter(
                                    card ->
                                            catalog
                                                    .printingsByCard()
                                                    .getOrDefault(card.id(), List.of())
                                                    .stream()
                                                    .anyMatch(printing -> fits(printing, filters)))
                            .toList();
            return fitting.size() == 1 ? Optional.of(fitting.get(0)) : Optional.empty();
        }
        Optional<String> code = printingCode(row.number());
        if (code.isEmpty()) {
            return Optional.empty();
        }
        Map<UUID, CatalogPrintingRef> cards = new LinkedHashMap<>();
        for (CatalogPrintingRef printing :
                catalog.printingsByCode().getOrDefault(code.get(), List.of())) {
            if (game == null || game.equals(printing.game())) {
                cards.putIfAbsent(printing.cardId(), printing);
            }
        }
        if (cards.size() != 1) {
            return Optional.empty();
        }
        CatalogPrintingRef printing = cards.values().iterator().next();
        return Optional.of(new CatalogCardRef(printing.cardId(), printing.game(), row.name()));
    }

    /** The cards that carry the row's name, in its game when it names one. */
    private static List<CatalogCardRef> namedCards(
            CollectrCsvParser.Row row, @Nullable String game, Catalog catalog) {
        Map<UUID, CatalogCardRef> cards = new LinkedHashMap<>();
        for (String key : nameKeys(row.name())) {
            for (CatalogCardRef card : catalog.cardsByName().getOrDefault(key, List.of())) {
                if (game == null || game.equals(card.game())) {
                    cards.putIfAbsent(card.id(), card);
                }
            }
            if (!cards.isEmpty()) {
                break; // the name as written wins over the name without its remark
            }
        }
        return List.copyOf(cards.values());
    }

    private static boolean fits(
            CatalogPrintingRef printing, List<Predicate<CatalogPrintingRef>> filters) {
        return filters.stream().allMatch(filter -> filter.test(printing));
    }

    /**
     * What "use the most recent printing" finds for a row.
     *
     * @param printingId the printing to take; {@code null} when nothing decides (the row stays to
     *     choose)
     * @param assumed whether the printing is the plain copy among several versions of the card in
     *     its most recent set, taken because the release date decided nothing between them
     */
    public record MostRecent(@Nullable UUID printingId, boolean assumed) {

        static final MostRecent UNDECIDED = new MostRecent(null, false);
    }

    /**
     * "The most recent printing" of a row: the printing of the card whose set was released last,
     * among the ones the row's file narrowed it to when it did.
     *
     * <p>When several of those printings share the most recent date, the date decides nothing. If
     * they are one printing in several editions or finishes (a 1st Edition and an Unlimited copy of
     * one set: the everyday case; a foil and a normal copy), the plain one is taken and marked
     * {@link MostRecent#assumed}: it is the copy that claims least, the collector is told, and the
     * row stays editable. Anything else (two rarities, two languages, two sets of one day, no date
     * at all) is left to the collector: taking one would claim something nobody chose.
     *
     * @param printingsOfCard the printings of the card, most recent set first, unknown dates last
     */
    public static MostRecent mostRecent(
            List<CatalogPrintingRef> printingsOfCard, List<UUID> suggested) {
        List<CatalogPrintingRef> pool = printingsOfCard;
        if (!suggested.isEmpty()) {
            List<CatalogPrintingRef> fitting =
                    printingsOfCard.stream()
                            .filter(printing -> suggested.contains(printing.id()))
                            .toList();
            if (!fitting.isEmpty()) {
                pool = fitting;
            }
        }
        if (pool.isEmpty()) {
            return MostRecent.UNDECIDED;
        }
        CatalogPrintingRef first = pool.get(0);
        if (pool.size() == 1) {
            return new MostRecent(first.id(), false);
        }
        if (first.setReleaseDate() == null) {
            return MostRecent.UNDECIDED;
        }
        List<CatalogPrintingRef> latest =
                pool.stream()
                        .filter(
                                printing ->
                                        first.setReleaseDate().equals(printing.setReleaseDate()))
                        .toList();
        if (latest.size() == 1) {
            return new MostRecent(first.id(), false);
        }
        if (!latest.stream().allMatch(printing -> sameButEditionAndFinish(first, printing))) {
            return MostRecent.UNDECIDED;
        }
        List<CatalogPrintingRef> plain =
                narrowWhenPossible(latest, PLAIN_EDITION, CatalogPrintingRef::edition);
        plain = narrowWhenPossible(plain, PLAIN_FINISH, CatalogPrintingRef::finish);
        return plain.size() == 1 && isPlain(plain.get(0))
                ? new MostRecent(plain.get(0).id(), true)
                : MostRecent.UNDECIDED;
    }

    /** Whether two printings are one printing of a set in another edition or finish. */
    private static boolean sameButEditionAndFinish(
            CatalogPrintingRef one, CatalogPrintingRef other) {
        return one.setCode().equals(other.setCode())
                && one.collectorNumber().equals(other.collectorNumber())
                && java.util.Objects.equals(one.printingCode(), other.printingCode())
                && java.util.Objects.equals(one.rarity(), other.rarity())
                && one.language().equals(other.language());
    }

    private static boolean isPlain(CatalogPrintingRef printing) {
        return PLAIN_EDITION.equals(printing.edition()) && PLAIN_FINISH.equals(printing.finish());
    }

    private static List<Predicate<CatalogPrintingRef>> identityFilters(CollectrCsvParser.Row row) {
        List<Predicate<CatalogPrintingRef>> filters = new ArrayList<>();
        if (row.set() != null) {
            String set = CollectrCsvFormat.key(row.set());
            filters.add(
                    printing ->
                            set.equals(CollectrCsvFormat.key(printing.setCode()))
                                    || set.equals(CollectrCsvFormat.key(printing.setName())));
        }
        if (row.number() != null) {
            String code = CollectrCsvFormat.key(row.number());
            String number = numberKey(row.number());
            filters.add(
                    printing ->
                            code.equals(CollectrCsvFormat.key(printing.printingCode()))
                                    || number.equals(numberKey(printing.collectorNumber())));
        }
        if (row.rarity() != null) {
            String rarity = CollectrCsvFormat.key(row.rarity());
            filters.add(printing -> rarity.equals(CollectrCsvFormat.key(printing.rarity())));
        }
        return filters;
    }

    /**
     * A collector number as the catalog and a file can both write it: the part before a slash
     * ({@code 045/165}), letters and digits only, without leading zeros or a leading {@code #}.
     */
    static String numberKey(@Nullable String number) {
        if (number == null) {
            return "";
        }
        int slash = number.indexOf('/');
        String key = CollectrCsvFormat.key(slash < 0 ? number : number.substring(0, slash));
        int start = 0;
        while (start < key.length() - 1 && key.charAt(start) == '0') {
            start++;
        }
        return key.substring(start);
    }

    private static List<CatalogPrintingRef> narrowWhenPossible(
            List<CatalogPrintingRef> candidates,
            @Nullable String value,
            java.util.function.Function<CatalogPrintingRef, String> attribute) {
        if (value == null) {
            return candidates;
        }
        List<CatalogPrintingRef> narrowed =
                candidates.stream()
                        .filter(printing -> value.equalsIgnoreCase(attribute.apply(printing)))
                        .toList();
        return narrowed.isEmpty() ? candidates : narrowed;
    }

    private static boolean anyHas(
            List<CatalogPrintingRef> candidates,
            String value,
            java.util.function.Function<CatalogPrintingRef, String> attribute) {
        return candidates.stream()
                .anyMatch(printing -> value.equalsIgnoreCase(attribute.apply(printing)));
    }

    /** The active game a wording means: a usual spelling, or the slug or a name of a game. */
    static Optional<String> game(String value, Catalog catalog) {
        Optional<String> alias = CollectrCsvFormat.game(value).filter(catalog.games()::containsKey);
        if (alias.isPresent()) {
            return alias;
        }
        return Optional.ofNullable(catalog.gameKeys().get(CollectrCsvFormat.key(value)));
    }

    /**
     * The copies a quantity says: 1 when the file has none, 0 when it is no number of copies an
     * item can hold (not a whole number, or more than {@value #QUANTITY_MAX}: such a row is
     * reported, never cut down to the most an item holds without a word).
     */
    static int quantity(@Nullable String value) {
        if (value == null) {
            return 1;
        }
        Matcher matcher = QUANTITY.matcher(value.toLowerCase(Locale.ROOT).strip());
        if (!matcher.matches()) {
            return 0;
        }
        long copies = Long.parseLong(matcher.group(1));
        return copies > QUANTITY_MAX ? 0 : (int) copies;
    }

    /**
     * The condition of a row whose file names none: the last of the game's conditions, which are
     * ordered best first. It is the grade that claims least about a card nobody has described: a
     * collector who later publishes the item has never promised more than the card is.
     */
    public static String defaultCondition(@Nullable GameSchema schema) {
        if (schema == null || schema.conditions().isEmpty()) {
            return FALLBACK_CONDITION;
        }
        return schema.conditions().get(schema.conditions().size() - 1);
    }

    private static ImportDraftRow unmatched(
            int position, CollectrCsvParser.Row row, int quantity, UnmatchedReason reason) {
        return new ImportDraftRow(
                position,
                null,
                row.name(),
                row.set(),
                row.number(),
                row.rarity(),
                null,
                null,
                null,
                quantity,
                null,
                null,
                reason,
                0,
                List.of(),
                null,
                null,
                null,
                ConditionSource.DEFAULT,
                null,
                null);
    }
}
