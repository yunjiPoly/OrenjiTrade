package com.orenjitrade.api.cards.domain.scan;

import com.orenjitrade.api.cards.domain.CatalogPrintingRef;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * The deterministic rules of a scan match (owner spec 2026-10-15, section 3.5), on catalog rows
 * looked up beforehand in a few grouped queries ({@link #codesToLookUp} says which codes). Pure.
 *
 * <ol>
 *   <li>Exact codes: each code as read, the other form of an old code, a missing dash at each
 *       place.
 *   <li>Look-alike characters, only when the catalog confirms (strict pairs, at most 64 variants
 *       per code read).
 *   <li>The name: every candidate card is scored against the names read ({@link NameSimilarity}); a
 *       card is close from {@value #CLOSE}.
 *   <li>Deciding: the code's card when it has the read name or no usable name was read (with no
 *       name, a look-alike variant counts only when it is the only one the catalog has); the name
 *       wins when it clearly points to another card, which then takes its printing one look-alike
 *       character from the read code when exactly one is; when no code read is a catalog code as
 *       read, its only printing one character lost, added or misread from a code read or its
 *       look-alikes; and otherwise has an unknown printing (PICK_PRINTING, even with a single
 *       printing). The name does not win over a code read that is another card's printing as read
 *       when the named card has no printing at that code or one look-alike character from it: not
 *       found, both cards the candidates. Several candidates and nothing to choose: not found.
 *   <li>English cards only: a code with another language's region, as printed or read with
 *       look-alike characters ({@code MACR-0E036}), is NOT_FOUND whatever the name says, and
 *       printings of another language are never matched, not even as look-alikes. A read without
 *       its dash that may be another language's or English ({@code VLBDE005}) is English when the
 *       catalog has one of its English places as read ({@code MRDE001} is {@code MRD-E001}), or
 *       knows the set of an English place and none of the other language's places ({@code
 *       SR10EN0O1}: {@code SR10} but no {@code SR1}; then its old forms and look-alikes count too).
 *       The other old form of a place is no place as read: {@code CT10E001} is refused when the
 *       catalog knows {@code CT1}, though it has {@code CT10-EN001}, as the German {@code
 *       CT1-DE001} read with its dash lost and its D as 0 (owner, 2026-10-15).
 * </ol>
 *
 * A name that is close to no card counts as no name. Without a name, the first code read (best
 * first) that the catalog knows decides. When the name wins, a card with a single printing is FOUND
 * only when no code was read.
 */
public final class ScanRules {

    /** pg_trgm similarity from which a name read is the card's (spec: "around 0.5"). */
    public static final double CLOSE = 0.5;

    /** How far the best close name must lead the next one to point clearly to its card. */
    public static final double CLEAR_MARGIN = 0.1;

    /** Similarity from which a card with a close name is shown among the other matches. */
    public static final double SHOWN = 0.3;

    public static final int MAX_CODES = 3;
    public static final int MAX_NAMES = 3;
    public static final int MAX_OTHER_MATCHES = 6;

    /** The language of the printings a scan can match. */
    static final String ENGLISH = "en";

    private ScanRules() {}

    // ---------------------------------------------------------------------------------------
    // What was read
    // ---------------------------------------------------------------------------------------

    /**
     * A code read and the codes it stands for.
     *
     * @param cleaned the read, cleaned ({@link ScanCodes#clean})
     * @param otherLanguage it carries another language's region
     * @param languageInDoubt without its dash it may be another language's or English ({@link
     *     ScanCodes#languageInDoubt}): only its English places are its exact forms, and it is
     *     English when the catalog has one of its {@code englishPlaces} as read, or knows one of
     *     its {@code englishSets} and none of its {@code otherLanguageSets}; another language's
     *     otherwise
     * @param englishPlaces in doubt: its English places as read, without their other old form
     * @param otherLanguageSets in doubt: the set parts of its other language's places
     * @param englishSets in doubt: the set parts of its English places
     * @param exactForms the codes it is, best first
     * @param lookAlikes its strict look-alike variants, the fewest swaps first
     * @param neighbours the codes one look-alike character away (shown only)
     */
    public record ReadCode(
            String cleaned,
            boolean otherLanguage,
            boolean languageInDoubt,
            List<String> englishPlaces,
            List<String> otherLanguageSets,
            List<String> englishSets,
            List<String> exactForms,
            List<ScanCodes.Variant> lookAlikes,
            List<String> neighbours) {}

