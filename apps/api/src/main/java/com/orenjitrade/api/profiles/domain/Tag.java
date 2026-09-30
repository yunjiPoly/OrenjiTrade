package com.orenjitrade.api.profiles.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** JPA entity for {@code tag}. Never leaves the profiles module (see {@link TagView}). */
@Entity
@Table(name = "tag")
public class Tag {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "slug", nullable = false, updatable = false)
    private String slug;

    @Column(name = "label", nullable = false)
    private String label;

    @Enumerated(EnumType.STRING)
    @Column(name = "category", nullable = false)
    private TagCategory category;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private TagStatus status = TagStatus.ACTIVE;

    @Column(name = "usage_count", nullable = false)
    private int usageCount;

    @Column(name = "created_by")
    private @Nullable UUID createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** JPA only. */
    protected Tag() {
        this.id = UUID.randomUUID();
        this.slug = "";
        this.label = "";
        this.category = TagCategory.CUSTOM;
        this.createdAt = Instant.EPOCH;
        this.updatedAt = Instant.EPOCH;
    }

    /** A new collector-created tag. */
    public static Tag custom(String slug, String label, UUID createdBy, Instant now) {
        Tag tag = new Tag();
        tag.id = UUID.randomUUID();
        tag.slug = slug;
        tag.label = label;
        tag.category = TagCategory.CUSTOM;
        tag.createdBy = createdBy;
        tag.createdAt = now;
        tag.updatedAt = now;
        return tag;
    }

    public TagView toView() {
        return new TagView(id, slug, label, category, usageCount);
    }

    public boolean isActive() {
        return status == TagStatus.ACTIVE;
    }

    public UUID getId() {
        return id;
    }

    public String getSlug() {
        return slug;
    }

    public String getLabel() {
        return label;
    }

    public TagCategory getCategory() {
        return category;
    }

    public TagStatus getStatus() {
        return status;
    }

    public int getUsageCount() {
        return usageCount;
    }
}
