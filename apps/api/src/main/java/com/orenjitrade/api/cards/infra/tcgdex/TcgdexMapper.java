package com.orenjitrade.api.cards.infra.tcgdex;

import static com.orenjitrade.api.cards.infra.http.ProviderText.trim;
import static com.orenjitrade.api.cards.infra.http.ProviderText.truncate;
import static com.orenjitrade.api.cards.infra.http.ProviderText.upper;

import com.orenjitrade.api.cards.domain.CatalogText;
import com.orenjitrade.api.cards.domain.provider.ProviderCard;
import com.orenjitrade.api.cards.domain.provider.ProviderImage;
import com.orenjitrade.api.cards.domain.provider.ProviderPrinting;
import com.orenjitrade.api.cards.domain.provider.ProviderSet;
import com.orenjitrade.api.cards.domain.provider.SyncResult;
import com.orenjitrade.api.cards.infra.http.ProviderText;
import com.orenjitrade.api.cards.infra.http.ProviderWarnings;
import java.text.Normalizer;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.JsonNode;

/**
 * Maps TCGdex's card database (the {@code data/} folder of github.com/tcgdex/cards-database: one
 * TypeScript file per serie, set and card) to the generic catalog model (ADR 0005, ADR 0021). Pure
 * and deterministic: the same archive always yields the same rows.
 *
 * <ul>
 *   <li>English only: a set or card without an English name is left out; Pokémon TCG Pocket (a
 *       digital game, serie {@code tcgp}) is left out.
 *   <li>Set: code = the official abbreviation ({@code abbreviations.official} or {@code tcgOnline},
 *       e.g. {@code DAA}) when it is unique, else the TCGdex id without punctuation ({@code sv03.5}
 *       → {@code SV035}); English name, release date, official card count, serie name.
 *   <li>Card: one per English name across sets (Pokémon has no Oracle-like id; reprints and
 *       different cards of one name are printings of that name): {@code card_type} Pokémon /
 *       Trainer / Energy, {@code subtype} the stage, trainer or energy type, rules text (abilities,
 *       attacks, effects) and metadata ({@code hp}, {@code types}, {@code stage}, {@code weakness})
 *       of its newest printing.
 *   <li>Printing: one per TCGdex card ({@code <setId>-<localId>}): collector number = {@code
 *       localId}, rarity as written ({@code None} → none), edition {@code UNLIMITED}, language
 *       {@code en}, finish {@code NORMAL}, else {@code HOLO}, else {@code REVERSE_HOLO} (the
 *       variants are kept in {@code metadata.variants}), printing code {@code <SET>-<NUMBER>} when
 *       it fits, illustrator and regulation mark. No market price.
 *   <li>Images: one per printing, {@code <assetBaseUrl>en/<serie>/<set>/<localId>/<imageFile>},
 *       server-side only; the card's primary artwork is its newest printing's.
 * </ul>
 */
final class TcgdexMapper {

    static final String PROVIDER_ID = "tcgdex";
    static final String LANGUAGE = "en";
    static final int MAX_NAME = 150;
    static final int MAX_TEXT = 4000;
    static final int MAX_SET_NAME = 120;
    static final int MAX_COLLECTOR_NUMBER = 20;

    static final String SKIPPED_CARD_LANGUAGE = "cards without an English name skipped";
    static final String SKIPPED_SET_LANGUAGE = "sets without an English name skipped";
    static final String SKIPPED_EXCLUDED = "cards of excluded series (digital games) skipped";

    private static final Pattern SET_CODE = Pattern.compile("^[A-Z0-9]{2,10}$");
    private static final Pattern PATH_PART = Pattern.compile("^[A-Za-z0-9._-]{1,32}$");
    private static final Pattern IMAGE_ID = Pattern.compile("^[A-Za-z0-9._-]{1,64}$");
    private static final Pattern STAGE_NUMBER = Pattern.compile("^Stage\\s*([0-9])$");

    private TcgdexMapper() {}