    /**
     * What one photo gave.
     *
     * @param codes the codes read, best first
     * @param names the names read, trimmed, best first
     */
    public record Evidence(List<ReadCode> codes, List<String> names) {

        /** A code carries another language's region. */
        public boolean otherLanguage() {
            return codes.stream().anyMatch(ReadCode::otherLanguage);
        }

        /** What was read, for the answer. */
        public ScanMatch.Read read() {
            return new ScanMatch.Read(codes.stream().map(ReadCode::cleaned).toList(), names);
        }
    }

    /**
     * Cleans what the phone sent: codes cleaned and expanded (blank and repeated ones dropped),
     * names trimmed with inner runs of spaces made one (blank and repeated ones dropped), at most 3
     * of each.
     */
    public static Evidence evidence(List<String> codes, List<String> names) {
        List<ReadCode> reads = new ArrayList<>();
        Set<String> seenCodes = new HashSet<>();
        for (String raw : codes) {
            String cleaned = ScanCodes.clean(raw);
            if (cleaned.isEmpty() || !seenCodes.add(cleaned) || reads.size() >= MAX_CODES) {
                continue;
            }
            boolean other = ScanCodes.otherLanguage(cleaned);
            boolean inDoubt = !other && ScanCodes.languageInDoubt(cleaned);
            List<String> forms =
                    other
                            ? List.of()
                            : inDoubt
                                    ? ScanCodes.englishForms(cleaned)
                                    : ScanCodes.exactForms(cleaned);
            reads.add(
                    new ReadCode(
                            cleaned,
                            other,
                            inDoubt,
                            inDoubt ? ScanCodes.englishPlaces(cleaned) : List.of(),
                            inDoubt ? ScanCodes.otherLanguageSets(cleaned) : List.of(),
                            inDoubt ? ScanCodes.englishSets(cleaned) : List.of(),
                            forms,
                            ScanCodes.lookAlikes(forms),
                            ScanCodes.neighbours(forms)));
        }
        List<String> kept = new ArrayList<>();
        Set<String> seenNames = new HashSet<>();
        for (String raw : names) {
            String name = raw.strip().replaceAll("\\s+", " ");
            if (name.isEmpty()
                    || !seenNames.add(NameSimilarity.key(name))
                    || kept.size() >= MAX_NAMES) {
                continue;
            }
            kept.add(name);
        }
        return new Evidence(List.copyOf(reads), List.copyOf(kept));
    }

    /**
     * Every code the catalog is asked about, in one query: the exact forms, the look-alike variants
     * and the neighbours of every code read (none for a read of another language).
     */
    public static Set<String> codesToLookUp(Evidence evidence) {
        Set<String> codes = new LinkedHashSet<>();
        for (ReadCode read : evidence.codes()) {
            if (read.otherLanguage()) {
                continue;
            }
            codes.addAll(read.exactForms());
            read.lookAlikes().forEach(variant -> codes.add(variant.code()));
            codes.addAll(read.neighbours());
        }
        return codes;
    }

    /**
     * The set parts the catalog is asked about, in one more query, only when a code read is in
     * doubt ({@link ReadCode#languageInDoubt}): those of its other language's places and of its
     * English places. Empty otherwise.
     */
    public static Set<String> setsToLookUp(Evidence evidence) {
        Set<String> sets = new LinkedHashSet<>();
        for (ReadCode read : evidence.codes()) {
            if (read.languageInDoubt()) {
                sets.addAll(read.otherLanguageSets());
                sets.addAll(read.englishSets());
            }
        }
        return sets;
    }

    // ---------------------------------------------------------------------------------------
    // The catalog rows
    // ---------------------------------------------------------------------------------------

