package com.orenjitrade.api.profiles.domain;

import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.storage.ObjectKeys;
import com.orenjitrade.api.common.storage.ObjectStorage;
import com.orenjitrade.api.games.domain.GameCatalog;
import com.orenjitrade.api.moderation.domain.ModerationScope;
import com.orenjitrade.api.moderation.domain.ModerationVerdict;
import com.orenjitrade.api.moderation.domain.TextModerationService;
import com.orenjitrade.api.profiles.domain.AvatarImageProcessor.AvatarRejectedException;
import com.orenjitrade.api.profiles.infra.ProfileRepository;
import com.orenjitrade.api.profiles.infra.TagRepository;
import com.orenjitrade.api.profiles.infra.TagSearchRepository;
import com.orenjitrade.api.users.domain.UserAccountService;
import com.orenjitrade.api.users.domain.UserAccountSnapshot;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The profiles module's service interface for the owner's profile: handle + display name (mirrored
 * on the account), bio, games, languages, avatar and tags (Phase 1 contract, "Profile").
 */
@Service
public class ProfileService {

    public static final int MAX_TAGS = 12;
    public static final int MAX_LANGUAGES = 10;
    static final String AVATAR_NAMESPACE = "avatars";

    private static final Logger log = LoggerFactory.getLogger(ProfileService.class);
    private static final Set<String> ISO_639_1 = Set.of(Locale.getISOLanguages());

    private final ProfileRepository profiles;
    private final TagRepository tags;
    private final TagSearchRepository tagViews;
    private final UserAccountService userAccountService;
    private final GameCatalog gameCatalog;
    private final TextModerationService moderation;
    private final ObjectStorage storage;
    private final AvatarImageProcessor avatarImageProcessor;
    private final TimeProvider timeProvider;
    private final TransactionTemplate transaction;