    /** Collects the parsed data files (in any order) and maps them once all are read. */
    static final class Builder {
        private final String gameSlug;
        private final String assetBaseUrl;
        private final String imageFile;
        private final Set<String> excludedSeries;
        private final ProviderWarnings warnings = new ProviderWarnings();
        private final Map<String, SerieDraft> series = new HashMap<>();
        private final Map<String, SetDraft> sets = new HashMap<>();
        private final List<CardDraft> cards = new ArrayList<>();

        Builder(String gameSlug, String assetBaseUrl, String imageFile, Set<String> excluded) {
            this.gameSlug = gameSlug;
            this.assetBaseUrl = assetBaseUrl;
            this.imageFile = imageFile;
            this.excludedSeries = Set.copyOf(excluded);
        }

        ProviderWarnings warnings() {
            return warnings;
        }

        /** {@code data/<serie>.ts}. */
        void serie(String dir, JsonNode node) {
            series.put(dir, new SerieDraft(trim(text(node.get("id"))), english(node.get("name"))));
        }

        /** {@code data/<serie>/<set>.ts}. */
        void set(String serieDir, String dir, JsonNode node) {
            JsonNode abbreviations = node.path("abbreviations");
            String abbreviation = text(abbreviations.get("official"));
            if (abbreviation.isEmpty()) {
                abbreviation = text(node.get("tcgOnline"));
            }
            JsonNode count = node.path("cardCount").get("official");
            sets.put(
                    serieDir + "/" + dir,
                    new SetDraft(
                            serieDir,
                            trim(text(node.get("id"))),
                            english(node.get("name")),
                            upper(abbreviation),
                            ProviderText.parseDate(english(node.get("releaseDate"))),
                            count != null && count.isNumber() && count.asInt() >= 0
                                    ? count.asInt()
                                    : null));
        }

        /** {@code data/<serie>/<set>/<localId>.ts}. */
        void card(String serieDir, String setDir, String localId, JsonNode node) {
            String name = english(node.get("name"));
            if (name.isEmpty()) {
                warnings.add(SKIPPED_CARD_LANGUAGE, setDir + "/" + localId);
                return;
            }
            cards.add(
                    new CardDraft(
                            serieDir + "/" + setDir,
                            localId,
                            truncate(name, MAX_NAME),
                            text(node.get("category")),
                            rarity(text(node.get("rarity"))),
                            text(node.get("illustrator")),
                            node.path("hp").isNumber() ? node.path("hp").asInt() : null,
                            strings(node.get("types")),
                            stage(text(node.get("stage"))),
                            text(node.get("trainerType")),
                            text(node.get("energyType")),
                            text(node.path("weaknesses").path(0).get("type")),
                            truncate(rulesText(node), MAX_TEXT),
                            text(node.get("regulationMark")),
                            variants(node.get("variants"))));
        }

