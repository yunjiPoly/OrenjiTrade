# ADR 0018 — Deals happen in the chat

**Status:** Accepted · **Date:** 2026-10-14 (owner decision; built from stage R1 of the phone
redesign) · **Amends:** [ADR 0011](0011-payments-stripe-connect-abstraction.md) (payments) ·
**Spec:** [`docs/product/specs/2026-10-14-phone-redesign.md`](../../product/specs/2026-10-14-phone-redesign.md),
sections 1, 10 and 11

## Context

Phases 8 and 9 built a structured deal on the web and on the phone: "Make an offer" (cash, trade
or both) with counter-offers, a trade page with an in-person meetup or payment protection
(Stripe Connect behind `PaymentProvider`, ADR 0011), shipping steps and disputes. None of it was
ever deployed; the web app is paused since 2026-10-12.

On 2026-10-14 the owner approved the phone redesign (mockup v32) as the final UI and, the same
day, removed "Make an offer" from the app: collectors don't meet, they agree in the chat, the
buyer sends an address and pays the seller outside the app (Interac e-Transfer), the seller
ships with tracking and marks the card sold, then both rate each other. OrenjiTrade never handles
the money.

## Decision

1. **Offers leave the phone; the server modules stay for now.** The phone has no offer, trade,
   protected-payment checkout, payout or dispute screen, no "Make an offer" and no "Share an
   offer", and never calls `/offers`, `/trades`, `/payments` or `/disputes` (stage R1). The API's
   `offers`, `trades` and `payments` modules (disputes included) stay exactly as they are,
   because the paused web uses them; deleting them later needs a new ADR. What the phone still
   meets of them is history: an old OFFER_LINK message or offer/trade SYSTEM message reads as the
   grey line "Offer (no longer available)" (a text sent with an offer link stays); an old offer,
   trade, payment or dispute notification opens nothing and says that deals happen in the chat
   (it names no collector, so it cannot open the chat with them); a link to a removed screen
   lands on Messages (Settings for the offer and payout settings) with the same note. The offer
   and trade notification categories leave the phone's notification settings (their stored values
   are sent back unchanged).
2. **Mark as sold records a sale between two collectors** (stage R4). The seller of the chat's
   pinned card or deck core marks it sold from the chat, with the copies sold and an optional
   tracking number: a `sale` row (conversation, seller, buyer, item or binder, quantity, tracking
   number), the copies leave the inventory, a SYSTEM message both sides read in their own words,
   an in-app notification for the buyer, and an undo for 10 minutes before anyone rated it. Sales
   live in a new module (`deals`, the spec's natural fit) that calls the others through their
   services and events.
3. **Ratings come from sales and conversations.** A sale records an interaction (`SALE`, stage
   R4) so both sides can rate at once; a conversation where both sides sent at least three
   messages stays eligible (`CONVERSATION_QUALIFIED`). Old `TRADE` and `OFFER_ACCEPTED`
   interactions keep their ratings. The phone asks Overall, Communication, Card condition and
   Shipping, never "Meetup reliability"; the column stays (the web, old ratings), and an edit
   from the phone sends an old meetup score back unchanged.
4. **Payment stays outside the app.** No escrow, no payment protection and no claim of either on
   the phone: OrenjiTrade is not a party to the deal and never handles the money. The
   `protectedPayments` flag and the `PaymentProvider` abstraction of ADR 0011 stay for the paused
   web; Premium, credits and donations keep their providers and their flags (off at launch).
5. **Cards ship by mail.** No meetups and no game stores: the chat safety tip is worded per side
   (buying, selling, a chat without a card; section 10 of the spec), "Meetup details always stay
   private" is gone, the curated "Local Meetups" tag is hidden (V115), the region channels say
   "trades and sales by mail" (V116), `ReportReason` no longer says "including at meetups", the
   seeds hold shipping and e-Transfer lines, and the "Trading safely" page (English and French,
   still a draft) explains deals by mail. The buyer's address and the seller's e-Transfer email
   go only into a message the user sends; the phone keeps them in its secure storage and never
   anywhere else (stage R4).

## Consequences

- **ADR 0011 amended:** protected payments and payouts are no longer offered on the phone, and
  the phone never uses the "payment protection" wording; the open owner question on app-store
  purchases now concerns Premium and donations only (protected payments were physical goods
  between people and are gone from the phone). The fake provider checkout of Premium and
  donations stays (`apps/mobile/src/features/billing`).
- The web keeps offers, trades, payment protection and disputes while it is paused; when the web
  resumes, its product shape is the owner's call (the redesign covers the phone).
- The legal texts other than "Trading safely" still describe meetups and payment protection
  (Terms, Community Guidelines, Payment Protection Policy): left for the lawyer, listed in
  `IMPLEMENTATION_STATUS.md` ("Phone redesign R1").
- Stage R1 builds parts 1, 3 (the phone's rating form), 4 (no claims) and 5; stage R4 builds
  part 2, the `SALE` interaction, the chats' pinned card (which feeds the buying and selling
  tips), the inbox thumbnails and the saved shipping details.

## Alternatives considered

- **Keep offers on the phone behind a flag:** rejected by the owner; a hidden flow still costs
  tests, reviews and a second deal model next to the chat.
- **Delete the server modules now:** rejected for now; the paused web compiles against them and
  every API change of the redesign is additive. A later ADR decides.
