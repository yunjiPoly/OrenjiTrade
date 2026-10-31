package com.orenjitrade.api.admin.infra;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * The admin console's staff search (spec 15.8.6, web stage WH2): accounts by handle, email or name,
 * cards by name or printing code, a report by its number. A read model over the modules' tables, as
 * the dashboard's; never a place.
 */
@Repository
public class StaffSearchRepository {

    private final JdbcClient jdbc;

    public StaffSearchRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Accounts whose handle, email or display name holds the text; exact handles first. */
    public List<CollectorHit> collectors(String text, int limit) {
        String bare = text.startsWith("@") ? text.substring(1) : text;
        return jdbc.sql(
                        """
                        SELECT u.id, u.handle, u.display_name, u.email, u.status
                          FROM user_account u
                         WHERE u.status <> 'DELETED'
                           AND (lower(u.handle) LIKE :like ESCAPE '\\'
                                OR lower(coalesce(u.email, '')) LIKE :like ESCAPE '\\'
                                OR lower(unaccent_immutable(coalesce(u.display_name, '')))
                                   LIKE lower(unaccent_immutable(:like)) ESCAPE '\\')
                         ORDER BY (lower(u.handle) = :exact) DESC,
                                  (lower(u.handle) LIKE :prefix ESCAPE '\\') DESC,
                                  u.handle
                         LIMIT :limit
                        """)
                .param("like", "%" + escape(bare.toLowerCase()) + "%")
                .param("prefix", escape(bare.toLowerCase()) + "%")
                .param("exact", bare.toLowerCase())
                .param("limit", limit)
                .query(
                        (rs, rowNum) ->
                                new CollectorHit(
                                        rs.getObject("id", UUID.class),
                                        rs.getString("handle"),
                                        rs.getString("display_name"),
                                        rs.getString("email"),
                                        rs.getString("status")))
                .list();
    }

    /**
     * Cards whose printing code is the text (with its printing, once per card and code), then cards
     * whose name holds it, names starting with it first.
     */
    public List<CardHit> cards(String text, int limit) {
        List<CardHit> byCode =
                jdbc.sql(
                                """
                                SELECT id, name, game, printing_code
                                  FROM (SELECT DISTINCT ON (c.id, upper(p.printing_code))
                                               c.id, c.name, g.slug AS game, p.printing_code,
                                               upper(p.printing_code) = :exact AS exact
                                          FROM card_printing p
                                          JOIN card c ON c.id = p.card_id
                                          JOIN game g ON g.id = c.game_id
                                         WHERE upper(p.printing_code) LIKE :code ESCAPE '\\'
                                         ORDER BY c.id, upper(p.printing_code), p.printing_code)
                                       AS one_per_card_and_code
                                 ORDER BY exact DESC, printing_code, name, id
                                 LIMIT :limit
                                """)
                        .param("code", escape(text.toUpperCase()) + "%")
                        .param("exact", text.toUpperCase())
                        .param("limit", limit)
                        .query(
                                (rs, rowNum) ->
                                        new CardHit(
                                                rs.getObject("id", UUID.class),
                                                rs.getString("name"),
                                                rs.getString("game"),
                                                rs.getString("printing_code")))
                        .list();
        if (byCode.size() >= limit) {
            return byCode;
        }
        List<CardHit> byName =
                jdbc.sql(
                                """
                                SELECT c.id, c.name, g.slug AS game
                                  FROM card c
                                  JOIN game g ON g.id = c.game_id
                                 WHERE c.normalized_name LIKE lower(unaccent_immutable(:like))
                                       ESCAPE '\\'
                                 ORDER BY c.normalized_name LIKE lower(unaccent_immutable(:prefix))
                                          ESCAPE '\\' DESC,
                                          c.normalized_name, c.id
                                 LIMIT :limit
                                """)
                        .param("like", "%" + escape(text) + "%")
                        .param("prefix", escape(text) + "%")
                        .param("limit", limit - byCode.size())
                        .query(
                                (rs, rowNum) ->
                                        new CardHit(
                                                rs.getObject("id", UUID.class),
                                                rs.getString("name"),
                                                rs.getString("game"),
                                                null))
                        .list();
        // One row per card and code (several printings, rarities or sets, may share a code), and
        // a card found by its code is not listed again by its name (web stage WH2 review fix 1).
        java.util.Set<UUID> found = new java.util.HashSet<>();
        byCode.forEach(hit -> found.add(hit.id()));
        List<CardHit> hits = new java.util.ArrayList<>(byCode);
        byName.stream().filter(hit -> !found.contains(hit.id())).forEach(hits::add);
        return hits;
    }

    /** The report with this number. */
    public Optional<ReportHit> report(long number) {
        return jdbc.sql(
                        """
                        SELECT r.id, r.report_number, r.reason, r.status, u.handle
                          FROM collector_report r
                          JOIN user_account u ON u.id = r.reported_user_id
                         WHERE r.report_number = :number
                        """)
                .param("number", number)
                .query(
                        (rs, rowNum) ->
                                new ReportHit(
                                        rs.getObject("id", UUID.class),
                                        rs.getLong("report_number"),
                                        rs.getString("reason"),
                                        rs.getString("status"),
                                        rs.getString("handle")))
                .optional();
    }

    private static String escape(String text) {
        return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    /** An account found by the staff search. */
    public record CollectorHit(
            UUID id,
            String handle,
            @Nullable String displayName,
            @Nullable String email,
            String status) {}

    /** A card found by the staff search, with the printing code it matched. */
    public record CardHit(UUID id, String name, String game, @Nullable String printingCode) {}

    /** A report found by its number. */
    public record ReportHit(
            UUID id, long number, String reason, String status, String reportedHandle) {}
}