    /**
     * The catalog rows a decision reads: English printings of the game only.
     *
     * @param printingsByCode printings by exact code (those of {@link #codesToLookUp})
     * @param printingsByCard every printing of every candidate card, newest set first
     * @param cardNames the name of every candidate card
     * @param nameCandidates the cards the name lookup found, in its order
     * @param knownSets the set parts of {@link #setsToLookUp} the game's catalog has a set of
     */
    public record Catalog(
            Map<String, List<CatalogPrintingRef>> printingsByCode,
            Map<UUID, List<CatalogPrintingRef>> printingsByCard,
            Map<UUID, String> cardNames,
            List<UUID> nameCandidates,
            Set<String> knownSets) {

        /** No rows: nothing is looked up for a read of another language. */
        public static Catalog empty() {
            return new Catalog(Map.of(), Map.of(), Map.of(), List.of(), Set.of());
        }

        /**
         * Keeps the English printings of {@code game} (language {@code en} and no other language's
         * region in the code) and the cards that have one.
         */
        public static Catalog of(
                String game,
                Map<String, List<CatalogPrintingRef>> printingsByCode,
                Map<UUID, List<CatalogPrintingRef>> printingsByCard,
                Map<UUID, String> cardNames,
                List<UUID> nameCandidates,
                Set<String> knownSets) {
            Map<String, List<CatalogPrintingRef>> byCode = new LinkedHashMap<>();
            printingsByCode.forEach(
                    (code, refs) -> {
                        List<CatalogPrintingRef> kept =
                                refs.stream().filter(ref -> scannable(game, ref)).toList();
                        if (!kept.isEmpty()) {
                            byCode.put(code, kept);
                        }
                    });
            Map<UUID, List<CatalogPrintingRef>> byCard = new LinkedHashMap<>();
            printingsByCard.forEach(
                    (card, refs) -> {
                        List<CatalogPrintingRef> kept =
                                refs.stream().filter(ref -> scannable(game, ref)).toList();
                        if (!kept.isEmpty()) {
                            byCard.put(card, kept);
                        }
                    });
            Map<UUID, String> names = new LinkedHashMap<>();
            cardNames.forEach(
                    (card, name) -> {
                        if (byCard.containsKey(card)) {
                            names.put(card, name);
                        }
                    });
            return new Catalog(
                    byCode,
                    byCard,
                    names,
                    nameCandidates.stream().filter(names::containsKey).distinct().toList(),
                    Set.copyOf(knownSets));
        }

        List<CatalogPrintingRef> printings(String code) {
            return printingsByCode.getOrDefault(code, List.of());
        }

        List<CatalogPrintingRef> printingsOf(UUID card) {
            return printingsByCard.getOrDefault(card, List.of());
        }

        boolean known(UUID card) {
            return cardNames.containsKey(card);
        }
    }

    /** A printing an English scan can match: of the game, in English, with an English code. */
    static boolean scannable(String game, CatalogPrintingRef ref) {
        return game.equals(ref.game())
                && ENGLISH.equals(ref.language())
                && ref.printingCode() != null
                && !ScanCodes.isOtherLanguage(ref.printingCode());
    }

    // ---------------------------------------------------------------------------------------
    // Deciding
    // ---------------------------------------------------------------------------------------

    /**
     * Another card the read could be.
     *
     * @param cardId the card
     * @param kind CODE or NAME
     * @param code the code that brought it (CODE only)
     */
    public record Other(UUID cardId, ScanOtherMatchKind kind, @Nullable String code) {}

    /**
     * The outcome.
     *
     * @param status what was found
     * @param reason why nothing was (NOT_FOUND only)
     * @param cardId the card (all but NOT_FOUND)
     * @param code the code of the card that was read (FOUND and PICK_RARITY)
     * @param printingId the printing (FOUND only)
     * @param others at most {@value #MAX_OTHER_MATCHES} other cards, best first
     */
    public record Decision(
            ScanStatus status,
            @Nullable ScanNotFoundReason reason,
            @Nullable UUID cardId,
            @Nullable String code,
            @Nullable UUID printingId,
            List<Other> others) {}

    /** A catalog code a read reached: which read, and how close (form order or swaps). */
    private record Hit(String code, int read, int rank) {}

    /** Decides on the rows of {@code catalog} what {@code evidence} points to. */
    public static Decision decide(Evidence evidence, Catalog catalog) {
        if (evidence.otherLanguage() || anotherLanguageAfterAll(evidence, catalog)) {
            return new Decision(
                    ScanStatus.NOT_FOUND,
                    ScanNotFoundReason.OTHER_LANGUAGE,
                    null,
                    null,
                    null,
                    List.of());
        }
        boolean anyCode = evidence.codes().stream().anyMatch(read -> !read.exactForms().isEmpty());
        if (!anyCode && evidence.names().isEmpty()) {
            return new Decision(
                    ScanStatus.NOT_FOUND,
                    ScanNotFoundReason.NOTHING_READ,
                    null,
                    null,
                    null,
                    List.of());
        }
        return new Decider(evidence, catalog).decide();
    }

