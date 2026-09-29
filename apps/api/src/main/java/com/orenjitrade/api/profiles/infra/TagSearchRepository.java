package com.orenjitrade.api.profiles.infra;

import com.orenjitrade.api.profiles.domain.TagCategory;
import com.orenjitrade.api.profiles.domain.TagView;
import java.text.Normalizer;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Tag search for {@code GET /api/v1/tags}: active tags only (custom ones once somebody uses them),
 * accent- and case-insensitive substring match on the label or slug (backed by the trigram index
 * {@code ix_tag_label_trgm}), prefix matches first, then by popularity.
 */
@Repository
public class TagSearchRepository {

    private static final Pattern DIACRITICS = Pattern.compile("\\p{M}+");

    private final JdbcClient jdbc;

    public TagSearchRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public List<TagView> search(@Nullable String query, @Nullable TagCategory category, int limit) {
        StringBuilder sql =
                new StringBuilder(
                        "SELECT id, slug, label, category, usage_count FROM tag WHERE status ="
                                + " 'ACTIVE' AND (category <> 'CUSTOM' OR usage_count > 0)");
        String normalised = query == null ? "" : normalise(query);
        if (category != null) {
            sql.append(" AND category = :category");
        }
        if (!normalised.isEmpty()) {
            sql.append(
                    " AND (lower(unaccent_immutable(label)) LIKE :contains ESCAPE '\\'"
                            + " OR slug LIKE :containsSlug ESCAPE '\\')");
            sql.append(
                    " ORDER BY CASE WHEN lower(unaccent_immutable(label)) LIKE :prefix ESCAPE '\\'"
                            + " THEN 0 ELSE 1 END, usage_count DESC, label ASC");
        } else {
            sql.append(" ORDER BY usage_count DESC, category ASC, label ASC");
        }
        sql.append(" LIMIT :limit");
        JdbcClient.StatementSpec statement = jdbc.sql(sql.toString()).param("limit", limit);
        if (category != null) {
            statement = statement.param("category", category.name());
        }
        if (!normalised.isEmpty()) {
            String escaped = escapeLike(normalised);
            statement =
                    statement
                            .param("contains", "%" + escaped + "%")
                            .param(
                                    "containsSlug",
                                    "%" + escapeLike(normalised.replace(' ', '-')) + "%")
                            .param("prefix", escaped + "%");
        }
        return statement
                .query(
                        (rs, rowNum) ->
                                new TagView(
                                        rs.getObject("id", UUID.class),
                                        rs.getString("slug"),
                                        rs.getString("label"),
                                        TagCategory.valueOf(rs.getString("category")),
                                        rs.getInt("usage_count")))
                .list();
    }

    /** Fresh views (current usage counts) of the given tags, straight from the database. */
    public List<TagView> findViews(Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("SELECT id, slug, label, category, usage_count FROM tag WHERE id IN (:ids)")
                .param("ids", ids)
                .query(TagSearchRepository::map)
                .list();
    }

    private static TagView map(java.sql.ResultSet rs, int rowNum) throws java.sql.SQLException {
        return new TagView(
                rs.getObject("id", UUID.class),
                rs.getString("slug"),
                rs.getString("label"),
                TagCategory.valueOf(rs.getString("category")),
                rs.getInt("usage_count"));
    }

    static String normalise(String query) {
        String decomposed = Normalizer.normalize(query.trim(), Normalizer.Form.NFD);
        return DIACRITICS.matcher(decomposed).replaceAll("").toLowerCase(Locale.ROOT);
    }

    static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
