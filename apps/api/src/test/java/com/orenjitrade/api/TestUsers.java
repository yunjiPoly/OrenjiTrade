package com.orenjitrade.api;

import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.auth.domain.Role;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.JdbcTemplate;

/** Direct database helpers for integration tests (roles, status, consents, audit rows). */
public class TestUsers {

    private final JdbcTemplate jdbc;

    public TestUsers(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public UUID idOf(String providerUid) {
        return jdbc.queryForObject(
                "SELECT id FROM user_account WHERE provider_uid = ?", UUID.class, providerUid);
    }

    public @Nullable UUID findIdOf(String providerUid) {
        List<UUID> ids =
                jdbc.queryForList(
                        "SELECT id FROM user_account WHERE provider_uid = ?",
                        UUID.class,
                        providerUid);
        return ids.isEmpty() ? null : ids.get(0);
    }

    public Map<String, Object> row(UUID id) {
        return jdbc.queryForMap("SELECT * FROM user_account WHERE id = ?", id);
    }

    public List<String> rolesOf(UUID id) {
        return jdbc.queryForList(
                "SELECT role FROM user_role WHERE user_id = ? ORDER BY role", String.class, id);
    }

    public void grantRoles(UUID id, Role... roles) {
        for (Role role : roles) {
            jdbc.update(
                    "INSERT INTO user_role (user_id, role, granted_at) VALUES (?, ?, now())"
                            + " ON CONFLICT (user_id, role) DO NOTHING",
                    id,
                    role.name());
        }
    }

    public void setStatus(UUID id, AccountStatus status, @Nullable Instant suspendedUntil) {
        jdbc.update(
                "UPDATE user_account SET status = ?, suspended_until = ?, updated_at = now()"
                        + " WHERE id = ?",
                status.name(),
                suspendedUntil == null ? null : Timestamp.from(suspendedUntil),
                id);
    }

    /** Inserts a consent row for every current required document. */
    public void acceptAllRequiredConsents(UUID id) {
        jdbc.update(
                "INSERT INTO user_consent (user_id, document_type, version, accepted_at,"
                        + " user_agent) SELECT ?, document_type, version, now(), 'test' FROM"
                        + " legal_document WHERE current AND required_at_registration ON CONFLICT"
                        + " (user_id, document_type, version) DO NOTHING",
                id);
    }

    /**
     * Records the 18+ confirmation (the current {@code AGE_CONFIRMATION} document) the way {@code
     * POST /me/consents} would, so the account passes the service-layer age gate.
     */
    public void confirmAge(UUID id) {
        jdbc.update(
                "INSERT INTO user_consent (user_id, document_type, version, accepted_at,"
                        + " user_agent) SELECT ?, document_type, version, now(), 'test' FROM"
                        + " legal_document WHERE current AND document_type = 'AGE_CONFIRMATION'"
                        + " ON CONFLICT (user_id, document_type, version) DO NOTHING",
                id);
    }

    public List<Map<String, Object>> consentsOf(UUID id) {
        return jdbc.queryForList(
                "SELECT document_type, version, ip_hash, user_agent, language FROM"
                        + " user_consent WHERE user_id = ? ORDER BY document_type",
                id);
    }

    public List<Map<String, Object>> auditRowsFor(UUID targetId) {
        return jdbc.queryForList(
                "SELECT id, occurred_at, actor_user_id, actor_type, action, target_type,"
                        + " target_id, details::text AS details, request_id FROM audit_log"
                        + " WHERE target_type = 'USER' AND target_id = ? ORDER BY occurred_at",
                targetId.toString());
    }

    public int countSeedAccounts() {
        Integer count =
                jdbc.queryForObject(
                        "SELECT count(*) FROM user_account WHERE provider_uid LIKE 'seed-%'",
                        Integer.class);
        return count == null ? 0 : count;
    }

    /**
     * The stored location of a user as plain numbers (tests only; production code never reads the
     * centre outside the location module): keys centre_lat, centre_lng, public_lat, public_lng,
     * public_label, grid_cell. Empty map without a row.
     */
    public Map<String, Object> locationOf(UUID id) {
        List<Map<String, Object>> rows =
                jdbc.queryForList(
                        "SELECT ST_Y(trading_area_center::geometry) AS centre_lat,"
                                + " ST_X(trading_area_center::geometry) AS centre_lng,"
                                + " ST_Y(public_point::geometry) AS public_lat,"
                                + " ST_X(public_point::geometry) AS public_lng,"
                                + " public_label, grid_cell, trading_area_radius_m"
                                + " FROM user_location WHERE user_id = ?",
                        id);
        return rows.isEmpty() ? Map.of() : rows.get(0);
    }

    public void setLastActive(UUID id, @Nullable Instant lastActiveAt) {
        jdbc.update(
                "UPDATE user_account SET last_active_at = ? WHERE id = ?",
                lastActiveAt == null ? null : Timestamp.from(lastActiveAt),
                id);
    }

    public int count(String sql, Object... args) {
        Integer count = jdbc.queryForObject(sql, Integer.class, args);
        return count == null ? 0 : count;
    }

    public List<Map<String, Object>> query(String sql, Object... args) {
        return jdbc.queryForList(sql, args);
    }

    public int update(String sql, Object... args) {
        return jdbc.update(sql, args);
    }

    public List<Map<String, Object>> jobRuns(String name) {
        return jdbc.queryForList(
                "SELECT name, status, details::text AS details FROM job_run WHERE name = ?"
                        + " ORDER BY started_at DESC",
                name);
    }
}