    /**
     * Whether a code read in doubt ({@link ReadCode#languageInDoubt}) is another language's after
     * all: the catalog has none of its English places as read (their other old form does not
     * count), and its sets do not make it English (the catalog knows no set of its English places,
     * or knows a set of another language's place: {@code VLBDE005} is German, the catalog knows
     * {@code VLB}; {@code CT10E001} is the German {@code CT1-DE001} misread when it knows {@code
     * CT1}, though it has {@code CT10-EN001}; {@code SR10EN0O1} is English, it knows {@code SR10}
     * and no {@code SR1}, and its look-alike {@code SR10-EN001} counts).
     */
    static boolean anotherLanguageAfterAll(Evidence evidence, Catalog catalog) {
        return evidence.codes().stream()
                .filter(ReadCode::languageInDoubt)
                .anyMatch(read -> !englishAsRead(read, catalog) && !englishBySet(read, catalog));
    }

    /** The catalog has one of the English places of {@code read} as read ({@code MRD-E001}). */
    private static boolean englishAsRead(ReadCode read, Catalog catalog) {
        return read.englishPlaces().stream().anyMatch(place -> has(catalog, place));
    }

    /**
     * The catalog knows the set of an English place of {@code read} and none of the sets of its
     * other language's places (then its old forms and look-alikes count: {@code SR10E001} is {@code
     * SR10-EN001} when it knows {@code SR10} and no {@code SR1}).
     */
    private static boolean englishBySet(ReadCode read, Catalog catalog) {
        return read.englishSets().stream().anyMatch(catalog.knownSets()::contains)
                && read.otherLanguageSets().stream().noneMatch(catalog.knownSets()::contains);
    }

    /** The catalog has an English printing of a known card with the code {@code code}. */
    private static boolean has(Catalog catalog, String code) {
        return catalog.printings(code).stream().anyMatch(ref -> catalog.known(ref.cardId()));
    }

    /** One decision's state. */
    private static final class Decider {

        private final Evidence evidence;
        private final Catalog catalog;
        private final Map<UUID, Double> scores = new LinkedHashMap<>();
        private final boolean nameUsable;
        private final @Nullable UUID clearName;
        private final Map<UUID, List<Hit>> exact = new LinkedHashMap<>();
        private final Map<UUID, List<Hit>> lookAlike = new LinkedHashMap<>();
        private final Map<UUID, List<Hit>> neighbour = new LinkedHashMap<>();
        private final List<String> forms = new ArrayList<>();

        Decider(Evidence evidence, Catalog catalog) {
            this.evidence = evidence;
            this.catalog = catalog;
            if (!evidence.names().isEmpty()) {
                catalog.cardNames()
                        .forEach(
                                (card, name) ->
                                        scores.put(
                                                card,
                                                evidence.names().stream()
                                                        .mapToDouble(
                                                                read ->
                                                                        NameSimilarity.score(
                                                                                read, name))
                                                        .max()
                                                        .orElse(0)));
            }
            this.nameUsable = scores.values().stream().anyMatch(score -> score >= CLOSE);
            this.clearName = clearPick(scores.keySet());
            List<ReadCode> reads = evidence.codes();
            for (int read = 0; read < reads.size(); read++) {
                List<String> exactForms = reads.get(read).exactForms();
                forms.addAll(exactForms);
                for (int form = 0; form < exactForms.size(); form++) {
                    collect(exact, exactForms.get(form), read, form);
                }
                for (ScanCodes.Variant variant : reads.get(read).lookAlikes()) {
                    collect(lookAlike, variant.code(), read, variant.swaps());
                }
                for (String code : reads.get(read).neighbours()) {
                    collect(neighbour, code, read, 1);
                }
            }
        }

        private void collect(Map<UUID, List<Hit>> hits, String code, int read, int rank) {
            for (CatalogPrintingRef ref : catalog.printings(code)) {
                if (catalog.known(ref.cardId())) {
                    List<Hit> cardHits =
                            hits.computeIfAbsent(ref.cardId(), id -> new ArrayList<>());
                    Hit hit = new Hit(code, read, rank);
                    if (!cardHits.contains(hit)) {
                        cardHits.add(hit);
                    }
                }
            }
        }

