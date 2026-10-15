package com.orenjitrade.api.cards.infra;

import com.orenjitrade.api.cards.domain.CatalogCardRef;
import com.orenjitrade.api.cards.domain.CatalogText;
import com.orenjitrade.api.cards.domain.scan.NameSimilarity;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * The name lookup of a scan match: the cards {@code GET /cards/suggest} would suggest for each name
 * read ({@link CatalogQueryRepository#suggestCards}: the same conditions and order), for every name
 * read in one query.
 */
@Repository
public class CardScanQueryRepository {

    private final JdbcClient jdbc;

    public CardScanQueryRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Cards of the ACTIVE game {@code gameId} whose name equals, starts with, contains, full-text
     * matches or resembles one of {@code names}, at most {@code perName} per name: names in their
     * order, each name's cards as {@code /cards/suggest} orders them (equal normalised name first).
     */
    public List<CatalogCardRef> cardsByNames(UUID gameId, List<String> names, int perName) {
        if (names.isEmpty()) {
            return List.of();
        }
        StringBuilder read = new StringBuilder();
        Map<String, Object> params = new LinkedHashMap<>();
        for (int i = 0; i < names.size(); i++) {
            String normalised = NameSimilarity.key(names.get(i));
            String escaped = CatalogText.escapeLike(normalised);
            read.append(i == 0 ? "" : ", ")
                    .append("(")
                    .append(i)
                    .append(", CAST(:q")
                    .append(i)
                    .append(" AS text), CAST(:qn")
                    .append(i)
                    .append(" AS text), CAST(:contains")
                    .append(i)
                    .append(" AS text), CAST(:prefix")
                    .append(i)
                    .append(" AS text))");
            params.put("q" + i, names.get(i));
            params.put("qn" + i, normalised);
            params.put("contains" + i, "%" + escaped + "%");
            params.put("prefix" + i, escaped + "%");
        }
        return jdbc.sql(
                        "WITH read (idx, q, qn, contains, prefix) AS (VALUES "
                                + read
                                + ")"
                                + """
                                 SELECT r.idx, m.id, m.game, m.name
                                   FROM read r
                                  CROSS JOIN LATERAL (
                                        SELECT c.id, g.slug AS game, c.name
                                          FROM card c
                                          JOIN game g ON g.id = c.game_id
                                         WHERE g.status = 'ACTIVE' AND c.game_id = :gameId
                                           AND (c.normalized_name LIKE r.contains ESCAPE '\\'
                                                OR c.search_vector @@ websearch_to_tsquery('simple',
                                                       unaccent_immutable(r.q))
                                                OR c.normalized_name % r.qn
                                                OR r.qn <% c.normalized_name)
                                         ORDER BY CASE WHEN c.normalized_name = r.qn THEN 0
                                                       WHEN c.normalized_name LIKE r.prefix ESCAPE '\\'
                                                           THEN 1
                                                       WHEN c.normalized_name LIKE r.contains
                                                           ESCAPE '\\' THEN 2
                                                       ELSE 3 END,
                                                  greatest(similarity(c.normalized_name, r.qn),
                                                           word_similarity(r.qn, c.normalized_name))
                                                      DESC,
                                                  c.normalized_name, c.id
                                         LIMIT :perName) m
                                  ORDER BY r.idx
                                """)
                .params(params)
                .param("gameId", gameId)
                .param("perName", perName)
                .query(
                        (rs, rowNum) ->
                                new CatalogCardRef(
                                        rs.getObject("id", UUID.class),
                                        rs.getString("game"),
                                        rs.getString("name")))
                .list();
    }
}
