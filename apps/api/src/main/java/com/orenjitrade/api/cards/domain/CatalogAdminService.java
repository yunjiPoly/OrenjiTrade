package com.orenjitrade.api.cards.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.cards.infra.CatalogWriteRepository;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.games.domain.GameSchema;
import com.orenjitrade.api.games.domain.GameService;
import com.orenjitrade.api.games.domain.GameView;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Admin edits of the catalog (ADMIN, SUPER_ADMIN; every write audited): sets, cards and printings.
 * Values are validated against the game's {@link GameSchema} (edition, language, finish and rarity
 * vocabularies; declared metadata fields must have the declared type). Slugs are derived from the
 * name on creation and never change.
 */
@Service
public class CatalogAdminService {

    public static final String TARGET_SET = "CARD_SET";
    public static final String TARGET_CARD = "CARD";
    public static final String TARGET_PRINTING = "CARD_PRINTING";

    private final CatalogWriteRepository writes;
    private final CatalogService catalogService;
    private final CatalogImportService importService;
    private final GameService gameService;
    private final AuditService auditService;
    private final TimeProvider timeProvider;

    public CatalogAdminService(
            CatalogWriteRepository writes,
            CatalogService catalogService,
            CatalogImportService importService,
            GameService gameService,
            AuditService auditService,
            TimeProvider timeProvider) {
        this.writes = writes;
        this.catalogService = catalogService;
        this.importService = importService;
        this.gameService = gameService;
        this.auditService = auditService;
        this.timeProvider = timeProvider;
    }

    // ---------------------------------------------------------------------------------------
    // Sets
    // ---------------------------------------------------------------------------------------

    @Transactional
    public SetSummary createSet(AuthenticatedUser actor, String gameSlug, SetValues values) {
        GameView game = game(gameSlug);
        String code = values.code().trim().toUpperCase(Locale.ROOT);
        if (writes.findSetId(game.id(), code).isPresent()) {
            throw ApiException.conflict("A set with this code already exists for the game");
        }
        CatalogWriteRepository.Upsert upsert =
                writes.upsertSet(
                        game.id(),
                        code,
                        values.name().trim(),
                        values.releaseDate(),
                        values.totalCards(),
                        blankToNull(values.series()),
                        values.metadata(),
                        null,
                        timeProvider.now());
        audit(
                actor,
                "card_set.create",
                TARGET_SET,
                upsert.id(),
                Map.of("game", game.slug(), "code", code));
        return catalogService.setDetail(upsert.id(), false, 0, 1).set();
    }

    @Transactional
    public SetSummary updateSet(AuthenticatedUser actor, UUID setId, SetValues values) {
        SetSummary current = catalogService.setDetail(setId, false, 0, 1).set();
        GameView game = game(current.game());
        String code = values.code().trim().toUpperCase(Locale.ROOT);
        if (!code.equals(current.code())) {
            throw invalid("code", "set codes cannot change");
        }
        writes.upsertSet(
                game.id(),
                code,
                values.name().trim(),
                values.releaseDate(),
                values.totalCards(),
                blankToNull(values.series()),
                values.metadata(),
                null,
                timeProvider.now());
        audit(
                actor,
                "card_set.update",
                TARGET_SET,
                setId,
                Map.of("game", game.slug(), "code", code));
        return catalogService.setDetail(setId, false, 0, 1).set();
    }

    // ---------------------------------------------------------------------------------------
    // Cards
    // ---------------------------------------------------------------------------------------

    @Transactional
    public CardDetail createCard(AuthenticatedUser actor, String gameSlug, CardValues values) {
        GameView game = game(gameSlug);
        validateMetadata(game.schema(), values.metadata());
        UUID id = UUID.randomUUID();
        String slug = importService.freeSlug(game.id(), values.name());
        writes.insertCard(
                id,
                game.id(),
                values.name().trim(),
                slug,
                blankToNull(values.cardType()),
                blankToNull(values.subtype()),
                values.text() == null ? "" : values.text().trim(),
                values.metadata(),
                null,
                timeProvider.now());
        audit(actor, "card.create", TARGET_CARD, id, Map.of("game", game.slug(), "slug", slug));
        return catalogService.cardDetail(id, false);
    }

