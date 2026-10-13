# Stage S5 — inventory import: YDK deck files and Collectr CSV exports

Owner product change of 2026-10-08, section 6 (stage S5, 2026-10-13). Migrations:
`V113__inventory_import.sql` and `V114__inventory_import_review_fixes.sql` (review fix 1: the room
a commit reserves under the plan limit, and the printing choice `MOST_RECENT_ASSUMED`). Tables and
locks: `docs/database/schema.md`, "V113 — inventory import previews" and "Locks of binders and
inventory items". The exported `../openapi.json` is the field-level truth; this document says what
the fields mean and what a client does with them.

The phone is the client of this stage (owner order of 2026-10-12): an "Import" entry on the
Inventory tab. A web import screen is a recorded follow-up.

## The flow

1. **Upload** a file: it is parsed, matched to the catalog and stored as a **preview**. Nothing is
   added to the inventory.
2. **Edit** the preview: which sections of a deck count; per row the printing, the condition, the
   copies, in or out; two bulk actions.
3. **Commit**: the rows that are ready become inventory items (PRIVATE, unfiled), or raise the
   quantity of an equal **private** item the collector already has. Nothing an import adds is
   public: an item the collector shows is never raised.

A preview belongs to the collector who uploaded it. Every other caller, signed in or not, gets the
same `404 NOT_FOUND` as for an id that never existed (never a 403, never a detail). It is kept for
`previewTtlMinutes` (60 by default); a new upload replaces the collector's previews no commit has
started, so a collector has one open preview at a time. Uploads of one collector run one after
the other (also two sent at the same moment: the second replaces the preview of the first), and an
upload waits for an edit of the preview it replaces.

OrenjiTrade never calls or scrapes Collectr: the collector exports a CSV there and uploads it here.
Collectr's prices are never read: a price column matches no column the import uses, and the parser
only reads the columns it found. Nothing a file holds is ever logged.

## Endpoints

All under `/api/v1/inventory/imports`, bearer token required (401 otherwise), the actor is the
token's account.

| Route | Operation id | Answer |
| --- | --- | --- |
| `GET /limits` | `getInventoryImportLimits` | `InventoryImportLimits` `{ydkMaxBytes, ydkMaxLines, csvMaxBytes, csvMaxRows, previewTtlMinutes}`: the admin settings, for a check before the upload. The server applies them whatever the client did |
| `POST /?source=&game=` (multipart) | `createInventoryImport` | 201 `InventoryImportResponse` + `Location`. Multipart part `file`; query parameters `source` (`YDK` \| `COLLECTR_CSV`, required) and `game` (optional, `COLLECTR_CSV` only: the game slug of rows that name no game). The generated clients send both in the query string; the server also reads them as form fields of the multipart body. The declared type and the name of the file are ignored: the content decides |
| `GET /` | `listInventoryImports` | `[InventoryImportResponse]`, newest first, at most 20: the open preview (`PENDING`, not expired; at most one), a commit that was cut (`COMMITTING`) and recent results (`COMMITTED`) until they are purged. What an app that was closed in the middle of an import picks up again |
| `GET /{id}` | `getInventoryImport` | `InventoryImportResponse` |
| `GET /{id}/rows?status=&page=&size=` | `listInventoryImportRows` | `PageResponse<InventoryImportRow>` in file order; `status` = `READY` \| `CHOOSE_PRINTING` \| `UNMATCHED` (optional); `page` from 0, `size` 1-100 (default 50) |
| `PATCH /{id}` | `updateInventoryImport` | `{includeMain?, includeExtra?, includeSide?}` → `InventoryImportResponse`. YDK only (400 for a CSV) |
| `PATCH /{id}/rows/{rowId}` | `updateInventoryImportRow` | any subset of `{printingId, condition, quantity, included}` → `InventoryImportRowChange` `{row, preview}` |
| `POST /{id}/bulk` | `bulkUpdateInventoryImport` | `{action, condition?}` → `InventoryImportBulkResponse` `{updated, assumed, undecided, preview}` |
| `POST /{id}/commit` | `commitInventoryImport` | optional body `{skipUnresolved?}` → `InventoryImportResponse` with `status` `COMMITTED` and `result` |
| `DELETE /{id}` | `deleteInventoryImport` | 204: discards a preview no commit has started |

