package com.orenjitrade.api.search.infra;

import com.orenjitrade.api.binders.domain.PublicVisibilityRules;
import com.orenjitrade.api.cards.domain.CatalogText;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository;

/**
 * SQL fragments of the discovery queries (ADR 0012, ADR 0017). Geography is the collector's
 * self-declared country and subdivision only: there is no coordinate and no distance. Public
 * listings reuse the live rules of the binders and inventory modules ({@link
 * PublicVisibilityRules}, {@link InventoryItemRepository#LISTED}).
 */
final class DiscoverySql {

    /**
     * Joins of an item query with the aliases {@link InventoryItemRepository#LISTED} expects
     * ({@code i}, {@code p}, {@code c}, {@code g}, {@code b}); the owner aliases {@code u} and
     * {@code ps} come from the enclosing query or {@link PublicVisibilityRules#ownerJoins}.
     */
    static final String ITEM_JOINS =
            """
             FROM inventory_item i
             JOIN card_printing p ON p.id = i.printing_id
             JOIN card c ON c.id = p.card_id
             JOIN game g ON g.id = c.game_id
             LEFT JOIN binder b ON b.id = i.binder_id
            """;

    /** The item is effectively public right now (needs {@link #ITEM_JOINS} and the owner). */
    static final String LISTED = InventoryItemRepository.LISTED;

    /**
     * Buyers see the card: listed on its own, or as a key card of a public deck core whatever its
     * own visibility ({@link InventoryItemRepository#SHOWN_PUBLICLY}; needs {@link #ITEM_JOINS} and
     * the owner). For what a binder shows of its cards, never for the card's own listings.
     */
    static final String SHOWN = InventoryItemRepository.SHOWN_PUBLICLY;

    /** Freshness rank of an item: 0 ACTIVE, 1 AGING, 2 STALE. */
    static final String FRESHNESS_RANK =
            "CASE i.freshness_state WHEN 'ACTIVE' THEN 0 WHEN 'AGING' THEN 1 ELSE 2 END";

    /**
     * The location of the user aliased {@code ownerColumn} ({@code ul}), its country ({@code co})
     * and subdivision ({@code sd}). An inner join: collectors without a location never appear.
     */
    static String locationJoins(String ownerColumn) {
        return " JOIN user_location ul ON ul.user_id = "
                + ownerColumn
                + " JOIN country co ON co.code = ul.country_code"
                + " JOIN subdivision sd ON sd.code = ul.subdivision_code";
    }

    /** The place columns of {@link #locationJoins} for {@code CollectorSearchRepository}. */
    static final String PLACE_COLUMNS =
            "co.region_code, ul.country_code, co.name AS country_name, ul.subdivision_code,"
                    + " sd.name AS subdivision_name, sd.whole_country";

    /**
     * The collector is discoverable: opted in, listed (ACTIVE account, profile not PRIVATE) and,
     * with {@link #locationJoins}, located. Needs {@code u} and {@code ps}.
     */
    static final String DISCOVERABLE =
            "COALESCE(ps.discoverable, false) AND " + PublicVisibilityRules.OWNER_LISTED;

    /** The collector's country is in the platform region {@code :region}. */
    static final String IN_REGION = "co.region_code = :region";

    /**
     * " AND no block exists, in either direction, between the viewer {@code :viewer} and the
     * collector in {@code ownerColumn}" ({@code user_block} of the messaging module, read-only).
     * Appended for a signed-in viewer to every query that counts or limits its rows: a collector
     * dropped after the SQL has counted or limited them leaves a total that is too high and a page
     * that comes back short.
     */
    static String notBlocked(String ownerColumn) {
        return " AND NOT EXISTS (SELECT 1 FROM user_block ub WHERE (ub.blocker_id = :viewer AND"
                + " ub.blocked_id = "
                + ownerColumn
                + ") OR (ub.blocker_id = "
                + ownerColumn
                + " AND ub.blocked_id = :viewer))";
    }

    /**
     * The effectively public binder aliased {@code alias} shows in public binder lists: it holds a
     * public item, or it is a deck core, which needs no cards (owner spec 2026-10-14, section 7; a
     * sold one is not effectively public). Needs no other alias.
     */
    static String binderShown(String alias) {
        return "("
                + alias
                + ".sells_as_core OR EXISTS (SELECT 1"
                + ITEM_JOINS
                + " WHERE i.binder_id = "
                + alias
                + ".id AND "
                + LISTED
                + "))";
    }

    /**
     * The binder aliased {@code alias} (owner {@code u}) matches the text of a binder search (stage
     * R3, for Search › Binders): its name or description (full text {@code :q}, name substring
     * {@code :contains}), its owner's handle ({@code :handle}, a substring) and, for a deck core,
     * the name of one of the cards buyers see as its key cards ({@link #SHOWN}: every live card of
     * a public deck core; never a card of a plain binder that is not public, a deleted card, or the
     * cards of a binder whose switch is off). {@link #binderTextParams} fills the parameters.
     */
    static String binderText(String alias) {
        return "("
                + alias
                + ".search_vector @@ websearch_to_tsquery('simple', unaccent_immutable(:q))"
                + " OR lower(unaccent_immutable("
                + alias
                + ".name)) LIKE :contains ESCAPE '\\'"
                + " OR u.handle LIKE :handle ESCAPE '\\'"
                + " OR ("
                + alias
                + ".sells_as_core AND EXISTS (SELECT 1"
                + ITEM_JOINS
                + " WHERE i.binder_id = "
                + alias
                + ".id AND "
                + SHOWN
                + " AND lower(unaccent_immutable(c.name)) LIKE :contains ESCAPE '\\')))";
    }

    /** The parameters of {@link #binderText}: {@code q}, {@code contains}, {@code handle}. */
    static void binderTextParams(String text, java.util.Map<String, Object> params) {
        String trimmed = text.trim();
        String escaped = CatalogText.escapeLike(CatalogText.normalise(trimmed));
        String handle = trimmed.startsWith("@") ? trimmed.substring(1) : trimmed;
        params.put("q", trimmed);
        params.put("contains", "%" + escaped + "%");
        params.put(
                "handle",
                "%"
                        + CatalogText.escapeLike(handle.trim().toLowerCase(java.util.Locale.ROOT))
                        + "%");
    }

    private DiscoverySql() {}
}