        SyncResult build(@Nullable String version) {
            Map<String, String> codes = setCodes();
            Map<String, List<CardDraft>> byName = new TreeMap<>();
            for (CardDraft card : cards) {
                @Nullable SetDraft set = sets.get(card.setKey());
                if (set == null) {
                    warnings.add("cards without a set file skipped", card.setKey());
                    continue;
                }
                @Nullable SerieDraft serie = series.get(set.serieDir());
                if (serie != null && excludedSeries.contains(serie.id())) {
                    warnings.add(SKIPPED_EXCLUDED, card.name());
                    continue;
                }
                if (set.name().isEmpty() || set.id().isEmpty()) {
                    warnings.add(SKIPPED_CARD_LANGUAGE, card.name());
                    continue;
                }
                if (!codes.containsKey(card.setKey())) {
                    continue; // the set was skipped and reported once
                }
                if (card.localId().isEmpty() || card.localId().length() > MAX_COLLECTOR_NUMBER) {
                    warnings.add("cards without a usable number skipped", card.name());
                    continue;
                }
                byName.computeIfAbsent(nameKey(card.name()), k -> new ArrayList<>()).add(card);
            }

            Comparator<CardDraft> order =
                    Comparator.comparing(
                                    (CardDraft c) -> sets.get(c.setKey()).releaseDate(),
                                    Comparator.nullsLast(Comparator.reverseOrder()))
                            .thenComparing(c -> codes.get(c.setKey()))
                            .thenComparing(
                                    CardDraft::localId, ProviderText::compareCollectorNumbers);
            List<ProviderCard> result = new ArrayList<>();
            for (Map.Entry<String, List<CardDraft>> entry : byName.entrySet()) {
                List<CardDraft> printings = new ArrayList<>(entry.getValue());
                printings.sort(order);
                CardDraft head = printings.get(0);
                String externalCardId = "name:" + entry.getKey();
                List<ProviderPrinting> mapped = new ArrayList<>();
                List<ProviderImage> artworks = new ArrayList<>();
                Set<String> seenPrintings = new HashSet<>();
                for (CardDraft card : printings) {
                    SetDraft set = sets.get(card.setKey());
                    String setCode = codes.get(card.setKey());
                    String externalId = set.id() + "-" + card.localId();
                    if (!seenPrintings.add(externalId)) {
                        warnings.add("cards listed twice skipped", externalId);
                        continue;
                    }
                    @Nullable ProviderImage artwork = artwork(set, card, externalId);
                    if (artwork != null) {
                        artworks.add(artwork);
                    }
                    mapped.add(printing(externalCardId, externalId, setCode, card, artwork));
                }
                result.add(
                        new ProviderCard(
                                externalCardId,
                                head.name(),
                                cardType(head.category()),
                                subtype(head),
                                head.text(),
                                metadata(head),
                                mapped,
                                artworks));
            }
            List<ProviderSet> providerSets = new ArrayList<>();
            codes.entrySet().stream()
                    .sorted(Map.Entry.comparingByValue())
                    .forEach(
                            entry -> {
                                SetDraft set = sets.get(entry.getKey());
                                @Nullable SerieDraft serie = series.get(set.serieDir());
                                Map<String, Object> metadata = new LinkedHashMap<>();
                                metadata.put("tcgdexId", set.id());
                                if (!set.abbreviation().isEmpty()) {
                                    metadata.put("abbreviation", set.abbreviation());
                                }
                                providerSets.add(
                                        new ProviderSet(
                                                set.id(),
                                                entry.getValue(),
                                                truncate(set.name(), MAX_SET_NAME),
                                                set.releaseDate(),
                                                set.officialCount(),
                                                serie == null || serie.name().isEmpty()
                                                        ? null
                                                        : truncate(serie.name(), 120),
                                                metadata));
                            });
            return new SyncResult(
                    PROVIDER_ID, gameSlug, providerSets, result, version, warnings.messages());
        }

        /**
         * Codes of the English sets of the included series: the official abbreviation when no other
         * set claims it, else the id without punctuation; a set without a usable code is skipped.
         */
        private Map<String, String> setCodes() {
            Map<String, SetDraft> english = new TreeMap<>();
            sets.forEach(
                    (key, set) -> {
                        @Nullable SerieDraft serie = series.get(set.serieDir());
                        if (serie != null && excludedSeries.contains(serie.id())) {
                            return;
                        }
                        if (set.id().isEmpty() || set.name().isEmpty()) {
                            warnings.add(SKIPPED_SET_LANGUAGE, set.id().isEmpty() ? key : set.id());
                            return;
                        }
                        english.put(key, set);
                    });
            Map<String, Integer> abbreviationUses = new HashMap<>();
            Set<String> fallbacks = new HashSet<>();
            english.values()
                    .forEach(
                            set -> {
                                if (SET_CODE.matcher(set.abbreviation()).matches()) {
                                    abbreviationUses.merge(set.abbreviation(), 1, Integer::sum);
                                }
                                fallbacks.add(fallbackCode(set.id()));
                            });
            Map<String, String> codes = new LinkedHashMap<>();
            Set<String> taken = new HashSet<>();
            english.forEach(
                    (key, set) -> {
                        String abbreviation = set.abbreviation();
                        String code =
                                SET_CODE.matcher(abbreviation).matches()
                                                && abbreviationUses.get(abbreviation) == 1
                                                && !fallbacks.contains(abbreviation)
                                        ? abbreviation
                                        : fallbackCode(set.id());
                        if (!SET_CODE.matcher(code).matches() || !taken.add(code)) {
                            warnings.add("sets without a usable code skipped", set.id());
                            return;
                        }
                        codes.put(key, code);
                    });
            return codes;
        }