Admin (ADMIN or SUPER_ADMIN): `GET` / `PUT /api/v1/admin/inventory/import-settings`
(`getAdminInventoryImportSettings`, `updateAdminInventoryImportSettings`), body and answer
`{ydkMaxKb, ydkMaxLines, csvMaxKb, csvMaxRows, previewTtlMinutes}` (+ `updatedBy`, `updatedAt` in
the answer); any subset in the `PUT`; audited `inventory.import.settings.update`.

Service: `POST /internal/jobs/inventory-import-purge` (`runInventoryImportPurgeJob`) → `{removed}`.
The job has no schedule of its own: the hourly `freshness` job runs it afterwards (an expired
preview is refused when it is read, so purging within the hour is enough); the route runs it on
request.

## Generated clients

- `packages/shared-types` (the phone, `openapi-fetch`): the operation ids above are the keys of
  `operations`; the paths are `paths['/api/v1/inventory/imports']`,
  `['/api/v1/inventory/imports/limits']`, `['/api/v1/inventory/imports/{id}']`,
  `['…/{id}/rows']`, `['…/{id}/rows/{rowId}']`, `['…/{id}/bulk']`, `['…/{id}/commit']`. Schemas
  (`components['schemas'][…]`): `InventoryImportResponse`, `InventoryImportSections`,
  `InventoryImportSummary`, `InventoryImportResult`, `InventoryImportRow`,
  `InventoryImportRowSource`, `InventoryImportDeckCopies`, `InventoryImportCard`,
  `PageResponseInventoryImportRow`, `InventoryImportRowChange`, `InventoryImportBulkResponse`,
  `InventoryImportLimits`, `UpdateInventoryImportRequest`, `UpdateInventoryImportRowRequest`,
  `BulkInventoryImportRequest`, `CommitInventoryImportRequest`; `ProblemDetail` gained `reason`
  (import values), `fileLimit`, `missingColumns`, `unresolved`, `requested` and the four
  `IMPORT_*` error codes.
- The upload, as the item photo upload does it (`apps/mobile/src/api/hooks/inventory.ts`): a
  `FormData` with the part `file` (`localFilePart` on a device) passed through `bodySerializer`,
  and `params: { query: { source: 'YDK' } }`. The part's content type and file name do not matter.
- `packages/api-client` (Angular, for the day the web screen is built): `InventoryImportService`
  and `AdminInventoryImportService`, methods named after the operation ids.

## `InventoryImportResponse`

| Field | Meaning |
| --- | --- |
| `id` | the import |
| `source` | `YDK` \| `COLLECTR_CSV` |
| `status` | `PENDING` (a preview: edit, commit or discard), `COMMITTING` (a commit wrote some chunks and was cut: commit again), `COMMITTED` |
| `createdAt`, `expiresAt`, `committedAt` (null until committed) | `expiresAt`: until when the preview can be used; after a commit, until when the result stays readable |
| `sections` | YDK: `{includeMain, includeExtra, includeSide, mainCopies, extraCopies, sideCopies}`: which sections count, and the copies the file holds in each (recognised or not, whether the section counts or not); `null` for a CSV |
| `ignoredLines` | lines of the file that were no card (YDK: not a passcode; CSV: rows without a card name) |
| `summary` | `{rows, ready, toChoose, unmatched, leftOut, copies, items, mergedItems, defaultConditions, defaultCondition}`: every row; rows a commit imports; rows that still need a printing; rows that fit nothing; matched rows left out (by the collector or by the deck sections); copies the ready rows add; inventory items they write once equal rows are merged; of those items, the ones equal to a **private** item the collector already has (the commit raises it: `items - mergedItems` are new); matched rows whose condition nobody chose (the rows `SET_CONDITION` changes); the condition those rows have when they all have the same one (`DAMAGED` at first, the condition of the last `SET_CONDITION` afterwards; `null` when there is no such row or they differ). `ready + toChoose + unmatched + leftOut = rows`. `mergedItems` is a count of the preview, read without a lock: after the commit `result` says what was written |
| `result` | `null` until the commit starts, then `{itemsCreated, itemsMerged, copiesAdded, rowsImported, copiesNotAdded, chunksDone, totalChunks}`. `copiesNotAdded`: copies of the imported rows that were not added because one item holds at most 9 999 (equal rows together, or on top of the copies the collector had) |

