# Card scan: match the text read on a card, add the scanned cards

Owner spec 2026-10-15 (`docs/product/specs/2026-10-15-card-scan.md`), sections 3.5 and 3.6: "Scan
with camera" for Yu-Gi-Oh! cards. The phone reads each card's name and set code on the device (the
photo never leaves the phone) and sends only that text; the API finds the exact printing, and the
review list adds the ready cards in one call. Migration: `V124__card_text_scan_flag.sql` (the flag
`cardTextScan`, on). Locks: `docs/database/schema.md`, "Locks of binders and inventory items". The
exported `../openapi.json` is the field-level truth; this document says what the fields mean and what
the phone does with them.

| Route | Operation id | Tag | Answer |
| --- | --- | --- | --- |
| `POST /api/v1/cards/scan-match` | `matchScannedCard` | `card-scan` | `CardScanMatch` |
| `POST /api/v1/inventory/items/batch` | `addInventoryItemsBatch` | `inventory` | `AddInventoryItemsBatchResponse` |

Both need a bearer token (401 `UNAUTHENTICATED` without one; 403/428 like every signed-in route for
a suspended account or missing consents), take JSON, answer JSON, and are guarded by the feature
flag `cardTextScan`: while an admin has it off they answer **404 `FEATURE_DISABLED`** (extension
`feature: "cardTextScan"`). Rate limit: the default policy, 120 requests a minute per collector
(one photo per scan-match call). Every refusal is an RFC 9457 problem with `errorCode`, `message`,
`requestId`, `timestamp` (and `errors` `[{field, message}]` for a 400). Neither response holds a place (ADR 0017).

## `POST /api/v1/cards/scan-match`

One call per photo. A POST so the text read stays out of addresses and access logs; the server
never logs it (only the status and how many codes and names were read, without the caller). A
rejected body is logged at DEBUG with its request id, path and the exception's type, never with the
values it held.

### Body `CardScanMatchRequest`

| Field | Type | Rule |
| --- | --- | --- |
| `game` | string, required | `yugioh` (case and spaces ignored). Anything else: **400** `VALIDATION_FAILED`, field `game` |
| `codes` | string[] | 0 to 3 printing code candidates as read, best first; each at most 40 characters, no `null` |
| `names` | string[] | 0 to 3 name candidates as read, best first; each at most 150 characters, no `null` |

Both lists may be left out (empty). A malformed body, more than 3 entries, a longer entry or a
`null` entry: **400** `VALIDATION_FAILED`.

### How a read is matched

The server cleans each code again: upper case, spaces removed, `–`, `—`, `_`, `.`, `~` between the
parts read as `-`, only `A-Z 0-9 -` kept. Blank and repeated entries are dropped. Then, in at most
five grouped queries whatever the number of variants (a sixth for a code read in doubt, rule 5):

1. **Exact codes**: each code as read; the other form of an old code (`LOB-005 ↔ LOB-EN005`,
   `LOB-E001 → LOB-EN001`); a missing dash tried at each place it could go (a set part of 2 to 5
   characters; a set part may be digits only, like `2017-EN001`).
2. **Look-alike characters**, only when the catalog has the result: O↔0, D↔0, I↔1, L↔1, S↔5, B↔8,
   Z↔2, G↔6; letters become digits in the number part, digits become letters in the region, both
   ways in the set part; the fewest swaps first, at most 64 variants per code read.
3. **The name**: the cards `/cards/suggest` would suggest for each name read (equal normalised name,
   prefix and substring, full text, trigram), scored with PostgreSQL's `pg_trgm` similarity (1 for
   the same name after case, accents and spaces; a read cut short scores the share of the name it
   holds). A name is close from **0.5**; it points clearly to a card when it is close and leads the
   next card by 0.1 (or is the only exact one). A name close to no card counts as no name.
4. **Deciding**:
   - the code's card when it has the read name, or no name was read;
   - with no name, the first code read (best first) the catalog knows decides, and a look-alike
     variant counts only when it is the only one the catalog has;
   - the name clearly points to another card: the name wins, with that card's printing whose code
     is the one read or one look-alike character from it (3/8, 6/8, 5/6, 0/8 and 1/7 included) when
     exactly one is; otherwise its printing is unknown (PICK_PRINTING), **even when the card has a
     single printing**: the code read is not that printing's (another card's, a printing the
     catalog lacks), so the collector picks it; the code's card goes to `otherMatches`. With no code
     read, the name alone finds the card: FOUND when it has one printing;
   - several candidates and nothing to choose between them: NOT_FOUND (`AMBIGUOUS`), the candidates
     first in `otherMatches`.
