package com.orenjitrade.api.cards.infra.scryfall;

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
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * Maps Scryfall's "Unique Artwork" bulk file (one card object per artwork) to the generic catalog
 * model (ADR 0005, ADR 0021). Pure and deterministic: the same file always yields the same rows, so
 * imports are idempotent.
 *
 * <ul>
 *   <li>Only English paper cards: {@code lang} {@code en}, not {@code digital}, {@code games} with
 *       {@code paper}; art series cards, tokens, emblems and oversized cards are left out (counted
 *       in the warnings).
 *   <li>Card: one per Oracle card ({@code oracle_id}; a reversible card's front face): name, Oracle
 *       text (faces joined), {@code card_type} and {@code subtype} from the front face's type line
 *       ({@code Legendary Creature} / {@code Elf Druid}), metadata matching the mtg GameSchema
 *       ({@code manaCost}, {@code manaValue}, {@code colorIdentity}, {@code typeLine}, {@code
 *       power}, {@code toughness}).
 *   <li>Printing: one per card object, keyed by set code plus collector number: rarity ({@code
 *       Common}, {@code Uncommon}, {@code Rare}, {@code Mythic Rare}, {@code Special}, {@code
 *       Bonus}), edition {@code UNLIMITED}, language {@code en}, finish the first of its finishes
 *       ({@code NORMAL}, {@code FOIL}, {@code ETCHED}; the list is kept in {@code
 *       metadata.finishes}; collectors record the finish of their own copy), printing code {@code
 *       <SET>-<NUMBER>} when it fits the code pattern, the artist. No market price.
 *   <li>Images: one per artwork ({@code illustration_id}, the front face's for multi-faced cards),
 *       the {@code normal} image (never a crop); each printing points at its own artwork; the
 *       card's primary artwork is its earliest printing's (the catalog shows a card with its
 *       earliest printing). Source URLs stay server-side.
 * </ul>
 */
final class ScryfallMapper {

    static final String PROVIDER_ID = "scryfall";
    static final int MAX_NAME = 150;
    static final int MAX_TEXT = 4000;
    static final int MAX_SET_NAME = 120;
    static final int MAX_COLLECTOR_NUMBER = 20;

    static final String SKIPPED_LANGUAGE = "non-English cards skipped";
    static final String SKIPPED_DIGITAL = "digital-only cards skipped";
    static final String SKIPPED_LAYOUT = "art series cards, tokens and emblems skipped";
    static final String SKIPPED_OVERSIZED = "oversized cards skipped";

    static final Set<String> EXCLUDED_LAYOUTS =
            Set.of("art_series", "token", "double_faced_token", "emblem");

    private static final Pattern SET_CODE = Pattern.compile("^[A-Z0-9]{2,10}$");
    private static final Pattern IMAGE_ID = Pattern.compile("^[A-Za-z0-9._-]{1,64}$");
    private static final String TYPE_SEPARATOR = " — ";

    private static final Map<String, String> RARITIES =
            Map.of(
                    "common", "Common",
                    "uncommon", "Uncommon",
                    "rare", "Rare",
                    "mythic", "Mythic Rare",
                    "special", "Special",
                    "bonus", "Bonus");

    /**
     * The catalog's order of a card's printings (the card shows its earliest printing's picture):
     * the set's release date, then the printing code, then the collector number.
     */
    static Comparator<ScryfallDtos.Card> printingOrder(Map<String, SetDraft> sets) {
        return Comparator.comparing(
                        (ScryfallDtos.Card c) -> sets.get(upper(c.set())).releaseDate,
                        Comparator.nullsLast(Comparator.<LocalDate>naturalOrder()))
                .thenComparing(
                        ScryfallMapper::printingCode,
                        Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(
                        c -> trim(c.collectorNumber()), ProviderText::compareCollectorNumbers)
                .thenComparing(c -> trim(c.id()));
    }

    /** {@code <SET>-<NUMBER>} when the code pattern can hold it, else null. */
    static @Nullable String printingCode(ScryfallDtos.Card card) {
        String code = upper(card.set()) + "-" + upper(card.collectorNumber());
        return CatalogText.PRINTING_CODE.matcher(code).matches() ? code : null;
    }

    private ScryfallMapper() {}

    static SyncResult map(
            String gameSlug,
            String imageBaseUrl,
            String imageVersion,
            Iterator<ScryfallDtos.Card> source,
            @Nullable String version) {
        ProviderWarnings warnings = new ProviderWarnings();
        Map<String, List<ScryfallDtos.Card>> byOracle = new TreeMap<>();
        Map<String, SetDraft> sets = new TreeMap<>();
        while (source.hasNext()) {
            ScryfallDtos.Card card = source.next();
            if (card == null) {
                continue;
            }
            @Nullable String excluded = exclusion(card);
            if (excluded != null) {
                warnings.add(excluded, trim(card.name()));
                continue;
            }
            @Nullable String oracleId = oracleId(card);
            String id = trim(card.id());
            String name = trim(card.name());
            if (oracleId == null || id.isEmpty() || name.isEmpty()) {
                warnings.add("cards without id, Oracle id or name skipped", name);
                continue;
            }
            String setCode = upper(card.set());
            if (!SET_CODE.matcher(setCode).matches()) {
                warnings.add("cards of a set with an unusable code skipped", setCode);
                continue;
            }
            String number = trim(card.collectorNumber());
            if (number.isEmpty() || number.length() > MAX_COLLECTOR_NUMBER) {
                warnings.add("cards without a usable collector number skipped", name);
                continue;
            }
            byOracle.computeIfAbsent(oracleId, k -> new ArrayList<>()).add(card);
            sets.computeIfAbsent(setCode, SetDraft::new).add(card);
        }

        Comparator<ScryfallDtos.Card> order = printingOrder(sets);
        Map<String, String> artworkOwners = new HashMap<>();
        List<ProviderCard> cards = new ArrayList<>();
        for (Map.Entry<String, List<ScryfallDtos.Card>> entry : byOracle.entrySet()) {
            String oracleId = entry.getKey();
            List<ScryfallDtos.Card> printings = new ArrayList<>(entry.getValue());
            printings.sort(order);
            ScryfallDtos.Card head = printings.get(0);

            Map<String, ProviderImage> artworks = new LinkedHashMap<>();
            List<ProviderPrinting> mapped = new ArrayList<>();
            for (ScryfallDtos.Card printing : printings) {
                @Nullable ProviderImage artwork = artwork(printing, imageBaseUrl, imageVersion);
                if (artwork != null) {
                    String owner = artworkOwners.putIfAbsent(artwork.providerImageId(), oracleId);
                    if (owner != null && !owner.equals(oracleId)) {
                        warnings.add(
                                "artworks listed by two cards skipped", artwork.providerImageId());
                        artwork = null;
                    } else {
                        @Nullable ProviderImage known = artworks.get(artwork.providerImageId());
                        if (known == null) {
                            artworks.put(artwork.providerImageId(), artwork);
                        } else {
                            artwork = known;
                        }
                    }
                }
                mapped.add(printing(oracleId, printing, artwork));
            }
            cards.add(
                    new ProviderCard(
                            oracleId,
                            truncate(trim(head.name()), MAX_NAME),
                            cardType(head),
                            subtype(head),
                            truncate(text(head), MAX_TEXT),
                            metadata(head),
                            mapped,
                            List.copyOf(artworks.values())));
        }
        List<ProviderSet> providerSets =
                sets.values().stream().map(SetDraft::toProviderSet).toList();
        return new SyncResult(
                PROVIDER_ID, gameSlug, providerSets, cards, version, warnings.messages());
    }

    /** Why a card object is left out (a warning category), or null when it is imported. */
    static @Nullable String exclusion(ScryfallDtos.Card card) {
        if (!"en".equals(trim(card.lang()))) {
            return SKIPPED_LANGUAGE;
        }
        if (Boolean.TRUE.equals(card.digital())
                || card.games() == null
                || !card.games().contains("paper")) {
            return SKIPPED_DIGITAL;
        }
        if (EXCLUDED_LAYOUTS.contains(trim(card.layout()))) {
            return SKIPPED_LAYOUT;
        }
        if (Boolean.TRUE.equals(card.oversized())) {
            return SKIPPED_OVERSIZED;
        }
        return null;
    }

    /** The Oracle id (a reversible card carries it on its faces). */
    static @Nullable String oracleId(ScryfallDtos.Card card) {
        String id = trim(card.oracleId());
        if (id.isEmpty()) {
            ScryfallDtos.@Nullable Face front = front(card);
            id = front == null ? "" : trim(front.oracleId());
        }
        return id.isEmpty() ? null : id;
    }

    private static ScryfallDtos.@Nullable Face front(ScryfallDtos.Card card) {
        return card.cardFaces() == null || card.cardFaces().isEmpty()
                ? null
                : card.cardFaces().get(0);
    }

    // -------------------------------------------------------------------------------------
    // Cards
    // -------------------------------------------------------------------------------------

    /** The front face's type line: {@code Creature — Elf // Land} → {@code Creature — Elf}. */
    static String frontTypeLine(ScryfallDtos.Card card) {
        ScryfallDtos.@Nullable Face front = front(card);
        String line =
                front != null && !trim(front.typeLine()).isEmpty()
                        ? trim(front.typeLine())
                        : trim(card.typeLine());
        int faces = line.indexOf(" // ");
        return faces < 0 ? line : line.substring(0, faces).strip();
    }

    static @Nullable String cardType(ScryfallDtos.Card card) {
        String line = frontTypeLine(card);
        int dash = line.indexOf(TYPE_SEPARATOR);
        String type = dash < 0 ? line : line.substring(0, dash).strip();
        return type.isEmpty() ? null : truncate(type, 100);
    }

    static @Nullable String subtype(ScryfallDtos.Card card) {
        String line = frontTypeLine(card);
        int dash = line.indexOf(TYPE_SEPARATOR);
        String subtype = dash < 0 ? "" : line.substring(dash + TYPE_SEPARATOR.length()).strip();
        return subtype.isEmpty() ? null : truncate(subtype, 100);
    }

    /** Oracle text; the faces' texts joined by a line {@code //}. */
    static String text(ScryfallDtos.Card card) {
        String own = trim(card.oracleText());
        if (!own.isEmpty() || card.cardFaces() == null) {
            return own;
        }
        List<String> faces = new ArrayList<>();
        for (ScryfallDtos.Face face : card.cardFaces()) {
            String text = trim(face.oracleText());
            if (!text.isEmpty()) {
                faces.add(text);
            }
        }
        return String.join("\n//\n", faces);
    }

    static Map<String, Object> metadata(ScryfallDtos.Card card) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        String manaCost = trim(card.manaCost());
        if (manaCost.isEmpty() && card.cardFaces() != null) {
            manaCost =
                    String.join(
                            " // ",
                            card.cardFaces().stream()
                                    .map(face -> trim(face.manaCost()))
                                    .filter(cost -> !cost.isEmpty())
                                    .toList());
        }
        if (!manaCost.isEmpty()) {
            metadata.put("manaCost", manaCost);
        }
        if (card.cmc() != null && Double.isFinite(card.cmc()) && card.cmc() >= 0) {
            double cmc = card.cmc();
            metadata.put("manaValue", cmc == Math.rint(cmc) ? (Object) (long) cmc : cmc);
        }
        if (card.colorIdentity() != null) {
            metadata.put(
                    "colorIdentity",
                    card.colorIdentity().stream()
                            .map(ProviderText::upper)
                            .filter(color -> !color.isEmpty())
                            .toList());
        }
        String typeLine = trim(card.typeLine());
        if (!typeLine.isEmpty()) {
            metadata.put("typeLine", typeLine);
        }
        ScryfallDtos.@Nullable Face front = front(card);
        String power = trim(card.power());
        String toughness = trim(card.toughness());
        if (power.isEmpty() && toughness.isEmpty() && front != null) {
            power = trim(front.power());
            toughness = trim(front.toughness());
        }
        if (!power.isEmpty()) {
            metadata.put("power", power);
        }
        if (!toughness.isEmpty()) {
            metadata.put("toughness", toughness);
        }
        return metadata;
    }

    // -------------------------------------------------------------------------------------
    // Printings and artworks
    // -------------------------------------------------------------------------------------

    private static ProviderPrinting printing(
            String oracleId, ScryfallDtos.Card card, @Nullable ProviderImage artwork) {
        String setCode = upper(card.set());
        String number = trim(card.collectorNumber());
        Map<String, Object> metadata = new LinkedHashMap<>();
        ScryfallDtos.@Nullable Face front = front(card);
        String artist = trim(card.artist());
        if (artist.isEmpty() && front != null) {
            artist = trim(front.artist());
        }
        if (!artist.isEmpty()) {
            metadata.put("artist", truncate(artist, 120));
        }
        List<String> finishes =
                card.finishes() == null
                        ? List.of()
                        : card.finishes().stream()
                                .map(ProviderText::trim)
                                .filter(f -> !f.isEmpty())
                                .toList();
        if (!finishes.isEmpty()) {
            metadata.put("finishes", finishes);
        }
        if (Boolean.TRUE.equals(card.promo())) {
            metadata.put("promo", true);
        }
        return new ProviderPrinting(
                trim(card.id()),
                oracleId,
                setCode,
                number,
                rarity(card.rarity()),
                "UNLIMITED",
                "en",
                finish(finishes),
                printingCode(card),
                metadata,
                artwork == null ? List.of() : List.of(artwork),
                null);
    }

    static @Nullable String rarity(@Nullable String rarity) {
        String key = trim(rarity).toLowerCase(Locale.ROOT);
        if (key.isEmpty()) {
            return null;
        }
        String known = RARITIES.get(key);
        return known != null
                ? known
                : truncate(Character.toUpperCase(key.charAt(0)) + key.substring(1), 100);
    }

    /** The printing's default finish: non-foil if it exists, else foil, else etched. */
    static String finish(List<String> finishes) {
        if (finishes.isEmpty() || finishes.contains("nonfoil")) {
            return "NORMAL";
        }
        if (finishes.contains("foil")) {
            return "FOIL";
        }
        if (finishes.contains("etched")) {
            return "ETCHED";
        }
        String other = finishes.get(0).toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]+", "_");
        return other.matches("^[A-Z][A-Z0-9_]{1,31}$") ? other : "NORMAL";
    }

    /**
     * The printing's artwork: its {@code illustration_id} (the front face's) and the chosen image
     * size under the image host; null when Scryfall has no real scan or the URL is elsewhere.
     */
    static @Nullable ProviderImage artwork(
            ScryfallDtos.Card card, String imageBaseUrl, String imageVersion) {
        String status = trim(card.imageStatus());
        if (status.equals("missing") || status.equals("placeholder")) {
            return null;
        }
        ScryfallDtos.@Nullable Face front = front(card);
        String illustration = trim(card.illustrationId());
        @Nullable Map<String, String> uris = card.imageUris();
        if (front != null && (illustration.isEmpty() || uris == null)) {
            if (illustration.isEmpty()) {
                illustration = trim(front.illustrationId());
            }
            if (uris == null) {
                uris = front.imageUris();
            }
        }
        if (illustration.isEmpty() || !IMAGE_ID.matcher(illustration).matches() || uris == null) {
            return null;
        }
        String url = trim(uris.get(imageVersion));
        if (!url.startsWith(imageBaseUrl) || url.contains("..") || url.length() > 1000) {
            return null;
        }
        return ProviderImage.artwork(PROVIDER_ID, illustration, url);
    }

    /** A set assembled from its card objects: the earliest release date names its day. */
    static final class SetDraft {
        final String code;
        String externalId;
        String name = "";
        @Nullable LocalDate releaseDate;
        String setType = "";

        SetDraft(String code) {
            this.code = code;
            this.externalId = code;
        }

        void add(ScryfallDtos.Card card) {
            if (name.isEmpty()) {
                name = truncate(trim(card.setName()), MAX_SET_NAME);
                String id = trim(card.setId());
                externalId = id.isEmpty() ? code : id;
                setType = trim(card.setType());
            }
            @Nullable LocalDate released = ProviderText.parseDate(card.releasedAt());
            if (released != null && (releaseDate == null || released.isBefore(releaseDate))) {
                releaseDate = released;
            }
        }

        ProviderSet toProviderSet() {
            Map<String, Object> metadata = new LinkedHashMap<>();
            if (!setType.isEmpty()) {
                metadata.put("setType", setType);
            }
            return new ProviderSet(
                    externalId,
                    code,
                    name.isEmpty() ? code : name,
                    releaseDate,
                    null,
                    null,
                    metadata);
        }
    }
}
