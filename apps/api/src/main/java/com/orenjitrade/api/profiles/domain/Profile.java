package com.orenjitrade.api.profiles.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.jspecify.annotations.Nullable;

/**
 * JPA entity for {@code profile} (+ {@code profile_tag}). Never leaves the profiles module; the
 * handle lives on the account (users module).
 */
@Entity
@Table(name = "profile")
public class Profile {

    @Id
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(name = "bio", nullable = false)
    private String bio = "";

    @Column(name = "avatar_key")
    private @Nullable String avatarKey;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "games", nullable = false, columnDefinition = "text[]")
    private String[] games = new String[0];

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "languages", nullable = false, columnDefinition = "text[]")
    private String[] languages = new String[0];

    @Column(name = "completed_at")
    private @Nullable Instant completedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "profile_tag",
            joinColumns = @JoinColumn(name = "profile_user_id"),
            inverseJoinColumns = @JoinColumn(name = "tag_id"))
    private Set<Tag> tags = new HashSet<>();

    /** JPA only. */
    protected Profile() {
        this.userId = UUID.randomUUID();
        this.displayName = "";
        this.createdAt = Instant.EPOCH;
        this.updatedAt = Instant.EPOCH;
    }

    public Profile(UUID userId, String displayName, Instant now) {
        this.userId = userId;
        this.displayName = displayName;
        this.createdAt = now;
        this.updatedAt = now;
    }

    /** Saves the collector-editable fields; the first save marks the profile complete. */
    public void update(
            String displayName,
            String bio,
            List<String> games,
            List<String> languages,
            Instant now) {
        this.displayName = displayName;
        this.bio = bio;
        this.games = games.toArray(String[]::new);
        this.languages = languages.toArray(String[]::new);
        if (completedAt == null) {
            completedAt = now;
        }
        this.updatedAt = now;
    }

    public void changeAvatar(@Nullable String avatarKey, Instant now) {
        this.avatarKey = avatarKey;
        this.updatedAt = now;
    }

    public void replaceTags(Set<Tag> newTags, Instant now) {
        tags.clear();
        tags.addAll(newTags);
        this.updatedAt = now;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getBio() {
        return bio;
    }

    public @Nullable String getAvatarKey() {
        return avatarKey;
    }

    public List<String> getGames() {
        return Arrays.asList(games);
    }

    public List<String> getLanguages() {
        return Arrays.asList(languages);
    }

    public @Nullable Instant getCompletedAt() {
        return completedAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public Set<Tag> getTags() {
        return tags;
    }
}
