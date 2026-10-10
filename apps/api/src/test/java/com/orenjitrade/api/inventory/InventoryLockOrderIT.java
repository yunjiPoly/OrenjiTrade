package com.orenjitrade.api.inventory;

import static com.orenjitrade.api.inventory.InventoryTestSupport.binder;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.binders.domain.BinderChanges.NewBinder;
import com.orenjitrade.api.binders.domain.BinderService;
import com.orenjitrade.api.binders.domain.ListingScope;
import com.orenjitrade.api.binders.domain.ListingVisibility;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.inventory.domain.FreshnessService;
import com.orenjitrade.api.inventory.domain.InventoryChanges.BulkAction;
import com.orenjitrade.api.inventory.domain.InventoryChanges.BulkRequest;
import com.orenjitrade.api.inventory.domain.InventoryChanges.NewItem;
import com.orenjitrade.api.inventory.domain.InventoryService;
import com.orenjitrade.api.inventory.domain.InventoryService.TransferLine;
import com.orenjitrade.api.inventory.domain.ListingReconciler;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.IntConsumer;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The locks of inventory and binder writes. Every item write ends in a binder row ({@code
 * trg_inventory_item_binder_count} keeps {@code binder.item_count}, confirmations and moves refresh
 * the binder) and the listing reconciler writes binders before items, so a path that took the item
 * first deadlocked with it ({@code DELETE /inventory/items/{id}} answered 500 right after a privacy
 * change). The owner lock stands in front of the rows now: the writes of one collector run one
 * after the other. Below it the rows are still taken in one order, binder rows first, then item
 * rows, each in ascending id.
 *
 * <p>The interleaving tests drive real transactions through the order of events that used to end in
 * a lock cycle: one transaction is stopped in the middle of its work (at a row another session
 * holds, or before its commit) until the other one waits for a lock it holds (seen in {@code
 * pg_blocking_pids}), then goes on. PostgreSQL aborts one side of a cycle ("deadlock detected").
 */
class InventoryLockOrderIT extends AbstractIntegrationTest {

    private static final Duration STEP = Duration.ofSeconds(30);
    private static final String ITEMS = "/api/v1/inventory/items";

    @Autowired private CatalogImportService importService;
    @Autowired private InventoryService inventoryService;
    @Autowired private BinderService binderService;
    @Autowired private ListingReconciler reconciler;
    @Autowired private FreshnessService freshnessService;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactionManager;

    private UUID printingId;
    private TransactionTemplate transaction;

    /** The collectors of the current test. */
    private final List<UUID> collectors = new ArrayList<>();

    @BeforeEach
    void catalog() {
        InventoryTestSupport.ensureCatalog(importService);
        // A card of this test only: the suite shares the catalog and the regions, and some of
        // these collectors list dozens of copies.
        printingId = InventoryTestSupport.isolatedCard(testUsers, "ygo-p001a").printingId();
        transaction = new TransactionTemplate(transactionManager);
    }

    /** Nothing of this test stays publicly listed for the suites that run after it. */
    @AfterEach
    void unlistEverything() {
        for (UUID ownerId : collectors) {
            setDiscoverable(ownerId, false);
            reconciler.owner(ownerId);
        }
    }

    /** A compliant collector of the current test (not discoverable yet). */
    private UUID collector(String uid) {
        UUID ownerId = provisionCompliant(uid);
        collectors.add(ownerId);
        return ownerId;
    }

    // ---------------------------------------------------------------------------------------
    // Item writes against the listing reconciler (the reported deadlock)
    // ---------------------------------------------------------------------------------------

    /** An item write of the owner that reaches the binder row of the item. */
    enum ItemWrite {
        DELETE,
        MOVE_TO_ANOTHER_BINDER,
        UNFILE,
        CONFIRM,
        BULK_DELETE,
        BULK_MOVE,
        BULK_CONFIRM,
        ADMIN_RESTORE,
        TRADE_TRANSFER
    }

    /**
     * The reconciliation of a privacy change has stored the new visibility of the binder and goes
     * on with its items while the owner writes one of those items. The reconciliation unlists the
     * items in ascending id and is stopped at the first one (another session holds that row, as an
     * item photo upload would).
     */
    @ParameterizedTest
    @EnumSource(ItemWrite.class)
    void anItemWriteNeverDeadlocksWithTheListingReconciler(ItemWrite write) throws Exception {
        String uid = uniqueUid("lock-order");
        UUID ownerId = collector(uid);
        setDiscoverable(ownerId, true);
        String binderId = createBinder(uid, "Listed", "PUBLIC");
        String otherBinderId = createBinder(uid, "Other", "PUBLIC");
        List<String> items = createItemsInIdOrder(uid, binderId);
        String kept = items.get(0);
        String written = items.get(1);
        assertThat(listedFlags(ownerId)).as("listed before the privacy change").containsOnly(true);

        // The privacy change itself (no event: the test runs the listener's reconciliation).
        setDiscoverable(ownerId, false);
        runStoppedAt(
                "inventory_item",
                uuid(kept),
                () -> reconciler.owner(ownerId),
                () -> perform(write, uid, ownerId, written, otherBinderId));

        assertThat(listedFlags(ownerId)).as("nothing stays listed").containsOnly(false);
        assertItemCountsMatch(ownerId);
        assertThat(itemCount(binderId))
                .isEqualTo(
                        switch (write) {
                            case CONFIRM, BULK_CONFIRM, ADMIN_RESTORE -> 2;
                            default -> 1;
                        });
        assertThat(isLive(kept)).isTrue();
    }