## `InventoryImportRow`

| Field | Meaning |
| --- | --- |
| `id`, `position` | the row; its order in the file, from 0 |
| `status` | `READY` (a card and a printing), `CHOOSE_PRINTING` (a card, no printing yet), `UNMATCHED` (nothing fits: reported, never imported, never editable) |
| `unmatchedReason` | `UNKNOWN_PASSCODE` (YDK), `UNKNOWN_CARD`, `AMBIGUOUS_CARD` (several cards fit and the row does not tell them apart), `UNKNOWN_GAME` (a game OrenjiTrade does not have), `NO_PRINTING` (the catalog has the card but no printing of it), `INVALID_QUANTITY`, `CARD_REMOVED` (the card left the catalog after the preview); `null` otherwise |
| `source` | what the file says: `{passcode}` for YDK; `{name, set, number, rarity}` as written for CSV (the others `null`). Never a price |
| `deck` | YDK: `{main, extra, side}` copies per section; `null` for a CSV |
| `card` | `{id, name, game, imageUrl}`; `null` when `UNMATCHED`. `imageUrl` is OrenjiTrade's own URL |
| `printing` | the chosen printing as a `PrintingSummary` (the shape of `GET /cards/{id}/printings`), `null` while to choose |
| `printingChoice` | `AUTO` (the row fits exactly one printing), `MANUAL`, `MOST_RECENT` (the bulk action, decided by the release date), `MOST_RECENT_ASSUMED` (the bulk action, for a card its most recent set holds in several editions or finishes: the plain copy was taken, and the client says so on the row until the collector changes it), `null` |
| `printingCount` | printings of the card in the catalog. The chooser lists them with the existing `GET /api/v1/cards/{card.id}/printings` |
| `suggestedPrintingIds` | CSV: the printings that fit what the row says (its set, number, rarity, language, edition, finish), when that is fewer than all of them; at most 50; empty otherwise. A hint for the chooser ("fits your file"): **any** printing of the card may be chosen |
| `condition`, `conditionSource` | the condition code (`null` when `UNMATCHED`) and where it comes from: `DEFAULT` (the file names none: the row has the **lowest** condition of the game, `DAMAGED` for the four games, until the collector says otherwise), `FILE`, `EDITED` |
| `language`, `edition` | what the item gets: the file's when it names one, else the printing's; `null` while neither is known |
| `quantity`, `fileQuantity`, `quantityEdited` | the copies the row adds; the copies the file says (YDK: all sections together); whether the collector typed `quantity` |
| `included` | `false`: the collector left the row out |
| `inScope` | YDK: a section that counts holds the card; always `true` for a CSV |
| `willImport` | `READY` and `included` and `inScope`: what a commit takes |
| `ownedQuantity` | copies the collector already holds in an equal **private** item (same printing, condition, edition, language): the commit raises that item ("you have 2, this adds 3") |
| `shownQuantity` | copies the collector holds in equal items they **show** (visibility other than `PRIVATE`). The import never raises such an item: the copies of the row become, or join, a private item, and the client says so ("you show 1 publicly: that card stays as it is") |

## What the files are

**YDK** (YGOPro deck file). UTF-8 text; a byte-order mark and CRLF are accepted. Sections `#main`,
`#extra`, `!side` (any letter case); one passcode per line; other lines starting with `#` are
comments; blank lines mean nothing; a passcode before the first marker counts in the main deck;
leading zeros are dropped. A line that is none of that is counted in `ignoredLines` and never stops
the rest. A passcode repeated is as many copies: per section (`deck`) and in total
(`fileQuantity`). One row per passcode.

A passcode is matched to a Yu-Gi-Oh! card through `card.external_ref` (provider `ygoprodeck`, id =
passcode), then through the provider's artwork ids (`card_image.provider_image_id`): an alternate
artwork has a passcode of its own and is the card of that artwork. A deck file names no printing: a
row is `READY` only when its card has exactly one printing, otherwise `CHOOSE_PRINTING`. The
condition is the `DEFAULT`.