5. **English cards only**: a code carrying another language's region (`FR`, `DE`, `IT`, `SP`, `PT`,
   `JP`, `KR`, or the old one-letter `F`, `G`, `I`, `S`, `P` before three digits, like `MACR-FR036` or
   `LOB-F001`) makes the answer NOT_FOUND (`OTHER_LANGUAGE`) **whatever the name says**, with no other
   match. So does a region read with look-alike characters: a digit there read as its letter (0 O/D,
   1 I/L, 2 Z, 5 S, 6 G, 8 B) and I/L or O/D taken for each other, before a number of digits (some
   may be look-alike letters, one at least a digit): `MACR-0E036` (DE), `SDK-1T001` or `SDK-LT001`
   (IT), `LOB-5P005` (SP), `LOB-5005` (the old S). E and N have no look-alike, so an English region is
   never taken for another language's. Printings whose language is not `en` or whose code has another
   language's region are never matched, listed or offered, not even as look-alikes. A read without
   its dash where one place of the dash gives another language's code and another an English one
   (`VLBDE005`: `VLB-DE005` or `VLBD-E005`; `VMCR0E036`) is in doubt, and the catalog settles it:
   English when it has one of its English places as read (`MRDE001` is the old Europe `MRD-E001`);
   English too, its old forms and look-alikes then allowed, when the Yu-Gi-Oh! catalog knows the set
   of one of its English places (a set with a printing) and none of the sets of its other
   language's places (`SR10EN0O1` is `SR10-EN0O1`, read `SR10-EN001`: the catalog has the set
   `SR10` and no set `SR1`); otherwise another language's: NOT_FOUND (`OTHER_LANGUAGE`), whatever
   the name says (`VLBDE005`: the catalog knows `VLB`). The other old form of a place is no place as
   read (owner, 2026-10-15): `CT10E001` is refused although the catalog has `CT10-EN001`, the other
   form of `CT10-E001`, because it knows `CT1`: it is the German `CT1-DE001` read with its dash lost
   and its D as 0 (batch B1 answered the English `CT10-EN001`, another card); the collector
   searches. The sets are a sixth grouped query, made only for a read in doubt. On the owner's
   catalog snapshot (35,955 English codes, 732 of them printed in the old Europe form, 648 sets),
   every English code read without its dash is found, and of those read without the dash **and**
   with one look-alike digit (`SR10EN0O1`) 129 are still refused, all in the sets `CT10`, `DL10`,
   `DP10`, `SD10` and `SDPD`, whose other place's set (`CT1`, `DL1`, `DP1`, `SD1`, `SDP`) exists
   too (batch B1 refused 4,302 of them, in 55 sets). The old Europe form of their 129 codes
   (`CT10E001`), never printed, is refused too. Of 949,869 synthetic other-language reads of those
   codes (`DE`, `FR`, `IT`, `SP`, `PT` as printed or misread, without the dash, with a look-alike
   digit or a second dash), none is taken as English (batch B1 took 64 through the old form). A
   second dash between a region and the number is the same code (`VLB-DE-005` is `VLB-DE005`,
   `LOB-E-001` is `LOB-E001`).
6. **Never the passcode**: a read with no letter (the 8-digit passcode, a stat), or one of 6 to 10
   characters, dashes left out (7 to 10 when it has a dash: `DL1-001` has six), all digits but at
   most two letters a reader prints for a digit (O, D, I, L, S, B, Z, G), like `9955812I` or
   `9955-8127`, is ignored: it is never looked up and counts as no code.

### Answer `CardScanMatch` (200)

| Field | When | Meaning |
| --- | --- | --- |
| `status` | always | `FOUND` one card and one printing (the code exists in one rarity, or the card has one printing and no code read disagrees); `PICK_RARITY` one card and one code in several rarities; `PICK_PRINTING` the card is known, not its printing (the code was unreadable or is none of its printings); `NOT_FOUND` |
| `reason` | NOT_FOUND only | `OTHER_LANGUAGE`, `AMBIGUOUS` (several cards fit), `NO_MATCH` (nothing read is in the catalog), `NOTHING_READ` (no code-shaped text and no name) |
| `card` | all but NOT_FOUND | `CardScanCard` `{id, name, imageUrl?}` |
| `printing` | FOUND only | `CardScanPrinting` `{id, printingCode?, setCode, setName, rarity?}`: `id` is what a batch line names |
| `rarities` | always (filled for PICK_RARITY) | the printings of the code read, one per rarity (the rarity list) |
| `printings` | always (filled when there is a card) | every English printing of the card, newest set first (the Pick printing list; screen 28's other printings) |
| `otherMatches` | always | at most 6 `CardScanOtherMatch` `{cardId, name, imageUrl?, kind, printingCode?, setName?, printingId?, rarity?}`: never the card found. `kind` `CODE`: a code close to the read one is this card's (the candidates of an undecided read, the codes read, their look-alikes, then codes one look-alike character away, the wider 3/8, 6/8, 5/6, 0/8, 1/7 included: shown, never accepted on their own); `printingCode` and `setName` say which code, `printingId` and `rarity` are set when that code comes in one rarity. `kind` `NAME`: its name is close to the one read (similarity 0.3 and more), best first |
| `read` | always | `{codes, names}`: what was read, as the server cleaned it |

Pictures (`imageUrl`) are this API's own addresses: `/api/v1/public/card-images/{id}` (a cached
artwork) or the generated placeholder, never a provider's address (ADR 0015). Absent fields are
left out of the JSON (not `null`).

