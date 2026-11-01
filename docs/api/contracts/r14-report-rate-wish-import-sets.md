# Stage R14 contract — Report, rating, reference, binders, wishes, import and sets (60 to 69)

> Owner prompt of 2026-10-19/20
> ([`docs/product/specs/2026-10-20-finish-the-phone-ui.md`](../../product/specs/2026-10-20-finish-the-phone-ui.md)),
> section "R14. Report, rating, reference, binders, wishes, import and sets (60 to 69)"; mockup v50
> screens 60 to 69. Extends [phase7-ratings-reports-admin.md](phase7-ratings-reports-admin.md) (the
> rating's eligibility) and [r4-messages-sales.md](r4-messages-sales.md) (sales). Two optional,
> nullable fields on one response, nothing else changed: no migration, no new endpoint, nothing
> removed or retyped; the paused web builds and passes its checks against the regenerated client,
> unchanged. Field-level truth: `../openapi.json`.

The screens keep every call they made before: `GET /public/report-reasons` and
`POST /reports/collectors` (60), `GET /ratings/eligibility`, `POST /ratings`, `PUT /ratings/{id}`
and `GET /collectors/{handle}/ratings` (61), `POST /references` (62), `POST /binders`,
`POST /inventory/bulk` and the binder's photos (63), `GET /cards`, `GET /cards/{id}`,
`GET /wishlist/price-terms`, `POST|PATCH|DELETE /wishlist` (64, 65), the inventory import's
endpoints (66 to 68, [s5-inventory-import.md](s5-inventory-import.md)), `GET /sets/{id}` (69). The
person at the top of 60 to 62 reads `GET /collectors/{handle}` (its picture and province, as the
caller may see them).

## `GET /api/v1/ratings/eligibility`: the deal of a sale (optional fields)

Rate a collector (61) names the deal under the collector: "Ash Blossom & Joyous Spring · sold to
you Oct 17" for the buyer, "… · bought from you Oct 17" for the seller. Each
`RatingEligibilityInteraction` gains two fields, always present:

| Field | Rule |
| --- | --- |
| `dealName` | nullable string: a `SALE` interaction's card or deck core as named when it was marked sold (`sale.name`); `null` for the other kinds, and for a sale the API no longer holds |
| `soldToYou` | nullable boolean: a `SALE` interaction, `true` when the caller bought it, `false` when the caller sold it; `null` for the other kinds |

- The ratings module reads them through an extension point it owns, `SaleDeals`, implemented by the
  deals module (`DealsExtensions`, `SaleService.deals`): ratings does not depend on deals, which
  depends on ratings for its interactions. Without the deals module the fields are `null`.
- The pure rule `RatingRules.soldTo(buyerId, me)` decides `soldToYou`.
- Nothing else of the sale is said: no tracking number, no seller or buyer id, no place.

Tests: `SaleIT.theRatingFormNamesTheDealForEachSide` (the buyer reads `soldToYou` true, the seller
false, the same `dealName`; no tracking number); `RatingEligibilityIT` (a conversation's interaction
carries both fields as `null`); `RatingRulesTest.aSaleIsSoldToTheCallerOnlyWhenTheCallerBoughtIt`;
`GeoPrivacyContractTest.chatSubjectsAndSalesCarryThePlaceOnly` (the eligibility after a sale names
the deal and carries no tracking number, place, city or party id).

## What the phone does with the other answers (no API change)

- **Report (60):** the reasons and their lines are the server's, as radio rows; "Send report" stays
  grey with "Choose a reason first." until one is chosen; 409 `REPORT_ALREADY_OPEN`, 422
  `CANNOT_REPORT_SELF`, 404 and 429 are said in place as before.
- **Rating (61):** Overall is required ("Publish rating" grey with "Choose an overall score first.");
  the details are optional and cleared by pressing their chosen star again; `meetupReliability` is
  never asked, and an edit keeps an old one (ADR 0018).
- **Wishes (64, 65):** "Add a wish" opens Search's card search (`GET /cards?query=&game=`, the
  browsed game); the card picked opens the form with the text typed, so a printing code typed picks
  that printing only when exactly one printing of the card has it (as stage S2). The price chips
  are "No price" and the terms of `GET /wishlist/price-terms`; at most one is sent as `priceTerm`.
- **Import (66 to 68):** "Use the newest" is `POST /inventory/imports/{id}/bulk`
  `{"action": "USE_MOST_RECENT_PRINTING"}`; the add button stays grey while lines need a printing
  unless the collector ticks "leave them out" (`skipUnresolved`). The file's name shown on "Check
  the cards" is the one this phone picked, kept in memory only: the API keeps no file name.
- **A set (69):** "Who has cards of this set" opens Search's card search with `GET /cards?set=`
  (the set's code, no text needed, every page); a printing of the grid opens Who has this card at
  that printing.

## Privacy (ADR 0017)

The two new fields carry no place and no person. The person at the top of 60 to 62 is "@handle ·
{province}" from the public profile as the caller may see it (the province of a discoverable
collector only), never the city. `GeoPrivacyContractTest` reads the eligibility after a sale.
