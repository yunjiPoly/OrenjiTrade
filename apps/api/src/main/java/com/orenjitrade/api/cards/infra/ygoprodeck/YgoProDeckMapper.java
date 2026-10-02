package com.orenjitrade.api.cards.infra.ygoprodeck;

import com.orenjitrade.api.cards.domain.CatalogText;
import com.orenjitrade.api.cards.domain.provider.ProviderCard;
import com.orenjitrade.api.cards.domain.provider.ProviderImage;
import com.orenjitrade.api.cards.domain.provider.ProviderMarketPrice;
import com.orenjitrade.api.cards.domain.provider.ProviderPrinting;
import com.orenjitrade.api.cards.domain.provider.ProviderSet;
import com.orenjitrade.api.cards.domain.provider.SyncResult;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * Maps a YGOPRODeck snapshot ({@code cardinfo.php?misc=yes} + {@code cardsets.php}) to the generic
 * catalog model (ADR 0005, ADR 0015). Pure and deterministic: the same snapshot always yields the
 * same rows, so imports are idempotent.
 *
 * <ul>
 *   <li>Card: name, rules text, {@code card_type} Monster/Spell/Trap/Skill/Token, subtype (monster
 *       typeline without the race, or the spell/trap property), game metadata matching the yugioh
 *       GameSchema (attribute, level / rank, link rating and arrows, pendulum scale, ATK/DEF,
 *       monster type, property, archetype, frame, Konami id).
 *   <li>Sets: one per printing-code prefix (YGOPRODeck lists several products under one code; the
 *       largest product names the set, the others are kept in {@code metadata.products}).
 *   <li>Printings: one per {@code card_sets} entry: printing code as printed ({@code LOB-EN001}),
 *       collector number after the dash, rarity (spelling variants unified), language {@code en},
 *       finish {@code NORMAL}; YGOPRODeck has no edition, so the schema default {@code UNLIMITED}
 *       applies (collectors record the edition of their own copy). {@code set_price} (USD) becomes
 *       the indicative market price, dated by the provider database's last update.
 *   <li>Images: one card-level artwork per {@code card_images} id (first = primary); the source URL
 *       {@code <imageBaseUrl><id>.jpg} stays server-side.
 * </ul>
 *
 * Invalid printing codes and codes claimed by two cards (provider data errors) are skipped and
 * reported as warnings.
 */
final class YgoProDeckMapper {

    static final String PROVIDER_ID = "ygoprodeck";
    static final String CURRENCY = "USD";
    static final int MAX_NAME = 150;
    static final int MAX_TEXT = 4000;
    static final int MAX_SET_NAME = 120;
    static final int MAX_WARNING_EXAMPLES = 5;

    private static final Pattern SET_CODE = Pattern.compile("^[A-Z0-9]{2,10}$");
    private static final DateTimeFormatter LAST_UPDATE =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss", Locale.ROOT);

    private YgoProDeckMapper() {}

