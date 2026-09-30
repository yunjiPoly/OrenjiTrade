package com.orenjitrade.api.ratings.infra;

import com.orenjitrade.api.ratings.domain.InteractionKind;
import com.orenjitrade.api.ratings.domain.InteractionSubjectType;
import com.orenjitrade.api.ratings.domain.InteractionView;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** {@code interaction} access; used only inside the ratings module. */
@Repository
public class InteractionRepository {

    private static final String COLUMNS =
            "id, kind, user_a, user_b, subject_type, subject_id, occurred_at";

    private final JdbcClient jdbc;

    public InteractionRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Inserts an interaction unless one exists for the same kind and subject. The two accounts are
     * stored in PostgreSQL's uuid order ({@code user_a < user_b}), whatever the argument order.
     *
     * @return whether a row was inserted
     */
    public boolean insertIfAbsent(
            UUID id,
            InteractionKind kind,
            UUID userOne,
            UUID userTwo,
            InteractionSubjectType subjectType,
            UUID subjectId,
            Instant occurredAt) {
        return jdbc.sql(
                                """
                                INSERT INTO interaction (id, kind, user_a, user_b, subject_type,
                                    subject_id, occurred_at)
                                VALUES (:id, :kind, LEAST(:one, :two), GREATEST(:one, :two),
                                    :subjectType, :subjectId, :at)
                                ON CONFLICT (kind, subject_id) DO NOTHING
                                """)
                        .param("id", id)
                        .param("kind", kind.name())
                        .param("one", userOne)
                        .param("two", userTwo)
                        .param("subjectType", subjectType.name())
                        .param("subjectId", subjectId)
                        .param("at", Timestamp.from(occurredAt))
                        .update()
                > 0;
    }

    public Optional<InteractionView> find(UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM interaction WHERE id = :id")
                .param("id", id)
                .query(InteractionRepository::map)
                .optional();
    }

    public Optional<InteractionView> findBySubject(InteractionKind kind, UUID subjectId) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM interaction WHERE kind = :kind AND subject_id ="
                                + " :subjectId")
                .param("kind", kind.name())
                .param("subjectId", subjectId)
                .query(InteractionRepository::map)
                .optional();
    }

    /** Interactions between two accounts (any argument order), newest first. */
    public List<InteractionView> between(UUID one, UUID other) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM interaction WHERE user_a = LEAST(:one, :other) AND"
                                + " user_b = GREATEST(:one, :other)"
                                + " ORDER BY occurred_at DESC, id DESC")
                .param("one", one)
                .param("other", other)
                .query(InteractionRepository::map)
                .list();
    }

    /** Interactions of an account (export), newest first. */
    public List<InteractionView> of(UUID userId) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM interaction WHERE user_a = :id OR user_b = :id"
                                + " ORDER BY occurred_at DESC, id DESC")
                .param("id", userId)
                .query(InteractionRepository::map)
                .list();
    }

    static InteractionView map(ResultSet rs, int rowNum) throws SQLException {
        return new InteractionView(
                rs.getObject("id", UUID.class),
                InteractionKind.valueOf(rs.getString("kind")),
                rs.getObject("user_a", UUID.class),
                rs.getObject("user_b", UUID.class),
                InteractionSubjectType.valueOf(rs.getString("subject_type")),
                rs.getObject("subject_id", UUID.class),
                rs.getTimestamp("occurred_at").toInstant());
    }
}