    @Transactional
    public CardDetail updateCard(AuthenticatedUser actor, UUID cardId, CardValues values) {
        CardDetail current = catalogService.cardDetail(cardId, false);
        GameView game = game(current.game());
        validateMetadata(game.schema(), values.metadata());
        boolean changed =
                writes.updateCard(
                        cardId,
                        values.name().trim(),
                        blankToNull(values.cardType()),
                        blankToNull(values.subtype()),
                        values.text() == null ? "" : values.text().trim(),
                        values.metadata(),
                        timeProvider.now());
        audit(
                actor,
                "card.update",
                TARGET_CARD,
                cardId,
                Map.of("game", game.slug(), "slug", current.slug(), "changed", changed));
        return catalogService.cardDetail(cardId, false);
    }

    // ---------------------------------------------------------------------------------------
    // Printings
    // ---------------------------------------------------------------------------------------

    @Transactional
    public PrintingDetail createPrinting(
            AuthenticatedUser actor, UUID cardId, PrintingInput input) {
        CardDetail card = catalogService.cardDetail(cardId, false);
        GameView game = game(card.game());
        SetSummary set = catalogService.setDetail(input.setId(), false, 0, 1).set();
        if (!set.game().equals(game.slug())) {
            throw invalid("setId", "the set belongs to another game");
        }
        CatalogWriteRepository.PrintingValues values = validatePrinting(game, input);
        if (writes.findPrintingByVariant(
                        set.id(),
                        values.collectorNumber(),
                        values.edition(),
                        values.language(),
                        values.finish(),
                        values.rarity())
                .isPresent()) {
            throw ApiException.conflict("This printing already exists");
        }
        UUID id = UUID.randomUUID();
        writes.insertPrinting(id, cardId, set.id(), values, timeProvider.now());
        audit(
                actor,
                "card_printing.create",
                TARGET_PRINTING,
                id,
                printingDetails(card, set, values));
        return catalogService.printingDetail(id, false);
    }

    @Transactional
    public PrintingDetail updatePrinting(
            AuthenticatedUser actor, UUID printingId, PrintingInput input) {
        CatalogWriteRepository.PrintingRef ref =
                writes.findPrinting(printingId)
                        .orElseThrow(() -> ApiException.notFound("Printing not found"));
        CardDetail card = catalogService.cardDetail(ref.cardId(), false);
        GameView game = game(card.game());
        SetSummary set = catalogService.setDetail(input.setId(), false, 0, 1).set();
        if (!set.game().equals(game.slug())) {
            throw invalid("setId", "the set belongs to another game");
        }
        CatalogWriteRepository.PrintingValues values = validatePrinting(game, input);
        writes.findPrintingByVariant(
                        set.id(),
                        values.collectorNumber(),
                        values.edition(),
                        values.language(),
                        values.finish(),
                        values.rarity())
                .filter(other -> !other.equals(printingId))
                .ifPresent(
                        other -> {
                            throw ApiException.conflict("Another printing has these attributes");
                        });
        writes.updatePrinting(printingId, set.id(), values, timeProvider.now());
        audit(
                actor,
                "card_printing.update",
                TARGET_PRINTING,
                printingId,
                printingDetails(card, set, values));
        return catalogService.printingDetail(printingId, false);
    }

    // ---------------------------------------------------------------------------------------
    // Validation
    // ---------------------------------------------------------------------------------------