The phone's tiles: FOUND → "✓ Found"; PICK_RARITY → "Pick rarity" (the list is `rarities`);
PICK_PRINTING → "Pick printing" with "Code unreadable" (the list is `printings`); NOT_FOUND →
"Couldn't read" (the search, with `read` and `otherMatches`).

### Examples

```http
POST /api/v1/cards/scan-match
Authorization: Bearer <ID token>
Content-Type: application/json

{"game": "yugioh", "codes": ["MACR-EN038"], "names": ["Ash Blossom & Joyous Spring"]}
```

```json
{
  "status": "FOUND",
  "card": {"id": "3c0d…", "name": "Ash Blossom & Joyous Spring",
           "imageUrl": "/api/v1/public/card-images/91e2…"},
  "printing": {"id": "5f7a…", "printingCode": "MACR-EN036", "setCode": "MACR",
               "setName": "Maximum Crisis", "rarity": "Secret Rare"},
  "rarities": [],
  "printings": [
    {"id": "8a10…", "printingCode": "RA01-EN008", "setCode": "RA01",
     "setName": "25th Anniversary Rarity Collection", "rarity": "Super Rare"},
    {"id": "5f7a…", "printingCode": "MACR-EN036", "setCode": "MACR",
     "setName": "Maximum Crisis", "rarity": "Secret Rare"}
  ],
  "otherMatches": [
    {"cardId": "a4b2…", "name": "Fairy Tail - Luna", "imageUrl": "/api/v1/public/card-images/…",
     "kind": "CODE", "printingCode": "MACR-EN038", "setName": "Maximum Crisis",
     "printingId": "c51e…", "rarity": "Super Rare"}
  ],
  "read": {"codes": ["MACR-EN038"], "names": ["Ash Blossom & Joyous Spring"]}
}
```

The code read is Fairy Tail - Luna's, the name Ash Blossom's: the name wins and takes its printing
one look-alike character (6/8) from the code read; Luna is the first other match.

`{"game": "yugioh", "codes": ["RAO1-ENO75"]}` → `PICK_RARITY`, `card` Infinite Impermanence,
`rarities` the seven printings of RA01-EN075.

`{"game": "yugioh", "codes": ["MACR-FR036"], "names": ["Ash Blossom & Joyous Spring"]}` →
`{"status": "NOT_FOUND", "reason": "OTHER_LANGUAGE", "rarities": [], "printings": [],
"otherMatches": [], "read": {…}}`.

`{"game": "pokemon"}` → 400:

```json
{"type": "https://api.orenjitrade.com/problems/validation-failed", "title": "Validation failed",
 "status": 400, "detail": "Validation failed", "instance": "/api/v1/cards/scan-match",
 "errorCode": "VALIDATION_FAILED", "message": "Validation failed",
 "errors": [{"field": "game", "message": "must be yugioh: the scan reads Yu-Gi-Oh! cards only"}],
 "requestId": "…", "timestamp": "…"}
```

## `POST /api/v1/inventory/items/batch`

The review list's "Add {n} cards to inventory": only the ready cards.

### Body `AddInventoryItemsBatchRequest`

| Field | Type | Rule |
| --- | --- | --- |
| `visibility` | `PRIVATE` \| `PUBLIC` | `PRIVATE` when left out. Another value: 400 |
| `binderId` | uuid | one of the caller's binders, else **404 `NOT_FOUND`** (someone else's binder answers exactly like an unknown one); no binder when left out |
| `lines` | `AddInventoryItemsBatchLine[]`, required | 1 to 500 lines `{printingId, quantity}`, both required; `quantity` 1 to 9999. Lines of the same printing are summed (the sum is at most 9999) |

