package com.orenjitrade.api.games.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.cache.RedisJsonCache;
import com.orenjitrade.api.games.infra.GameRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * The games module's service interface: the database-backed {@link GameCatalog} (profiles validate
 * game slugs against the ACTIVE games), game lookups with their {@link GameSchema} for the catalog,
 * and the audited admin edits. Games are cached in Redis for {@link #CACHE_TTL} and evicted after
 * every write.
 */
@Service
public class GameService implements GameCatalog {

    public static final Duration CACHE_TTL = Duration.ofSeconds(60);
    public static final String ACTION_CREATE = "game.create";
    public static final String ACTION_UPDATE = "game.update";
    public static final String TARGET_GAME = "GAME";

    static final String CACHE_KEY = "games:v1";

    private final GameRepository repository;
    private final RedisJsonCache cache;
    private final AuditService auditService;
    private final TimeProvider timeProvider;

    public GameService(
            GameRepository repository,
            RedisJsonCache cache,
            AuditService auditService,
            TimeProvider timeProvider) {
        this.repository = repository;
        this.cache = cache;
        this.auditService = auditService;
        this.timeProvider = timeProvider;
    }

    // ---------------------------------------------------------------------------------------
    // GameCatalog
    // ---------------------------------------------------------------------------------------

    /** Slugs of the ACTIVE games, in display order. */
    @Override
    public List<String> slugs() {
        return active().stream().map(GameView::slug).toList();
    }

    // ---------------------------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------------------------

    /** Every game (active and hidden), in display order. */
    public List<GameView> all() {
        return cache.get(
                        CACHE_KEY,
                        GameSnapshot.class,
                        CACHE_TTL,
                        () -> new GameSnapshot(repository.findAll()))
                .games();
    }

    /** ACTIVE games, in display order. */
    public List<GameView> active() {
        return all().stream().filter(GameView::isActive).toList();
    }

    /** The game with {@code slug}, whatever its status. */
    public Optional<GameView> find(String slug) {
        return all().stream().filter(game -> game.slug().equals(slug)).findFirst();
    }

    /** The game with {@code id}, whatever its status. */
    public Optional<GameView> findById(UUID id) {
        return all().stream().filter(game -> game.id().equals(id)).findFirst();
    }

    /** The ACTIVE game with {@code slug}, or {@code 404}. */
    public GameView requireActive(String slug) {
        return find(slug)
                .filter(GameView::isActive)
                .orElseThrow(() -> ApiException.notFound("Game not found"));
    }

    // ---------------------------------------------------------------------------------------
    // Administration (ADMIN, SUPER_ADMIN; audited)
    // ---------------------------------------------------------------------------------------

    @Transactional
    public GameView create(AuthenticatedUser actor, GameDraft draft, String slug) {
        validateSchema(draft.schema());
        if (repository.existsBySlug(slug)) {
            throw ApiException.conflict("A game with this slug already exists");
        }
        Instant now = timeProvider.now();
        UUID id = UUID.randomUUID();
        repository.insert(
                id,
                slug,
                draft.name().trim(),
                draft.shortName().trim(),
                draft.publisher().trim(),
                draft.status(),
                draft.sortOrder(),
                draft.schema(),
                now);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("slug", slug);
        details.put("status", draft.status().name());
        auditService.record(
                ActorType.ADMIN, actor.userId(), ACTION_CREATE, TARGET_GAME, slug, details);
        evictAfterCommit();
        return new GameView(
                id,
                slug,
                draft.name().trim(),
                draft.shortName().trim(),
                draft.publisher().trim(),
                draft.status(),
                draft.sortOrder(),
                draft.schema(),
                now);
    }

    @Transactional
    public GameView update(AuthenticatedUser actor, String slug, GameDraft draft) {
        validateSchema(draft.schema());
        GameView current =
                repository
                        .findBySlugForUpdate(slug)
                        .orElseThrow(() -> ApiException.notFound("Game not found"));
        Instant now = timeProvider.now();
        repository.update(
                current.id(),
                draft.name().trim(),
                draft.shortName().trim(),
                draft.publisher().trim(),
                draft.status(),
                draft.sortOrder(),
                draft.schema(),
                now);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("slug", slug);
        details.put("previousStatus", current.status().name());
        details.put("status", draft.status().name());
        details.put("schemaChanged", !current.schema().equals(draft.schema()));
        auditService.record(
                ActorType.ADMIN, actor.userId(), ACTION_UPDATE, TARGET_GAME, slug, details);
        evictAfterCommit();
        return new GameView(
                current.id(),
                slug,
                draft.name().trim(),
                draft.shortName().trim(),
                draft.publisher().trim(),
                draft.status(),
                draft.sortOrder(),
                draft.schema(),
                now);
    }

    /** Drops the cached games (admin writes, tests). */
    public void invalidate() {
        cache.evict(CACHE_KEY);
    }

    /** Cross-field rules bean validation cannot express (unique keys, summary fields exist). */
    static void validateSchema(GameSchema schema) {
        List<ProblemFieldError> errors = new ArrayList<>();
        Set<String> keys = new HashSet<>();
        for (GameSchema.MetadataField field : schema.metadataFields()) {
            if (!keys.add(field.key())) {
                errors.add(
                        new ProblemFieldError(
                                "schema.metadataFields", "duplicate key " + field.key()));
            }
        }
        for (String summary : schema.summaryFields()) {
            if (!keys.contains(summary)) {
                errors.add(
                        new ProblemFieldError(
                                "schema.summaryFields", "unknown metadata field " + summary));
            }
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
    }

    private void evictAfterCommit() {
        invalidate();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            invalidate();
                        }
                    });
        }
    }

    /**
     * Editable attributes of a game.
     *
     * @param name full name
     * @param shortName short display name
     * @param publisher publisher
     * @param status ACTIVE or HIDDEN
     * @param sortOrder display order
     * @param schema vocabularies and metadata fields
     */
    public record GameDraft(
            String name,
            String shortName,
            String publisher,
            GameStatus status,
            int sortOrder,
            GameSchema schema) {}

    /** Cache envelope. */
    public record GameSnapshot(List<GameView> games) {}
}