    static SyncResult map(
            String gameSlug,
            String imageBaseUrl,
            List<YgoProDeckDtos.Card> cardInfo,
            List<YgoProDeckDtos.SetInfo> setInfo,
            @Nullable String version,
            @Nullable String lastUpdate) {
        Warnings warnings = new Warnings();
        @Nullable Instant priceDate = parseLastUpdate(lastUpdate);
        Map<String, String> rarities = canonicalRarities(cardInfo);

        Map<String, YgoProDeckDtos.SetInfo> setsByName = new HashMap<>();
        Map<String, List<YgoProDeckDtos.SetInfo>> productsByCode = new TreeMap<>();
        for (YgoProDeckDtos.SetInfo set : setInfo) {
            String name = trim(set.setName());
            String code = upper(set.setCode());
            if (name.isEmpty()) {
                continue;
            }
            setsByName.putIfAbsent(name, set);
            if (SET_CODE.matcher(code).matches()) {
                productsByCode.computeIfAbsent(code, c -> new ArrayList<>()).add(set);
            } else {
                warnings.add("sets with an invalid set code skipped", code);
            }
        }
        Map<String, SetDraft> sets = new TreeMap<>();
        productsByCode.forEach((code, products) -> sets.put(code, SetDraft.of(code, products)));

        List<YgoProDeckDtos.Card> ordered = new ArrayList<>(cardInfo);
        ordered.sort(Comparator.comparingLong(YgoProDeckDtos.Card::id));
        Set<String> claimedVariants = new HashSet<>();
        Set<String> seenImages = new HashSet<>();
        List<ProviderCard> cards = new ArrayList<>();
        for (YgoProDeckDtos.Card card : ordered) {
            String name = truncate(trim(card.name()), MAX_NAME);
            if (card.id() <= 0 || name.isEmpty()) {
                warnings.add("cards without id or name skipped", String.valueOf(card.id()));
                continue;
            }
            String externalId = Long.toString(card.id());
            List<ProviderImage> images = new ArrayList<>();
            for (YgoProDeckDtos.Image image : nullSafe(card.cardImages())) {
                if (image.id() <= 0) {
                    warnings.add("artworks without id skipped", externalId);
                    continue;
                }
                String imageId = Long.toString(image.id());
                if (!seenImages.add(imageId)) {
                    warnings.add("artworks listed by two cards skipped", imageId);
                    continue;
                }
                images.add(
                        ProviderImage.artwork(
                                PROVIDER_ID, imageId, imageBaseUrl + imageId + ".jpg"));
            }

            List<ProviderPrinting> printings = new ArrayList<>();
            Set<String> ownVariants = new HashSet<>();
            for (YgoProDeckDtos.CardSet entry : nullSafe(card.cardSets())) {
                String code = upper(entry.setCode());
                if (!CatalogText.PRINTING_CODE.matcher(code).matches()) {
                    warnings.add("printings with an invalid printing code skipped", code);
                    continue;
                }
                int dash = code.indexOf('-');
                String setCode = code.substring(0, dash);
                String number = code.substring(dash + 1);
                @Nullable String rarity =
                        rarities.get(trim(entry.setRarity()).toLowerCase(Locale.ROOT));
                String rarityKey = rarity == null ? "" : rarity.toLowerCase(Locale.ROOT);
                if (!ownVariants.add(code + "|" + rarityKey)) {
                    continue; // the same code and rarity listed twice for one card
                }
                if (!claimedVariants.add(code + "|" + rarityKey)) {
                    warnings.add(
                            "printings claimed by two cards skipped (provider data error)",
                            code + (rarity == null ? "" : " " + rarity));
                    continue;
                }
                String productName = truncate(trim(entry.setName()), MAX_SET_NAME);
                SetDraft set =
                        sets.computeIfAbsent(
                                setCode,
                                c ->
                                        SetDraft.fromEntry(
                                                c, productName, setsByName.get(productName)));
                Map<String, Object> metadata = new LinkedHashMap<>();
                String rarityCode = trim(entry.setRarityCode()).replace("(", "").replace(")", "");
                if (!rarityCode.isEmpty()) {
                    metadata.put("rarityCode", rarityCode);
                }
                if (!productName.isEmpty() && !productName.equals(set.name)) {
                    metadata.put("setName", productName);
                }
                printings.add(
                        new ProviderPrinting(
                                externalId + ":" + code + ":" + rarityId(rarity),
                                externalId,
                                setCode,
                                number,
                                rarity,
                                "UNLIMITED",
                                "en",
                                "NORMAL",
                                code,
                                metadata,
                                List.of(),
                                price(entry.setPrice(), priceDate)));
            }
            cards.add(
                    new ProviderCard(
                            externalId,
                            name,
                            cardType(card),
                            subtype(card),
                            truncate(card.desc() == null ? "" : card.desc().strip(), MAX_TEXT),
                            metadata(card),
                            printings,
                            images));
        }
        List<ProviderSet> providerSets =
                sets.values().stream().map(SetDraft::toProviderSet).toList();
        return new SyncResult(
                PROVIDER_ID, gameSlug, providerSets, cards, version, warnings.messages());
    }

    // -------------------------------------------------------------------------------------
    // Cards
    // -------------------------------------------------------------------------------------

    static boolean isMonster(YgoProDeckDtos.Card card) {
        return trim(card.type()).contains("Monster");
    }

    static @Nullable String cardType(YgoProDeckDtos.Card card) {
        String type = trim(card.type());
        if (type.contains("Monster")) {
            return "Monster";
        }
        return switch (type) {
            case "Spell Card" -> "Spell";
            case "Trap Card" -> "Trap";
            case "Skill Card" -> "Skill";
            case "Token" -> "Token";
            case "" -> null;
            default -> type;
        };
    }