**Collectr CSV**. UTF-8 text (a byte-order mark is accepted); comma, semicolon or tab, detected
from the first line; fields may be quoted, with commas, line breaks and doubled quotes inside. The
first line titles the columns. The real header of Collectr's export is not confirmed, so the
columns are found by title through one table of aliases (`CollectrCsvFormat`; titles are compared
without case, accents, spaces and punctuation):

| Column | Titles it is found under | Needed |
| --- | --- | --- |
| card name | Product Name, Card Name, Name, Card, Product, Item Name, Title | **yes** |
| set (name or code) | Set, Set Name, Expansion, Expansion Name, Set Code, Release | no |
| number (collector number or printing code) | Card Number, Collector Number, Number, Card No, No, Printing Code, Card Code, Code | no |
| rarity | Rarity | no |
| variant (edition and finish wording) | Variance, Variant, Printing, Finish, Foil, Version | no |
| language | Language, Lang | no |
| condition | Card Condition, Condition, Cond | no |
| quantity | Quantity, Qty, Count, Amount, Copies, Owned | no (1 without it) |
| game | Category, Game, TCG, Category Name, Franchise | no |

A file without a card name column is refused (`MISSING_COLUMNS`) with a message that names the
column and the titles it is looked for under. Every other column is never read: prices ("Market
Price", "Average Cost Paid", "Price Override"), dates, notes, the portfolio name.

A row is matched by its name (case and accents do not matter; a trailing remark in brackets is
dropped when the full name finds nothing), in its game when it names one (or in the `game` of the
upload), told apart by its set and number when a name belongs to several cards, and by its number
when that is a full printing code and the name finds nothing. Then its printings are narrowed by
what the row says: set, number and rarity must fit (a row that says one of them and fits no
printing with it contradicts the catalog and is never preselected); language and edition narrow
when a printing has them, and otherwise belong to the copy (`language`, `edition` of the row). The
finish narrows too, but an item takes its finish from its printing: a row that names a finish none
of the remaining printings has ("Foil, English" where only the Japanese printing is a foil) is
never preselected, so a foil is not written as a normal copy without a word. A row that ends with
exactly one printing is `READY` (`AUTO`); one card and several printings is `CHOOSE_PRINTING` with
`suggestedPrintingIds`; nothing is `UNMATCHED`.

Conditions are read from the usual wordings (Near Mint / NM, Lightly Played / LP, Moderately Played
/ MP, Heavily Played / HP, Damaged / DMG, Mint); anything else ("Ungraded", a grade) is the
`DEFAULT`. A quantity is a whole number of copies from 1 to 9 999 ("3", "x3", "3.0"); "0", a word
or a larger number is `INVALID_QUANTITY` (a row is reported, never cut down to what an item holds).
A row of a game OrenjiTrade does not have (`UNKNOWN_GAME`) still says the copies its file wrote
(`fileQuantity`).

## Edits

- `PATCH /{id}` `{includeSide: false}`: a section that does not count gives none of its copies; a
  card that is in no section that counts has `inScope` false and leaves the import.
- `PATCH /{id}/rows/{rowId}`:
  - `printingId`: a printing of the row's card (400 `printingId` otherwise); `null` puts the row
    back to `CHOOSE_PRINTING`;
  - `condition`: one of the conditions of the card's game (`GET /games`), any letter case (400
    `condition` with the list otherwise); the source becomes `EDITED`;
  - `quantity`: 1-9999 (400 `quantity` otherwise); `null` goes back to the copies of the file;
  - `included`: `false` leaves the row out, `true` puts it back;
  - a row that is `UNMATCHED` cannot be changed: 409 `CONFLICT`.