    public ProfileService(
            ProfileRepository profiles,
            TagRepository tags,
            TagSearchRepository tagViews,
            UserAccountService userAccountService,
            GameCatalog gameCatalog,
            TextModerationService moderation,
            ObjectStorage storage,
            AvatarImageProcessor avatarImageProcessor,
            TimeProvider timeProvider,
            PlatformTransactionManager transactionManager) {
        this.profiles = profiles;
        this.tags = tags;
        this.tagViews = tagViews;
        this.userAccountService = userAccountService;
        this.gameCatalog = gameCatalog;
        this.moderation = moderation;
        this.storage = storage;
        this.avatarImageProcessor = avatarImageProcessor;
        this.timeProvider = timeProvider;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    // ---------------------------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------------------------

    /** The owner's profile; defaults derived from the account when nothing was saved yet. */
    @Transactional(readOnly = true)
    public MyProfileView getMine(UUID userId) {
        UserAccountSnapshot account = requireAccount(userId);
        return profiles.findWithTagsByUserId(userId)
                .map(profile -> toView(account, profile))
                .orElseGet(
                        () ->
                                new MyProfileView(
                                        userId,
                                        account.handle(),
                                        defaultDisplayName(account),
                                        "",
                                        List.of(),
                                        List.of(),
                                        null,
                                        List.of(),
                                        null,
                                        null));
    }

    /** Public URL of the avatar, or {@code null}. */
    @Transactional(readOnly = true)
    public @Nullable String avatarUrlOf(UUID userId) {
        return profiles.findAvatarKey(userId).map(storage::publicUrl).orElse(null);
    }

    @Transactional(readOnly = true)
    public boolean isComplete(UUID userId) {
        return profiles.findCompleted(userId).orElse(false);
    }

    /** At least one game or one tag selected. */
    @Transactional(readOnly = true)
    public boolean hasInterests(UUID userId) {
        return profiles.findHasInterests(userId).orElse(false);
    }

    /** Public parts of a profile (collector view); empty when never saved. */
    @Transactional(readOnly = true)
    public Optional<PublicProfileParts> publicPartsOf(UUID userId) {
        return profiles.findWithTagsByUserId(userId)
                .map(
                        profile ->
                                new PublicProfileParts(
                                        profile.getDisplayName(),
                                        profile.getBio(),
                                        profile.getAvatarKey() == null
                                                ? null
                                                : storage.publicUrl(profile.getAvatarKey()),
                                        List.copyOf(profile.getGames()),
                                        activeTagViews(profile),
                                        profile.getCompletedAt() != null));
    }

    // ---------------------------------------------------------------------------------------
    // Writes
    // ---------------------------------------------------------------------------------------

    /**
     * Saves handle, display name, bio, games and languages. {@code 400} for unknown games, non ISO
     * 639-1 languages or blocked terms; {@code 409 HANDLE_TAKEN} for a taken/reserved handle.
     */
    @Transactional
    public MyProfileView update(UUID userId, ProfileUpdate update) {
        List<ProblemFieldError> errors = new ArrayList<>();
        String displayName = update.displayName().trim();
        String bio = update.bio() == null ? "" : update.bio().trim();
        if (displayName.isEmpty()) {
            errors.add(new ProblemFieldError("displayName", "must not be blank"));
        }
        checkText(ModerationScope.PROFILE, "displayName", displayName, errors);
        checkText(ModerationScope.PROFILE, "bio", bio, errors);
        List<String> games = normaliseGames(update.games(), errors);
        List<String> languages = normaliseLanguages(update.languages(), errors);
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        userAccountService.changeHandle(userId, update.handle());
        UserAccountSnapshot account = userAccountService.changeDisplayName(userId, displayName);
        Profile profile = loadOrCreate(account);
        profile.update(displayName, bio, games, languages, timeProvider.now());
        profiles.flush();
        return toView(account, profile);
    }

    /**
     * Replaces the avatar: validates and re-encodes the upload ({@link AvatarImageProcessor})
     * before any transaction starts, stores it under a fresh random key and deletes the previous
     * object after commit.
     */
    public MyProfileView uploadAvatar(UUID userId, byte[] upload) {
        byte[] processed;
        try {
            processed = avatarImageProcessor.process(upload);
        } catch (AvatarRejectedException e) {
            throw switch (e.rejection()) {
                case TOO_LARGE -> new ApiException(ErrorCode.PAYLOAD_TOO_LARGE, e.getMessage());
                case UNSUPPORTED_TYPE ->
                        new ApiException(ErrorCode.UNSUPPORTED_MEDIA_TYPE, e.getMessage());
                case EMPTY, DIMENSIONS, UNREADABLE ->
                        ApiException.validation(
                                "Validation failed",
                                List.of(new ProblemFieldError("file", e.getMessage())));
            };
        }
        String key =
                ObjectKeys.newKey(AVATAR_NAMESPACE, userId, AvatarImageProcessor.OUTPUT_EXTENSION);
        storage.put(key, processed, AvatarImageProcessor.OUTPUT_CONTENT_TYPE);
        MyProfileView view;
        try {
            view =
                    transaction.execute(
                            status -> {
                                UserAccountSnapshot account = requireAccount(userId);
                                Profile profile = loadOrCreate(account);
                                @Nullable String previous = profile.getAvatarKey();
                                profile.changeAvatar(key, timeProvider.now());
                                if (previous != null) {
                                    deleteObjectAfterCommit(previous);
                                }
                                return toView(account, profile);
                            });
        } catch (RuntimeException e) {
            storage.delete(key);
            throw e;
        }
        if (view == null) {
            throw new IllegalStateException("Avatar transaction returned nothing");
        }
        log.info("Avatar updated user={} bytes={}", userId, processed.length);
        return view;
    }

    /** Removes the avatar (no-op without one). */
    @Transactional
    public void deleteAvatar(UUID userId) {
        profiles.findById(userId)
                .ifPresent(
                        profile -> {
                            @Nullable String previous = profile.getAvatarKey();
                            if (previous != null) {
                                profile.changeAvatar(null, timeProvider.now());
                                deleteObjectAfterCommit(previous);
                            }
                        });
    }

    /**
     * Replaces the profile tags with {@code tagIds} (existing, active tags) plus {@code
     * customLabels} (created as CUSTOM tags after the banned-term check, or reused when a tag with
     * the same slug exists). At most {@value #MAX_TAGS} in total.
     */
    @Transactional
    public List<TagView> replaceTags(UUID userId, List<UUID> tagIds, List<String> customLabels) {
        List<ProblemFieldError> errors = new ArrayList<>();
        LinkedHashSet<UUID> ids = new LinkedHashSet<>(tagIds);
        Map<String, String> labelsBySlug = new LinkedHashMap<>();
        for (int i = 0; i < customLabels.size(); i++) {
            String label = CustomTagLabels.normalise(customLabels.get(i));
            String field = "customLabels[" + i + "]";
            Optional<String> problem = CustomTagLabels.problem(label);
            if (problem.isPresent()) {
                errors.add(new ProblemFieldError(field, problem.get()));
                continue;
            }
            if (moderation.evaluate(ModerationScope.TAG, label).isBlocked()) {
                errors.add(new ProblemFieldError(field, "contains a term that is not allowed"));
                continue;
            }
            labelsBySlug.putIfAbsent(CustomTagLabels.slugOf(label), label);
        }
        if (ids.size() + labelsBySlug.size() > MAX_TAGS) {
            errors.add(new ProblemFieldError("tagIds", "at most " + MAX_TAGS + " tags in total"));
        }
        List<Tag> selected = new ArrayList<>(tags.findAllById(ids));
        if (selected.size() != ids.size() || selected.stream().anyMatch(tag -> !tag.isActive())) {
            errors.add(new ProblemFieldError("tagIds", "contains unknown or unavailable tags"));
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        Instant now = timeProvider.now();
        labelsBySlug.forEach(
                (slug, label) -> {
                    Optional<Tag> existing = tags.findBySlug(slug);
                    if (existing.isPresent() && !existing.get().isActive()) {
                        throw ApiException.validation(
                                "Validation failed",
                                List.of(
                                        new ProblemFieldError(
                                                "customLabels",
                                                "'" + label + "' is not available")));
                    }
                    selected.add(
                            existing.orElseGet(
                                    () -> tags.save(Tag.custom(slug, label, userId, now))));
                });
        Set<Tag> unique = new LinkedHashSet<>(selected);
        if (unique.size() > MAX_TAGS) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(new ProblemFieldError("tagIds", "at most " + MAX_TAGS + " tags")));
        }
        UserAccountSnapshot account = requireAccount(userId);
        Profile profile = loadOrCreate(account);
        Set<UUID> affected = new HashSet<>();
        profile.getTags().forEach(tag -> affected.add(tag.getId()));
        unique.forEach(tag -> affected.add(tag.getId()));
        profile.replaceTags(unique, now);
        if (!affected.isEmpty()) {
            tags.recountUsage(affected); // flushes the new links first
        }
        List<UUID> finalIds = unique.stream().map(Tag::getId).toList();
        return tagViews.findViews(finalIds).stream().sorted(TagView.DISPLAY_ORDER).toList();
    }