400 `VALIDATION_FAILED` with `errors` on `lines[i].printingId` ("unknown printing": no printing of
an active game) or `lines[i].quantity` (the first line of the printing), `lines`, `visibility`.
Nothing is written on any refusal.

### What it does

One transaction:

- A line adds its copies to the caller's **equal item**, the oldest one: the same printing,
  language, condition, edition and finish, **and** the same visibility and binder. Otherwise it
  creates an item.
- A new item gets the defaults of a card added on the phone today (`newItemDefaults` of the phone's
  item form): the printing's language, edition and finish; the game's `NEAR_MINT` condition (its
  first condition when it has none); availability `TRADE_OR_SALE`; offers off; currency `CAD`; no
  price; no notes; the batch's visibility and binder. Stage R2 of the phone redesign changes the
  condition to "not stated" and keeps the rest; the batch follows once R2 is merged.
- An item holds at most 9999 copies: what an equal item cannot take is counted in
  `copiesNotAdded` (it is not written elsewhere). An equal item that is already full gets no copy
  and is not raised.
- `inventory.items.max` is checked **for the whole batch** before anything is written: when the new
  items would pass it, **429 `LIMIT_REACHED`** (extensions `limitKey`, `limit`, `used`, `requested`
  = the new items the batch needed, `planCode`, `upgradeUrl`) and nothing is written. Lines that
  only raise items need no room.
- The items count as **confirmed** (freshness): a new item is confirmed by its creation, an equal
  item a line reached is confirmed, raised or full (a hidden one comes back, `RESTORED` freshness
  event).
- The listing is reconciled in the same transaction: a public card of a discoverable collector
  publishes `InventoryItemPublished` (wishlist alerts, the Home feed), once.
- Locks: the owner lock first, then the target binder and the binders of the items it raises,
  then those items in ascending id (`docs/database/schema.md`, "A new bulk write").

### Answer `AddInventoryItemsBatchResponse` (200)

| Field | Meaning |
| --- | --- |
| `itemsCreated` | new items |
| `itemsRaised` | items that got extra copies (an equal item already at 9999 copies gets none: it is not counted here, its copies are in `copiesNotAdded`, and it is still confirmed) |
| `copiesAdded` | copies written |
| `copiesNotAdded` | copies an item could not take (at most 9999 per item) |
| `createdItemIds` | the new items, in the order of the lines |
| `raisedItemIds` | the items that got extra copies, in the order of the lines |

The phone's toast "Saved · {n} cards" counts the copies of the ready cards it sent
(`copiesAdded`).

### Example

```http
POST /api/v1/inventory/items/batch
Authorization: Bearer <ID token>
Content-Type: application/json

{"visibility": "PRIVATE",
 "lines": [{"printingId": "5f7a…", "quantity": 2},
           {"printingId": "0b44…", "quantity": 1},
           {"printingId": "5f7a…", "quantity": 1}]}
```

```json
{"itemsCreated": 1, "itemsRaised": 1, "copiesAdded": 4, "copiesNotAdded": 0,
 "createdItemIds": ["e3c1…"], "raisedItemIds": ["77d0…"]}
```

```json
{"type": "https://api.orenjitrade.com/problems/limit-reached", "title": "Limit reached",
 "status": 429, "errorCode": "LIMIT_REACHED",
 "message": "You have reached the limit of your plan for this action",
 "limitKey": "inventory.items.max", "limit": 3, "used": 2, "requested": 2,
 "planCode": "FREE", "upgradeUrl": "/premium", "requestId": "…", "timestamp": "…"}
```

## Generated clients

- Phone (`packages/shared-types`, `openapi-fetch`): `api.POST('/api/v1/cards/scan-match', { body })`
  with `components['schemas']['CardScanMatchRequest']` → `CardScanMatch`; `api.POST(
  '/api/v1/inventory/items/batch', { body })` with `AddInventoryItemsBatchRequest` →
  `AddInventoryItemsBatchResponse` (operations `matchScannedCard`, `addInventoryItemsBatch`).
- Web (`packages/api-client`, paused): `CardScanService.matchScannedCard({cardScanMatchRequest})`,
  `InventoryService.addInventoryItemsBatch({addInventoryItemsBatchRequest})`.

## Tests

`CardScanMatchIT`, `TextCardMatcherTest`, `ScanCodesTest`, `NameSimilarityTest` (the matcher);
`InventoryBatchIT` and `InventoryLockOrderIT` (`BATCH_ADD`,
`aBatchAddNextToTheOtherWritesNeverDeadlocks`) (the batch add); `FeatureFlagsIT` (the flag).
