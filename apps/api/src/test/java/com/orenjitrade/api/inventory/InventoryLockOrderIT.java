package com.orenjitrade.api.inventory;

import static com.orenjitrade.api.inventory.InventoryTestSupport.binder;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

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
import com.orenjitrade.api.users.domain.DeletionParticipant;
import java.nio.charset.StandardCharsets;
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
import java.util.concurrent.TimeoutException;
import java.util.function.IntConsumer;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;

/**
 * The locks of inventory and binder writes. Every item write ends in a binder row ({@code
 * trg_inventory_item_binder_count} keeps {@code binder.item_count}, confirmations and moves refresh
 * the binder) and the listing reconciler writes binders before items, so a path that took the item
 * first deadlocked with it ({@code DELETE /inventory/items/{id}} answered 500 right after a privacy
 * change). The owner lock stands in front of the rows now (the writes of one collector run one
 * after the other); below it the rows are still taken in one order, binder rows first, then item
 * rows, each in ascending id. The freshness job writes every collector's rows without an owner
 * lock: it skips the rows another transaction holds, so it never waits for one.
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

    @Autowired
    @Qualifier("inventoryDeletionParticipant")
    private DeletionParticipant inventoryDeletion;

    private UUID printingId;

    /** The name of the card of {@link #printingId}: an import finds the card by it. */
    private String cardName;

    private TransactionTemplate transaction;

    /** The collectors of the current test. */
    private final List<UUID> collectors = new ArrayList<>();

    @BeforeEach
    void catalog() {
        InventoryTestSupport.ensureCatalog(importService);
        // A card of this test only: the suite shares the catalog and the regions, and some of
        // these collectors list dozens of copies.
        InventoryTestSupport.IsolatedCard card =
                InventoryTestSupport.isolatedCard(testUsers, "ygo-p001a");
        printingId = card.printingId();
        cardName = card.name();
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
        ADMIN_HIDE,
        TRADE_TRANSFER,
        /** The owner's undo of a delete (stage R2): the item was deleted before the test. */
        RESTORE
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
        List<String> items =
                ascending(
                        "inventory_item",
                        createItem(uid, binderId, Map.of()),
                        createItem(uid, binderId, Map.of()));
        String kept = items.get(0);
        String written = items.get(1);
        prepare(write, uid, written);
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
                            case CONFIRM, BULK_CONFIRM, ADMIN_RESTORE, ADMIN_HIDE, RESTORE -> 2;
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
        prepare(write, uid, written);
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
                            case CONFIRM, BULK_CONFIRM, ADMIN_RESTORE, ADMIN_HIDE, RESTORE -> 2;
                            default -> 1;
                        });
        assertThat(isLive(kept)).isTrue();
    }

    /** What a write needs before the test: the item that a restore brings back is deleted. */
    private void prepare(ItemWrite write, String uid, String itemId) {
        if (write == ItemWrite.RESTORE) {
            callJson(HttpMethod.DELETE, ITEMS + "/" + itemId, uid, null, 204);
        }
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
            case ADMIN_HIDE -> assertThat(inventoryService.hideListing(uuid(itemId))).isPresent();
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
            case RESTORE -> callJson(HttpMethod.POST, uri + "/restore", uid, null, 200);
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

    /**
     * An item photo locks its item row and nothing else, without the owner lock. A write that has
     * to unlist that item waits for the upload and unlists the item then: only the freshness job
     * skips a row that is held.
     */
    @Test
    void aBinderWriteWaitsForAnItemAPhotoUploadHolds() throws Exception {
        String uid = uniqueUid("lock-photo");
        UUID ownerId = collector(uid);
        setDiscoverable(ownerId, true);
        String binderId = createBinder(uid, "Listed", "PUBLIC");
        String item = createItem(uid, binderId, Map.of());
        assertThat(listedFlags(ownerId)).as("listed before").containsOnly(true);

        interleave(
                () ->
                        inventoryService.addImage(
                                ownerId, uuid(item), InventoryTestSupport.png(64, 64)),
                () -> {},
                () ->
                        callJson(
                                HttpMethod.POST,
                                "/api/v1/binders/" + binderId + "/unpublish",
                                uid,
                                null,
                                200));

        assertThat(listedFlags(ownerId)).as("nothing stays listed").containsOnly(false);
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
     * An admin hides a listing while the reconciliation of a privacy change of its owner runs (the
     * collector has just become discoverable). The reconciliation waits for the hide and finds the
     * item PRIVATE. Next to the uncommitted hide it decided "listed" on the item as it was before,
     * waited for the row and stored that: a hidden card flagged as listed, and announced as
     * published, until the next freshness job.
     */
    @Test
    void anItemHiddenByAnAdminDuringAPrivacyChangeIsNotListed() throws Exception {
        String uid = uniqueUid("lock-hide");
        UUID ownerId = collector(uid);
        String item = createItem(uid, null, Map.of());
        assertThat(listedFlags(ownerId)).as("not discoverable yet").containsExactly(false);
        // The privacy change itself (no event: the test runs the listener's reconciliation).
        setDiscoverable(ownerId, true);

        interleave(
                () -> assertThat(inventoryService.hideListing(uuid(item))).isPresent(),
                () -> {},
                () -> reconciler.owner(ownerId));

        assertThat(column("inventory_item", "visibility", item)).isEqualTo("PRIVATE");
        assertThat(listedFlags(ownerId)).as("the hidden item").containsExactly(false);
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
    // Item writes against rows of other modules that reference the items
    // ---------------------------------------------------------------------------------------

    /**
     * Offers, trade lines, trades and wishlist matches reference inventory items, and inserting
     * such a row takes a key-share lock on the item (the foreign key check). An item write does not
     * wait for a transaction that has inserted a reference to its item and is not committed yet: it
     * locks the row without claiming its key.
     */
    @ParameterizedTest
    @EnumSource(ItemWrite.class)
    void anItemWriteDoesNotWaitForAReferenceToItsItem(ItemWrite write) throws Exception {
        String uid = uniqueUid("lock-ref");
        UUID ownerId = collector(uid);
        String binderId = createBinder(uid, "Listed", "PUBLIC");
        String otherBinderId = createBinder(uid, "Other", "PUBLIC");
        String kept = createItem(uid, binderId, Map.of());
        String written = createItem(uid, binderId, Map.of());
        prepare(write, uid, written);

        endsWhile(
                () -> reference(ownerId, written),
                () -> perform(write, uid, ownerId, written, otherBinderId));

        assertItemCountsMatch(ownerId);
        assertThat(isLive(kept)).isTrue();
    }

    /** The same for an item photo, which locks the item row and nothing else. */
    @Test
    void aPhotoUploadDoesNotWaitForAReferenceToItsItem() throws Exception {
        String uid = uniqueUid("lock-ref-photo");
        UUID ownerId = collector(uid);
        String item = createItem(uid, null, Map.of());

        endsWhile(
                () -> reference(ownerId, item),
                () ->
                        inventoryService.addImage(
                                ownerId, uuid(item), InventoryTestSupport.png(64, 64)));

        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item_image WHERE item_id = ?",
                                uuid(item)))
                .isEqualTo(1);
    }

    /**
     * A new offer references the seller's card first and the buyer's trade card second; the
     * transfer of a completed trade between the same two collectors locks both items in ascending
     * id, which can be the other way round. Each then held the item the other one needed next (the
     * transfer answered 500, "deadlock detected") as long as the transfer claimed the full row
     * lock.
     */
    @Test
    void aTradeTransferNeverDeadlocksWithReferencesInsertedInOfferOrder() throws Exception {
        String oneUid = uniqueUid("lock-ref-one");
        String twoUid = uniqueUid("lock-ref-two");
        UUID one = collector(oneUid);
        UUID two = collector(twoUid);
        String itemOfOne = createItem(oneUid, null, Map.of());
        String itemOfTwo = createItem(twoUid, null, Map.of());
        // The seller's card is the higher id: the transfer takes the buyer's card first.
        boolean oneSells =
                ascending("inventory_item", itemOfOne, itemOfTwo).get(1).equals(itemOfOne);
        UUID seller = oneSells ? one : two;
        UUID buyer = oneSells ? two : one;
        String sellerItem = oneSells ? itemOfOne : itemOfTwo;
        String buyerItem = oneSells ? itemOfTwo : itemOfOne;

        interleave(
                () -> reference(seller, sellerItem),
                () -> reference(buyer, buyerItem),
                () ->
                        assertThat(
                                        inventoryService.reserveAndTransfer(
                                                List.of(
                                                        new TransferLine(
                                                                uuid(sellerItem), seller, 1),
                                                        new TransferLine(
                                                                uuid(buyerItem), buyer, 1))))
                                .allMatch(result -> result.removed()));

        assertThat(isLive(sellerItem)).isFalse();
        assertThat(isLive(buyerItem)).isFalse();
    }

    // ---------------------------------------------------------------------------------------
    // The owner lock in front of every write
    // ---------------------------------------------------------------------------------------

    /** A write to a collector's binders or inventory items, through its entry point. */
    enum OwnerWrite {
        ITEM_CREATE,
        ITEM_CREATE_IN_A_BINDER,
        ITEM_UPDATE,
        ITEM_DELETE,
        ITEM_RESTORE,
        ITEM_CONFIRM,
        ITEM_BULK,
        IMPORT_COMMIT,
        ITEM_ADMIN_RESTORE,
        ITEM_ADMIN_HIDE,
        TRADE_TRANSFER,
        BINDER_CREATE,
        BINDER_UPDATE,
        BINDER_PUBLISH,
        BINDER_UNPUBLISH,
        BINDER_ADMIN_UNPUBLISH,
        BINDER_CONFIRM,
        BINDER_DELETE,
        BINDER_REORDER,
        OWNER_RECONCILIATION,
        ITEM_PURGE,
        BINDER_PURGE,
        ACCOUNT_PURGE
    }

    /**
     * The owner lock is the first lock of every write to a collector's binders or items. While
     * another transaction holds it, the write waits, and it waits with no row in hand: every
     * binder, item and import preview of the collector can still be locked. A write that skipped
     * the lock would run next to the collector's other writes; one that took a row first would hold
     * it while it waits. The import preview is one of those rows: a commit that locked it, read the
     * limit or froze its rows before the owner lock would hold it here, and so would an account
     * purge that deleted the previews first.
     */
    @ParameterizedTest
    @EnumSource(OwnerWrite.class)
    void everyWriteStartsWithTheOwnerLock(OwnerWrite write) throws Exception {
        String uid = uniqueUid("lock-first");
        UUID ownerId = collector(uid);
        String binderId = createBinder(uid, "One", "PRIVATE");
        String otherBinderId = createBinder(uid, "Two", "PRIVATE");
        String filed = createItem(uid, binderId, Map.of());
        String unfiled = createItem(uid, null, Map.of());
        // A private mint card filed in the binder: the one an import adds its mint copies to (an
        // import never raises a card its owner shows), so the commit locks a binder and an item.
        createItem(uid, binderId, Map.of("visibility", "PRIVATE", "condition", "MINT"));
        // The preview of the commit and of the account purge, uploaded before the owner lock is
        // held: the write that waits for it is the commit, or the purge, itself.
        @Nullable String importId =
                write == OwnerWrite.IMPORT_COMMIT || write == OwnerWrite.ACCOUNT_PURGE
                        ? uploadImport(uid, importOf(2, 1))
                        : null;
        // The card an undo brings back, deleted before the owner lock is held.
        if (write == OwnerWrite.ITEM_RESTORE) {
            callJson(HttpMethod.DELETE, ITEMS + "/" + filed, uid, null, 204);
        }

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
                                                                        List.of(ownerId)));
                                                awaitQuietly(release);
                                            }));
            Future<?> writing;
            try {
                int pid = holderPid.get(STEP.toSeconds(), TimeUnit.SECONDS);
                writing =
                        pool.submit(
                                () ->
                                        perform(
                                                write,
                                                uid,
                                                ownerId,
                                                binderId,
                                                otherBinderId,
                                                filed,
                                                unfiled,
                                                importId));
                awaitWaiterOf(pid, writing);
                assertThatCode(() -> lockEveryRowOf(ownerId))
                        .as("no row is held while the write waits for the owner lock")
                        .doesNotThrowAnyException();
                if (importId != null) {
                    assertThat(
                                    testUsers.query(
                                            "SELECT i.status, (SELECT count(*) FROM"
                                                    + " inventory_import_row r WHERE r.import_id ="
                                                    + " i.id AND r.commit_chunk IS NOT NULL) AS"
                                                    + " frozen FROM inventory_import i WHERE i.id"
                                                    + " = ?",
                                            uuid(importId)))
                            .as("the preview is untouched while its write waits")
                            .singleElement()
                            .satisfies(
                                    row -> {
                                        assertThat(row.get("status")).isEqualTo("PENDING");
                                        assertThat(row.get("frozen")).isEqualTo(0L);
                                    });
                }
            } finally {
                release.countDown();
            }
            holder.get(STEP.toSeconds(), TimeUnit.SECONDS);
            writing.get(STEP.toSeconds(), TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }
        assertItemCountsMatch(ownerId);
    }

    private void perform(
            OwnerWrite write,
            String uid,
            UUID ownerId,
            String binderId,
            String otherBinderId,
            String filed,
            String unfiled,
            @Nullable String importId) {
        String binder = "/api/v1/binders/" + binderId;
        switch (write) {
            case ITEM_CREATE -> createItem(uid, null, Map.of());
            case ITEM_CREATE_IN_A_BINDER -> createItem(uid, binderId, Map.of());
            case ITEM_UPDATE ->
                    callJson(
                            HttpMethod.PATCH,
                            ITEMS + "/" + unfiled,
                            uid,
                            Map.of("quantity", 2),
                            200);
            case ITEM_DELETE -> callJson(HttpMethod.DELETE, ITEMS + "/" + filed, uid, null, 204);
            case ITEM_RESTORE ->
                    callJson(HttpMethod.POST, ITEMS + "/" + filed + "/restore", uid, null, 200);
            case ITEM_CONFIRM ->
                    callJson(HttpMethod.POST, ITEMS + "/" + filed + "/confirm", uid, null, 200);
            case ITEM_BULK ->
                    bulk(
                            uid,
                            "SET_AVAILABILITY",
                            List.of(filed, unfiled),
                            Map.of("availability", "TRADE"));
            case IMPORT_COMMIT -> {
                // The mint row is added to the private filed card (its binder and the item are
                // locked), the others become new items: the cards the collector shows are not
                // raised.
                JsonNode result = commit(uid, importId);
                assertThat(result.path("itemsMerged").asInt()).isEqualTo(1);
                assertThat(result.path("itemsCreated").asInt()).isEqualTo(2);
            }
            case ITEM_ADMIN_RESTORE ->
                    assertThat(inventoryService.restoreListing(uuid(filed))).isPresent();
            case ITEM_ADMIN_HIDE ->
                    assertThat(inventoryService.hideListing(uuid(filed))).isPresent();
            case TRADE_TRANSFER ->
                    assertThat(
                                    inventoryService.reserveAndTransfer(
                                            List.of(new TransferLine(uuid(filed), ownerId, 1))))
                            .allMatch(result -> result.removed());
            case BINDER_CREATE -> createBinder(uid, "Three", "PRIVATE");
            case BINDER_UPDATE ->
                    callJson(HttpMethod.PATCH, binder, uid, Map.of("name", "Renamed"), 200);
            case BINDER_PUBLISH ->
                    callJson(
                            HttpMethod.POST,
                            binder + "/publish",
                            uid,
                            Map.of("mode", "PUBLIC"),
                            200);
            case BINDER_UNPUBLISH ->
                    callJson(HttpMethod.POST, binder + "/unpublish", uid, null, 200);
            case BINDER_ADMIN_UNPUBLISH ->
                    assertThat(binderService.adminUnpublish(uuid(binderId))).isPresent();
            case BINDER_CONFIRM -> callJson(HttpMethod.POST, binder + "/confirm", uid, null, 200);
            case BINDER_DELETE -> callJson(HttpMethod.DELETE, binder, uid, null, 204);
            case BINDER_REORDER ->
                    callJson(
                            HttpMethod.PUT,
                            "/api/v1/binders/reorder",
                            uid,
                            Map.of("binderIds", List.of(otherBinderId, binderId)),
                            200);
            case OWNER_RECONCILIATION -> reconciler.owner(ownerId);
            case ITEM_PURGE -> inventoryService.purge(ownerId);
            case BINDER_PURGE -> binderService.purge(ownerId);
            // The inventory's part of the account purge, in one transaction as the purge runs it:
            // the items and then the import previews.
            case ACCOUNT_PURGE ->
                    transaction.executeWithoutResult(status -> inventoryDeletion.purge(ownerId));
        }
    }

    /**
     * Locks every binder, item and import preview of the collector for a moment; fails when one is
     * held.
     */
    private void lockEveryRowOf(UUID ownerId) {
        transaction.executeWithoutResult(
                status -> {
                    for (String table : List.of("binder", "inventory_item", "inventory_import")) {
                        jdbc.queryForList(
                                "SELECT id FROM "
                                        + table
                                        + " WHERE owner_id = ? ORDER BY id FOR UPDATE NOWAIT",
                                UUID.class,
                                ownerId);
                    }
                });
    }

    /**
     * A commit plans what it writes before its transaction, without a lock. An edit of the preview
     * that is saved while the commit waits for the owner lock is part of that commit: it finds
     * another revision than it planned from and plans again. Without that check the row the
     * collector has just left out, and was told is left out, would be imported.
     */
    @Test
    void aCommitThatWaitedPlansAgainAfterAnEditOfItsPreview() throws Exception {
        String uid = uniqueUid("lock-replan");
        UUID ownerId = collector(uid);
        String importId = uploadImport(uid, importOf(2, 1));
        String base = ImportTestSupport.IMPORTS + "/" + importId;
        JsonNode rows = callJson(HttpMethod.GET, base + "/rows", uid, null, 200).path("items");
        assertThat(rows).hasSize(3);
        String mintRow = rows.get(1).path("id").asString();
        assertThat(rows.get(1).path("condition").asString()).isEqualTo("MINT");

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
                                                                        List.of(ownerId)));
                                                awaitQuietly(release);
                                            }));
            Future<JsonNode> committing;
            try {
                int pid = holderPid.get(STEP.toSeconds(), TimeUnit.SECONDS);
                committing = pool.submit(() -> commit(uid, importId));
                // The commit has planned its three rows and waits for the owner lock.
                awaitWaiterOf(pid, committing);
                JsonNode edited =
                        callJson(
                                HttpMethod.PATCH,
                                base + "/rows/" + mintRow,
                                uid,
                                Map.of("included", false),
                                200);
                assertThat(edited.path("row").path("included").asBoolean())
                        .as("the edit was saved and answered while the commit waited")
                        .isFalse();
            } finally {
                release.countDown();
            }
            holder.get(STEP.toSeconds(), TimeUnit.SECONDS);
            JsonNode result = committing.get(STEP.toSeconds(), TimeUnit.SECONDS);

            assertThat(result.path("rowsImported").asInt())
                    .as("the commit planned again: the row left out is not in it")
                    .isEqualTo(2);
            assertThat(result.path("itemsCreated").asInt()).isEqualTo(2);
        } finally {
            pool.shutdownNow();
        }
        assertThat(
                        testUsers.query(
                                "SELECT condition FROM inventory_item WHERE owner_id = ? AND"
                                        + " deleted_at IS NULL ORDER BY condition",
                                ownerId))
                .extracting(row -> row.get("condition"))
                .as("no mint card: the collector left that row out")
                .containsExactly("LIGHTLY_PLAYED", "NEAR_MINT");
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_import_row WHERE id = ? AND"
                                        + " commit_chunk IS NULL",
                                uuid(mintRow)))
                .isEqualTo(1);
    }

    // ---------------------------------------------------------------------------------------
    // The freshness job next to the writes
    // ---------------------------------------------------------------------------------------

    /**
     * The job has aged a binder and is about to age one of its items while the owner deletes that
     * item. The delete waits for the binder the job holds, with nothing in hand; the job goes on to
     * the items and ends, then the delete does.
     */
    @Test
    void anItemWriteWaitsForTheFreshnessJobAndBothEnd() throws Exception {
        UUID stopAt = collectorWithAnAgingBinder();
        String uid = uniqueUid("lock-job");
        UUID ownerId = collector(uid);
        setDiscoverable(ownerId, true);
        String binderId = createBinder(uid, "Aging", "PUBLIC");
        String kept = createItem(uid, binderId, Map.of());
        String written = createItem(uid, binderId, Map.of());
        confirmedDaysAgo("binder", binderId, 20);
        confirmedDaysAgo("inventory_item", kept, 20);
        confirmedDaysAgo("inventory_item", written, 20);

        runJobStoppedAtTheEventsOf(
                stopAt, () -> callJson(HttpMethod.DELETE, ITEMS + "/" + written, uid, null, 204));

        assertThat(isLive(written)).isFalse();
        assertThat(column("binder", "freshness_state", binderId)).isEqualTo("AGING");
        assertThat(column("inventory_item", "freshness_state", kept)).isEqualTo("AGING");
        assertItemCountsMatch(ownerId);
    }

    /**
     * The lock cycle the job used to close with a write of several binders: the job has made an
     * expired binder PRIVATE and still has to warn another binder of the same collector when that
     * collector reorders the binders. The reorder holds the binder the job wants next and waits for
     * the one the job holds. The job does not wait for it: it leaves that binder to its next run.
     */
    @Test
    void theFreshnessJobLeavesABinderAWriteHoldsToItsNextRun() throws Exception {
        UUID stopAt = collectorWithAnAgingBinder();
        String uid = uniqueUid("lock-job-binders");
        UUID ownerId = collector(uid);
        setDiscoverable(ownerId, true);
        List<String> binders =
                ascending(
                        "binder",
                        createBinder(uid, "One", "PUBLIC"),
                        createBinder(uid, "Two", "PUBLIC"));
        // The job writes the higher binder in its first step and the lower one in its last
        // binder step; the reorder takes the lower one first.
        String warned = binders.get(0);
        String expired = binders.get(1);
        testUsers.update(
                "UPDATE binder SET visibility = 'TEMPORARILY_PUBLIC', public_until = now() -"
                        + " interval '1 minute' WHERE id = ?",
                uuid(expired));
        dueForAWarning("binder", warned);

        runJobStoppedAtTheEventsOf(
                stopAt,
                () ->
                        callJson(
                                HttpMethod.PUT,
                                "/api/v1/binders/reorder",
                                uid,
                                Map.of("binderIds", List.of(warned, expired)),
                                200));

        assertThat(column("binder", "visibility", expired)).isEqualTo("PRIVATE");
        assertThat(column("binder", "sort_order", warned)).isEqualTo(0);
        assertThat(column("binder", "sort_order", expired)).isEqualTo(1);
        assertThat(column("binder", "warned_at", warned))
                .as("held by the reorder while the job ran")
                .isNull();

        freshnessService.run();
        assertThat(column("binder", "warned_at", warned)).as("the next run").isNotNull();
    }

    /** A write that holds the binder of an item and then needs the item. */
    enum BinderHolder {
        ITEM_CONFIRMATION,
        BINDER_CONFIRMATION,
        BINDER_DELETE,
        PRIVACY_RECONCILIATION
    }

    /**
     * The job hides an item and then unlists it: two updates of one row in one transaction, and
     * PostgreSQL re-runs the foreign key checks of a row the transaction itself wrote before, among
     * them a key-share lock on the item's binder. Between the two updates a write of the owner
     * takes that binder and waits for the item. The job does not wait for the binder, because no
     * write takes the full row lock of a binder (while they did, each waited for the other: 500,
     * "deadlock detected").
     */
    @ParameterizedTest
    @EnumSource(BinderHolder.class)
    void theFreshnessJobNeverWaitsForTheBinderOfAnItemItWritesTwice(BinderHolder holder)
            throws Exception {
        UUID stopAt = collectorWithAnAgingItem();
        String uid = uniqueUid("lock-job-twice");
        UUID ownerId = collector(uid);
        setDiscoverable(ownerId, true);
        String binderId = createBinder(uid, "Listed", "PUBLIC");
        String item = createItem(uid, binderId, Map.of());
        confirmedDaysAgo("inventory_item", item, 50);

        runJobStoppedAtTheEventsOf(
                stopAt,
                () -> {
                    switch (holder) {
                        case ITEM_CONFIRMATION ->
                                callJson(
                                        HttpMethod.POST,
                                        ITEMS + "/" + item + "/confirm",
                                        uid,
                                        null,
                                        200);
                        case BINDER_CONFIRMATION ->
                                callJson(
                                        HttpMethod.POST,
                                        "/api/v1/binders/" + binderId + "/confirm",
                                        uid,
                                        null,
                                        200);
                        // Deletes the binder row itself, after it has unfiled the item.
                        case BINDER_DELETE ->
                                callJson(
                                        HttpMethod.DELETE,
                                        "/api/v1/binders/" + binderId,
                                        uid,
                                        null,
                                        204);
                        case PRIVACY_RECONCILIATION -> {
                            setDiscoverable(ownerId, false);
                            reconciler.owner(ownerId);
                        }
                    }
                });

        assertThat(
                        testUsers
                                .query(
                                        "SELECT event FROM inventory_freshness_event WHERE item_id"
                                                + " = ? ORDER BY created_at, id",
                                        uuid(item))
                                .stream()
                                .map(row -> row.get("event")))
                .as("the job hid the item")
                .contains("HIDDEN");
        if (holder == BinderHolder.PRIVACY_RECONCILIATION || holder == BinderHolder.BINDER_DELETE) {
            assertThat(column("inventory_item", "freshness_state", item)).isEqualTo("HIDDEN");
            assertThat(listedFlags(ownerId)).as("nothing stays listed").containsOnly(false);
        } else {
            // The confirmation came after the job: the item is fresh and listed again.
            assertThat(column("inventory_item", "freshness_state", item)).isEqualTo("ACTIVE");
            assertThat(listedFlags(ownerId)).as("listed again").containsOnly(true);
        }
    }

    /** What a binder delete does with the items of the binder. */
    enum BinderDelete {
        WITH_ITS_ITEMS,
        ITEMS_UNFILED
    }

    /**
     * An item deleted earlier keeps its binder. A binder deleted together with its items locks only
     * the live ones, so the deleted one is reached by the {@code DELETE} of the binder itself,
     * through the foreign key ({@code ON DELETE SET NULL}), when the binder is held with the full
     * row lock. A job that had written that item once waited for the binder at its second write
     * (the foreign key check PostgreSQL re-runs) while the delete waited for the item: 500,
     * "deadlock detected". Here the deleted item is due for the two writes the job had for it: its
     * temporary publication has ended and a listed flag was left on it. The job is stopped between
     * the two statements and the owner deletes the binder. The job writes a deleted item at most
     * once per run (the flag), so it never asks for the binder. Deleted without its items, the
     * binder unfiles every item it holds, deleted ones included, before its {@code DELETE}.
     */
    @ParameterizedTest
    @EnumSource(BinderDelete.class)
    void aBinderDeleteNeverDeadlocksWithTheFreshnessJobOverAnItemDeletedEarlier(BinderDelete delete)
            throws Exception {
        UUID stopAt = collectorWithAnAgingItem();
        String uid = uniqueUid("lock-job-deleted");
        UUID ownerId = collector(uid);
        setDiscoverable(ownerId, true);
        String binderId = createBinder(uid, "Doomed", "PUBLIC");
        String kept = createItem(uid, binderId, Map.of());
        String gone = createTemporaryItem(uid, binderId);
        callJson(HttpMethod.DELETE, ITEMS + "/" + gone, uid, null, 204);
        assertThat(column("inventory_item", "binder_id", gone))
                .as("a deleted item keeps its binder")
                .isEqualTo(uuid(binderId));
        // The publication ends, and a job run that overlapped the delete left the flag (the stored
        // flag can be one run behind: docs/database/schema.md, "Not covered").
        testUsers.update(
                "UPDATE inventory_item SET public_until = now() - interval '1 minute',"
                        + " publicly_listed = true WHERE id = ?",
                uuid(gone));
        boolean deleteItems = delete == BinderDelete.WITH_ITS_ITEMS;

        runJobStoppedAtTheEventsOf(
                stopAt,
                () ->
                        callJson(
                                HttpMethod.DELETE,
                                "/api/v1/binders/" + binderId + "?deleteItems=" + deleteItems,
                                uid,
                                null,
                                204));

        assertThat(testUsers.count("SELECT count(*) FROM binder WHERE id = ?", uuid(binderId)))
                .as("the binder is deleted")
                .isZero();
        assertThat(isLive(kept)).isEqualTo(!deleteItems);
        assertThat(column("inventory_item", "binder_id", gone)).isNull();
        assertThat(column("inventory_item", "publicly_listed", gone))
                .as("no flag stays on the deleted item")
                .isEqualTo(false);
    }

    /**
     * The photo purge ({@code inventory-photo-purge}, stage R2) closes the restore windows that
     * have passed and skips the rows another transaction holds, like every job statement. A binder
     * delete holds the cards deleted from that binder while it ends their undo (and deletes their
     * photos itself): the purge does not wait for it, closes the other windows that have passed,
     * and leaves those cards to the delete.
     */
    @Test
    void thePhotoPurgeNeverWaitsForTheDeletedCardsABinderDeleteHolds() throws Exception {
        String uid = uniqueUid("lock-photo-purge");
        UUID ownerId = collector(uid);
        String binderId = createBinder(uid, "Doomed", "PRIVATE");
        String kept = createItem(uid, binderId, Map.of());
        String inTheBinder = createItem(uid, binderId, Map.of());
        String unfiled = createItem(uid, null, Map.of());
        for (String item : List.of(inTheBinder, unfiled)) {
            inventoryService.addImage(ownerId, uuid(item), InventoryTestSupport.png(64, 64));
            callJson(HttpMethod.DELETE, ITEMS + "/" + item, uid, null, 204);
            testUsers.update(
                    "UPDATE inventory_item SET restorable_until = now() - interval '1 minute'"
                            + " WHERE id = ?",
                    uuid(item));
        }

        endsWhile(
                () -> binderService.delete(ownerId, uuid(binderId), false),
                () -> inventoryService.closeRestoreWindows(500));

        assertThat(photos(unfiled)).as("the purge closed the window nobody held").isZero();
        assertThat(column("inventory_item", "restorable_until", unfiled)).isNull();
        assertThat(photos(inTheBinder)).as("the binder delete deleted those photos").isZero();
        assertThat(column("inventory_item", "restorable_until", inTheBinder)).isNull();
        assertThat(testUsers.count("SELECT count(*) FROM binder WHERE id = ?", uuid(binderId)))
                .isZero();
        assertThat(isLive(kept)).isTrue();
    }

    private int photos(String itemId) {
        return testUsers.count(
                "SELECT count(*) FROM inventory_item_image WHERE item_id = ?", uuid(itemId));
    }

    /** A statement of the freshness job, by the table it writes and what it does there. */
    enum JobStep {
        BINDER_EXPIRY("binder"),
        BINDER_FRESHNESS("binder"),
        BINDER_LISTING("binder"),
        BINDER_WARNING("binder"),
        ITEM_EXPIRY("inventory_item"),
        ITEM_FRESHNESS("inventory_item"),
        ITEM_LISTING("inventory_item"),
        ITEM_WARNING("inventory_item");

        private final String table;

        JobStep(String table) {
            this.table = table;
        }
    }

    /**
     * No statement of the job waits for a row: with a row it has to write held by another
     * transaction, the run ends while the row is still held, having written the other row that was
     * due in the same statement. The next run writes the row that was held.
     */
    @ParameterizedTest
    @EnumSource(JobStep.class)
    void theFreshnessJobNeverWaitsForARow(JobStep step) throws Exception {
        String uid = uniqueUid("lock-job-skip");
        UUID ownerId = collector(uid);
        boolean warning = step == JobStep.BINDER_WARNING || step == JobStep.ITEM_WARNING;
        // Only listed rows are warned.
        setDiscoverable(ownerId, warning);
        String held = dueFor(step, uid);
        String free = dueFor(step, uid);
        if (step == JobStep.BINDER_LISTING || step == JobStep.ITEM_LISTING) {
            // Created unlisted; listed by the rules from now on (no reconciliation ran).
            setDiscoverable(ownerId, true);
        }
        assertThat(isWritten(step, held)).isFalse();
        assertThat(isWritten(step, free)).isFalse();

        endsWhile(() -> lockRow(step.table, held), () -> freshnessService.run());

        assertThat(isWritten(step, free)).as("the row nobody held").isTrue();
        assertThat(isWritten(step, held)).as("the row that was held").isFalse();

        freshnessService.run();
        assertThat(isWritten(step, held)).as("the next run").isTrue();
    }

    /** A row the given statement of the job has to write, and no other statement before it. */
    private String dueFor(JobStep step, String uid) {
        return switch (step) {
            case BINDER_EXPIRY -> {
                String id = createBinder(uid, "Expired", "PRIVATE");
                testUsers.update(
                        "UPDATE binder SET visibility = 'TEMPORARILY_PUBLIC', public_until = now()"
                                + " - interval '1 minute' WHERE id = ?",
                        uuid(id));
                yield id;
            }
            case BINDER_FRESHNESS -> {
                String id = createBinder(uid, "Aging", "PRIVATE");
                confirmedDaysAgo("binder", id, 20);
                yield id;
            }
            case BINDER_LISTING -> createBinder(uid, "Listed", "PUBLIC");
            case BINDER_WARNING -> {
                String id = createBinder(uid, "Stale", "PUBLIC");
                dueForAWarning("binder", id);
                yield id;
            }
            case ITEM_EXPIRY -> {
                String id = createTemporaryItem(uid, null);
                expire(id);
                yield id;
            }
            case ITEM_FRESHNESS -> {
                String id = createItem(uid, null, Map.of());
                confirmedDaysAgo("inventory_item", id, 20);
                yield id;
            }
            case ITEM_LISTING -> createItem(uid, null, Map.of());
            case ITEM_WARNING -> {
                String id = createItem(uid, null, Map.of());
                dueForAWarning("inventory_item", id);
                yield id;
            }
        };
    }

    /** Whether the given statement of the job has written the row. */
    private boolean isWritten(JobStep step, String id) {
        return switch (step) {
            case BINDER_EXPIRY, ITEM_EXPIRY ->
                    "PRIVATE".equals(column(step.table, "visibility", id));
            case BINDER_FRESHNESS, ITEM_FRESHNESS ->
                    "AGING".equals(column(step.table, "freshness_state", id));
            case BINDER_LISTING, ITEM_LISTING ->
                    Boolean.TRUE.equals(column(step.table, "publicly_listed", id));
            case BINDER_WARNING, ITEM_WARNING -> column(step.table, "warned_at", id) != null;
        };
    }

    /** A write of one item that is in progress when the job runs. */
    enum WriteInProgress {
        OWNER_CONFIRMATION,
        PHOTO_UPLOAD
    }

    /**
     * The job runs while a write of an item it has to age is not committed yet. It does not wait
     * for the write and leaves the item alone; its next run decides on the item as the write left
     * it: a confirmed item stays fresh, any other is aged then.
     */
    @ParameterizedTest
    @EnumSource(WriteInProgress.class)
    void theFreshnessJobLeavesAnItemBeingWrittenToItsNextRun(WriteInProgress write)
            throws Exception {
        String uid = uniqueUid("lock-job-write");
        UUID ownerId = collector(uid);
        String item = createItem(uid, null, Map.of());
        confirmedDaysAgo("inventory_item", item, 20);

        endsWhile(
                () -> {
                    switch (write) {
                        case OWNER_CONFIRMATION -> inventoryService.confirm(ownerId, uuid(item));
                        case PHOTO_UPLOAD ->
                                inventoryService.addImage(
                                        ownerId, uuid(item), InventoryTestSupport.png(64, 64));
                    }
                },
                () -> freshnessService.run());

        assertThat(column("inventory_item", "freshness_state", item))
                .as("held by the write while the job ran")
                .isEqualTo("ACTIVE");

        freshnessService.run();
        assertThat(column("inventory_item", "freshness_state", item))
                .as("the next run")
                .isEqualTo(write == WriteInProgress.OWNER_CONFIRMATION ? "ACTIVE" : "AGING");
    }

    // ---------------------------------------------------------------------------------------
    // Everything at once
    // ---------------------------------------------------------------------------------------

    /**
     * Bounded stress: one collector's writes of every kind at the same time (two requests adding to
     * one binder, moves between binders, confirmations and edits of the items being moved, deletes,
     * edits of unfiled items, a binder published and unpublished, reorders, privacy
     * reconciliations) next to two workers that run the freshness job in a loop. None may fail, in
     * particular not with a deadlock, and the binder counts stay right.
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
                        },
                        round -> freshnessService.run(),
                        round -> freshnessService.run());

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

    /**
     * Bounded stress for the import (stage S5): commits of imports of one collector, each of them
     * raising items filed in a binder and an unfiled one, next to that collector's item writes
     * (creations, edits, deletes, moves between the two binders), privacy reconciliations and two
     * workers that run the freshness job. None may fail, in particular not with a deadlock; the
     * binder counts stay right and every copy of every import is in the inventory exactly once.
     */
    @Test
    void anImportCommitNextToTheOtherWritesNeverDeadlocks() throws Exception {
        int rounds = 12;
        String uid = uniqueUid("lock-import");
        UUID ownerId = collector(uid);
        setDiscoverable(ownerId, true);
        String first = createBinder(uid, "First", "PUBLIC");
        String second = createBinder(uid, "Second", "PUBLIC");
        // The items the imports add copies to (private ones: an import never raises a card its
        // owner shows); another worker moves both between the binders.
        String nearMint = createItem(uid, first, Map.of("visibility", "PRIVATE"));
        String mint = createItem(uid, first, Map.of("visibility", "PRIVATE", "condition", "MINT"));
        List<String> movers = List.of(nearMint, mint);
        List<String> doomed = new ArrayList<>();
        for (int index = 0; index < rounds; index++) {
            doomed.add(createItem(uid, index % 2 == 0 ? first : second, Map.of()));
        }
        // Deleting a doomed near mint item must never take the copies an import adds: the import
        // adds them to the private equal item created above, never to one of these public ones.
        List<IntConsumer> writers =
                List.of(
                        round -> {
                            JsonNode result = commitImport(uid, importOf(1, 2));
                            assertThat(result.path("copiesAdded").asInt()).isEqualTo(6);
                        },
                        round -> {
                            String created = createItem(uid, first, Map.of("condition", "DAMAGED"));
                            callJson(
                                    HttpMethod.PATCH,
                                    ITEMS + "/" + created,
                                    uid,
                                    Map.of("quantity", round + 2),
                                    200);
                            callJson(HttpMethod.DELETE, ITEMS + "/" + created, uid, null, 204);
                        },
                        round -> {
                            callJson(
                                    HttpMethod.DELETE,
                                    ITEMS + "/" + doomed.get(round),
                                    uid,
                                    null,
                                    204);
                            bulk(
                                    uid,
                                    "MOVE_TO_BINDER",
                                    movers,
                                    Map.of("binderId", round % 2 == 0 ? second : first));
                        },
                        round -> {
                            setDiscoverable(ownerId, round % 2 == 1);
                            reconciler.owner(ownerId);
                        },
                        round -> freshnessService.run(),
                        round -> freshnessService.run());

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
        assertThat(column("inventory_item", "quantity", nearMint))
                .as("one copy per import, added to the same item every time")
                .isEqualTo(1 + rounds);
        assertThat(column("inventory_item", "quantity", mint)).isEqualTo(1 + 2 * rounds);
        assertThat(
                        testUsers.query(
                                "SELECT quantity, visibility, binder_id FROM inventory_item WHERE"
                                        + " owner_id = ? AND deleted_at IS NULL AND condition ="
                                        + " 'LIGHTLY_PLAYED'",
                                ownerId))
                .as("the new item of the first import, raised by every later one")
                .singleElement()
                .satisfies(
                        row -> {
                            assertThat(row.get("quantity")).isEqualTo(3 * rounds);
                            assertThat(row.get("visibility")).isEqualTo("PRIVATE");
                            assertThat(row.get("binder_id")).isNull();
                        });
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item WHERE owner_id = ? AND"
                                        + " deleted_at IS NULL",
                                ownerId))
                .isEqualTo(3);
    }

    /**
     * A Collectr CSV of the card of this test: {@code nearMint} near mint copies, {@code mint} mint
     * copies and three lightly played ones. The card has one printing, so every row is ready.
     */
    private String importOf(int nearMint, int mint) {
        return "Product Name,Card Condition,Quantity\n"
                + cardName
                + ",Near Mint,"
                + nearMint
                + "\n"
                + cardName
                + ",Mint,"
                + mint
                + "\n"
                + cardName
                + ",Lightly Played,3\n";
    }

    /** Uploads a CSV import and commits it; returns the result of the commit. */
    private JsonNode commitImport(String uid, String csv) {
        return commit(uid, uploadImport(uid, csv));
    }

    /** Uploads a CSV import; returns the id of its preview. */
    private String uploadImport(String uid, String csv) {
        EntityExchangeResult<byte[]> uploaded =
                ImportTestSupport.upload(
                        http, bearer(uid), "COLLECTR_CSV", csv.getBytes(StandardCharsets.UTF_8));
        assertThat(uploaded.getStatus().value()).isEqualTo(201);
        return json(uploaded).path("id").asString();
    }

    /** Commits an import; returns the result of the commit. */
    private JsonNode commit(String uid, @Nullable String id) {
        JsonNode committed =
                callJson(
                        HttpMethod.POST,
                        ImportTestSupport.IMPORTS + "/" + id + "/commit",
                        uid,
                        null,
                        200);
        assertThat(committed.path("status").asString()).isEqualTo("COMMITTED");
        return committed.path("result");
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

    /**
     * Runs the freshness job stopped between two of its statements, lets {@code contender} run
     * until it waits for a row the job holds (or ends), then lets the job go on. The job never
     * waits for a binder or an item, so it is stopped at the one other lock it takes: the foreign
     * key check of a freshness event, on the account row of {@code ownerId}, which another session
     * holds here. Where that is depends on the collector: after the expired and the aged binders
     * are written and nothing else ({@link #collectorWithAnAgingBinder}), or after the items have
     * their new freshness and before they are unlisted ({@link #collectorWithAnAgingItem}).
     */
    private void runJobStoppedAtTheEventsOf(UUID ownerId, Runnable contender) throws Exception {
        runStoppedAt("user_account", ownerId, () -> freshnessService.run(), contender);
    }

    /** A collector whose only binder the next run of the job ages. */
    private UUID collectorWithAnAgingBinder() {
        String uid = uniqueUid("lock-job-stop");
        UUID ownerId = collector(uid);
        confirmedDaysAgo("binder", createBinder(uid, "Aging", "PRIVATE"), 20);
        return ownerId;
    }

    /** A collector without binders whose only item the next run of the job ages. */
    private UUID collectorWithAnAgingItem() {
        String uid = uniqueUid("lock-job-stop");
        UUID ownerId = collector(uid);
        confirmedDaysAgo("inventory_item", createItem(uid, null, Map.of()), 20);
        return ownerId;
    }

    /**
     * Runs {@code inProgress} in a transaction and, before that transaction ends, {@code work},
     * which must run to its end meanwhile: it may not wait for anything {@code inProgress} holds.
     * Fails when either of the two ends with an error.
     */
    private void endsWhile(Runnable inProgress, Runnable work) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            CompletableFuture<Integer> holderPid = new CompletableFuture<>();
            CountDownLatch release = new CountDownLatch(1);
            Future<?> holder =
                    pool.submit(
                            () ->
                                    transaction.executeWithoutResult(
                                            status -> {
                                                announce(holderPid, inProgress);
                                                awaitQuietly(release);
                                            }));
            try {
                holderPid.get(STEP.toSeconds(), TimeUnit.SECONDS);
                Future<?> running = pool.submit(work);
                try {
                    running.get(STEP.toSeconds() / 2, TimeUnit.SECONDS);
                } catch (TimeoutException e) {
                    throw new AssertionError(
                            "Still running: it waits for the transaction in progress", e);
                }
            } finally {
                release.countDown();
            }
            holder.get(STEP.toSeconds(), TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }
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
        throw new AssertionError("Nothing waited for a lock of backend " + pid);
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

    /** Locks a row in the current transaction. */
    private void lockRow(String table, String id) {
        jdbc.queryForObject(
                "SELECT id FROM " + table + " WHERE id = ? FOR UPDATE", UUID.class, uuid(id));
    }

    /**
     * Inserts a row that references the item, in the current transaction. Its foreign key check
     * takes the key-share lock on the item that an offer, a trade line, a trade or a wishlist match
     * takes (a freshness event here: the one referencing table without rows of its own to set up).
     */
    private void reference(UUID ownerId, String itemId) {
        jdbc.update(
                "INSERT INTO inventory_freshness_event (owner_id, item_id, event) VALUES (?, ?,"
                        + " 'AGED')",
                ownerId,
                uuid(itemId));
    }

    /** A stale row in its warning window: only the warning step of the job writes it. */
    private void dueForAWarning(String table, String id) {
        confirmedDaysAgo(table, id, 42);
        testUsers.update(
                "UPDATE " + table + " SET freshness_state = 'STALE' WHERE id = ?", uuid(id));
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