    /** Deletes profile, tags links and avatar (account deletion job). */
    @Transactional
    public void purge(UUID userId) {
        profiles.findWithTagsByUserId(userId)
                .ifPresent(
                        profile -> {
                            Set<UUID> affected = new HashSet<>();
                            profile.getTags().forEach(tag -> affected.add(tag.getId()));
                            @Nullable String avatar = profile.getAvatarKey();
                            profiles.delete(profile);
                            profiles.flush();
                            if (!affected.isEmpty()) {
                                tags.recountUsage(affected);
                            }
                            if (avatar != null) {
                                deleteObjectAfterCommit(avatar);
                            }
                        });
    }

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

    private Profile loadOrCreate(UserAccountSnapshot account) {
        return profiles.findWithTagsByUserId(account.id())
                .orElseGet(
                        () ->
                                profiles.save(
                                        new Profile(
                                                account.id(),
                                                defaultDisplayName(account),
                                                timeProvider.now())));
    }

    private UserAccountSnapshot requireAccount(UUID userId) {
        return userAccountService
                .findSnapshot(userId)
                .orElseThrow(() -> ApiException.notFound("Account not found"));
    }

    private MyProfileView toView(UserAccountSnapshot account, Profile profile) {
        return new MyProfileView(
                account.id(),
                account.handle(),
                profile.getDisplayName(),
                profile.getBio(),
                List.copyOf(profile.getGames()),
                List.copyOf(profile.getLanguages()),
                profile.getAvatarKey() == null ? null : storage.publicUrl(profile.getAvatarKey()),
                profile.getTags().stream().map(Tag::toView).sorted(TagView.DISPLAY_ORDER).toList(),
                profile.getCompletedAt(),
                profile.getUpdatedAt());
    }

