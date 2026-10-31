package com.orenjitrade.api.community.infra;

import com.orenjitrade.api.audit.domain.AuditLabelIds;
import com.orenjitrade.api.audit.domain.AuditTargetLabels;
import com.orenjitrade.api.community.domain.CityChannels;
import com.orenjitrade.api.location.domain.RegionCatalog;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Names community rooms, posts and replies in the audit log (spec 15.8, web stage WH2): a room by
 * its name, a post or a reply by its room. An archived channel of the old model named after a city
 * ({@link CityChannels}, V041's "Montréal / …") reads "An archived channel", and the details staff
 * read carry {@link CityChannels#ARCHIVED_SLUG} instead of its slug ({@code
 * community.post.remove}'s and {@code community.post.delete}'s {@code channel}, {@code
 * community.channel.update}'s {@code slug}): the stored records are evidence and stay as written,
 * no city reaches staff (ADR 0017, WH1's R2-1).
 */
@Component
public class CommunityAuditLabels implements AuditTargetLabels {

    static final String TARGET_CHANNEL = "COMMUNITY_CHANNEL";
    static final String TARGET_POST = "COMMUNITY_POST";
    static final String TARGET_REPLY = "COMMUNITY_REPLY";
    static final String ARCHIVED = "An archived channel";

    private final JdbcClient jdbc;
    private final RegionCatalog regions;

    public CommunityAuditLabels(JdbcClient jdbc, RegionCatalog regions) {
        this.jdbc = jdbc;
        this.regions = regions;
    }

    @Override
    public Set<String> targetTypes() {
        return Set.of(TARGET_CHANNEL, TARGET_POST, TARGET_REPLY);
    }

    @Override
    public Map<String, String> labelsOf(String targetType, Collection<Target> targets) {
        List<UUID> ids = AuditLabelIds.uuids(targets);
        if (ids.isEmpty()) {
            return Map.of();
        }
        String sql =
                switch (targetType) {
                    case TARGET_CHANNEL ->
                            "SELECT c.id, c.name, c.region_label FROM community_channel c"
                                    + " WHERE c.id IN (:ids)";
                    case TARGET_POST ->
                            "SELECT p.id, c.name, c.region_label FROM community_post p JOIN"
                                    + " community_channel c ON c.id = p.channel_id WHERE p.id IN"
                                    + " (:ids)";
                    default ->
                            "SELECT r.id, c.name, c.region_label FROM community_reply r JOIN"
                                    + " community_post p ON p.id = r.post_id JOIN"
                                    + " community_channel c ON c.id = p.channel_id WHERE r.id IN"
                                    + " (:ids)";
                };
        String prefix =
                switch (targetType) {
                    case TARGET_POST -> "A post in ";
                    case TARGET_REPLY -> "A reply in ";
                    default -> "";
                };
        Map<String, String> labels = new LinkedHashMap<>();
        jdbc.sql(sql)
                .param("ids", ids)
                .query(
                        (rs, rowNum) -> {
                            boolean city =
                                    CityChannels.isCity(rs.getString("region_label"), regions);
                            String room = city ? null : rs.getString("name");
                            return labels.put(
                                    rs.getObject("id", UUID.class).toString(),
                                    roomLabel(prefix, room));
                        })
                .list();
        return labels;
    }

    @Override
    public Map<String, Object> staffDetails(
            String action,
            String targetType,
            @Nullable String targetId,
            Map<String, Object> details) {
        String key = TARGET_CHANNEL.equals(targetType) ? "slug" : "channel";
        if (!(details.get(key) instanceof String slug) || !citySlugs().contains(slug)) {
            return details;
        }
        Map<String, Object> shown = new LinkedHashMap<>(details);
        shown.put(key, CityChannels.ARCHIVED_SLUG);
        return shown;
    }

    /** "Americas (North) · Yu-Gi-Oh!", "A post in …", or the archived wording for a city. */
    static String roomLabel(String prefix, @Nullable String room) {
        if (room == null) {
            return prefix.isEmpty() ? ARCHIVED : prefix + "an archived channel";
        }
        return prefix + room;
    }

    /** Slugs of the archived city channels (a handful of rows, read per page of entries). */
    private Set<String> citySlugs() {
        Map<String, String> labels = new HashMap<>();
        jdbc.sql("SELECT slug, region_label FROM community_channel WHERE region_label IS NOT NULL")
                .query(
                        (rs, rowNum) ->
                                labels.put(rs.getString("slug"), rs.getString("region_label")))
                .list();
        Set<String> slugs = new java.util.HashSet<>();
        labels.forEach(
                (slug, label) -> {
                    if (CityChannels.isCity(label, regions)) {
                        slugs.add(slug);
                    }
                });
        return slugs;
    }
}