    /**
     * The second line behind the owner lock: an item write takes the binder of its item before the
     * item. The other side here is a transaction that takes no owner lock (as a write path added
     * later might): it has stored the new visibility of the binders and goes on with their items.
     * An item write that held its item while it waited for the binder would deadlock with it.
     */
    @ParameterizedTest
    @EnumSource(ItemWrite.class)
    void anItemWriteTakesItsBinderBeforeItsItem(ItemWrite write) throws Exception {
        String uid = uniqueUid("lock-rows");
        UUID ownerId = collector(uid);
        setDiscoverable(ownerId, true);
        String binderId = createBinder(uid, "Listed", "PUBLIC");
        String otherBinderId = createBinder(uid, "Other", "PUBLIC");
        String kept = createItem(uid, binderId, Map.of());
        String written = createItem(uid, binderId, Map.of());
        assertThat(listedFlags(ownerId)).as("listed before the privacy change").containsOnly(true);

        setDiscoverable(ownerId, false);
        interleave(
                () -> binderService.reconcileListing(new ListingScope.Owner(ownerId)),
                () -> reconciler.binders(List.of(uuid(binderId), uuid(otherBinderId))),
                () -> perform(write, uid, ownerId, written, otherBinderId));

        assertThat(listedFlags(ownerId)).as("nothing stays listed").containsOnly(false);
        assertItemCountsMatch(ownerId);
        assertThat(itemCount(binderId))
                .isEqualTo(
                        switch (write) {
                            case CONFIRM, BULK_CONFIRM, ADMIN_RESTORE -> 2;
                            default -> 1;
                        });
        assertThat(isLive(kept)).isTrue();
    }

    private void perform(
            ItemWrite write, String uid, UUID ownerId, String itemId, String otherBinderId) {
        String uri = ITEMS + "/" + itemId;
        switch (write) {
            case DELETE -> callJson(HttpMethod.DELETE, uri, uid, null, 204);
            case MOVE_TO_ANOTHER_BINDER ->
                    callJson(HttpMethod.PATCH, uri, uid, Map.of("binderId", otherBinderId), 200);
            case UNFILE -> {
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("binderId", null);
                callJson(HttpMethod.PATCH, uri, uid, body, 200);
            }
            case CONFIRM -> callJson(HttpMethod.POST, uri + "/confirm", uid, null, 200);
            case BULK_DELETE -> bulk(uid, "DELETE", List.of(itemId), Map.of());
            case BULK_MOVE ->
                    bulk(uid, "MOVE_TO_BINDER", List.of(itemId), Map.of("binderId", otherBinderId));
            case BULK_CONFIRM -> bulk(uid, "CONFIRM", List.of(itemId), Map.of());
            case ADMIN_RESTORE ->
                    assertThat(inventoryService.restoreListing(uuid(itemId))).isPresent();
            case TRADE_TRANSFER ->
                    assertThat(
                                    inventoryService
                                            .reserveAndTransfer(
                                                    List.of(
                                                            new TransferLine(
                                                                    uuid(itemId), ownerId, 1)))
                                            .get(0)
                                            .removed())
                            .isTrue();
        }
    }

    /**
     * A write waits for another write of the same collector: issued while a move of its item is not
     * committed yet, a delete finds the item in its new binder and both counts end right.
     */
    @Test
    void anItemMovedMeanwhileIsWrittenUnderItsNewBinder() throws Exception {
        String uid = uniqueUid("lock-moved");
        UUID ownerId = collector(uid);
        String from = createBinder(uid, "From", "PRIVATE");
        String to = createBinder(uid, "To", "PRIVATE");
        String moved = createItem(uid, from, Map.of());
        createItem(uid, from, Map.of());

        interleave(
                () ->
                        assertThat(
                                        inventoryService
                                                .bulk(
                                                        ownerId,
                                                        new BulkRequest(
                                                                List.of(uuid(moved)),
                                                                BulkAction.MOVE_TO_BINDER,
                                                                null,
                                                                null,
                                                                uuid(to),
                                                                null))
                                                .updated())
                                .isEqualTo(1),
                () -> {},
                () -> callJson(HttpMethod.DELETE, ITEMS + "/" + moved, uid, null, 204));

        assertThat(isLive(moved)).isFalse();
        assertThat(itemCount(from)).isEqualTo(1);
        assertThat(itemCount(to)).isZero();
        assertItemCountsMatch(ownerId);
    }