        Decision decide() {
            Outcome outcome;
            if (!exact.isEmpty()) {
                outcome = among(exact, true);
            } else if (!lookAlike.isEmpty()) {
                outcome = among(lookAlike, false);
            } else if (clearName != null) {
                outcome = nameWins(clearName);
            } else if (nameUsable) {
                outcome = ambiguous(closeNames());
            } else {
                outcome = Outcome.notFound(ScanNotFoundReason.NO_MATCH, List.of());
            }
            return new Decision(
                    outcome.status,
                    outcome.reason,
                    outcome.cardId,
                    outcome.code,
                    outcome.printingId,
                    others(outcome));
        }

        /** The cards some codes reached. */
        private Outcome among(Map<UUID, List<Hit>> hits, boolean exactCodes) {
            if (nameUsable) {
                List<UUID> close = hits.keySet().stream().filter(this::close).toList();
                if (close.size() == 1) {
                    return withHits(close.get(0), hits.get(close.get(0)), exactCodes);
                }
                if (close.size() > 1) {
                    @Nullable UUID pick = clearPick(close);
                    return pick != null
                            ? withHits(pick, hits.get(pick), exactCodes)
                            : ambiguous(close);
                }
                if (clearName == null) {
                    return ambiguous(new ArrayList<>(hits.keySet()));
                }
                if (exactCodes && !hasPrintingAtOrNear(clearName)) {
                    // The code read is another card's printing as read, and the named card has
                    // none at it or one look-alike character from it: the name may be a card's
                    // lying behind the photographed one. Both cards, the named one first.
                    List<UUID> both = new ArrayList<>();
                    both.add(clearName);
                    hits.keySet().stream()
                            .filter(card -> !card.equals(clearName))
                            .forEach(both::add);
                    return ambiguous(both);
                }
                // The name clearly points to another card: the name wins.
                return nameWins(clearName);
            }
            if (exactCodes) {
                // No name: the first code read (best first) the catalog knows decides.
                int first =
                        hits.values().stream()
                                .flatMap(List::stream)
                                .mapToInt(Hit::read)
                                .min()
                                .orElseThrow();
                List<UUID> cards =
                        hits.entrySet().stream()
                                .filter(e -> e.getValue().stream().anyMatch(h -> h.read() == first))
                                .map(Map.Entry::getKey)
                                .toList();
                return cards.size() == 1
                        ? withHits(cards.get(0), hits.get(cards.get(0)), true)
                        : ambiguous(cards);
            }
            // No name: a look-alike counts only when it is the only one the catalog has.
            Set<String> codes = new LinkedHashSet<>();
            hits.values().forEach(cardHits -> cardHits.forEach(hit -> codes.add(hit.code())));
            if (codes.size() == 1 && hits.size() == 1) {
                UUID card = hits.keySet().iterator().next();
                return withCode(card, codes.iterator().next());
            }
            return ambiguous(new ArrayList<>(hits.keySet()));
        }

        /**
         * The card some codes reached: the code of its best hit (exact codes: the first read, then
         * the first form; look-alikes: the fewest swaps, then the first read), unless several codes
         * tie there.
         */
        private Outcome withHits(UUID card, List<Hit> hits, boolean exactCodes) {
            Comparator<Hit> order =
                    exactCodes
                            ? Comparator.comparingInt(Hit::read).thenComparingInt(Hit::rank)
                            : Comparator.comparingInt(Hit::rank).thenComparingInt(Hit::read);
            Hit best = hits.stream().min(order).orElseThrow();
            Set<String> codes = new LinkedHashSet<>();
            for (Hit hit : hits) {
                if (hit.read() == best.read() && hit.rank() == best.rank()) {
                    codes.add(hit.code());
                }
            }
            return codes.size() == 1 ? withCode(card, best.code()) : withoutCode(card);
        }

        /**
         * Whether {@code card} has a printing at a code read or one look-alike character from it.
         */
        private boolean hasPrintingAtOrNear(UUID card) {
            return catalog.printingsOf(card).stream()
                    .map(CatalogPrintingRef::printingCode)
                    .anyMatch(
                            code ->
                                    forms.contains(code)
                                            || forms.stream()
                                                    .anyMatch(
                                                            form ->
                                                                    ScanCodes.oneLookAlikeApart(
                                                                            code, form)));
        }

