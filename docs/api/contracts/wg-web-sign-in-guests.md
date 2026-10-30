# Web stage WG contract — Sign-in, welcome and guests

> Owner prompt of 2026-10-28 ([`docs/product/specs/2026-10-28-web-redesign-stages.md`](../../product/specs/2026-10-28-web-redesign-stages.md)),
> stage WG; spec [`2026-10-20-web-redesign.md`](../../product/specs/2026-10-20-web-redesign.md)
> section 14, decision 4; boards W26 and W27. The web reads the API of the phone's stages R12
> (sign-in, sign-up and the welcome) and R15 (browse without an account,
> [r15-browse-without-account.md](r15-browse-without-account.md)) unchanged: **no endpoint, field
> or rule changes, no migration** (the next is still **V135**), the phone unchanged. Field-level
> truth: `../openapi.json`.

The one change outside `apps/web-angular` is the web's own Angular client (`packages/api-client`):
`CollectorMarker` and `PublicBinderOwner` now keep the `null` of `id`, `handle` and `displayName`
that the OpenAPI document has had since R15 (`WEB_CLIENT_NOT_NULL` of
`packages/api-client/tools/web-omits.mjs` is empty; `FeedCollector` lost its override in stage WE).
The web now has guests on every page that reads these schemas, so its types say what a signed-out
visitor reads. The phone's types (`packages/shared-types`) are unchanged.

## What the web reads

| Screen | Requests |
| --- | --- |
| Sign in, Create your account, Reset your password, Verify your email (W27) | Firebase Authentication (the emulator locally); `GET /public/legal/documents` (the documents due at registration and the `AGE_CONFIRMATION` attestation); `POST /me/consents` (each document, then the age); `GET /me`. Create your account sets the Firebase display name and refreshes the token before the first API call when it can, so the account starts with the name typed there; when `GET /me` provisioned the account first, the welcome offers that name again |
| Review our terms (an account state) | `GET /me` (`requiredConsents`, `onboarding.ageConfirmed`), `GET /public/legal/documents`, `POST /me/consents`. An account with `ageConfirmed: false` is shown this page, alone with the age when no document is due (the phone's R12); the welcome never asks the age |
| Suspended, scheduled for deletion (account states) | `GET /me` (`status`), the 403 `ACCOUNT_SUSPENDED` of any request (`suspendedUntil`); `GET /me/deletion-requests`, `DELETE /me/deletion-requests/{id}` (Cancel deletion), `GET /me/export` (Download my data) |
| We could not load your account | `GET /me` again ("Try again") |
| The welcome (`/onboarding`) | `GET /me/profile`, `GET /me/profile/handle-availability?handle=` (the live check while typing, 400 ms after the last key; `AVAILABLE` "@sam_trades is free", `CURRENT` "is yours", `TAKEN` refused; a failed check says nothing, the save decides), `PUT /me/profile`, `PUT /me/profile/tags`, `GET /games` (the five tiles; `hasCards: false` dims a game "Cards coming soon"), `GET /regions`, `PUT /me/location`, `PUT /me/settings/privacy` ("Show me on the map", off by default) |
| A guest's pages (Home, Search, a card, a set, a binder or deck core, Legal, Settings › Appearance) | The reads of stages WD and WE, signed out: R15's answers (`id`, `handle`, `displayName`, `avatarUrl` `null`, no `rating`, no presence; the place kept) |
| A guest's action, after signing in | `GET /listings/owner?itemId=` / `binderId=` / `wishId=` (members only): who owns the listing the guest acted on; then the member's own request (`POST /conversations`, the wish dialog, Report collector, the profile) |

## A guest's action

A guest never reads who a collector is, so the web keeps what they tried by its listing or card,
never by a collector (the phone's R15 rule), in memory for the tab, with the page's address as the
sign-in's `returnUrl`:

| What the guest did | Dialog title | Kept | After signing in, back on the page |
| --- | --- | --- | --- |
| "Message" on a card (Home, Who has this card, a binder's tile) | Sign in to message this collector | `itemId` | the chat drawer with the owner, the card pinned |
| "Message" on a deck core or a plain public binder | Sign in to message this collector | `binderId` | the chat drawer, the deck core pinned (a plain binder: nothing pinned) |
| "I have it" on a wish (Home) | Sign in to tell them you have it | `wishId` and the card | the chat drawer with "Hi! I have {card}." in the box |
| A post's header or "+N", a holder's row, a binder's "View profile" or seller row | Sign in to see collector profiles | the listing | the collector's profile (their own: Profile) |
| "Add to wishlist" on a card page | Sign in to save your wishes | the card, printing or rarity | the wish dialog of that card |
| "Report" on a binder or deck core | Sign in to report this collector | `binderId` | Report collector about that binder |
| "I have this card" on a card page, "Add from this set" | Sign in to add your cards | the card or the set | the page opens its Add drawer, or the set's adding mode |

A listing gone in between answers 404: "That listing is no longer available." One of the
collector's own: "That’s one of your own listings." The last two titles are not in the spec's list
(spec 14 names four): a guest can reach these actions too, and the phone uses the first of them.

The action belongs to the sign-in it was asked for, and to nothing else (WG review fix 1; the
phone's R15 forgets it on every other entry too). It is kept only once Create account or Sign in is
chosen, and forgotten by "Not now", Esc, "Not now, keep browsing", leaving the sign-in steps still
signed out (the browser's Back, the wordmark), signing out after signing in for it (Review our
terms, the account states), another account appearing in the tab, and the ready account first
landing on another page than the action's. It never finishes on a later visit, nor for anyone
else. Nothing is sent without a tap: "I have it" fills the box, the wish and the report open their
dialogs.

## Privacy

Nothing new is returned: the reads above are the ones `GeoPrivacyContractTest`,
`GuestBrowsingIT` and `RefusedAccountBrowsesAsGuestIT` already pin for signed-out callers (R15,
the owner decisions of 2026-10-28). The web's guest E2E (`e2e/guests.spec.ts`) reads Home, Search,
a card, its set, a binder and a deck core signed out and finds no handle, display name, account id,
avatar or rating of anyone in the page or in any JSON answer. The decorative map of the sign-in
pages is a fixed pattern drawn from the bundled boundaries: it reads nothing from the API.