    private static List<TagView> activeTagViews(Profile profile) {
        return profile.getTags().stream()
                .filter(Tag::isActive)
                .map(Tag::toView)
                .sorted(TagView.DISPLAY_ORDER)
                .toList();
    }

    static String defaultDisplayName(UserAccountSnapshot account) {
        String name = account.displayName();
        if (name == null || name.isBlank()) {
            return account.handle();
        }
        String trimmed = name.trim();
        return trimmed.length() <= 80 ? trimmed : trimmed.substring(0, 80);
    }

    private void checkText(
            ModerationScope scope, String field, String text, List<ProblemFieldError> errors) {
        ModerationVerdict verdict = moderation.evaluate(scope, text);
        if (verdict.isBlocked()) {
            errors.add(new ProblemFieldError(field, "contains a term that is not allowed"));
        } else if (verdict == ModerationVerdict.FLAG) {
            log.info("Profile text flagged for review field={}", field);
        }
    }

    private List<String> normaliseGames(
            @Nullable List<String> raw, List<ProblemFieldError> errors) {
        if (raw == null) {
            return List.of();
        }
        LinkedHashSet<String> games = new LinkedHashSet<>();
        for (String value : raw) {
            String slug = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
            if (!gameCatalog.isKnown(slug)) {
                errors.add(
                        new ProblemFieldError(
                                "games", "unknown game; expected one of " + gameCatalog.slugs()));
                return List.of();
            }
            games.add(slug);
        }
        return List.copyOf(games);
    }

    private static List<String> normaliseLanguages(
            @Nullable List<String> raw, List<ProblemFieldError> errors) {
        if (raw == null) {
            return List.of();
        }
        LinkedHashSet<String> languages = new LinkedHashSet<>();
        for (String value : raw) {
            String code = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
            if (code.length() != 2 || !ISO_639_1.contains(code)) {
                errors.add(new ProblemFieldError("languages", "must be ISO 639-1 codes"));
                return List.of();
            }
            languages.add(code);
        }
        if (languages.size() > MAX_LANGUAGES) {
            errors.add(
                    new ProblemFieldError("languages", "at most " + MAX_LANGUAGES + " languages"));
        }
        return List.copyOf(languages);
    }

    private void deleteObjectAfterCommit(String key) {
        Runnable delete =
                () -> {
                    try {
                        storage.delete(key);
                    } catch (RuntimeException e) {
                        log.warn("Could not delete stored object {}", key, e);
                    }
                };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            delete.run();
                        }
                    });
        } else {
            delete.run();
        }
    }

    /** Public parts of a saved profile. */
    public record PublicProfileParts(
            String displayName,
            String bio,
            @Nullable String avatarUrl,
            List<String> games,
            List<TagView> tags,
            boolean complete) {}
}