        /**
         * The name wins: its card, with its printing whose code is the one read or one look-alike
         * character from it when exactly one is; when no code read is a catalog code as read, its
         * only printing one character lost, added or misread from a code read or one of its strict
         * look-alikes ({@link #oneEditApart}). Otherwise its printing is unknown (PICK_PRINTING,
         * even for a card with a single printing: the code read is not that printing's, so it may
         * be a printing the catalog lacks, a garbled read or another card's code reached through a
         * look-alike). With no code read, the card alone decides ({@link #withoutCode}).
         */
        private Outcome nameWins(UUID card) {
            if (forms.isEmpty()) {
                return withoutCode(card);
            }
            Set<String> codesOfCard = new LinkedHashSet<>();
            catalog.printingsOf(card).forEach(ref -> codesOfCard.add(ref.printingCode()));
            List<String> same = codesOfCard.stream().filter(forms::contains).toList();
            if (same.size() == 1) {
                return withCode(card, same.get(0));
            }
            if (same.isEmpty()) {
                List<String> near =
                        codesOfCard.stream()
                                .filter(
                                        code ->
                                                forms.stream()
                                                        .anyMatch(
                                                                form ->
                                                                        ScanCodes.oneLookAlikeApart(
                                                                                code, form)))
                                .toList();
                if (near.size() == 1) {
                    return withCode(card, near.get(0));
                }
                if (near.isEmpty() && exact.isEmpty()) {
                    // No code read is a catalog code as read: one character lost, added or misread.
                    Set<String> variants = new LinkedHashSet<>(forms);
                    evidence.codes()
                            .forEach(
                                    read -> read.lookAlikes().forEach(v -> variants.add(v.code())));
                    List<String> edited =
                            codesOfCard.stream()
                                    .filter(
                                            code ->
                                                    variants.stream()
                                                            .anyMatch(
                                                                    variant ->
                                                                            oneEditApart(
                                                                                    code, variant)))
                                    .toList();
                    if (edited.size() == 1) {
                        return withCode(card, edited.get(0));
                    }
                }
            }
            return new Outcome(ScanStatus.PICK_PRINTING, null, card, null, null, List.of());
        }

        /** The card and the code: FOUND in one rarity, PICK_RARITY in several. */
        private Outcome withCode(UUID card, String code) {
            List<CatalogPrintingRef> printings =
                    catalog.printingsOf(card).stream()
                            .filter(ref -> code.equals(ref.printingCode()))
                            .toList();
            if (printings.isEmpty()) {
                return withoutCode(card);
            }
            return printings.size() == 1
                    ? Outcome.found(card, code, printings.get(0).id())
                    : new Outcome(ScanStatus.PICK_RARITY, null, card, code, null, List.of());
        }

        /**
         * The card without its code: FOUND with a single printing, PICK_RARITY when all its
         * printings share one code, PICK_PRINTING otherwise.
         */
        private Outcome withoutCode(UUID card) {
            List<CatalogPrintingRef> printings = catalog.printingsOf(card);
            if (printings.isEmpty()) {
                return Outcome.notFound(ScanNotFoundReason.NO_MATCH, List.of());
            }
            if (printings.size() == 1) {
                return Outcome.found(card, printings.get(0).printingCode(), printings.get(0).id());
            }
            Set<String> codes = new LinkedHashSet<>();
            printings.forEach(ref -> codes.add(ref.printingCode()));
            return codes.size() == 1
                    ? new Outcome(
                            ScanStatus.PICK_RARITY,
                            null,
                            card,
                            codes.iterator().next(),
                            null,
                            List.of())
                    : new Outcome(ScanStatus.PICK_PRINTING, null, card, null, null, List.of());
        }

        private Outcome ambiguous(List<UUID> candidates) {
            return Outcome.notFound(ScanNotFoundReason.AMBIGUOUS, candidates);
        }

        private boolean close(UUID card) {
            return scores.getOrDefault(card, 0.0) >= CLOSE;
        }

        private List<UUID> closeNames() {
            return scores.keySet().stream().filter(this::close).sorted(byScore()).toList();
        }

        private Comparator<UUID> byScore() {
            return Comparator.comparingDouble((UUID card) -> scores.getOrDefault(card, 0.0))
                    .reversed();
        }