    /** A write of several items of one collector. */
    enum MultiItemWrite {
        BULK,
        TRADE_TRANSFER
    }

    /**
     * Three requests of one collector at the same moment: a bulk move files two unfiled items into
     * a binder, a confirmation of one of them and a write of both wait for it, and a privacy change
     * is committed meanwhile (so the confirmation unlists the other item of the binder). A write of
     * both items that decided on "no binder" before the move was committed held the first item
     * without its new binder while it waited for the second: a lock cycle with the confirmation.
     */
    @ParameterizedTest
    @EnumSource(MultiItemWrite.class)
    void aWriteOfItemsFiledMeanwhileNeverDeadlocks(MultiItemWrite write) throws Exception {
        String uid = uniqueUid("lock-filed");
        UUID ownerId = collector(uid);
        setDiscoverable(ownerId, true);
        String binderId = createBinder(uid, "Target", "PUBLIC");
        List<String> items =
                ascending(
                        "inventory_item",
                        createItem(uid, null, Map.of()),
                        createItem(uid, null, Map.of()));
        String lower = items.get(0);
        String higher = items.get(1);
        assertThat(listedFlags(ownerId)).as("listed before the privacy change").containsOnly(true);

        ExecutorService pool = Executors.newFixedThreadPool(3);
        try {
            CompletableFuture<Integer> moverPid = new CompletableFuture<>();
            CountDownLatch commitMove = new CountDownLatch(1);
            Future<?> mover =
                    pool.submit(
                            () ->
                                    transaction.executeWithoutResult(
                                            status -> {
                                                announce(
                                                        moverPid,
                                                        () -> move(ownerId, items, binderId));
                                                awaitQuietly(commitMove);
                                            }));
            int pid = moverPid.get(STEP.toSeconds(), TimeUnit.SECONDS);
            Future<?> confirmation;
            Future<?> both;
            try {
                // The confirmation queues first, then the write of both items.
                confirmation =
                        pool.submit(
                                () ->
                                        callJson(
                                                HttpMethod.POST,
                                                ITEMS + "/" + higher + "/confirm",
                                                uid,
                                                null,
                                                200));
                awaitWaiters(pid, 1);
                both =
                        pool.submit(
                                () -> {
                                    switch (write) {
                                        case BULK ->
                                                bulk(
                                                        uid,
                                                        "SET_AVAILABILITY",
                                                        items,
                                                        Map.of("availability", "TRADE"));
                                        case TRADE_TRANSFER ->
                                                assertThat(
                                                                inventoryService.reserveAndTransfer(
                                                                        List.of(
                                                                                new TransferLine(
                                                                                        uuid(lower),
                                                                                        ownerId,
                                                                                        1),
                                                                                new TransferLine(
                                                                                        uuid(
                                                                                                higher),
                                                                                        ownerId,
                                                                                        1))))
                                                        .allMatch(result -> result.removed());
                                    }
                                });
                awaitWaiters(pid, 2);
                // The privacy change itself; its reconciliation has not run yet.
                setDiscoverable(ownerId, false);
            } finally {
                commitMove.countDown();
            }
            mover.get(STEP.toSeconds(), TimeUnit.SECONDS);
            confirmation.get(STEP.toSeconds(), TimeUnit.SECONDS);
            both.get(STEP.toSeconds(), TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }

        assertThat(listedFlags(ownerId)).as("nothing stays listed").containsOnly(false);
        assertItemCountsMatch(ownerId);
        assertThat(itemCount(binderId)).isEqualTo(write == MultiItemWrite.BULK ? 2 : 0);
    }

    private void move(UUID ownerId, List<String> itemIds, String binderId) {
        assertThat(
                        inventoryService
                                .bulk(
                                        ownerId,
                                        new BulkRequest(
                                                itemIds.stream()
                                                        .map(InventoryLockOrderIT::uuid)
                                                        .toList(),
                                                BulkAction.MOVE_TO_BINDER,
                                                null,
                                                null,
                                                uuid(binderId),
                                                null))
                                .updated())
                .isEqualTo(itemIds.size());
    }

    /** A row a collector creates. */
    enum Created {
        UNFILED_ITEM,
        BINDER
    }

    /**
     * A collector creates a public card (or binder) while their discoverability is switched off.
     * The reconciliation of the privacy change waits for the creation, so it finds the new row and
     * unlists it. Running next to the uncommitted creation it missed the row, which then kept its
     * listed flag until the next freshness job.
     */
    @ParameterizedTest
    @EnumSource(Created.class)
    void aRowCreatedDuringAPrivacyChangeIsUnlisted(Created created) throws Exception {
        UUID ownerId = collector(uniqueUid("lock-create"));
        setDiscoverable(ownerId, true);

        interleave(
                () -> {
                    switch (created) {
                        case UNFILED_ITEM ->
                                inventoryService.create(
                                        ownerId,
                                        new NewItem(
                                                printingId,
                                                null,
                                                null,
                                                null,
                                                null,
                                                null,
                                                null,
                                                null,
                                                null,
                                                null,
                                                null,
                                                null,
                                                ListingVisibility.PUBLIC,
                                                null,
                                                null));
                        case BINDER ->
                                binderService.create(
                                        ownerId,
                                        new NewBinder(
                                                "Listed",
                                                null,
                                                null,
                                                ListingVisibility.PUBLIC,
                                                null,
                                                null));
                    }
                },
                () -> {},
                () -> {
                    setDiscoverable(ownerId, false);
                    reconciler.owner(ownerId);
                });

        assertThat(listedFlags(ownerId)).as("the new row").containsExactly(false);
    }

    /**
     * A trade transfer writes items of two collectors and takes both owner locks, in one order
     * whatever the order in which the collectors are named. Seen from outside: while one of the two
     * locks is held elsewhere, a request for both either waits with nothing in hand or holds the
     * other lock, and which of the two does not depend on the order of the request.
     */
    @Test
    void theOwnerLocksOfTwoCollectorsAreTakenInOneOrder() throws Exception {
        UUID one = collector(uniqueUid("lock-pair"));
        UUID two = collector(uniqueUid("lock-pair"));
        for (UUID held : List.of(one, two)) {
            UUID other = held.equals(one) ? two : one;
            assertThat(isFreeWhileBothAreRequested(other, held, List.of(held, other)))
                    .as("the same order for both ways of naming the two collectors")
                    .isEqualTo(isFreeWhileBothAreRequested(other, held, List.of(other, held)));
        }
    }

    /**
     * Whether the owner lock of {@code other} is free while a request for the locks of {@code
     * requested} waits for the lock of {@code held}, which another transaction holds.
     */
    private boolean isFreeWhileBothAreRequested(UUID other, UUID held, List<UUID> requested)
            throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            CompletableFuture<Integer> holderPid = new CompletableFuture<>();
            CountDownLatch release = new CountDownLatch(1);
            Future<?> holder =
                    pool.submit(
                            () ->
                                    transaction.executeWithoutResult(
                                            status -> {
                                                announce(
                                                        holderPid,
                                                        () ->
                                                                binderService.lockOwners(
                                                                        List.of(held)));
                                                awaitQuietly(release);
                                            }));
            Future<?> request;
            boolean free;
            try {
                int pid = holderPid.get(STEP.toSeconds(), TimeUnit.SECONDS);
                request =
                        pool.submit(
                                () ->
                                        transaction.executeWithoutResult(
                                                status -> binderService.lockOwners(requested)));
                awaitWaiters(pid, 1);
                free = canLockOwner(other);
            } finally {
                release.countDown();
            }
            holder.get(STEP.toSeconds(), TimeUnit.SECONDS);
            request.get(STEP.toSeconds(), TimeUnit.SECONDS);
            return free;
        } finally {
            pool.shutdownNow();
        }
    }

    /** Whether the owner lock of a collector can be taken right now (waits a moment at most). */
    private boolean canLockOwner(UUID ownerId) {
        try {
            transaction.executeWithoutResult(
                    status -> {
                        jdbc.execute("SET LOCAL lock_timeout = '300ms'");
                        binderService.lockOwners(List.of(ownerId));
                    });
            return true;
        } catch (DataAccessException e) {
            assertThat(e).hasMessageContaining("lock timeout");
            return false;
        }
    }

    // ---------------------------------------------------------------------------------------
    // Item writes against the freshness job
    // ---------------------------------------------------------------------------------------

    /**
     * The job has aged a binder and is about to age one of its items while the owner deletes that
     * item: the job holds the binder and wants the item, so the delete must not hold the item while
     * it waits for the binder.
     */
    @Test
    void anItemWriteNeverDeadlocksWithTheFreshnessJob() throws Exception {
        String uid = uniqueUid("lock-job");
        UUID ownerId = collector(uid);
        setDiscoverable(ownerId, true);
        String binderId = createBinder(uid, "Aging", "PUBLIC");
        String kept = createItem(uid, binderId, Map.of());
        String written = createItem(uid, binderId, Map.of());
        // The job expires this unfiled item first; holding its row stops the job there.
        String expiring = createTemporaryItem(uid, null);
        expire(expiring);
        confirmedDaysAgo("binder", binderId, 20);
        confirmedDaysAgo("inventory_item", kept, 20);
        confirmedDaysAgo("inventory_item", written, 20);

        runJobStoppedAt(
                uuid(expiring),
                () -> callJson(HttpMethod.DELETE, ITEMS + "/" + written, uid, null, 204));

        assertThat(isLive(written)).isFalse();
        assertThat(column("binder", "freshness_state", binderId)).isEqualTo("AGING");
        assertThat(column("inventory_item", "freshness_state", kept)).isEqualTo("AGING");
        assertThat(column("inventory_item", "visibility", expiring)).isEqualTo("PRIVATE");
        assertItemCountsMatch(ownerId);
    }

    /**
     * The job writes every binder before its first item. Here it has turned an expired item PRIVATE
     * and still has to warn the binder of that item; were the warning written after the item, a
     * delete of the item (binder first, then the item) would wait for the job and the job for the
     * delete.
     */
    @Test
    void theFreshnessJobWritesItsBindersBeforeItsItems() throws Exception {
        String uid = uniqueUid("lock-job-order");
        UUID ownerId = collector(uid);
        setDiscoverable(ownerId, true);
        String binderId = createBinder(uid, "Stale", "PUBLIC");
        String written = createTemporaryItem(uid, binderId);
        // The job ages this unfiled item after the expiries; holding its row stops the job there.
        String aging = createItem(uid, null, Map.of());
        expire(written);
        confirmedDaysAgo("inventory_item", aging, 20);
        // A stale binder in its warning window: only the warning step writes it.
        confirmedDaysAgo("binder", binderId, 42);
        testUsers.update(
                "UPDATE binder SET freshness_state = 'STALE' WHERE id = ?", uuid(binderId));

        runJobStoppedAt(
                uuid(aging),
                () -> callJson(HttpMethod.DELETE, ITEMS + "/" + written, uid, null, 204));

        assertThat(isLive(written)).isFalse();
        assertThat(column("binder", "warned_at", binderId)).as("the binder is warned").isNotNull();
        assertThat(column("inventory_item", "freshness_state", aging)).isEqualTo("AGING");
        assertItemCountsMatch(ownerId);
    }

    /**
     * The job waits for a row another transaction holds and then decides on the row as it is now:
     * an item the owner confirmed in the meantime keeps its fresh state instead of receiving the
     * state the job computed before it waited.
     */
    @Test
    void theFreshnessJobReReadsARowItWaitedFor() throws Exception {
        String uid = uniqueUid("lock-job-reread");
        UUID ownerId = collector(uid);
        String confirmed = createItem(uid, null, Map.of());
        confirmedDaysAgo("inventory_item", confirmed, 20);

        interleave(
                () -> inventoryService.confirm(ownerId, uuid(confirmed)),
                () -> {},
                () -> freshnessService.run());

        assertThat(column("inventory_item", "freshness_state", confirmed)).isEqualTo("ACTIVE");
    }

    // ---------------------------------------------------------------------------------------
    // Everything at once
    // ---------------------------------------------------------------------------------------

    /**
     * Bounded stress: one collector's writes of every kind at the same time (two requests adding to
     * one binder, moves between binders, confirmations and edits of the items being moved, deletes,
     * edits of unfiled items, a binder published and unpublished, reorders, privacy
     * reconciliations). None may fail, in particular not with a deadlock, and the binder counts
     * stay right.
     *
     * <p>The freshness job is not part of the mix: it writes rows of every collector without their
     * owner locks, so it can still meet a write in a lock cycle.
     */
    @Test
    void concurrentWritesOfOneCollectorNeverDeadlock() throws Exception {
        int rounds = 20;
        String uid = uniqueUid("lock-stress");
        UUID ownerId = collector(uid);
        setDiscoverable(ownerId, true);
        String first = createBinder(uid, "First", "PUBLIC");
        String second = createBinder(uid, "Second", "PUBLIC");
        String third = createBinder(uid, "Third", "PUBLIC");
        List<String> movers = new ArrayList<>();
        List<String> confirmed = new ArrayList<>();
        List<String> unfiled = new ArrayList<>();
        for (int index = 0; index < 4; index++) {
            movers.add(createItem(uid, first, Map.of()));
            confirmed.add(createItem(uid, index % 2 == 0 ? second : third, Map.of()));
            unfiled.add(createItem(uid, null, Map.of()));
        }
        List<String> doomed = new ArrayList<>();
        for (int index = 0; index < rounds; index++) {
            doomed.add(createItem(uid, index % 2 == 0 ? first : third, Map.of()));
        }
        String binders = "/api/v1/binders/";

        // Fewer workers than the connection pool holds: a waiting write keeps its connection, and
        // a starved pool would fail the run for a reason that has nothing to do with locks.
        List<IntConsumer> writers =
                List.of(
                        round -> createItem(uid, first, Map.of()),
                        round -> createItem(uid, first, Map.of()),
                        round ->
                                bulk(
                                        uid,
                                        "MOVE_TO_BINDER",
                                        movers,
                                        Map.of("binderId", round % 2 == 0 ? second : first)),
                        round -> {
                            bulk(uid, "CONFIRM", confirmed, Map.of());
                            String one = confirmed.get(round % confirmed.size());
                            callJson(
                                    HttpMethod.POST,
                                    ITEMS + "/" + one + "/confirm",
                                    uid,
                                    null,
                                    200);
                            // Items another worker is moving between two binders.
                            String moving = movers.get(round % movers.size());
                            callJson(
                                    HttpMethod.POST,
                                    ITEMS + "/" + moving + "/confirm",
                                    uid,
                                    null,
                                    200);
                            callJson(
                                    HttpMethod.PATCH,
                                    ITEMS + "/" + moving,
                                    uid,
                                    Map.of("quantity", round + 2),
                                    200);
                        },
                        round -> {
                            String gone = doomed.get(round);
                            callJson(HttpMethod.DELETE, ITEMS + "/" + gone, uid, null, 204);
                            String visibility = round % 2 == 0 ? "PRIVATE" : "PUBLIC";
                            bulk(uid, "SET_VISIBILITY", unfiled, Map.of("visibility", visibility));
                            callJson(
                                    HttpMethod.PATCH,
                                    ITEMS + "/" + unfiled.get(round % unfiled.size()),
                                    uid,
                                    Map.of("quantity", round + 2),
                                    200);
                        },
                        round -> {
                            boolean unpublish = round % 2 == 0;
                            callJson(
                                    HttpMethod.POST,
                                    binders + third + (unpublish ? "/unpublish" : "/publish"),
                                    uid,
                                    unpublish ? null : Map.of("mode", "PUBLIC"),
                                    200);
                            List<String> order =
                                    unpublish
                                            ? List.of(third, second, first)
                                            : List.of(first, second, third);
                            callJson(
                                    HttpMethod.PUT,
                                    binders + "reorder",
                                    uid,
                                    Map.of("binderIds", order),
                                    200);
                        },
                        round -> {
                            setDiscoverable(ownerId, round % 2 == 1);
                            reconciler.owner(ownerId);
                        });

        ExecutorService pool = Executors.newFixedThreadPool(writers.size());
        try {
            CountDownLatch start = new CountDownLatch(1);
            List<Future<?>> running = new ArrayList<>();
            for (IntConsumer writer : writers) {
                running.add(
                        pool.submit(
                                () -> {
                                    awaitQuietly(start);
                                    for (int round = 0; round < rounds; round++) {
                                        writer.accept(round);
                                    }
                                }));
            }
            start.countDown();
            for (Future<?> writer : running) {
                writer.get(4 * STEP.toSeconds(), TimeUnit.SECONDS);
            }
        } finally {
            pool.shutdownNow();
        }

        assertItemCountsMatch(ownerId);
        assertThat(doomed).noneMatch(this::isLive);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item WHERE owner_id = ? AND"
                                        + " deleted_at IS NULL",
                                ownerId))
                .isEqualTo(movers.size() + confirmed.size() + unfiled.size() + 2 * rounds);
        // The last privacy change of the run made the collector discoverable again.
        reconciler.owner(ownerId);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item i JOIN binder b ON b.id ="
                                        + " i.binder_id WHERE i.owner_id = ? AND i.deleted_at IS"
                                        + " NULL AND i.publicly_listed <> b.publicly_listed",
                                ownerId))
                .as("filed items listed differently from their binder")
                .isZero();
    }

    // ---------------------------------------------------------------------------------------
    // Interleaving
    // ---------------------------------------------------------------------------------------

    /**
     * Runs {@code first} in a transaction, lets {@code contender} run until it waits for a lock of
     * that transaction (or ends), then runs {@code then} and commits. Fails when either side ends
     * with an error.
     */
    private void interleave(Runnable first, Runnable then, Runnable contender) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            CompletableFuture<Integer> holderPid = new CompletableFuture<>();
            CountDownLatch resume = new CountDownLatch(1);
            Future<?> holder =
                    pool.submit(
                            () ->
                                    transaction.executeWithoutResult(
                                            status -> {
                                                announce(holderPid, first);
                                                awaitQuietly(resume);
                                                then.run();
                                            }));
            int pid = holderPid.get(STEP.toSeconds(), TimeUnit.SECONDS);
            Future<?> other = pool.submit(contender);
            try {
                awaitWaitingFor(pid, other);
            } finally {
                resume.countDown();
            }
            holder.get(STEP.toSeconds(), TimeUnit.SECONDS);
            other.get(STEP.toSeconds(), TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }
    }

    /**
     * Runs {@code stopped} while another session holds the row {@code heldId} of {@code table}, a
     * row {@code stopped} has to lock: it stops there, in the middle of its work. Then lets {@code
     * contender} run until it waits for a lock of {@code stopped} (or ends) and releases the row.
     * Fails when either of the two ends with an error.
     */
    private void runStoppedAt(String table, UUID heldId, Runnable stopped, Runnable contender)
            throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(3);
        try {
            CompletableFuture<Integer> blockerPid = new CompletableFuture<>();
            CountDownLatch release = new CountDownLatch(1);
            Future<?> blocker =
                    pool.submit(
                            () ->
                                    transaction.executeWithoutResult(
                                            status -> {
                                                announce(
                                                        blockerPid,
                                                        () ->
                                                                jdbc.queryForObject(
                                                                        "SELECT id FROM "
                                                                                + table
                                                                                + " WHERE id = ?"
                                                                                + " FOR UPDATE",
                                                                        UUID.class,
                                                                        heldId));
                                                awaitQuietly(release);
                                            }));
            Future<?> first;
            Future<?> other;
            try {
                int held = blockerPid.get(STEP.toSeconds(), TimeUnit.SECONDS);
                first = pool.submit(stopped);
                int stoppedPid = awaitWaiterOf(held, first);
                other = pool.submit(contender);
                awaitWaitingFor(stoppedPid, other);
            } finally {
                release.countDown();
            }
            blocker.get(STEP.toSeconds(), TimeUnit.SECONDS);
            first.get(STEP.toSeconds(), TimeUnit.SECONDS);
            other.get(STEP.toSeconds(), TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }
    }

    /** Runs the freshness job stopped at an item it has to write ({@link #runStoppedAt}). */
    private void runJobStoppedAt(UUID heldItemId, Runnable contender) throws Exception {
        runStoppedAt("inventory_item", heldItemId, () -> freshnessService.run(), contender);
    }

    /** Runs {@code work} and publishes the backend pid of the current transaction. */
    private void announce(CompletableFuture<Integer> pid, Runnable work) {
        try {
            work.run();
            pid.complete(jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class));
        } catch (RuntimeException | Error e) {
            pid.completeExceptionally(e);
            throw e;
        }
    }

    /** Waits until a session waits for a lock held by backend {@code pid}, or the task ended. */
    private void awaitWaitingFor(int pid, Future<?> task) throws InterruptedException {
        long deadline = System.nanoTime() + STEP.toNanos();
        while (System.nanoTime() < deadline) {
            if (task.isDone() || !waitersOf(pid).isEmpty()) {
                return;
            }
            Thread.sleep(20);
        }
        throw new AssertionError("The contender neither ended nor waited for backend " + pid);
    }

    /** The backend that waits for a lock held by backend {@code pid}; {@code task} must wait. */
    private int awaitWaiterOf(int pid, Future<?> task) throws InterruptedException {
        long deadline = System.nanoTime() + STEP.toNanos();
        while (System.nanoTime() < deadline && !task.isDone()) {
            List<Integer> waiters = waitersOf(pid);
            if (!waiters.isEmpty()) {
                return waiters.get(0);
            }
            Thread.sleep(20);
        }
        throw new AssertionError("Nothing stopped at the row held by backend " + pid);
    }

    /** Waits until {@code count} sessions wait for a lock held by backend {@code pid}. */
    private void awaitWaiters(int pid, int count) throws InterruptedException {
        long deadline = System.nanoTime() + STEP.toNanos();
        while (System.nanoTime() < deadline) {
            if (waitersOf(pid).size() >= count) {
                return;
            }
            Thread.sleep(20);
        }
        throw new AssertionError("Expected " + count + " session(s) waiting for backend " + pid);
    }

    private List<Integer> waitersOf(int pid) {
        return jdbc.queryForList(
                "SELECT pid FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND ? = ANY"
                        + " (pg_blocking_pids(pid))",
                Integer.class,
                pid);
    }

    private static void awaitQuietly(CountDownLatch latch) {
        try {
            if (!latch.await(STEP.toSeconds(), TimeUnit.SECONDS)) {
                throw new IllegalStateException("Not resumed");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }

    // ---------------------------------------------------------------------------------------
    // Fixtures and assertions
    // ---------------------------------------------------------------------------------------

    /** Sets the collector's discoverability in place: no event, so no listener reconciles. */
    private void setDiscoverable(UUID ownerId, boolean discoverable) {
        testUsers.update(
                "INSERT INTO privacy_settings (user_id, discoverable) VALUES (?, ?) ON CONFLICT"
                        + " (user_id) DO UPDATE SET discoverable = EXCLUDED.discoverable",
                ownerId,
                discoverable);
    }

    private String createBinder(String uid, String name, String visibility) {
        return callJson(HttpMethod.POST, "/api/v1/binders", uid, binder(name, visibility), 201)
                .path("id")
                .asString();
    }

    /** An item in a binder, or an unfiled PUBLIC one. */
    private String createItem(String uid, @Nullable String binderId, Map<String, Object> extra) {
        Map<String, Object> body = item(printingId);
        if (binderId != null) {
            body.put("binderId", binderId);
        } else {
            body.put("visibility", "PUBLIC");
        }
        body.putAll(extra);
        return callJson(HttpMethod.POST, ITEMS, uid, body, 201).path("id").asString();
    }

    /**
     * Two items of the binder whose ids ascend in the order of their creation (ids are random, so a
     * pair in the other order is deleted and replaced): the order in which a statement reaches them
     * is then the same with and without an {@code ORDER BY id}.
     */
    private List<String> createItemsInIdOrder(String uid, String binderId) {
        for (int attempt = 0; attempt < 20; attempt++) {
            String first = createItem(uid, binderId, Map.of());
            String second = createItem(uid, binderId, Map.of());
            if (ascending("inventory_item", first, second).get(0).equals(first)) {
                return List.of(first, second);
            }
            callJson(HttpMethod.DELETE, ITEMS + "/" + first, uid, null, 204);
            callJson(HttpMethod.DELETE, ITEMS + "/" + second, uid, null, 204);
        }
        throw new AssertionError("No pair of items in id order");
    }

    private String createTemporaryItem(String uid, @Nullable String binderId) {
        return createItem(
                uid,
                binderId,
                Map.of(
                        "visibility",
                        "TEMPORARILY_PUBLIC",
                        "publicUntil",
                        Instant.now().plus(Duration.ofHours(2)).toString()));
    }

    private void expire(String itemId) {
        testUsers.update(
                "UPDATE inventory_item SET public_until = now() - interval '1 minute' WHERE id = ?",
                uuid(itemId));
    }

    private void confirmedDaysAgo(String table, String id, int days) {
        testUsers.update(
                "UPDATE "
                        + table
                        + " SET confirmed_at = now() - make_interval(days => ?) WHERE id = ?",
                days,
                uuid(id));
    }

    private void bulk(String uid, String action, List<String> itemIds, Map<String, Object> extra) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("itemIds", itemIds);
        body.put("action", action);
        body.putAll(extra);
        assertThat(
                        callJson(HttpMethod.POST, ITEMS + "/bulk", uid, body, 200)
                                .path("updated")
                                .asInt())
                .isEqualTo(itemIds.size());
    }

    /** The materialised visibility flags of the owner's binders and live items. */
    private List<Object> listedFlags(UUID ownerId) {
        return testUsers
                .query(
                        "SELECT publicly_listed FROM binder WHERE owner_id = ? UNION ALL SELECT"
                                + " publicly_listed FROM inventory_item WHERE owner_id = ? AND"
                                + " deleted_at IS NULL",
                        ownerId,
                        ownerId)
                .stream()
                .map(row -> row.get("publicly_listed"))
                .toList();
    }

    /** {@code binder.item_count} equals the live items of every binder of the owner. */
    private void assertItemCountsMatch(UUID ownerId) {
        assertThat(
                        testUsers.query(
                                "SELECT b.id FROM binder b WHERE b.owner_id = ? AND b.item_count"
                                        + " <> (SELECT count(*) FROM inventory_item i WHERE"
                                        + " i.binder_id = b.id AND i.deleted_at IS NULL)",
                                ownerId))
                .as("binders whose item_count is off")
                .isEmpty();
    }

    private int itemCount(String binderId) {
        return testUsers.count("SELECT item_count FROM binder WHERE id = ?", uuid(binderId));
    }

    private boolean isLive(String itemId) {
        return testUsers.count(
                        "SELECT count(*) FROM inventory_item WHERE id = ? AND deleted_at IS NULL",
                        uuid(itemId))
                == 1;
    }

    private @Nullable Object column(String table, String column, String id) {
        return testUsers
                .query("SELECT " + column + " AS value FROM " + table + " WHERE id = ?", uuid(id))
                .get(0)
                .get("value");
    }

    /** The rows in ascending id as PostgreSQL orders them (not the order of {@link UUID}). */
    private List<String> ascending(String table, String... ids) {
        List<String> sorted = new ArrayList<>();
        for (Map<String, Object> row :
                testUsers.query(
                        "SELECT id::text AS id FROM "
                                + table
                                + " WHERE id = ANY (?::uuid[]) ORDER BY id",
                        "{" + String.join(",", ids) + "}")) {
            sorted.add((String) row.get("id"));
        }
        assertThat(sorted).hasSize(ids.length);
        return sorted;
    }

    private static UUID uuid(String id) {
        return UUID.fromString(id);
    }
}