- `POST /{id}/bulk`:
  - `{"action": "USE_MOST_RECENT_PRINTING"}`: every matched row without a printing gets the most
    recent printing of its card, by the release date of the set (a set without a date is the
    oldest), among `suggestedPrintingIds` when the row has some. Rows whose printing is chosen are
    left alone. `updated` = rows changed. When several printings share that most recent date, the
    date decides nothing:
    - if they are one printing in several editions or finishes (same set, number, code, rarity and
      language: a 1st Edition and an Unlimited copy, a foil and a normal one), the **plain copy**
      is taken (edition `UNLIMITED`, finish `NORMAL`: the copy that claims least, as the lowest
      condition does for a row whose file names none), the row gets `printingChoice`
      `MOST_RECENT_ASSUMED`, and `assumed` counts those rows (they are part of `updated`);
    - anything else (two rarities, two languages, two sets of one day, no date at all, no plain
      copy among them) is left to the collector: the row stays `CHOOSE_PRINTING` and `undecided`
      counts it. No edition, rarity, language or finish is ever taken because the alphabet put it
      first;
  - `{"action": "SET_CONDITION", "condition": "NEAR_MINT"}`: every matched row whose
    `conditionSource` is `DEFAULT` gets that condition (and stays `DEFAULT`, so the action can be
    repeated); rows of a game that does not have the condition are left alone; 400 when no row's
    game has it.

Every edit answers with the new counts. Edits are refused once a commit started (409
`IMPORT_ALREADY_COMMITTED`, `currentStatus`) and after `expiresAt` (410 `IMPORT_EXPIRED`).

## Commit

`POST /{id}/commit`, body optional.

- Rows with `willImport` go in. Rows that are equal (printing, condition, edition, language) are
  one item with their copies together (at most 9 999). A **private** item the collector already
  has with the same four values takes the copies (the oldest one); anything else is a new item:
  **PRIVATE**, unfiled, availability `COLLECTION_ONLY`, no price, no notes. An item the collector
  shows (visibility `PUBLIC` or `TEMPORARILY_PUBLIC`, wherever it is filed) is never raised: its
  equal rows become a private item next to it (`shownQuantity` tells the client), so an import
  changes nothing other collectors can see. (Decision of review fix 1, to be confirmed by the
  owner: the alternative is to raise the public item and say so before the commit.)
- Copies beyond the 9 999 of one item are not added, and `result.copiesNotAdded` says how many.
- Rows that still need a printing (`summary.toChoose > 0`) refuse the commit: 409
  `IMPORT_ROWS_UNRESOLVED` with `unresolved`. `{"skipUnresolved": true}` leaves them out instead.
  Nothing ready at all: 409 `IMPORT_EMPTY`.
- **Idempotent.** A second commit of the same import, also one sent while the first runs, adds
  nothing and answers the same `result`.
- **Chunks.** Up to 500 items are one transaction. Above that the import is written in chunks of
  500 items in file order, each its own transaction, all in the one request. If the request is cut
  between two chunks the import is `COMMITTING` (`result.chunksDone < result.totalChunks`): commit
  again and it continues after the last chunk written.
- **Limit.** The plan's `inventory.items.max` is checked for the whole import, every chunk of it,
  before the first item: 429 `LIMIT_REACHED` with `limitKey` `inventory.items.max`, `limit`,
  `used`, `requested` (the new items the import would add; rows that only raise a quantity add
  none), `planCode`, `upgradeUrl`; nothing is written and the preview stays editable. No plan has a
  number for this limit today (V113 seeds it unlimited), so the answer only appears once an admin
  sets one.
- **Reserved room.** From the moment a commit starts, the new items of its chunks still to write
  count as used (`inventory_import.chunk_new_items`): `POST /inventory/items`, a second import and
  `GET /me/plan` all see `used` = the collector's items + what the commits in progress have still
  to write. Nothing takes the room of a chunk that is still to come, so an import of several
  chunks ends at the limit, never beyond it. A commit that was cut keeps its room until it is
  finished (commit again) or purged (7 days).
- One case can still refuse a **later** chunk with 429 `LIMIT_REACHED`: the collector deleted,
  after the commit started, a card the import was going to raise and gave its room to another
  card. That line is a new item after all, and it is only written when the limit has room for it
  (`requested` = the items beyond what the commit reserved). The chunks written stay, the import
  stays `COMMITTING`, and a repeated commit continues once there is room.
- After the commit the items are ordinary inventory items (`GET /inventory/items`).

## Refusals

Problem Details (`application/problem+json`) with `errorCode`; the extensions are in the
`ProblemDetail` schema.

