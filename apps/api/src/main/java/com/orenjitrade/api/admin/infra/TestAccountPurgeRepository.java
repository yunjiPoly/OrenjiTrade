package com.orenjitrade.api.admin.infra;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Read-only queries of the local test-data purge ({@code npm run e2e:purge}) over other modules'
 * tables: which accounts are fictional E2E accounts, what they own (counts only) and which open
 * trades block their deletion. Every change goes through the owning modules' services.
 */
@Repository
public class TestAccountPurgeRepository {

    /** Domain of the web E2E suites' accounts; seed accounts use {@code orenjitrade.test}. */
    public static final String TEST_EMAIL_DOMAIN = "example.test";

    private final JdbcClient jdbc;

    public TestAccountPurgeRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** A fictional test account that is not deleted yet. */
    public record TestAccount(UUID id, String email, String status) {}

    /** What a set of accounts owns (counts). */
    public record Dependents(long locations, long discoverable, long binders, long items) {}

    /** An open trade of an account. */
    public record OpenTrade(UUID id, UUID buyerId, UUID sellerId, String status) {

        /** The other party of {@code accountId}. */
        public UUID otherParty(UUID accountId) {
            return buyerId.equals(accountId) ? sellerId : buyerId;
        }
    }

    /** Every {@code ...@example.test} account that is not deleted yet, oldest first. */
    public List<TestAccount> testAccounts() {
        return jdbc.sql(
                        """
                        SELECT id, email, status FROM user_account
                         WHERE lower(email) LIKE :pattern AND status <> 'DELETED'
                         ORDER BY created_at, id
                        """)
                .param("pattern", "%@" + TEST_EMAIL_DOMAIN)
                .query(
                        (rs, row) ->
                                new TestAccount(
                                        rs.getObject("id", UUID.class),
                                        rs.getString("email"),
                                        rs.getString("status")))
                .list();
    }

    /** Locations, discoverable public points, binders and live inventory items of {@code ids}. */
    public Dependents dependents(Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return new Dependents(0, 0, 0, 0);
        }
        List<UUID> list = List.copyOf(ids);
        return jdbc.sql(
                        """
                        SELECT
                          (SELECT count(*) FROM user_location WHERE user_id IN (:ids)) AS locations,
                          (SELECT count(*) FROM user_location WHERE user_id IN (:ids)
                              AND public_point IS NOT NULL) AS discoverable,
                          (SELECT count(*) FROM binder WHERE owner_id IN (:ids)) AS binders,
                          (SELECT count(*) FROM inventory_item WHERE owner_id IN (:ids)
                              AND deleted_at IS NULL) AS items
                        """)
                .param("ids", list)
                .query(
                        (rs, row) ->
                                new Dependents(
                                        rs.getLong("locations"),
                                        rs.getLong("discoverable"),
                                        rs.getLong("binders"),
                                        rs.getLong("items")))
                .single();
    }

    /** Trades of {@code accountId} that are neither completed nor cancelled. */
    public List<OpenTrade> openTradesOf(UUID accountId) {
        return jdbc.sql(
                        """
                        SELECT id, buyer_id, seller_id, status FROM trade
                         WHERE (buyer_id = :id OR seller_id = :id)
                           AND status NOT IN ('COMPLETED', 'CANCELLED')
                        """)
                .param("id", accountId)
                .query(
                        (rs, row) ->
                                new OpenTrade(
                                        rs.getObject("id", UUID.class),
                                        rs.getObject("buyer_id", UUID.class),
                                        rs.getObject("seller_id", UUID.class),
                                        rs.getString("status")))
                .list();
    }

    /** Event publications made since {@code since} whose listeners have not completed yet. */
    public long incompleteEventPublicationsSince(Instant since) {
        return jdbc.sql(
                        "SELECT count(*) FROM event_publication"
                                + " WHERE completion_date IS NULL AND publication_date >= :since")
                .param("since", java.sql.Timestamp.from(since))
                .query(Long.class)
                .single();
    }
}