    private CatalogWriteRepository.PrintingValues validatePrinting(
            GameView game, PrintingInput input) {
        GameSchema schema = game.schema();
        List<ProblemFieldError> errors = new ArrayList<>();
        String edition = input.edition().trim().toUpperCase(Locale.ROOT);
        if (!schema.editions().contains(edition)) {
            errors.add(new ProblemFieldError("edition", "must be one of " + schema.editions()));
        }
        String language = input.language().trim().toLowerCase(Locale.ROOT);
        if (!schema.languages().contains(language)) {
            errors.add(new ProblemFieldError("language", "must be one of " + schema.languages()));
        }
        String finish = input.finish().trim().toUpperCase(Locale.ROOT);
        if (!schema.finishes().contains(finish)) {
            errors.add(new ProblemFieldError("finish", "must be one of " + schema.finishes()));
        }
        @Nullable String rarity = blankToNull(input.rarity());
        if (rarity != null && !schema.rarities().isEmpty() && !schema.rarities().contains(rarity)) {
            errors.add(new ProblemFieldError("rarity", "must be one of " + schema.rarities()));
        }
        @Nullable String code = CatalogText.normalisePrintingCode(input.printingCode());
        if (code != null && !CatalogText.PRINTING_CODE.matcher(code).matches()) {
            errors.add(
                    new ProblemFieldError(
                            "printingCode", "must look like SET-NUMBER, e.g. LOB-EN001"));
        }
        if ((input.marketPrice() == null) != (input.marketPriceCurrency() == null)) {
            errors.add(new ProblemFieldError("marketPrice", "amount and currency go together"));
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        return new CatalogWriteRepository.PrintingValues(
                input.collectorNumber().trim(),
                rarity,
                edition,
                language,
                finish,
                code,
                input.marketPrice(),
                input.marketPriceCurrency(),
                input.marketPrice() == null ? null : timeProvider.now(),
                input.metadata(),
                null);
    }

    /** Declared metadata fields must carry values of their declared type (extra keys allowed). */
    static void validateMetadata(GameSchema schema, Map<String, Object> metadata) {
        List<ProblemFieldError> errors = new ArrayList<>();
        for (Map.Entry<String, Object> entry : metadata.entrySet()) {
            schema.field(entry.getKey())
                    .ifPresent(
                            field -> {
                                if (!hasType(field.type(), entry.getValue())) {
                                    errors.add(
                                            new ProblemFieldError(
                                                    "metadata." + entry.getKey(),
                                                    "must be of type " + field.type()));
                                }
                            });
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
    }

    private static boolean hasType(String type, @Nullable Object value) {
        if (value == null) {
            return true;
        }
        return switch (type) {
            case GameSchema.MetadataField.NUMBER -> value instanceof Number;
            case GameSchema.MetadataField.BOOLEAN -> value instanceof Boolean;
            case GameSchema.MetadataField.STRING_LIST ->
                    value instanceof List<?> list
                            && list.stream().allMatch(String.class::isInstance);
            default -> value instanceof String;
        };
    }

    private GameView game(String slug) {
        return gameService.find(slug).orElseThrow(() -> invalid("gameSlug", "unknown game"));
    }

    private static Map<String, Object> printingDetails(
            CardDetail card, SetSummary set, CatalogWriteRepository.PrintingValues values) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("card", card.slug());
        details.put("set", set.code());
        details.put("collectorNumber", values.collectorNumber());
        details.put("edition", values.edition());
        details.put("language", values.language());
        details.put("finish", values.finish());
        return details;
    }

    private void audit(
            AuthenticatedUser actor,
            String action,
            String targetType,
            UUID targetId,
            Map<String, ?> details) {
        auditService.record(
                ActorType.ADMIN, actor.userId(), action, targetType, targetId.toString(), details);
    }

    private static @Nullable String blankToNull(@Nullable String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static ApiException invalid(String field, String message) {
        return ApiException.validation(
                "Validation failed", List.of(new ProblemFieldError(field, message)));
    }

    /**
     * Editable set attributes.
     *
     * @param code set code (immutable after creation)
     * @param name set name
     * @param releaseDate release date
     * @param totalCards cards in the set
     * @param series series / block
     * @param metadata game-specific set attributes
     */
    public record SetValues(
            String code,
            String name,
            @Nullable LocalDate releaseDate,
            @Nullable Integer totalCards,
            @Nullable String series,
            Map<String, Object> metadata) {}

    /**
     * Editable card attributes.
     *
     * @param name card name
     * @param cardType main type
     * @param subtype sub type
     * @param text rules text
     * @param metadata game-specific attributes
     */
    public record CardValues(
            String name,
            @Nullable String cardType,
            @Nullable String subtype,
            @Nullable String text,
            Map<String, Object> metadata) {}

    /**
     * Editable printing attributes.
     *
     * @param setId set of the printing (same game as the card)
     * @param collectorNumber collector number
     * @param printingCode printed code
     * @param rarity rarity label (from the game schema)
     * @param edition edition code (from the game schema)
     * @param language language (from the game schema)
     * @param finish finish code (from the game schema)
     * @param marketPrice indicative price
     * @param marketPriceCurrency ISO 4217 code of the price
     * @param metadata printing-specific attributes
     */
    public record PrintingInput(
            UUID setId,
            String collectorNumber,
            @Nullable String printingCode,
            @Nullable String rarity,
            String edition,
            String language,
            String finish,
            @Nullable BigDecimal marketPrice,
            @Nullable String marketPriceCurrency,
            Map<String, Object> metadata) {}
}