| When | Status | `errorCode` | Extensions |
| --- | --- | --- | --- |
| file larger than the limit of its source | 413 | `PAYLOAD_TOO_LARGE` | `reason` `TOO_LARGE`, `fileLimit` (bytes) |
| not UTF-8 text (binary content, another encoding) | 415 | `UNSUPPORTED_MEDIA_TYPE` | `reason` `NOT_TEXT` |
| YDK with more lines than the limit | 400 | `VALIDATION_FAILED` (`errors[].field` `file`) | `reason` `TOO_MANY_LINES`, `fileLimit` (lines) |
| CSV with more rows than the limit | 400 | `VALIDATION_FAILED` (`file`) | `reason` `TOO_MANY_ROWS`, `fileLimit` (rows) |
| CSV without a card name column | 400 | `VALIDATION_FAILED` (`file`) | `reason` `MISSING_COLUMNS`, `missingColumns` (`["card name"]`) |
| CSV whose quoting cannot be read | 400 | `VALIDATION_FAILED` (`file`) | `reason` `MALFORMED` |
| no content / no card in the file | 400 | `VALIDATION_FAILED` (`file`) | `reason` `EMPTY_FILE` / `NO_CARDS` |
| unknown `source`, unknown `game`, invalid edit | 400 | `VALIDATION_FAILED` | `errors[]` |
| another collector's import, an unknown id, a purged import | 404 | `NOT_FOUND` | |
| a preview past `expiresAt` | 410 | `IMPORT_EXPIRED` | |
| an edit or a discard after the commit started | 409 | `IMPORT_ALREADY_COMMITTED` | `currentStatus` |
| a change of an `UNMATCHED` row | 409 | `CONFLICT` | |
| a commit with rows to choose | 409 | `IMPORT_ROWS_UNRESOLVED` | `unresolved` |
| a commit with nothing ready | 409 | `IMPORT_EMPTY` | |
| a commit beyond the plan's inventory size (`used` includes what the collector's commits in progress have still to write) | 429 | `LIMIT_REACHED` | `limitKey`, `limit`, `used`, `requested`, `planCode`, `upgradeUrl` |
| more than 30 uploads, or 30 commits, in an hour | 429 | `RATE_LIMITED` | `limit`, `windowSeconds`, `retryAfterSeconds`, header `Retry-After` |

The `message` of a file refusal is written for the collector ("The file has more than 500 lines")
and never repeats anything the file holds.

## Limits

Admin settings `inventory.import.*` (`platform_settings`, cached 60 s, read at every upload):

| Setting | Default | Bounds | Why |
| --- | --- | --- | --- |
| `ydk_max_kb` | 100 | 1-1024 | owner spec |
| `ydk_max_lines` | 500 | 10-5000 | owner spec; every line counts, comments and blank ones too |
| `csv_max_kb` | 2048 | 16-8192 | a row of an export is about 200 bytes: 5 000 rows is about 1 MB, the rest is room for long names and notes; below the 10 MB the server accepts for any upload |
| `csv_max_rows` | 5000 | 10-20000 | ten chunks of 500 at the commit, which one request finishes in seconds; a larger collection is exported in parts or an admin raises the limit |
| `preview_ttl_minutes` | 60 | 5-1440 | "short-lived": long enough to choose printings on a phone |

A kB is 1 024 bytes. Rate limits (Redis, per collector): `inventory-import-upload` and
`inventory-import-commit`, 30 an hour each (`RATE_LIMIT_IMPORT_UPLOADS_PER_HOUR`,
`RATE_LIMIT_IMPORT_COMMITS_PER_HOUR`); reads and edits fall under the default 120 a minute.