        private @Nullable ProviderImage artwork(SetDraft set, CardDraft card, String externalId) {
            @Nullable SerieDraft serie = series.get(set.serieDir());
            if (serie == null
                    || !PATH_PART.matcher(serie.id()).matches()
                    || !PATH_PART.matcher(set.id()).matches()
                    || !PATH_PART.matcher(card.localId()).matches()
                    || !IMAGE_ID.matcher(externalId).matches()) {
                warnings.add("printings without an image address skipped", externalId);
                return null;
            }
            String url =
                    assetBaseUrl
                            + LANGUAGE
                            + "/"
                            + serie.id()
                            + "/"
                            + set.id()
                            + "/"
                            + card.localId()
                            + "/"
                            + imageFile;
            return ProviderImage.artwork(PROVIDER_ID, externalId, url);
        }
    }

    // -------------------------------------------------------------------------------------
    // Rows
    // -------------------------------------------------------------------------------------

    private static ProviderPrinting printing(
            String externalCardId,
            String externalId,
            String setCode,
            CardDraft card,
            @Nullable ProviderImage artwork) {
        String code = setCode + "-" + upper(card.localId());
        Map<String, Object> metadata = new LinkedHashMap<>();
        if (!card.illustrator().isEmpty()) {
            metadata.put("illustrator", truncate(card.illustrator(), 120));
        }
        if (!card.regulationMark().isEmpty()) {
            metadata.put("regulationMark", truncate(card.regulationMark(), 4));
        }
        if (!card.variants().isEmpty()) {
            metadata.put("variants", card.variants());
        }
        return new ProviderPrinting(
                externalId,
                externalCardId,
                setCode,
                card.localId(),
                card.rarity(),
                "UNLIMITED",
                LANGUAGE,
                finish(card.variants()),
                CatalogText.PRINTING_CODE.matcher(code).matches() ? code : null,
                metadata,
                artwork == null ? List.of() : List.of(artwork),
                null);
    }

    static String finish(List<String> variants) {
        if (variants.isEmpty() || variants.contains("normal")) {
            return "NORMAL";
        }
        if (variants.contains("holo")) {
            return "HOLO";
        }
        if (variants.contains("reverse")) {
            return "REVERSE_HOLO";
        }
        return "NORMAL";
    }

    static @Nullable String cardType(String category) {
        return switch (category) {
            case "" -> null;
            case "Pokemon", "Pokémon" -> "Pokémon";
            default -> truncate(category, 100);
        };
    }

    static @Nullable String subtype(CardDraft card) {
        String subtype =
                switch (card.category()) {
                    case "Trainer" -> card.trainerType();
                    case "Energy" -> card.energyType();
                    default -> card.stage();
                };
        return subtype.isEmpty() ? null : truncate(subtype, 100);
    }