        /**
         * The card the names point to clearly among {@code cards}: close, and its own name read
         * exactly while no other one was, or ahead of the next by {@value #CLEAR_MARGIN}.
         */
        private @Nullable UUID clearPick(Collection<UUID> cards) {
            List<UUID> ranked = cards.stream().sorted(byScore()).toList();
            if (ranked.isEmpty()) {
                return null;
            }
            double best = scores.getOrDefault(ranked.get(0), 0.0);
            double next = ranked.size() > 1 ? scores.getOrDefault(ranked.get(1), 0.0) : 0;
            if (best < CLOSE) {
                return null;
            }
            if (best >= 1 && next < 1) {
                return ranked.get(0);
            }
            return best - next >= CLEAR_MARGIN ? ranked.get(0) : null;
        }

        /**
         * The other matches: the candidates of an undecided read first, then the cards of the codes
         * read, of their look-alikes and of the codes one look-alike character away, then the cards
         * with close names; never the card found, at most {@value #MAX_OTHER_MATCHES}.
         */
        private List<Other> others(Outcome outcome) {
            Map<UUID, Other> others = new LinkedHashMap<>();
            for (UUID card : outcome.candidates) {
                others.putIfAbsent(card, asOther(card));
            }
            for (Map<UUID, List<Hit>> hits : List.of(exact, lookAlike, neighbour)) {
                hits.entrySet().stream()
                        .sorted(
                                Comparator.comparingInt(
                                        (Map.Entry<UUID, List<Hit>> e) ->
                                                e.getValue().stream()
                                                        .mapToInt(Hit::rank)
                                                        .min()
                                                        .orElse(0)))
                        .forEach(
                                e ->
                                        others.putIfAbsent(
                                                e.getKey(),
                                                new Other(
                                                        e.getKey(),
                                                        ScanOtherMatchKind.CODE,
                                                        bestCode(e.getValue()))));
            }
            scores.keySet().stream()
                    .filter(card -> scores.getOrDefault(card, 0.0) >= SHOWN)
                    .sorted(byScore())
                    .forEach(
                            card ->
                                    others.putIfAbsent(
                                            card, new Other(card, ScanOtherMatchKind.NAME, null)));
            if (outcome.cardId != null) {
                others.remove(outcome.cardId);
            }
            return others.values().stream().limit(MAX_OTHER_MATCHES).toList();
        }

        private Other asOther(UUID card) {
            for (Map<UUID, List<Hit>> hits : List.of(exact, lookAlike, neighbour)) {
                List<Hit> cardHits = hits.get(card);
                if (cardHits != null) {
                    return new Other(card, ScanOtherMatchKind.CODE, bestCode(cardHits));
                }
            }
            return new Other(card, ScanOtherMatchKind.NAME, null);
        }

        private static String bestCode(List<Hit> hits) {
            return hits.stream()
                    .min(Comparator.comparingInt(Hit::rank).thenComparingInt(Hit::read))
                    .map(Hit::code)
                    .orElseThrow();
        }
    }

    /**
     * Whether two codes are one character apart: the same length and one character different, or
     * one character more or less.
     */
    static boolean oneEditApart(String a, String b) {
        if (a.equals(b) || Math.abs(a.length() - b.length()) > 1) {
            return false;
        }
        String longer = a.length() >= b.length() ? a : b;
        String shorter = a.length() >= b.length() ? b : a;
        int same = 0;
        while (same < shorter.length() && longer.charAt(same) == shorter.charAt(same)) {
            same++;
        }
        return longer.length() == shorter.length()
                ? longer.substring(same + 1).equals(shorter.substring(same + 1))
                : longer.substring(same + 1).equals(shorter.substring(same));
    }

    /** A decision before its other matches. */
    private record Outcome(
            ScanStatus status,
            @Nullable ScanNotFoundReason reason,
            @Nullable UUID cardId,
            @Nullable String code,
            @Nullable UUID printingId,
            List<UUID> candidates) {

        static Outcome found(UUID card, @Nullable String code, UUID printingId) {
            return new Outcome(ScanStatus.FOUND, null, card, code, printingId, List.of());
        }

        static Outcome notFound(ScanNotFoundReason reason, List<UUID> candidates) {
            return new Outcome(ScanStatus.NOT_FOUND, reason, null, null, null, candidates);
        }
    }
}