`inventory.items.max` (`usage_limit`, TOTAL, usage = the collector's non-deleted items plus the new
items the collector's import commits in progress have still to write) is new with V113 and has no
number for any plan: no inventory limit existed before this stage. `POST /inventory/items` respects
it too (429 `LIMIT_REACHED`).

## What a client does

Learned from the review of the phone (review fix 1); a second client does the same:

- **The commit goes after the edits.** Edits are sent as they are made and can still be on their
  way when the commit is pressed. A client sends the commit only once every edit made before it
  was answered (the phone queues them in one mutation scope and holds the button, "Saving your
  changes…"): the API cannot know about an edit it has not received, and would import a card the
  collector sees as left out. An edit answered 409 `IMPORT_ALREADY_COMMITTED` (the import was
  committed elsewhere meanwhile) is said on the result: that change is not in the import.
- **Say what was assumed.** A row with `conditionSource` `DEFAULT` says its condition is not from
  the file; a row with `printingChoice` `MOST_RECENT_ASSUMED` says its copy was taken as the plain
  one; a row with `shownQuantity` says the public card stays as it is.
- **The lines that were not added stay readable.** After the commit `GET /{id}/rows?status=`
  (`UNMATCHED`, `CHOOSE_PRINTING`) still answers until the import is purged: the result lists
  them, with what the file said and what can be done about each.
- **The plan limit before the commit.** `GET /me/plan` gives `remaining` for
  `inventory.items.max`; `summary.items - summary.mergedItems` (plus `toChoose` at most) is what
  the import adds. After a refusal, `requested`, `limit` and `used` say how many to leave out.
- **A picked file is not kept.** On a device the system picker hands the app a copy of the file in
  its cache: the client deletes it once the upload answered, was refused or was abandoned (a
  Collectr export holds what its owner paid).

## Worked examples

Fictional data. `P1`, `P2`... stand for printing ids.

### A deck file

```
#created by a fictional player
#main
910000001
910000001
910000002
#extra
910000003
!side
910000002
919999999
```

`POST /api/v1/inventory/imports?source=YDK` (multipart: `file`) → 201

```json
{
  "id": "0b6f…", "source": "YDK", "status": "PENDING",
  "createdAt": "2026-10-13T12:00:00Z", "expiresAt": "2026-10-13T13:00:00Z", "committedAt": null,
  "sections": {"includeMain": true, "includeExtra": true, "includeSide": true, "mainCopies": 3, "extraCopies": 1, "sideCopies": 2},
  "ignoredLines": 0,
  "summary": {"rows": 4, "ready": 1, "toChoose": 2, "unmatched": 1, "leftOut": 0, "copies": 2, "items": 1, "mergedItems": 0, "defaultConditions": 3, "defaultCondition": "DAMAGED"},
  "result": null
}
```

`GET /api/v1/inventory/imports/0b6f…/rows` → four rows:

| position | `source.passcode` | `status` | notes |
| --- | --- | --- | --- |
| 0 | 910000001 | `READY` | one printing: `printing` set, `printingChoice` `AUTO`, `deck` `{main 2}`, `quantity` 2, `condition` `DAMAGED` (`DEFAULT`) |
| 1 | 910000002 | `CHOOSE_PRINTING` | two printings: `printing` null, `printingCount` 2, `deck` `{main 1, side 1}`, `quantity` 2 |
| 2 | 910000003 | `CHOOSE_PRINTING` | the alternate artwork of the same card (`card.id` as row 1), `deck` `{extra 1}` |
| 3 | 919999999 | `UNMATCHED` | `unmatchedReason` `UNKNOWN_PASSCODE`, `card` null |

Then, for example:

- `POST …/bulk` `{"action": "SET_CONDITION", "condition": "NEAR_MINT"}` → `{"updated": 3, "assumed": 0, "undecided": 0, "preview": {"summary": {"defaultConditions": 3, "defaultCondition": "NEAR_MINT", …}}}`
- `POST …/bulk` `{"action": "USE_MOST_RECENT_PRINTING"}` → `{"updated": 2, "assumed": 0, "undecided": 0, "preview": {"summary": {"ready": 3, "toChoose": 0, "copies": 5, "items": 2, …}}}`
  (the Heron's two printings are in two sets: the date decides, nothing is assumed; rows 1 and 2
  now have the same printing: they are one item of 3 copies)
- `PATCH …` `{"includeSide": false}` → row 1 has `quantity` 1; `summary.copies` 4
- `POST …/commit` → `{"status": "COMMITTED", "result": {"itemsCreated": 2, "itemsMerged": 0, "copiesAdded": 4, "rowsImported": 3, "copiesNotAdded": 0, "chunksDone": 1, "totalChunks": 1}, …}`

### A Collectr export

```
Portfolio Name,Category,Set,Product Name,Card Number,Rarity,Variance,Grade,Card Condition,Average Cost Paid,Quantity,Market Price (As of 2026-10-01),Price Override,Watchlist,Date Added,Notes
Main,Yu-Gi-Oh!,Azure Dawn,Azure-Eyes Sky Dragon,AZR-EN001,Ultra Rare,1st Edition,Ungraded,Near Mint,31.41,2,59.26,53.58,false,2026-09-30,
Main,Yu-Gi-Oh!,,Mirrorblade Knight,,,,,Lightly Played,4.00,1,6.10,,false,2026-09-30,
Main,Yu-Gi-Oh!,Some Set,Nobody Knows Me,EN404,Common,,,,1.00,3,1.20,,false,2026-09-30,
```

`POST /api/v1/inventory/imports?source=COLLECTR_CSV` (multipart: `file`) → 201, `sections`
null, `summary` `{rows 3, ready 1, toChoose 1, unmatched 1, copies 2, items 1}`. With the sample
catalog of the seed:

| position | `source.name` | `status` | notes |
| --- | --- | --- | --- |
| 0 | Azure-Eyes Sky Dragon | `READY` | set, code, rarity and "1st Edition" fit one printing (`AZR-EN001`, first edition): `AUTO`; `condition` `NEAR_MINT` (`FILE`); `quantity` 2; `edition` `FIRST_EDITION` |
| 1 | Mirrorblade Knight | `CHOOSE_PRINTING` | two printings (first edition, unlimited), nothing in the row tells them apart: `suggestedPrintingIds` empty; `condition` `LIGHTLY_PLAYED` (`FILE`) |
| 2 | Nobody Knows Me | `UNMATCHED` | `UNKNOWN_CARD`; `source` `{name, set "Some Set", number "EN404", rarity "Common"}`; `fileQuantity` 3 |

- `PATCH …/rows/{row 1}` `{"printingId": "P2"}` → `{"row": {"status": "READY", "printingChoice": "MANUAL", …}, "preview": {"summary": {"ready": 2, "toChoose": 0, …}}}`
  (or `POST …/bulk` `{"action": "USE_MOST_RECENT_PRINTING"}` → `{"updated": 1, "assumed": 1, "undecided": 0, …}`:
  the knight's set holds a 1st Edition and an Unlimited copy, the Unlimited one is taken and row 1
  says `printingChoice` `MOST_RECENT_ASSUMED`)
- `POST …/commit` → `result` `{itemsCreated 2, itemsMerged 0, copiesAdded 3, rowsImported 2, copiesNotAdded 0, …}`.
  Committed again: the same answer, nothing added. If the collector already had two near mint first
  edition English copies of `AZR-EN001` in a **private** item: the preview says
  `summary.mergedItems` 1 and row 0 `ownedQuantity` 2, the commit answers `itemsCreated 1,
  itemsMerged 1` and that item now holds 4. If those two copies were in an item the collector
  shows: row 0 says `ownedQuantity` 0 and `shownQuantity` 2, the commit answers `itemsCreated 2`,
  the public item still holds 2 and a new private item holds the 2 imported ones.

## End-to-end fixtures

The sample catalog of the seed is another provider than `ygoprodeck`, so no deck file matches it.
For the end-to-end suites only, `SEED_IMPORT_FIXTURES=true` (`orenji.seed.import-fixtures`) adds
three fictional things under the provider `ygoprodeck` (`ImportFixtureSeedContributor`): the card
`910000001` "Fixture Lantern Wisp" with one printing (`YDKF-EN001`), the card `910000002` "Fixture
Clockwork Heron" with two (`YDKF-EN002`, set of 2026-01-10, and `YDKR-EN002`, set of 2026-06-20:
the most recent), and the artwork `910000003` of the Heron. The deck file above is written for
them. The seed refuses to run while the real provider is enabled (`YGOPRODECK_ENABLED` must be
`false`, as the end-to-end harnesses set it): a database that imports the real catalog never gets
an invented passcode. The API's own tests create their cards themselves (`ImportTestSupport`).