    static Map<String, Object> metadata(CardDraft card) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        if (card.hp() != null) {
            metadata.put("hp", card.hp());
        }
        if (!card.types().isEmpty()) {
            metadata.put("types", card.types());
        }
        if (!card.stage().isEmpty() && "Pokémon".equals(cardType(card.category()))) {
            metadata.put("stage", card.stage());
        }
        if (!card.weakness().isEmpty()) {
            metadata.put("weakness", card.weakness());
        }
        return metadata;
    }

    /** {@code None} and blanks are no rarity. */
    static @Nullable String rarity(String rarity) {
        return rarity.isEmpty() || rarity.equalsIgnoreCase("None") ? null : truncate(rarity, 100);
    }

    /** {@code Stage1} → {@code Stage 1}; other stages as written. */
    static String stage(String stage) {
        var matcher = STAGE_NUMBER.matcher(stage);
        return matcher.matches() ? "Stage " + matcher.group(1) : stage;
    }

    /** The grouping key of a name: typographic apostrophes and spacing unified. */
    static String nameKey(String name) {
        String key =
                Normalizer.normalize(name, Normalizer.Form.NFC)
                        .replace('’', '\'')
                        .replace('‘', '\'')
                        .replaceAll("\\s+", " ")
                        .strip();
        return key;
    }

    /** {@code sv03.5} → {@code SV035}. */
    static String fallbackCode(String id) {
        return upper(id).replaceAll("[^A-Z0-9]", "");
    }

    /** Abilities, attacks and effects of a card in English, one block each. */
    static String rulesText(JsonNode node) {
        List<String> blocks = new ArrayList<>();
        for (JsonNode ability : iterable(node.get("abilities"))) {
            String type = text(ability.get("type"));
            String name = english(ability.get("name"));
            String effect = english(ability.get("effect"));
            String title =
                    (type.isEmpty() ? "Ability" : type) + (name.isEmpty() ? "" : ": " + name);
            blocks.add(effect.isEmpty() ? title : title + "\n" + effect);
        }
        for (JsonNode attack : iterable(node.get("attacks"))) {
            String name = english(attack.get("name"));
            String damage = text(attack.get("damage"));
            String effect = english(attack.get("effect"));
            List<String> cost = strings(attack.get("cost"));
            String title =
                    (cost.isEmpty() ? "" : "[" + String.join(", ", cost) + "] ")
                            + name
                            + (damage.isEmpty() ? "" : " " + damage);
            if (!title.isBlank()) {
                blocks.add(effect.isEmpty() ? title.strip() : title.strip() + "\n" + effect);
            }
        }
        String effect = english(node.get("effect"));
        if (!effect.isEmpty()) {
            blocks.add(effect);
        }
        return String.join("\n\n", blocks);
    }

    /** The English text of a translated field ({@code {en: "..."}}) or a plain string. */
    static String english(@Nullable JsonNode node) {
        if (node == null || node.isNull() || node.isMissingNode()) {
            return "";
        }
        if (node.isObject()) {
            return text(node.get(LANGUAGE));
        }
        return text(node);
    }

    static String text(@Nullable JsonNode node) {
        if (node == null || node.isNull() || node.isMissingNode() || node.isContainer()) {
            return "";
        }
        return trim(node.asString());
    }

    static List<String> strings(@Nullable JsonNode node) {
        List<String> values = new ArrayList<>();
        for (JsonNode item : iterable(node)) {
            String value = text(item);
            if (!value.isEmpty()) {
                values.add(value);
            }
        }
        return values;
    }

    /** Variant names: {@code {normal: true, holo: false}} or {@code [{type: "normal"}]}. */
    static List<String> variants(@Nullable JsonNode node) {
        List<String> variants = new ArrayList<>();
        if (node == null || node.isNull() || node.isMissingNode()) {
            return variants;
        }
        if (node.isObject()) {
            for (String name : List.of("normal", "reverse", "holo", "firstEdition", "wPromo")) {
                if (node.path(name).asBoolean(false)) {
                    variants.add(name);
                }
            }
        } else {
            for (JsonNode item : iterable(node)) {
                String type = item.isObject() ? text(item.get("type")) : text(item);
                if (!type.isEmpty() && !variants.contains(type)) {
                    variants.add(type);
                }
            }
        }
        return variants;
    }

    private static Iterable<JsonNode> iterable(@Nullable JsonNode node) {
        if (node == null || !node.isArray()) {
            return List.of();
        }
        List<JsonNode> items = new ArrayList<>();
        node.forEach(items::add);
        return items;
    }

    record SerieDraft(String id, String name) {}

    record SetDraft(
            String serieDir,
            String id,
            String name,
            String abbreviation,
            @Nullable LocalDate releaseDate,
            @Nullable Integer officialCount) {}

    /** The English fields of one card file, kept instead of its parsed tree. */
    record CardDraft(
            String setKey,
            String localId,
            String name,
            String category,
            @Nullable String rarity,
            String illustrator,
            @Nullable Integer hp,
            List<String> types,
            String stage,
            String trainerType,
            String energyType,
            String weakness,
            String text,
            String regulationMark,
            List<String> variants) {}
}