    static @Nullable String subtype(YgoProDeckDtos.Card card) {
        if (isMonster(card)) {
            List<String> typeline = nullSafe(card.typeline());
            if (typeline.size() > 1) {
                return String.join(" / ", typeline.subList(1, typeline.size()));
            }
            String readable = trim(card.humanReadableCardType());
            String withoutMonster = readable.replace(" Monster", "").trim();
            return withoutMonster.isEmpty() ? null : withoutMonster;
        }
        String race = trim(card.race());
        return race.isEmpty() || "Token".equals(cardType(card)) ? null : race;
    }

    static Map<String, Object> metadata(YgoProDeckDtos.Card card) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        String frame = trim(card.frameType()).toLowerCase(Locale.ROOT);
        if (isMonster(card)) {
            putText(metadata, "attribute", card.attribute());
            boolean link = frame.equals("link");
            boolean xyz = frame.startsWith("xyz");
            if (card.level() != null && !link) {
                metadata.put(xyz ? "rank" : "level", card.level());
            }
            if (card.linkval() != null) {
                metadata.put("linkRating", card.linkval());
            }
            List<String> markers =
                    nullSafe(card.linkmarkers()).stream()
                            .map(YgoProDeckMapper::trim)
                            .filter(marker -> !marker.isEmpty())
                            .toList();
            if (!markers.isEmpty()) {
                metadata.put("linkMarkers", markers);
            }
            if (card.scale() != null) {
                metadata.put("pendulumScale", card.scale());
            }
            if (card.atk() != null) {
                metadata.put("atk", card.atk());
            }
            if (card.def() != null && !link) {
                metadata.put("def", card.def());
            }
            putText(metadata, "monsterType", card.race());
        } else if ("Spell".equals(cardType(card)) || "Trap".equals(cardType(card))) {
            putText(metadata, "property", card.race());
        }
        putText(metadata, "archetype", card.archetype());
        if (!frame.isEmpty()) {
            metadata.put("frameType", frame);
        }
        for (YgoProDeckDtos.Misc misc : nullSafe(card.miscInfo())) {
            if (misc.konamiId() != null && misc.konamiId() > 0) {
                metadata.put("konamiId", misc.konamiId());
                break;
            }
        }
        return metadata;
    }

    // -------------------------------------------------------------------------------------
    // Printings
    // -------------------------------------------------------------------------------------

    /**
     * Rarity spellings unified case-insensitively (the snapshot contains e.g. "Platinum Secret
     * Rare" and "PLatinum Secret Rare"): the most frequent spelling wins, ties alphabetically.
     */
    static Map<String, String> canonicalRarities(List<YgoProDeckDtos.Card> cards) {
        Map<String, Map<String, Integer>> spellings = new HashMap<>();
        for (YgoProDeckDtos.Card card : cards) {
            for (YgoProDeckDtos.CardSet entry : nullSafe(card.cardSets())) {
                String rarity = trim(entry.setRarity());
                if (!rarity.isEmpty()) {
                    spellings
                            .computeIfAbsent(rarity.toLowerCase(Locale.ROOT), k -> new TreeMap<>())
                            .merge(rarity, 1, Integer::sum);
                }
            }
        }
        Map<String, String> canonical = new HashMap<>();
        spellings.forEach(
                (key, counts) ->
                        canonical.put(
                                key,
                                counts.entrySet().stream()
                                        .max(
                                                Map.Entry.<String, Integer>comparingByValue()
                                                        .thenComparing(
                                                                Map.Entry.comparingByKey(
                                                                        Comparator.reverseOrder())))
                                        .orElseThrow()
                                        .getKey()));
        return canonical;
    }

    /** Stable id part of a rarity: {@code Ultra Rare} → {@code ULTRA_RARE}. */
    static String rarityId(@Nullable String rarity) {
        if (rarity == null || rarity.isBlank()) {
            return "NONE";
        }
        String id =
                rarity.toUpperCase(Locale.ROOT)
                        .replace("'", "")
                        .replaceAll("[^A-Z0-9]+", "_")
                        .replaceAll("^_+|_+$", "");
        return id.isEmpty() ? "NONE" : id;
    }

    static @Nullable ProviderMarketPrice price(
            @Nullable String value, @Nullable Instant priceDate) {
        if (priceDate == null || value == null || value.isBlank()) {
            return null;
        }
        try {
            BigDecimal amount = new BigDecimal(value.trim()).setScale(2, RoundingMode.HALF_UP);
            if (amount.signum() <= 0 || amount.compareTo(new BigDecimal("9999999999.99")) > 0) {
                return null;
            }
            return new ProviderMarketPrice(amount, CURRENCY, priceDate);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    static @Nullable Instant parseLastUpdate(@Nullable String lastUpdate) {
        if (lastUpdate == null || lastUpdate.isBlank()) {
            return null;
        }
        try {
            return LocalDateTime.parse(lastUpdate.trim(), LAST_UPDATE).toInstant(ZoneOffset.UTC);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    static @Nullable LocalDate parseDate(@Nullable String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(value.trim());
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    // -------------------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------------------

    private static void putText(Map<String, Object> metadata, String key, @Nullable String value) {
        String text = trim(value);
        if (!text.isEmpty()) {
            metadata.put(key, text);
        }
    }

    static String trim(@Nullable String value) {
        return value == null ? "" : value.strip();
    }

    private static String upper(@Nullable String value) {
        return trim(value).toUpperCase(Locale.ROOT);
    }

    static String truncate(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max).strip();
    }

    private static <T> List<T> nullSafe(@Nullable List<T> list) {
        return list == null ? List.of() : list;
    }

    /** A set being assembled from the products sharing a code. */
    private static final class SetDraft {
        final String code;
        final String name;
        final @Nullable LocalDate releaseDate;
        final @Nullable Integer totalCards;
        final List<String> products;

        private SetDraft(
                String code,
                String name,
                @Nullable LocalDate releaseDate,
                @Nullable Integer totalCards,
                List<String> products) {
            this.code = code;
            this.name = name.isEmpty() ? code : name;
            this.releaseDate = releaseDate;
            this.totalCards = totalCards;
            this.products = products;
        }

        /** The largest product names the set (then the earliest, then alphabetical). */
        static SetDraft of(String code, List<YgoProDeckDtos.SetInfo> products) {
            List<YgoProDeckDtos.SetInfo> sorted = new ArrayList<>(products);
            sorted.sort(
                    Comparator.comparing(
                                    (YgoProDeckDtos.SetInfo s) ->
                                            s.numOfCards() == null ? 0 : s.numOfCards(),
                                    Comparator.reverseOrder())
                            .thenComparing(
                                    s -> parseDate(s.tcgDate()),
                                    Comparator.nullsLast(Comparator.naturalOrder()))
                            .thenComparing(s -> trim(s.setName())));
            YgoProDeckDtos.SetInfo primary = sorted.get(0);
            List<String> names =
                    sorted.stream()
                            .map(s -> truncate(trim(s.setName()), MAX_SET_NAME))
                            .distinct()
                            .toList();
            Integer total = primary.numOfCards();
            return new SetDraft(
                    code,
                    truncate(trim(primary.setName()), MAX_SET_NAME),
                    parseDate(primary.tcgDate()),
                    total == null || total < 0 ? null : total,
                    names);
        }

        /** A code absent from cardsets.php: named after the first printing that uses it. */
        static SetDraft fromEntry(
                String code, String productName, YgoProDeckDtos.@Nullable SetInfo product) {
            return new SetDraft(
                    code,
                    productName,
                    product == null ? null : parseDate(product.tcgDate()),
                    null,
                    productName.isEmpty() ? List.of() : List.of(productName));
        }

        ProviderSet toProviderSet() {
            Map<String, Object> metadata = new LinkedHashMap<>();
            if (products.size() > 1) {
                metadata.put("products", products);
            }
            return new ProviderSet(code, code, name, releaseDate, totalCards, null, metadata);
        }
    }

    /** Aggregated, client-safe warnings with a few examples each. */
    private static final class Warnings {
        private final Map<String, List<String>> examples = new LinkedHashMap<>();
        private final Map<String, Integer> counts = new LinkedHashMap<>();

        void add(String category, String example) {
            counts.merge(category, 1, Integer::sum);
            List<String> list = examples.computeIfAbsent(category, k -> new ArrayList<>());
            if (list.size() < MAX_WARNING_EXAMPLES && !example.isBlank()) {
                list.add(example);
            }
        }

        List<String> messages() {
            List<String> messages = new ArrayList<>();
            counts.forEach(
                    (category, count) ->
                            messages.add(
                                    count
                                            + " "
                                            + category
                                            + (examples.get(category).isEmpty()
                                                    ? ""
                                                    : " (e.g. "
                                                            + String.join(
                                                                    ", ", examples.get(category))
                                                            + ")")));
            return messages;
        }
    }
}
