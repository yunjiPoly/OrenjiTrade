# IMPLEMENTATION_STATUS.md

Living checklist for the OrenjiTrade MVP. Legend: `[ ]` NOT STARTED · `[-]` IN PROGRESS ·
`[x]` COMPLETE (workflow verified to work, tests pass) · `[!]` BLOCKED.

A feature is marked complete only when: implementation exists, API works, UI works where
applicable, authorization works, validation works, error handling works, tests pass,
documentation is updated. Each completed item lists location, tests, migrations, and debt.

**Last updated:** 2026-10-20 (stage R6 of the phone redesign, "Profiles", mockup screens 19 to 21, and Settings behind the gear: another collector's profile with the "⋯" sheet (Share profile, Report, Block), the header and its one line ("{city, }{province} · Member since {year} · Active this week"), Message, Cards, Binders, Looking for with "I have it", About, Ratings & references, each with "See all", the compact top bar on scroll; "I have it" opening the chat with your copy pinned and the text in the box, nothing sent before send; your Profile tab with Edit profile, Share profile and the gear that opens Settings; API: `cardId` on `GET /inventory/items` and `excludeDeckCoreItems` on `GET /collectors/{handle}/inventory`, both optional; no migration (V128 stays free); native flow 6; the walk at the largest text size fixed two layouts — branch `feature/r6-profiles`, builder done, not pushed; see "Phone redesign R6: profiles (2026-10-19)"). Before: 2026-10-16 (stage R5's review fix 1: the old `/regions/<region>/<code>` link crashed the tabs (its `state` parameter is React Navigation's own; now `place`), `rarity` on `GET /search/card-holders` and the card page's `?rarity=`, a new link to the card page on screen, the 1st Edition on holder rows, the Search key keeping the whole text, the region pill's name alone, two native flakes, the card results starting at the top for each new text or game; see "Review fix 1" in the R5 section). Before: 2026-10-16 (stage R5 of the phone redesign, "Search", mockup screens 11 to 15: four tabs (Search | Inventory | Messages | Profile); Search's map with the state card, typing a card with the collectors and the recent searches, Who has this card (the one card page: holders by province, Message pinning the card, "Also in a deck core"), Search › Binders with Deck cores, Search › Wishlist with "Available", Settings › Privacy › "Remember my searches"; the old routes and links redirect; API: `GET /search/collectors`, `sort=province`, `available` and `GET /wishlist/availability`, blocked collectors left out of search's collectors in SQL, no search text in the search analytics events; no migration (V128 stays free); native flows 2 and 3 in full; the walk at the largest text size fixed four layouts — branch `feature/r5-search`, builder done, not pushed; see "Phone redesign R5: search (2026-10-16)")
**Last updated:** 2026-10-16 (the owner's inventory change dated 2026-10-16 merged with `main` after stage R4, #76: conflicts only in this file, the handoff and one hooks test (both sides kept); R4's chat shows a saved price as typed, so the new "$12.50" / "85% TCG" texts read as they are, and its "Share a card from your inventory" sheet, which reuses the Inventory row, now shows and speaks each card's Public or Private tag too; no migration, no API change (`git diff origin/main -- apps/api apps/web-angular packages` empty). The full check list on the merged code, retries off: mobile typecheck, lint and format clean; `test:mobile` 95 suites / 1,070 tests (+ 28 node tests); `expo export` iOS, Android and web exit 0; mobile web E2E 58 passed; the native suite 33 / 33 flows in 52 min 7 s on the owner's iPhone 18 Pro; `test:scripts` 135; `audit:gate` OK (2 allow-listed highs); Spotless clean; `test:api` 1,058 tests + 12 catalog tests, 0 failures; web build 896.09 kB initial; `test:web` 136 files / 633 tests; web E2E 70 passed — branch `feature/inventory-visibility-price`, its pull request next, not pushed)
**Last updated:** 2026-10-15 (the owner's inventory change dated 2026-10-16, mockup v43 screens 1, 6 to 9, phone only: a Public / Private tag after the card code on every Inventory row (amber, with its status's short label "Public · not visible", while nobody can see a public card; spoken in the row's name), the asking price typed in "$" or "% TCG" (a switch beside a number box; "$" above 0, two decimals at most, 99999.99 at most, a comma as the decimal point; "% TCG" a whole number from 1 to 200; saved as "$12.50" or "85% TCG"; a new card starts in the mode used last on the phone, "$" the first time; an old text such as "Trade only" kept as "Was: {text}" until a price is typed), Copies on its own row above the price; deck cores keep their free text; no migration, no API change; fix round 1: the tags follow "Show me on the map", a saved or removed location and Edit binder at once (those writes read the cards again), the light theme's pending tag a dark amber, an ended temporary publication the short "Public · ended", Edit card remembers the mode only when it saves a new price; fix round 2: any Edit card save writes a saved text that reads back into a mode the one way ("85 % tcg" as "85% TCG", "12,50 $" as "$12.50"), as no change by itself and not as the mode used last, "Trade only" and old amounts without a text left as they are — branch `feature/inventory-visibility-price`, builder done, fix rounds 1 and 2 done, not pushed; see "Changed by the owner on 2026-10-16" at the end of `docs/product/specs/2026-10-14-phone-redesign.md`)
**Last updated:** 2026-10-16 (stage R4's review fix 2: a test that the Mark as sold sheet keeps the card it opened with, and the quick reply chips' 44 pt touch targets on iOS; see "Review fix 2" in the R4 section). Before: 2026-10-16 (stage R4's review fix 1: Mark as sold names the card the seller saw, pins pushed to both collectors, the toast's Undo above the keyboard, sold deck cores out of `binders.max`, the tracking-number log test and nine minor fixes; see "Review fix 1" in the R4 section). Before that: 2026-10-15 (stage R4 of the phone redesign, "Messages and Mark as sold", mockup screens 22 to 25: V127 — the chat's subject (`subject_item_id` / `subject_binder_id`, `POST /conversations` pinning a card or a deck core, `GET /conversations/{id}`, sharing one's own card with `inventoryItemId`), the `sale` table and the new `deals` module (`POST /conversations/{id}/sales`, `POST /sales/{id}/undo` within 10 minutes and before a rating, the copies leaving the inventory and coming back exactly), the SALE interaction, the sale message and the buyer's `SALE_RECORDED` notification; on the phone the inbox, the chat's top bar, pinned bar, safety tip per side, quick replies and "+" sheet with the saved address or e-Transfer email (Settings › Shipping details, on the phone only), Mark as sold with its toast and Undo, the sale message per side with "Rate {other}"; R3's leftovers fixed first; native flows 4 and 3 (as far as R4 reaches) — branch `feature/r4-messages-mark-as-sold`, builder done, not pushed; see "Phone redesign R4: messages and Mark as sold (2026-10-15)")
**Last updated:** 2026-10-15 (stage R3 of the phone redesign, "Binders and deck cores", mockup screens 16 to 18 and Inventory › Binders: V126 — `sells_as_core`, the deck core's price as typed (`asking_price_text`, a plain amount also in `asking_price`), `sold_at`, `binder_image` with `POST` / `DELETE /binders/{id}/images`; photos, preview pictures and key cards in the binder responses; a public deck core shows without cards; the search API of R5 (`excludeDeckCoreItems`, `GET /search/deck-cores`, `deckCore` and `q` on the binder searches, `GET /regions/{region}/binders`, `deckCoreCount`); on the phone Inventory › Binders, Edit binder and New binder with "Sell as a deck core", the deck core page with its photo pager and "Message {handle}", the public binder restyled; native flow 2 as far as R3 reaches; review fix 1: a public deck core shows every card in it as a key card and the cards keep their own visibility, Edit binder follows saves made elsewhere; review fix 2: the sheets at the largest text size, a delete from the binder's own link, the profile rows after a save, the key card hint, tests for the rule's untested terms — branch `feature/r3-binders-deck-cores`, builder done, review fixes 1 and 2 done, not pushed; see "Phone redesign R3: binders and deck cores (2026-10-15)")
**Last updated:** 2026-10-15 (stage R2 merged with `main` after stage F1, "free for all" (#73): R2's Inventory and Add cards screens keep no sponsored row, upgrade offer or paid entry point, and its screens that reach a limit say it as F1's plain caps; R2's API additions (`asking_price_text`, the condition not stated, the restore, the photo purge job, `sort=created`, `PATCH … confirm`, the richer suggestions) sit next to F1's `limits` module; R2's migration renumbered after F1's V120–V123; the generated OpenAPI and clients regenerated on the merged code — branch `feature/r2-inventory-adding-cards`, not pushed; see "Merged with free for all (2026-10-15)" in the R2 section)
**Last updated:** 2026-10-15 (stage R2 of the phone redesign, "Inventory and adding cards", mockup screens 1 to 9: V117 (V125 since the merge with F1) — the asking price as typed (`asking_price_text`, plain amounts parsed into `asking_price`), a condition not stated (`conditionStated`), the undo of a delete for 10 minutes (`POST /inventory/items/{id}/restore`, the `inventory-photo-purge` job); `PATCH … confirm`, `sort=created`, catalog suggestions with set, rarity and printing count; on the phone the Inventory with its own header, Filter and sort, Add cards, Choose the printing, Add to inventory with photos, Edit card, the toasts with "View" and "Undo", the bulk delete undone — branch `feature/r2-inventory-adding-cards`, builder done, review fixes 1 and 2 done (the emptied price, native flow 1's photo, twin printings, a truthful Public hint, photo failures, the largest text, `markedPublic`, the lock tests; then the photo's creation date, toasts clear of the photo failures, the hint from the card itself), not pushed; see "Phone redesign R2: inventory and adding cards (2026-10-14)")
**Last updated:** 2026-10-15 (stage F1, "free for all", merged with `main` after stage R1 of the phone redesign (#72): both stages' removals hold together — no offer, trade, payment, dispute, Premium, credits, donation or sponsored screen, row, route or checkout left on the phone; one removed-route mechanism for the links of both (`src/navigation/removedRoutes.ts`); R1's fonts, tokens, wording and safety tip with F1's limit messages; migrations V115, V116 (R1) and V120–V123 (F1); ADR 0018 and ADR 0019 — branch `feature/f1-free-for-all`, not pushed; see "Merged with R1 (2026-10-15)" in the F1 section)
**Last updated:** 2026-10-14 (stage F1, "free for all": Premium, sponsored placements, credits and donations removed from the API, the phone and the paused web app; the usage limits the same for every collector; protected payments kept on the API; migrations V120–V123; ADR 0019; the code saved on `archive/paid-features` — branch `feature/f1-free-for-all`; see "Free for all: Premium, ads, credits and donations removed (stage F1, 2026-10-14)")
**Last updated:** 2026-10-14 (stage R1 of the phone redesign, "Offers out, shipping wording, look": offers, trades, protected payments and disputes off the phone (ADR 0018, "Deals happen in the chat"), the chat safety tip per side, ratings without meetup reliability, V115 (the meetup tag hidden) and V116 (region channels by mail), shipping seeds, "Trading safely" in English and French, the deckCore tokens, Sora / Inter / JetBrains Mono through the theme, a new install in dark — branch `feature/r1-offers-out-shipping-look`, merged as #72; see "Phone redesign R1: offers out, shipping wording, look (2026-10-14)")
**Last updated:** 2026-10-14 (stage S6, the end of the owner's change of 2026-10-08: the final documents and the definition-of-done walkthrough — 12 of 22 clauses done, 5 partly, 5 not built (stages S3 and S4, skipped by the owner on 2026-10-13); the small fixes before them; the import chip and button names start with their visible words; the documents brought to today (except two lines of the paused web README and two database comments of V112, recorded) and corrected after the fact check, rounds 1 and 2; the delivery report `docs/product/2026-10-08-change-delivery-report.md`; the phone redesign of 2026-10-14 saved as `docs/product/specs/2026-10-14-phone-redesign.md` and set as the next task — branch `feature/s6-final-docs`, not pushed; see "Final documents and the definition-of-done walkthrough (stage S6, 2026-10-14)". Merged since the line below: stage S2 (#60), the first run on Apple Silicon (#59), the iOS path of the native suite (#61), mobile stage M9 (#67), the inventory lock fix (#68), stage S5 (#69) and the scrim fix (#70))
**Last updated:** 2026-10-10 (stage S2 review fix 3, first run on the Mac mini: an "Any printing" wishlist alert opens the card page on "Any printing" (`?printing=any`), a typed printing code never picks one of several printings, V112's last edit before it freezes (opt-outs carried over, paused wishes deleted, outbox rows completed, more normalisation), the seed on a database seeded before S2, small UX fixes — branch `feature/regions-s2-wishlist`, not pushed; see "Review fix 3" in "A simpler wishlist, wishlist alerts, no matches (stage S2)")
**Last updated:** 2026-10-08 (stage S1 of the 2026-10-08 product change, geography: platform regions instead of geolocation, ADR 0017 — no coordinates, distances, radii, GPS, geocoding or map provider anywhere; regions / countries / ISO 3166-2 subdivisions as admin-editable data (V106/V107); the self-declared location (country, state or province, optional city shown only on the owner's profile; V108); region-scoped search, card holders, wishlist matching, ads and analytics (V109); one community channel per platform region (V110); the web region switcher and a Leaflet vector map of bundled Natural Earth boundaries; mobile pickers and a Map tab placeholder — branch `feature/regions-geography`, builder done, not pushed; see "Platform regions and the self-declared location (stage S1)")
**Last updated:** 2026-10-06 (mobile stage M8: launch readiness on the Expo app — the 18+ confirmation (the bilingual checkbox at sign-up and on the consent screen, a first onboarding "Age" step for existing accounts, `needsOnboarding` while `ageConfirmed === false`, the `403 AGE_CONFIRMATION_REQUIRED` answer routed to the step), every consent recorded with the language shown, the French legal pages with an EN / FR switch (French by default on a French device), the dismissible "Trade safely" notice in conversations and on offers / trades, Block / Unblock on the collector profile, the money-off follow-ups (neutral limit wording, the plan-limit notification without a Premium link unless the API carries it); the mobile E2E harness and the Maestro host scripts record the age consent so the suites pass against the gated API — branch `feature/launch-readiness` with mobile stage M7 merged in (then `origin/main` with #53), builder done: 60 Playwright specs and 24 Maestro flows green; see "Mobile app (stage M8)")
**Last updated:** 2026-10-06 (mobile stage M7: the web-vs-mobile parity gaps closed on the Expo app — Google sign-in and sign-up (proven against the Auth emulator only), the Search tab's Collectors and Binders segments, the card holders list with the web's sort and filters, "Looking for" on profiles, Settings → Blocked users, inventory owner photos and multi-select bulk actions, the visibility filter, binder reordering, the map's freshness / tags filters and search box, set pages; every acceptance row's mobile half completed; the M1–M6 verification caveats replaced with their merged PRs — branch `feature/mobile-m7` on top of `feature/mobile-m6` with `origin/main` (#49, #51) merged in, builder done; see "Mobile app (stage M7)"); 2026-10-05 (mobile stage M6: Phases 9 and 10 on the Expo app — payment protection on the trade (pay on the app's fake checkout, ship, confirm receipt, disputes with statements and photos, payouts), Premium through the fake billing checkout, credits, voluntary donations through the fake donation checkout, "Sponsored" placements, "See Premium" on every reached limit, the mobile half of the acceptance tracker, app-store purchase rules recorded as an open owner question in ADR 0011 — branch `feature/mobile-m6` on top of `feature/mobile-m5`, builder done; see "Mobile app (stage M6)"); 2026-10-05 (mobile stage M5: Phases 7 and 8 on the Expo app — reporting a collector and My reports, rating collectors and writing references, making offers (cash / trade / cash + cards), the offers inbox, one offer with accept / counter / decline / withdraw, trades with the meetup, confirmations, cancelling and rating — branch `feature/mobile-m5` on top of `feature/mobile-m4`, builder done; see "Mobile app (stage M5)"); 2026-10-05 (mobile stage M4: Phases 5 and 6 on the Expo app — the realtime STOMP channel, the Messages tab with the inbox, the full conversation and the community channels, the Wishlist tab with matches nearby, the notification centre with a live bell and deep links, the ended-session and signed-out-link fixes — branch `feature/mobile-m4` on top of `feature/mobile-m3`, builder done; see "Mobile app (stage M4)"); 2026-10-05 (mobile stage M3: Phase 4 on the Expo app — the Map tab with collectors as 3 km zones capped at zoom 14, filters, "Who has this near me", the preview bottom sheet, the collector profile and a minimal conversation — branch `feature/mobile-m3` on top of `feature/mobile-m2`, builder done; see "Mobile app (stage M3)"); 2026-10-05 (mobile stage M2: Phases 2 and 3 on the Expo app — Search tab, card detail, Inventory tab, add / edit / delete cards, binders and the public binder view — branch `feature/mobile-m2` on top of `feature/mobile-m1`, builder done; see "Mobile app (stage M2)"); 2026-10-05 (mobile stage M1: foundation + Phase 1 accounts on the Expo app, branch `feature/mobile-m1`, verifier fixes incl. the map-based trading-area picker, merged with `main` after #39/#40; see "Mobile app (stage M1)"); 2026-10-04 (web E2E suite isolated on its own database/stack, `npm run e2e:purge`, collectors shown only as 3 km zones on the web, branch `fix/e2e-isolation-3km-zones`, merged as #39); 2026-10-04 (card image cache cap raised from 500 MB to 5 GB, ADR 0015 amendment, branch `feature/card-image-cache-5gb`, builder done and independently verified); 2026-10-03 (map location privacy rendering, ADR 0004 "Client rendering", branch `feature/map-privacy-zoom`, builder done and independently verified); 2026-10-01 (card images + real Yu-Gi-Oh! catalog, ADR 0015, backend, web, "image gaps" and independent verification of workflow `card-images` on branch `feature/card-images`; previously 2026-09-30: final independent verification of the local web MVP)
**Last updated:** 2026-10-05 (launch readiness parts 4 and 5: the launch configuration — every money feature flag off by migration (V105), the last Premium entry points of the web hidden while `premiumPlans` is off, `LaunchConfigurationIT`, the `launch-config` Playwright project — the "Launch configuration" runbook section, the Quebec Law 25 operating docs (confidentiality incident register and procedure, requests from police and courts, owner account security checklist with the actual admin-MFA value per profile), and the full-UI-translation plan recorded as the next task — branch `feature/launch-readiness`, builder done; see "Launch readiness, parts 4 and 5"); 2026-10-05 (launch readiness parts 2 and 3: the "Trading safely" page, the dismissible safety notice in conversations and on offer / trade pages, Block on the collector profile, French versions of every legal page with an EN/FR switch (French by default for a French browser), the Law 25 additions to the Privacy Policy and the venue / responsibility clauses of the Terms, consents recorded with the language shown (`user_consent.language`, V104), the UI-translation assessment — branch `feature/launch-readiness`, builder done; see "Launch readiness, parts 2 and 3"); 2026-10-05 (launch readiness part 1: the 18+ rule — server-side age confirmation recorded as an `AGE_CONFIRMATION` consent, `403 AGE_CONFIRMATION_REQUIRED` gate on discoverability, messaging, community posts and offers, sign-up checkbox and onboarding age step on the web, Terms and Privacy wording — branch `feature/launch-readiness`, builder done; see "Launch readiness, part 1"); 2026-10-05 (mobile stage M5: Phases 7 and 8 on the Expo app — reporting a collector and My reports, rating collectors and writing references, making offers (cash / trade / cash + cards), the offers inbox, one offer with accept / counter / decline / withdraw, trades with the meetup, confirmations, cancelling and rating — branch `feature/mobile-m5` on top of `feature/mobile-m4`, builder done; see "Mobile app (stage M5)"); 2026-10-05 (mobile stage M4: Phases 5 and 6 on the Expo app — the realtime STOMP channel, the Messages tab with the inbox, the full conversation and the community channels, the Wishlist tab with matches nearby, the notification centre with a live bell and deep links, the ended-session and signed-out-link fixes — branch `feature/mobile-m4` on top of `feature/mobile-m3`, builder done; see "Mobile app (stage M4)"); 2026-10-05 (mobile stage M3: Phase 4 on the Expo app — the Map tab with collectors as 3 km zones capped at zoom 14, filters, "Who has this near me", the preview bottom sheet, the collector profile and a minimal conversation — branch `feature/mobile-m3` on top of `feature/mobile-m2`, builder done; see "Mobile app (stage M3)"); 2026-10-05 (mobile stage M2: Phases 2 and 3 on the Expo app — Search tab, card detail, Inventory tab, add / edit / delete cards, binders and the public binder view — branch `feature/mobile-m2` on top of `feature/mobile-m1`, builder done; see "Mobile app (stage M2)"); 2026-10-05 (mobile stage M1: foundation + Phase 1 accounts on the Expo app, branch `feature/mobile-m1`, verifier fixes incl. the map-based trading-area picker, merged with `main` after #39/#40; see "Mobile app (stage M1)"); 2026-10-04 (web E2E suite isolated on its own database/stack, `npm run e2e:purge`, collectors shown only as 3 km zones on the web, branch `fix/e2e-isolation-3km-zones`, merged as #39); 2026-10-04 (card image cache cap raised from 500 MB to 5 GB, ADR 0015 amendment, branch `feature/card-image-cache-5gb`, builder done and independently verified); 2026-10-03 (map location privacy rendering, ADR 0004 "Client rendering", branch `feature/map-privacy-zoom`, builder done and independently verified); 2026-10-01 (card images + real Yu-Gi-Oh! catalog, ADR 0015, backend, web, "image gaps" and independent verification of workflow `card-images` on branch `feature/card-images`; previously 2026-09-30: final independent verification of the local web MVP)
**Last updated:** 2026-10-05 (mobile stage M6: Phases 9 and 10 on the Expo app — payment protection on the trade (pay on the app's fake checkout, ship, confirm receipt, disputes with statements and photos, payouts), Premium through the fake billing checkout, credits, voluntary donations through the fake donation checkout, "Sponsored" placements, "See Premium" on every reached limit, the mobile half of the acceptance tracker, app-store purchase rules recorded as an open owner question in ADR 0011 — branch `feature/mobile-m6` on top of `feature/mobile-m5`, builder done; see "Mobile app (stage M6)"); 2026-10-05 (mobile stage M5: Phases 7 and 8 on the Expo app — reporting a collector and My reports, rating collectors and writing references, making offers (cash / trade / cash + cards), the offers inbox, one offer with accept / counter / decline / withdraw, trades with the meetup, confirmations, cancelling and rating — branch `feature/mobile-m5` on top of `feature/mobile-m4`, builder done; see "Mobile app (stage M5)"); 2026-10-05 (mobile stage M4: Phases 5 and 6 on the Expo app — the realtime STOMP channel, the Messages tab with the inbox, the full conversation and the community channels, the Wishlist tab with matches nearby, the notification centre with a live bell and deep links, the ended-session and signed-out-link fixes — branch `feature/mobile-m4` on top of `feature/mobile-m3`, builder done; see "Mobile app (stage M4)"); 2026-10-05 (mobile stage M3: Phase 4 on the Expo app — the Map tab with collectors as 3 km zones capped at zoom 14, filters, "Who has this near me", the preview bottom sheet, the collector profile and a minimal conversation — branch `feature/mobile-m3` on top of `feature/mobile-m2`, builder done; see "Mobile app (stage M3)"); 2026-10-05 (mobile stage M2: Phases 2 and 3 on the Expo app — Search tab, card detail, Inventory tab, add / edit / delete cards, binders and the public binder view — branch `feature/mobile-m2` on top of `feature/mobile-m1`, builder done; see "Mobile app (stage M2)"); 2026-10-05 (mobile stage M1: foundation + Phase 1 accounts on the Expo app, branch `feature/mobile-m1`, verifier fixes incl. the map-based trading-area picker, merged with `main` after #39/#40; see "Mobile app (stage M1)"); 2026-10-04 (web E2E suite isolated on its own database/stack, `npm run e2e:purge`, collectors shown only as 3 km zones on the web, branch `fix/e2e-isolation-3km-zones`, merged as #39); 2026-10-04 (card image cache cap raised from 500 MB to 5 GB, ADR 0015 amendment, branch `feature/card-image-cache-5gb`, builder done and independently verified); 2026-10-03 (map location privacy rendering, ADR 0004 "Client rendering", branch `feature/map-privacy-zoom`, builder done and independently verified); 2026-10-01 (card images + real Yu-Gi-Oh! catalog, ADR 0015, backend, web, "image gaps" and independent verification of workflow `card-images` on branch `feature/card-images`; previously 2026-09-30: final independent verification of the local web MVP)
**Last updated:** 2026-10-05 (low-cost first-year production profile, ADR 0016, branch `feature/prod-low-cost`: Terraform, API and docs prepared for a ≈ US$131–142/month Google Cloud prod, go-live blockers fixed, nothing applied; see "Low-cost first-year production profile"); 2026-10-05 (mobile stage M5: Phases 7 and 8 on the Expo app — reporting a collector and My reports, rating collectors and writing references, making offers (cash / trade / cash + cards), the offers inbox, one offer with accept / counter / decline / withdraw, trades with the meetup, confirmations, cancelling and rating — branch `feature/mobile-m5` on top of `feature/mobile-m4`, builder done; see "Mobile app (stage M5)"); 2026-10-05 (mobile stage M4: Phases 5 and 6 on the Expo app — the realtime STOMP channel, the Messages tab with the inbox, the full conversation and the community channels, the Wishlist tab with matches nearby, the notification centre with a live bell and deep links, the ended-session and signed-out-link fixes — branch `feature/mobile-m4` on top of `feature/mobile-m3`, builder done; see "Mobile app (stage M4)"); 2026-10-05 (mobile stage M3: Phase 4 on the Expo app — the Map tab with collectors as 3 km zones capped at zoom 14, filters, "Who has this near me", the preview bottom sheet, the collector profile and a minimal conversation — branch `feature/mobile-m3` on top of `feature/mobile-m2`, builder done; see "Mobile app (stage M3)"); 2026-10-05 (mobile stage M2: Phases 2 and 3 on the Expo app — Search tab, card detail, Inventory tab, add / edit / delete cards, binders and the public binder view — branch `feature/mobile-m2` on top of `feature/mobile-m1`, builder done; see "Mobile app (stage M2)"); 2026-10-05 (mobile stage M1: foundation + Phase 1 accounts on the Expo app, branch `feature/mobile-m1`, verifier fixes incl. the map-based trading-area picker, merged with `main` after #39/#40; see "Mobile app (stage M1)"); 2026-10-04 (web E2E suite isolated on its own database/stack, `npm run e2e:purge`, collectors shown only as 3 km zones on the web, branch `fix/e2e-isolation-3km-zones`, merged as #39); 2026-10-04 (card image cache cap raised from 500 MB to 5 GB, ADR 0015 amendment, branch `feature/card-image-cache-5gb`, builder done and independently verified); 2026-10-03 (map location privacy rendering, ADR 0004 "Client rendering", branch `feature/map-privacy-zoom`, builder done and independently verified); 2026-10-01 (card images + real Yu-Gi-Oh! catalog, ADR 0015, backend, web, "image gaps" and independent verification of workflow `card-images` on branch `feature/card-images`; previously 2026-09-30: final independent verification of the local web MVP)
**Next task:** see "NEXT TASK" at the bottom.

---

## Phase 0 — Foundation

- [x] Monorepo structure (`apps/`, `packages/`, `infrastructure/`, `docs/`, `.github/`)
- [x] Root docs: `README.md`, `CLAUDE.md`, `IMPLEMENTATION_STATUS.md`
- [x] Architecture docs: `docs/architecture/ARCHITECTURE.md`, ADRs 0001–0014, phase contracts in `docs/api/contracts/`
- [x] Local infra: `docker-compose.yml` (PostGIS 17, Redis 7, Firebase Auth emulator), `.env.example` — verified healthy locally
- [x] Spring Boot API skeleton (`apps/api`) — Boot 4.1.1 / Java 21 toolchain; Problem Details handler, request-id filter, SecurityConfig, springdoc (non-prod), Flyway V001+V002, Testcontainers base (`postgis/postgis:17-3.5` + Redis), Spotless, layered Dockerfile. Tests: 30 unit + 20 integration, all green; independently verified. `./gradlew exportOpenApi` writes `docs/api/openapi.json`. Debt: google-java-format pinned 1.28 until Gradle runs on JDK 21; OpenAPI `info.license` lacks `identifier`/`url` (client generator needs `--skip-validate-spec`).
- [x] Angular web skeleton (`apps/web-angular`) — Angular 22 + Material 3 theme from tokens, app shell (top bar, bottom nav <960px, footer), lazy routes incl. map/inventory placeholders, admin shell, 8 legal draft pages, shared UI (empty/error/skeleton/badges/chips), `config.json` loader, interceptors (base URL, request id, ProblemDetail→ApiError), theme service, Playwright smoke (5 pass), 38 unit tests, Dockerfile + nginx + entrypoint. Builder verified; independent verifier was interrupted by the pause (re-run `npm run lint && npm run format:check && npm test && npm run build`). Root npm workspace added (Phase 1, `d85a93f`); the link script is gone.
- [x] Mobile skeleton (`apps/mobile`) — Expo 57 + expo-router six tabs, typed openapi-fetch client, tokens sync, offline banner, 29 jest tests, Maestro smoke flow (replaced by the M1 flows in `apps/mobile/.maestro`), deep links; expo-doctor 21/21. Independently verified. Debt: RNTL pinned 13.3.3; fonts not bundled; EAS project id placeholder. shared-types is now a real workspace dependency (`d85a93f`).
- [x] ML skeleton (`apps/ml`) — FastAPI factory, `/health`, `/ready`, `/v1/identify` (stub identifier + perceptual hashing), `/v1/duplicates`, Pub/Sub push handler with SSRF guards, problem-details errors, pytest ≥85 % coverage, Dockerfile (3.12 image smoke-tested). Independently verified.
- [x] Shared packages: `packages/design-tokens` (JSON → CSS/TS), `packages/api-client` (typescript-angular generated; generator CLI isolated in `tools/`), `packages/shared-types` (openapi-typescript + fetch helper)
- [x] Dockerfiles for api, web (repo-root context), ml
- [x] CI (`.github/workflows/ci.yml` + docker-build, deploy, e2e, codeql, dependabot) — runs on PR #1; fixed in session: `pull-requests: read` for paths-filter, Trivy tag `v0.36.0`, `actions: read` for SARIF/CodeQL, CodeQL v4, executable bit on `gradlew`/entrypoints, shared-types install before mobile typecheck
- [x] Terraform skeleton: 15 modules + dev/staging/prod environments + Cloudflare Terraform, all `terraform validate` clean (providers google 7.46, cloudflare 5.26); Cloudflare setup documented in `infrastructure/cloudflare/README.md`; deployment/security docs in `docs/deployment/`, `docs/security/`. Independent verifier interrupted by the pause (re-run `terraform fmt -check -recursive infrastructure` + validate per env). Debt: plan/apply unproven without GCP credentials; `/internal/*` endpoints must verify Google OIDC tokens app-side; Memorystore TLS off until the API trusts the CA.
- [x] Everything builds — PR #1 CI on `0d68c8a`: API (Gradle incl. Testcontainers), Web, Mobile, ML, Terraform ×4 and change detection green; the web and infra verifications interrupted by the pause were re-executed by those CI jobs. Security job: Trivy gate fixed by the non-root web image; SARIF uploads gated on `CODE_SCANNING_ENABLED` (no GHAS on this private repo)

## Phase 1 — Auth + Users

_Backend complete (stage A `8531fd4` + stage B, workflow `web-mvp-local` stage 1, independently re-verified: 310 API tests green, OpenAPI re-exported, clients regenerated). Web Phase 1 complete (workflow `web-mvp-local` stage 2, independently re-verified: 99 web unit tests + 18 Playwright specs against the real local stack, 0 skipped). Mobile Phase 1 done in stage M1 (2026-10-04, verifier fixes 2026-10-05, branch `feature/mobile-m1`, builder; see "Mobile app (stage M1)")._

- [x] Identity provider abstraction (`IdentityTokenVerifier`), Firebase adapter (emulator via static owner token, ADC in cloud), `StaticIdentityTokenVerifier` for tests, `IdentityAdminClient` — `apps/api/.../auth`; tests AuthenticationIT (13), unit verifier tests
- [x] Bearer token filter → `AuthenticatedUser` principal; provisioning on first login with derived handle; last-active throttled via Redis — `auth` + `users`
- [x] `user_account`, `user_role`, suspension + DELETION_REQUESTED gating (403 ACCOUNT_SUSPENDED), admin MFA authorization manager, service-token/OIDC auth for `/internal/**`, `jobs` module (`job_run`) — migration V003; tests RbacIT, AdminMfaIT, AdminUsersIT, ServiceAuthIT
- [x] Profile: display name, handle (`HandleRules`: 3–24 `[a-z0-9_]`, reserved list, 409 HANDLE_TAKEN, audited change), bio, games (`games` module `GameCatalog`, DB-backed by `GameService` since Phase 2; `orenji.games.slugs` removed), languages, avatar (multipart `POST/DELETE /me/profile/avatar` → `AvatarImageProcessor` 512×512, EXIF stripped, decompression-bomb guard → `ObjectStorage` (`LocalFileObjectStorage` default, `GcsObjectStorage` only with `STORAGE_PROVIDER=gcs`), served by `GET /public/media/{key}`) — `apps/api/.../profiles`, `common/storage`; migration V004; tests ProfileIT (8), AvatarImageProcessorTest, ObjectKeysTest, HandleRulesTest. Debt: avatars re-encoded as JPEG, not WebP (no JDK WebP encoder; TwelveMonkeys reads WebP only)
- [x] Tag system (`tag` with 22 curated tags, `profile_tag`, `GET /tags` search, `PUT /me/profile/tags` max 12 incl. CUSTOM labels 2–24 chars) with `moderation_rule` + `TextModerationService` banned-term check (rules cached 60 s) — `profiles`, `moderation`; migration V004; tests TagIT (4), CustomTagLabelsTest. Debt: admin tag/rule moderation UI lands with Phase 7
- [x] Privacy settings (`privacy_settings`, `GET/PUT /me/settings/privacy`, defaults: not discoverable, online status hidden, profile MEMBERS, messaging MEMBERS_WITH_PROFILE, wishlist hidden) + `PrivacyPolicyService` (profile visibility, messaging, distance/last-active/online display) — `profiles`; migration V004; tests SettingsIT, PrivacyPolicyServiceTest, LastActiveBucketTest
- [x] Approximate location (ADR 0004): `GET/DELETE /me/location`, `PUT /me/location/trading-area` (radius 1–50 km, MANUAL/DEVICE), `ApproximateLocationService` (0.009° grid snap + deterministic HMAC-SHA256 per-user jitter with 0.001° margin, 3 decimals), `StaticRegionGeocoder` (34 regions) public labels, `public_point` NULL while not discoverable / suspended / deletion pending, bucketed distances, startup guard on `LOCATION_JITTER_SECRET` outside local/test — `location`; migration V005; tests LocationIT (6), GeoPrivacyContractTest (collector profiles + admin user detail over all seeded users, logs scanned), CollectorProfileIT (5), ApproximateLocationServiceTest (10), StaticRegionGeocoderTest, LocationConfigTest. `GET /collectors/{handle}` public profile (privacy-respecting, 404 when PRIVATE/deleted/suspended). Debt: `LOCATION_JITTER_SECRET` not yet wired into Terraform/Secret Manager (deferred, docs/deployment/DEFERRED.md)
- [x] Account settings: notification preferences (`notification_preferences`, `GET/PUT /me/settings/notifications`, 8 categories × push/email/in-app, quiet hours), messaging permission and discoverability via privacy settings — `notifications`, `profiles`; migration V006; tests SettingsIT
- [x] Account deletion + export: `POST/GET /me/deletion-requests`, `DELETE /me/deletion-requests/{id}` (5-min re-auth window, 7-day grace, `DeletionParticipant.blockers()` → 409 DELETION_BLOCKED, sessions revoked, off the map), `POST /internal/jobs/account-deletion` + hourly `@Scheduled` under `local` (anonymise, purge participants, delete emulator/Firebase user, keep consents/audit, `job_run`), `GET /me/export` via `ExportContributor`s (attachment, 10/hour) — `users`, admin detail shows pending request; migration V007; tests DeletionIT (5), ExportIT (2). Deviations: sessions are revoked instead of disabling the Firebase user (keeps the cancel endpoint reachable); extra `GET /me/deletion-requests`; export limit follows the contract table (10/hour)
- [x] Terms acceptance: `legal_document` (8 seeded, v2026-09-01) + `user_consent` (version, timestamp, hashed IP, UA), 428 TERMS_ACCEPTANCE_REQUIRED enforcement, `GET /public/legal/documents`, `POST /me/consents` — tests TermsIT, ConsentIT
- [x] Web: register/login/verify/reset, onboarding (games, tags, trading area), settings pages — `apps/web-angular/src/app`: `core/auth` (Firebase JS SDK lazily loaded behind `FirebaseAuthPort`, Auth emulator locally; `AuthService`, `SessionService` (`GET /me`, states anonymous/loading/ready/consent-required/suspended/deletion-pending/error with retry banner), auth interceptor (Bearer except `/public/**` and `/meta`, one forced-refresh retry on 401), session interceptor (428 → `/auth/consent`, 403 ACCOUNT_SUSPENDED → `/auth/suspended`), guards auth/account/onboarding/accountState/admin/guest + `safeReturnUrl`), `features/auth` (sign-in, sign-up with legal consents, verify-email, reset-password, consent, suspended/deletion-pending with cancel + export), `features/onboarding` (3-step wizard: profile with handle 409 field error, games/languages/tags, trading area on Leaflet), `features/settings` (profile + avatar, privacy, notifications, trading area, account: export, deletion with re-auth and cancel, appearance), `features/collectors` (`/collectors/:handle`, 404 and members-only states), `features/admin` (dashboard counts, users list/detail with roles editor, suspend/unsuspend, audit logs), `shared/map` (`MapAdapter`, lazy Leaflet/OSM default, Google only with a key), `shared/location` (`TradingAreaPicker`, 3-decimal rounding), `shared/profile`, `shared/ui` (avatar, card-art, confirm-dialog, game-chip, section-card). Generated `@orenji/api-client` only. Tests: 99 Vitest unit tests (19 files); Playwright `e2e/auth.spec.ts` (5), `e2e/settings.spec.ts` (4, incl. every JSON response ≤ 3 decimals for lat/lng), `e2e/admin.spec.ts` (4), `e2e/smoke.spec.ts` (5) — 18/18 pass against `api-phase2.jar` + docker compose + Auth emulator. Deviations/debt: `core/http/accept-header.interceptor.ts` widens `Accept` because the generated client sends `application/problem+json` on 204 operations and the API answers 406 (fix in the API or generator config later); generator types `uniqueItems` role lists as `Set` → `roleList()`/`rolePayload()` helpers; route is `/collectors/:handle` (not `/c/:handle`); onboarding guard requires only profile + interests (trading area skippable); Binder/Message/Report buttons disabled "Coming soon" until Phases 3/5/7; game list is still hard-coded in `shared/domain/games.ts` (switch to `GET /games` with web Phase 2); initial bundle 884 kB after the Phase 2 client regeneration (900 kB warning budget)
- [x] Mobile: login/register, profile tab, settings — stage M1 (builder, 2026-10-04): the parked `wip/mobile-auth-partial` work reconciled with today's API and the web flows. `apps/mobile`: `src/config/env.ts` (one typed config, Android `10.0.2.2` / iOS + web `localhost` defaults, `.env.example` public values only); `src/auth` (Firebase behind an `AuthPort`, React Native persistence on AsyncStorage / browser persistence on web, Auth emulator, sign-up with display name, sign-in, reset, re-auth, sign-out, friendly errors); `src/api` (openapi-fetch on `@orenji/shared-types`, ID token + one forced-refresh retry after 401, RFC 9457 → `ApiError`, 428/403 account signals, React Native response class handled); `src/account` (`/me`, consent / suspended / banned / deletion-pending / onboarding gate); screens sign-in, sign-up with versioned legal documents read in-app, verify email, reset password, consent, account status (cancel deletion, export), onboarding (profile, interests, trading area picked like on the web: a tap on the map or a dragged pin, "Use map centre", city quick picks with their suggested radius, a 1–50 km radius, or the device at reduced accuracy rounded to 3 decimals and sent only to the API, never drawn; map opt-in off by default), Profile tab + public preview, Settings (profile + avatar, location and discoverability, privacy, notifications, account with export and deletion, appearance, legal); building blocks `CardImage` (API picture URLs only + provider credit), form controls, `QueryState`, snackbar, confirm dialog, query keys. Maps follow ADR 0010 (amended 2026-10-05): Apple Maps on iOS, Google Maps on Android only in a build with the project's key, otherwise (Expo Go, whose bundled Google key the Maps SDK refuses) Leaflet + OpenStreetMap in a WebView. Tests: 231 jest tests (33 suites), 12 Playwright specs on the Expo web build (`npm run test:mobile:e2e`, 3 of them run the Android WebView map page in Chromium), 5 Maestro flows on Android in Expo Go (`npm run test:mobile:maestro`). First independent verification failed on the trading-area picker (city presets only, no map); fixed (see "Mobile app (stage M1)", verifier fixes); re-verification pending
- [x] Tests (API): auth filter, RBAC, audit, rate limit, consent, seed, profiles, tags, location, geo privacy contract, settings, deletion job, export — 310 API tests (45 classes, unit + Testcontainers ITs), 0 failures, 0 skipped on `./gradlew spotlessCheck build --rerun-tasks`; web/mobile flow tests come with their UI stages
- [x] Audit log (`audit_log`, `AuditService`, `GET /admin/audit-logs`) and admin user endpoints (list/get/suspend/unsuspend/roles), every write audited — tests AuditIT
- [x] Rate limiting (Redis Lua token bucket, property-driven policies, X-RateLimit headers, fail-open) — tests RateLimitIT
- [x] Seed accounts: 12 fictional users + roles + consents, Firebase emulator users created by the runner, plus fictional profiles/tags (`db/seed/profiles.json`) and neighbourhood-level trading areas (`db/seed/locations.json`; collector7 and staff not discoverable) — SeedDataRunnerIT, SeedIT

## Phase 2 — Card Catalog

_Backend complete (workflow `web-mvp-local` stage 2, independently re-verified: 354 API tests / 55 classes green on `./gradlew spotlessCheck build --rerun-tasks`, OpenAPI re-exported (59 paths, no Phase 1 path/schema lost), clients regenerated, live smoke on `api-phase2.jar`). Web Phase 2 complete (stage 3, independently re-verified: 153 web unit tests / 31 files, 26/26 Playwright specs against `api-phase3.jar`, 0 skipped). Mobile: stage M2 (2026-10-05, see "Mobile app (stage M2)")._

- [x] `game`, `card`, `card_set`, `card_printing`, `card_image` with JSONB metadata — migrations V012 (`game` with a `GameSchema` jsonb per game) and V013 (`card_set`, `card`, `card_printing`, `card_image`, `catalog_sync_run`; generated tsvector columns, trigram, jsonb GIN and printing-code indexes). `games` module: `GameService` implements `GameCatalog` from the DB (ACTIVE games only), replacing `ConfiguredGameCatalog`/`GamesProperties`/`orenji.games.slugs`. Tests GamesIT (3)
- [x] `CardProvider` interface + `MockCardProvider` + import/sync pipeline — `apps/api/.../cards`: `CardProvider` (contract shape), `MockCardProvider` (profiles local/dev/test), idempotent `CatalogImportService` (keyed by `external_ref`, per-game advisory lock, only changed rows rewritten, stable slugs), `POST /admin/catalog/sync` → 202 + `CatalogSyncRequestedEvent` handled by an `@ApplicationModuleListener`, `GET /admin/catalog/sync-runs[/{id}]`, `GET /admin/catalog/providers`. Tests CatalogImportIT (3). Real provider since 2026-10-01: `YgoProDeckCardProvider` (see "Card images + real Yu-Gi-Oh! catalog")
- [x] Seed catalog: Yu-Gi-Oh!, Pokémon, Magic: The Gathering, Riftbound (fictional-safe subset) — `db/seed/catalog/{yugioh,pokemon,mtg,riftbound}.json`, 4 sets / 20 cards / 40 printings per game, invented names, per-game metadata; imported at local/dev startup by `CatalogSeedContributor` (order 400). Server-generated SVG placeholders `GET /public/placeholder-images/{game}/{slug}.svg` (escaped, no scripts, CSP, 1-day cache, ETag/304) — tests CatalogMetadataIT (5), PlaceholderImageIT (3)
- [x] Catalog search: FTS + trigram, filters (game, set, rarity, language, edition) — `CatalogQueryRepository`: `ts_rank_cd` FTS, trigram fallback under 5 hits, accent-insensitive, printing-code short-circuit, set/rarity/language/edition filters and typed `metadata.<key>` filters (jsonb containment, validated against the `GameSchema`), `GET /cards/suggest` — tests CatalogSearchIT (9), CatalogTextTest (4)
- [x] `/api/v1/games`, `/api/v1/cards`, `/api/v1/cards/{id}/printings`, `/api/v1/sets` — plus `/games/{slug}`, `/cards/{id}`, `/printings/{id}`, `/sets/{id}`; public GET routes (`SecurityConfig.PUBLIC_GET_PATTERNS`, also exempt from the account-state and 428 terms checks); admin writes `POST/PUT /admin/games`, `/admin/sets`, `/admin/cards`, `POST /admin/cards/{id}/printings`, `PUT /admin/printings/{id}` (audited, schema-validated) — tests AdminCatalogIT (3), CatalogSearchIT. Deviation: OpenAPI path is `/public/placeholder-images/{game}/{file}` (file = `<slug>.svg`)
- [x] Web card search UI (autocomplete) and card detail — `apps/web-angular/src/app`: `shared/catalog` (top-bar `CardSearchBoxComponent` on `GET /cards/suggest`: 250 ms debounce, keyboard navigation, printing suggestions open the card with `?printing=`, Enter without a highlight searches `/cards?q=`, deferred chunk; `GamesStore` on `GET /games`, card image/tile/grid, catalog labels), `features/catalog` (`/cards` with query, game pills and set/rarity/language/edition filters from the `GameSchema`, all state in the URL, paginated grid, printing-code badge; `/cards/:id` with schema-driven attributes, selected printing and printings table with market prices; `/sets/:id` with a paginated checklist), `/search` previews matching cards, profile game picker now from `GET /games`. Skeleton/empty/error-with-retry states. Tests: Vitest units (card search params, card metadata, catalog labels, search box), Playwright `e2e/catalog.spec.ts` (4: keyboard autocomplete → card detail → printings → set page; filters kept in the URL across reload; printing-code search from the page and the autocomplete; not-found state). Deviations/debt: `metadata.<key>` filters not exposed (the generator emits no dynamic query parameters); no `/sets` index page yet; "Who has this near me" / "Add to wishlist" disabled until Phases 4/6; E2E specs serve placeholder card images from memory (`stubCardImages`) because the API counts each image against the anonymous 60/min per-IP rate limit shared by the parallel suite
- [x] Mobile card search UI and card detail — stage M2 (builder, 2026-10-05): Search tab (`app/(tabs)/search.tsx`: live typo-tolerant `GET /cards` search across games, 350 ms debounce, game pills, set (`GET /sets?game=`) / rarity / language / edition filters from the game schema with the web's `withFilter` rules, infinite pages, printing-code match badge, recent searches per account on the device, empty / error-with-retry / offline states, links into the tab apply a set) and card detail (`app/cards/[id].tsx`, `?printing=`: `CardImage` (API picture URLs only) with the YGOPRODeck credit line, schema-ordered attributes, the selected printing with market price, every printing (`PrintingList`), the set opens the Search tab filtered by it, "Add to inventory" (the add flow with card and printing preselected), "Who has this near me" opens the Map tab with `?card=` until the card filter of stage M3; not-found / error states). "Add to wishlist" is left out: the web adds wishes through the wishlist dialog (criteria, radius), the mobile wishlist stage brings it. Tests: jest (`search.test.tsx`, `card-detail.test.tsx`, `cardSearch.test.ts`, `catalog.test.ts`, catalog hooks), Playwright `catalog.spec.ts` (2), Maestro `search-card-detail.yaml`
- [x] Tests: provider contract, search ranking, JSONB metadata per game — CatalogImportIT, CatalogSearchIT, CatalogMetadataIT, AdminCatalogIT, PlaceholderImageIT, GamesIT, CatalogTextTest
- [x] Platform rules (ADR 0014, plan item 2): feature flags — `featureflags` module, migration V010 (7 default flags), `FeatureFlags.isEnabled/require/evaluateAll` (60 s Redis cache evicted after commit, deterministic CRC32 rollout bucket per account), `GET /public/feature-flags`, `GET /admin/feature-flags`, `PUT /admin/feature-flags/{key}` (SUPER_ADMIN, audited); local/dev seed enables `protectedPayments`, `advertising`, `donations` (fake providers), `mlScanning` stays off; `FEATURE_DISABLED` now renders 404 with a `feature` extension — tests FeatureFlagsIT (4). Plans/limits/entitlements: see Phase 10. `common/cache/RedisJsonCache` fail-open read-through cache. Debt: no contract document covers the feature-flag endpoints (the exported `openapi.json` is the field-level truth)
- [x] Web platform rules + catalog admin (stage 3) — `core/feature-flags` (`FeatureFlagsService` on `GET /public/feature-flags`, sends the ID token when signed in via the new `ATTACH_ID_TOKEN` context so rollouts are per account, flags off until known, reload on sign-in/out; `featureGuard(key, label)` guards `/community` (`publicChat`)), `core/limits` (429 `LIMIT_REACHED` interceptor + lazy dialog: limit label/key, used/limit, reset time, plan, Premium value from `GET /plans`, "See Premium" while `premiumPlans` is on; snackbar fallback; opt out with `SKIP_LIMIT_DIALOG`), `features/premium` (`/premium`: plans + `GET /me/plan` usage; upgrade disabled until Phase 10), `features/admin/games` (list incl. hidden, schema JSON editor with live validation, format and preview), `features/admin/cards` (search, `/admin/cards/:id` editor with schema-driven attributes and printing dialog, mock catalog sync panel polling runs), `features/admin/feature-flags` (switch with confirmation, SUPER_ADMIN; read-only for ADMIN), `features/admin/usage-limits` (plans × limits matrix, inline edit, Enter/Escape, SUPER_ADMIN), audit labels for Phase 2 actions. Fixes: `SearchFieldComponent` now handles the native submit event (it used `(ngSubmit)` without a form directive); footer `/meta` probe sends the token when signed in and loads lazily. Tests: Vitest units (feature flags, feature guard, limit-reached parsing/interceptor/dialog, schema validation, limit matrix, cell editor, plan labels), Playwright `e2e/admin-rules.spec.ts` (4: SUPER_ADMIN flag switch with cancel + confirm persisting after reload, inline PREMIUM limit edit persisting and shown on `/premium`, ADMIN read-only, game schema validation + mock sync; state restored through the API). Verifier fix: `packages/api-client/package.json` now declares `"sideEffects": false` so unused generated services are tree-shaken (initial bundle 927.77 kB → 835.50 kB after the Phase 3 regeneration; 900 kB warning budget). Debt: set/printing creation has no admin UI yet (the user entitlements panel and the plan editor landed with web Phase 10, stage 11); the limit-reached dialog is covered end to end since stage 4 (`inventory.spec.ts`) and stage 11 (`freemium.spec.ts`)

## Phase 3 — Inventory + Binders

_Backend complete (workflow `web-mvp-local` stage 3, independently re-verified: 413 API tests / 67 classes, 0 failures, 0 skipped on `./gradlew spotlessCheck build --rerun-tasks`; OpenAPI re-exported (81 paths, previously 59, no path or schema lost; every contract route present); clients regenerated; live check on `.local-dev/api-snapshots/api-phase3.jar` (seeds 10 binders / 36 items)). Web `/inventory` and public binder pages complete (workflow `web-mvp-local` stage 4, independently re-verified: 185 web unit tests / 38 files, 30/30 Playwright specs against `api-phase4.jar`, 0 skipped); mobile: stage M2 (2026-10-05, see "Mobile app (stage M2)"). Module order `delisting` ← `binders` ← `inventory` (inventory implements the `binders` `BinderContents` extension point, no cycle)._

- [x] `binder`, `inventory_item` (quantity, condition, language, printing, edition, price, availability, visibility, notes) — migrations V021 (`binder`, generated `search_vector` + GIN) and V022 (`inventory_item` with the contract indexes and the `trg_inventory_item_binder_count` trigger maintaining `binder.item_count`, `inventory_item_image`, `inventory_freshness_event`); `binders` (`BinderService`: CRUD, publish PUBLIC/ONE_HOUR/ONE_DAY/UNTIL_DISABLED, unpublish, confirm, reorder, delete that unfiles or `?deleteItems=true`; `binders.max` via `Limits.consume` + a `LimitUsageSource`) and `inventory` (`InventoryService`: CRUD, PATCH with absent-vs-null semantics through `common/PartialUpdate`, soft delete, confirm, ≤ 4 photos re-encoded to JPEG ≤ 1600 px through `ObjectStorage` (rate-limited 60/hour), summary); export contributors and deletion participants for both; seed `db/seed/inventory.json` (`InventorySeedContributor`, order 500) — tests InventoryIT (9), BinderIT (8, incl. `binders.max` → 429), ItemImageProcessorTest (4), PartialUpdateTest (4), DeletionIT (extended), SeedDataRunnerIT (extended)
- [x] Visibility: PRIVATE / PUBLIC / TEMPORARILY_PUBLIC (until timestamp); binder-level too — `binders/domain/PublicVisibilityRules` (SQL fragments + pure Java twin evaluated live on every public read; `publicUntil` ≤ 30 days ahead), `ListingReconciler` keeps a materialised `publicly_listed` flag so `InventoryItemPublished`/`Unpublished` and `BinderPublished`/`Unpublished` fire once per transition (Modulith outbox), re-run on suspend/unsuspend/`PrivacySettingsChangedEvent` (new, published by `PrivacySettingsService.update`) — tests VisibilityIT (4), VisibilityRulesTest (5), EventsIT (3)
- [x] Freshness fields: created/updated/confirmed/lastOwnerActivity + freshness status calc — V020 `delist_policy` (exactly one active row; seed ACTIVE 0–14 / AGING 15–30 / STALE 31–45 / HIDDEN 46+, warn 5 days before hiding, `max_strikes` 3), `delisting` (`FreshnessPolicy`, `FreshnessLabels` "Updated 3 hours ago", `DelistPolicyService` Redis-cached + audited admin update, `FreshnessEventLog`), `FreshnessService`/`FreshnessJob` `POST /internal/jobs/freshness` (hourly `@Scheduled` under `local`; expired temporary publications → PRIVATE, AGED/STALED/HIDDEN/RESTORED/WARNED events, `BinderFreshnessChanged`, `BinderFreshnessWarning`; never deletes), `DelistJob` `POST /internal/jobs/delist` (records a `job_run`, no-op until strikes exist), `GET/PUT /admin/delist-policies` (Phase 7 contract, ADR 0014) — tests FreshnessPolicyTest (5), FreshnessJobIT (5), AdminDelistPolicyIT (2)
- [x] Bulk operations: select, change visibility, move binder — `POST /inventory/items/bulk` (`SET_VISIBILITY`, `MOVE_TO_BINDER`, `SET_AVAILABILITY`, `CONFIRM`, `DELETE`; one transaction; per-id ownership, `skipped[].reason` NOT_FOUND/UNCHANGED) — tests BulkOperationsIT (4)
- [x] Public binder views + collector public profile endpoint — `GET /collectors/{handle}/binders`, `GET /public/binders/{id}` (owner block with region label + distance bucket only; `binder.views.per_day` consumed once per binder and UTC day for signed-in non-owners), `GET /public/binders/{id}/items`, `GET /collectors/{handle}/inventory` (`PublicInventoryItem`, never `notes`); routes added to `SecurityConfig.PUBLIC_GET_PATTERNS` — tests PublicBinderIT (3), GeoPrivacyContractTest `publicListingsNeverCarryCoordinatesOrPrivateNotes` (every public listing route of the seeded collectors, anonymous and signed in: no coordinates, ≤ 3 decimals, no private notes, logs clean). Contract deviations (documented in `apps/api/README.md`, contract docs not yet edited): PRIVATE profiles never publish; additive columns (`binder.freshness_state`/`warned_at`/`publicly_listed`/`listing_changed_at`, `inventory_item.warned_at`/`publicly_listed`/`listing_changed_at`, `inventory_freshness_event.owner_id`, `delist_policy.max_strikes`/`created_at`) and response fields (`BinderResponse.sortOrder`/`effectivePublic`/`games`/`coverPrintingId`, `PublicInventoryItem.binder`, `PublicBinderResponse.kind`/`publicUntil`/`coverImageUrl`, summary `agingCount`/`effectivePublicCount`, list params `unfiled`/`direction`); photo upload answers 201 with the item. Debt: photos JPEG not WebP; binder names/descriptions and public notes not yet run through `TextModerationService` (Phase 7); web must send the token on `GET /public/binders/{id}` for `binder.views.per_day` to count
- [x] Web `/inventory` page (filters, table/grid, edit drawer, bulk bar, binder manager) — `apps/web-angular/src/app/features/inventory` (stage 4): container page with all state in the URL (`?binder=<id>|unfiled&q&game&visibility&availability&condition&freshness&sort&view&page&size`), `InventoryStore` + `BinderActionsService` shared with the dialogs; binder list (All cards / Unfiled / binders with visibility icon and counts, horizontal strip < 960 px); summary strip (cards/copies, public, private, temporarily public with next end, stale + hidden "needs confirmation" with "Confirm all"); privacy notice when public content cannot be seen (not discoverable / profile not PUBLIC) and per-item/binder visibility explanations; toolbar (search, All/Private/Public/Temporarily public segmented control, game, availability, condition, freshness, sort, grid/table); selected-binder header (publish 1 h / 24 h / until disabled, make private, public page, edit, confirm, delete); grid cards + table rows with quantity stepper (PATCH in place), visibility and server-labelled freshness badges; bulk bar (visibility incl. temporary 1 h / 24 h / 3 / 7 / 30 days, move to binder/unfiled, availability, confirm, delete; skipped cards and reasons listed); "Add card" dialog (`/cards/suggest` → printing picker → details, Private by default); edit side panel (changed fields only as PATCH, ≤ 4 photos, confirm, delete); binder form dialog (`binders.max` → limit-reached dialog + inline message); binder manager (drag and drop, keyboard move buttons keeping focus, inline rename, publish/private, delete, create). Public binder page `features/binders` (`/binders/:id`, ID token attached when signed in so `binder.views.per_day` counts; owner card = region label + distance bucket only; game pills/search/availability in the URL; never private notes; 404 / 429 / error-with-retry states). Collector page: "View public binder" wired, public binders + 8-card inventory preview; card detail "Add to inventory"; signed-out `/inventory` shows a sign-in invitation. Shared `shared/inventory`, `shared/ui/visibility-badge`, `FreshnessBadge` `label`/`compact` inputs. Generated `@orenji/api-client` only. Tests: Vitest units (inventory-params, item-form, bulk-actions, visibility-status, inventory.store, quantity-stepper, inventory-labels, freshness-badge) — 185 web unit tests / 38 files; Playwright `e2e/inventory.spec.ts` (4: add card → binder → move → public → edit + photo + publish until disabled + reload; bulk temporary publication / availability with skipped reason / move / private / delete; a second collector opens the published binder from the owner's profile with every JSON lat/lng ≤ 3 decimals; `binders.max` limit-reached dialog + keyboard reorder persisted + delete) — 30/30 Playwright specs green against `api-phase4.jar`. Debt: a `/sets` index page still pending (stage 3 carry-over; admin user entitlements and plan editing landed in stage 11)
- [x] Mobile inventory tab optimised for card management — stage M2 (builder, 2026-10-05): Inventory tab (`app/(tabs)/inventory.tsx`, Cards | Binders): cards with search, binder (all / unfiled / one) / game / intent (`availability`) filters and sorting (recently updated, name, price both ways) in bottom-sheet selects, infinite list rows (picture, printing code, condition, copies, price, intent, offers, visibility, freshness), totals (`GET /inventory/summary`), stale or hidden cards with "Confirm all" (bulk `CONFIRM`), listing health (`GET /me/listings/status`: paused banner with "Resume listings" after a confirmation, or moderation review; strikes reminder); add a card (`app/items/new.tsx`: `GET /cards/suggest` → `GET /cards/{id}` printing → details (copies, condition / language / edition / finish from the game schema, intent + accepts offers exactly as the API models them, price and currency, private / public / temporarily public 1 h–30 days, binder, public and private notes; the web's validation) → `POST /inventory/items`); edit (`app/items/[id].tsx`: `PATCH` of the changed fields only, visibility explained, "Still available" → `POST .../confirm` for stale / hidden cards, delete with a confirmation); binders (`app/binders/[id].tsx` own view: status and freshness, publish 1 h / 24 h / until disabled, make private, confirm, rename (`binders/edit`), delete (cards become unfiled), "Add cards" (bulk `MOVE_TO_BINDER`), remove a card (`binderId: null`), public page; public view for any other binder: owner area label + distance bucket, public cards and notes only, availability filter, 404 and binder-views limit states; `binders/new` with the `binders.max` limit explained in place). Public binder reads carry the ID token when signed in (the web's `ATTACH_ID_TOKEN`). Not on mobile yet: item photos, the multi-select bulk bar, binder reordering, set pages
- [x] Tests: visibility enforcement, ownership, bulk ops, freshness — InventoryIT, VisibilityIT, BulkOperationsIT, BinderIT, PublicBinderIT, FreshnessJobIT, EventsIT, AdminDelistPolicyIT, BinderViewLimitIT (3, stage 4: FREE visitors consume one view per binder and day, owner/signed-out views never count, PREMIUM and entitled visitors unlimited) + unit FreshnessPolicyTest, VisibilityRulesTest, ItemImageProcessorTest, PartialUpdateTest; shared `TestDomainEventsConfiguration` records committed events; web flow tests: Playwright `inventory.spec.ts` (4); mobile (stage M2): jest (`inventory.test.tsx`, `items.test.tsx`, `binders.test.tsx`, `itemForm.test.ts`, inventory / binder hooks), Playwright `inventory.spec.ts` (2) and `binders.spec.ts` (3), Maestro `inventory-add-edit-delete.yaml` and `binder-create-add-item.yaml`

## Phase 4 — Map + Geographic Search (flagship)

> **Reworked by stage S1 (ADR 0017, 2026-10-08):** no positions or distances any more; the items
> below describe the original Phase 4. See "Platform regions and the self-declared location (stage S1)".
> The mobile Map tab draws the region map since mobile stage M9 (2026-10-12): see "Mobile app:
> regions and the region map".

_Backend complete (workflow `web-mvp-local` stage 4, independently re-verified: 463 API tests / 77 classes, 0 failures, 0 skipped on `./gradlew spotlessCheck build --rerun-tasks`; OpenAPI re-exported (86 paths, previously 81; every contract route present; no path or schema lost, only `PublicBinderSummary` gains an optional `owner`); clients regenerated; live check on `.local-dev/api-snapshots/api-phase4.jar` with an emulator token). Migration V030 only (range V030–V039). Web `/map` and `/search` complete (workflow `web-mvp-local` stage 5, independently re-verified: 247 web unit tests / 51 files, lint + format clean, production build 841.71 kB initial with no warnings, 32/32 Playwright specs against `.local-dev/api-snapshots/api-phase5.jar`, 0 skipped); mobile: stage M3 (2026-10-05, see "Mobile app (stage M3)"). Contract deviations are documented in `apps/api/README.md` ("Deviations from the Phase 4 contract"; the contract document itself is not edited): the caller's own marker stays in `nearby`; collectors without public listings appear (`binderFreshness: null`, ranked after AGING), all-STALE collectors never do; ranking freshness → distance bucket → rating → distance; `center` snapped to 2 decimals; additive `MatchingItem`/`suggest` fields; `card-holders` needs a centre (400 for signed-out callers without `lat`/`lng`); the plan cap key is `map.radius.max_km` (V011) where the contract says `map.radius.max`; `nearby` is a reserved handle. Since Phase 5 blocks are real (`BlockRelationProvider.blockedAmong`, one lookup per page) but still applied after the cached page is read, so `total` may count blocked collectors beyond the limit (debt: join blocks into the discovery SQL)._

- [x] `/api/v1/collectors/nearby` (PostGIS `ST_DWithin` on `public_point`), bucketed distances — new module `apps/api/.../search`: `DiscoveryController` (`GET /collectors/nearby`, `GET /collectors/{handle}/preview`), `CollectorDiscoveryService`, `GeoScopeResolver` (centre = `lat`/`lng` or the caller's own trading area via `LocationService.searchCentreOf`, snapped to 0.01° inside the `location` module; radius capped by `Limits` `map.radius.max_km` → 429 LIMIT_REACHED, FREE rule for signed-out callers via the new `Limits.checkValueForAnonymous`; default 10 km), `MarkerAssembler` (per-viewer `PrivacyPolicyService` rules incl. new `canAppearOnMap`/`canAppearInNameSearch`: distance buckets for signed-in callers only, last active, online status, blocks, rating), `MarkerRanking`, `infra/CollectorSearchRepository` (SQL on `user_location.public_point` only, reusing `PublicVisibilityRules` and `InventoryItemRepository.LISTED`; STALE/HIDDEN items never match), `NearbyCache` (Redis 60 s, key `orenji:cache:nearby:<generation>:<sha256 of the snapped request>`) + `NearbyCacheInvalidator` (generation bumped after commit on item/binder publish/unpublish, `BinderFreshnessChanged`, `TradingAreaChanged`, `LocationRemoved`, `PrivacySettingsChanged`, `UserSuspended`/`UserUnsuspended`); routes added to `SecurityConfig.PUBLIC_GET_PATTERNS` (anonymous reads with reduced detail); `DistanceBucket.upperKm()`, `location/domain/SearchCentre`; migration V030 (`ix_inventory_item_owner_discovery`, `ix_inventory_item_printing_discovery`, `ix_privacy_settings_map`, `ix_binder_name_trgm`) — tests NearbyCollectorsIT (8: radius/freshness ranking/details by sign-in state, filters, hidden collectors, plan radius 429, preview messaging state, centre required for signed-out callers and defaulting to the own trading area, limit truncation, cache invalidation), SearchCentreTest (2). Debt: blocked collectors are filtered after the page is read (so `total` may count them) until Phase 5 blocks are joined in SQL; ratings arrive with Phase 7
- [x] `/api/v1/search` unified (cards, printings, sets, collectors, public binders) — `SearchController` (`GET /search`, `/search/suggest`), `SearchService` (resolution via new `CatalogService.resolve`/`CatalogResolution`: an exact printing code resolves the printing, a shared code / exact name / single card hit resolves the card; `collectors` then lists nearby holders with the `nearby` engine; public binders with an optional owner block via `PublicBinderService.publicBinders`; collector text matching substring-only; `suggest` mixes CARD/PRINTING/SET/COLLECTOR/BINDER/TAG), `infra/BinderSearchRepository` — tests SearchIT (4), SearchDomainTest (5)
- [x] Card-holder search: collectors near me with printing X (filters: sale/trade/offers, price, freshness, condition) — `GET /search/card-holders` (`printingId`|`cardId`, availability, condition, min/max price, freshness, edition, language, acceptsOffers, `sort=distance|price|freshness`, paged `PageResponse<CardHolderResult>`; the caller's own items excluded), `infra/CardHolderRepository`, `PublicInventoryService.publicItems(ids)` — tests CardHoldersIT (4)
- [x] Web `/map` page: MapAdapter (Google Maps / Leaflet fallback), markers, preview card, messages panel (collapsible), filters bar — `apps/web-angular/src/app/features/map` (stage 5): `MapPageComponent` container + `data/map-discovery.store.ts`; filters in the URL (game, availability, freshness, tags, radius, card/printing, `view=list`), never the map position; signed-in collectors with a trading area are centred by the server (first `GET /collectors/nearby` without `lat`/`lng`; the page never calls `GET /me/location`), signed-out visitors / collectors without an area get Montréal + city picker + "Sign in / Set my area" prompt (`area-prompt`, `shared/discovery/discovery-centre.ts`); viewport moves debounced 400 ms, re-query only when the view leaves the circle last answered, visible radius capped by the plan's `map.radius.max_km` (`GET /me/plan`, FREE when signed out), centre rounded to 2 decimals, 429 LIMIT_REACHED → limit-reached dialog + retry at the cap, 400 (no trading area) → Montréal; avatar markers with a freshness ring (`markerIconHtml`, HTML-escaped, both adapters), in-house screen-space clustering above 60 (selected collector never clustered, cluster click zooms), keyboard-focusable markers (Enter/Space → preview); `collector-preview` card on `GET /collectors/{handle}/preview` + first public binder (View profile / View public binder / Message disabled until web Phase 5; Escape restores focus; bottom sheet on phones); `collector-list` accessible "List" toggle; `map-canvas`, `map-filters-bar` (game, radius slider, availability, freshness, lazily loaded tags), `map-legend` ("Positions are approximate to protect privacy"; since 2026-10-03 "Locations are approximate (about 2 km) to protect privacy", see "Map location privacy rendering"), `discovery-panel` (map search box on `GET /search/suggest` grouped by type: card/printing → "Holders of X" side list with chips and prices, collector → preview, tag → filter, set/binder → their pages; Messages placeholder panel); `shared/map` gains `zoomControlPosition`, `shared/search`. `/search` (`features/search`: `?q=` tabs Cards / Collectors / Binders on `GET /search` with a nearby-holders banner when resolved; `?card=`/`?printing=` card-holders view on `GET /search/card-holders` with every filter, inline-validated price range, sort and pagination); card detail "Who has this near me" → `/map?card=<id>&view=list`. Generated `@orenji/api-client` only. Tests: Vitest (map page, store, adapter, list, preview, filters, search pages) — 247 web unit tests / 51 files; Playwright `e2e/map.spec.ts` (2, see below); `e2e/support/stack.ts` gains `stubMapTiles` (OSM tiles served from memory) and `createOnboardedCollector({area, displayName})`. Debt: the Messages panel is a placeholder until web Phase 5; admin entitlements / plan editing UI and a `/sets` index page still pending (carry-over)
- [x] Collector preview → full profile → public binder → message — API: `GET /collectors/{handle}/preview` (marker + `canMessage`/`isBlocked`, 404 for collectors not on the map; NearbyCollectorsIT; `canMessage`/`isBlocked` real since Phase 5); web: marker → preview → full profile → public binder proven by Playwright `map.spec.ts`; "Message" from the preview opens (or creates, `POST /conversations`) the conversation in the map's Messages panel and the collector page's Message opens `/messages/:id` (stage 6, Playwright `messaging.spec.ts`)
- [x] Mobile map tab with bottom-sheet preview — stage M3 (2026-10-05, branch `feature/mobile-m3`, merged into `main` as #46): collectors as zones 3 km wide (radius 1500 m, never pins) on react-native-maps / Leaflet in a WebView (Expo Go, no key) / Leaflet on web, zoom capped at 14 for gestures and every camera request, game / intent / distance filters, "Who has this near me" (`hasCardId`), list view, preview bottom sheet (View profile, public binder, Message when allowed, Show on map), the collector profile with its approximate area, ratings, references and binders; jest, Playwright (`map.spec.ts`, `collector-map-page.spec.ts`) and Maestro (`map-preview-profile.yaml`, `card-who-near-me.yaml`). See "Mobile app (stage M3)"
- [x] Tests: geo search, no exact coordinates in any response (contract test), ranking fresh > stale — NearbyCollectorsIT, SearchIT, CardHoldersIT, SearchDomainTest (`rankingIsFreshnessThenDistanceBucketThenRatingThenDistance`, canonical cache keys never holding the raw centre), GeoPrivacyContractTest `mapAndSearchResponsesOnlyEverCarryPublicPoints` (nearby, preview, unified search, binder search, card holders, suggest; anonymous and signed in: every point is the stored public point or the snapped centre, ≤ 3 decimals, no private location keys or notes, non-discoverable collectors 404/absent, no distance buckets for signed-out callers, logs free of coordinates), PrivacyPolicyServiceTest (extended); web Playwright `map.spec.ts` (collector A publishes a card, collector B opens `/map`, finds A's avatar marker, opens the preview, uses the List toggle by keyboard, opens A's profile and public binder; card search in the map box → "Holders of" list with price and chips → card-holders view with an inverted price-range message and URL-kept max price/availability → `/search?q=AZR-EN011` banner + Collectors tab; both scenarios assert every JSON lat/lng has ≤ 3 decimals and never equals A's or B's stored trading-area centre; random rural areas per run so earlier data never crowds the map)

## Phase 5 — Chat

_Backend complete (workflow `web-mvp-local` stage 5, independently re-verified: 517 API tests / 86 classes, 0 failures, 0 skipped on `./gradlew spotlessCheck build --rerun-tasks`; OpenAPI re-exported (105 paths, previously 86; every contract route present; no path, operation or schema lost; `ProblemDetail.errorCode` gains `MESSAGE_BLOCKED`, `POST_BLOCKED`, `DUPLICATE_POST`); clients regenerated; live check on `.local-dev/api-snapshots/api-phase5.jar` (= `api-latest.jar`) with emulator tokens: seeded conversation, messages, send 201, channels, posts, `/me/blocks`, moderator flags 200, collector on admin flags 403, no token 401, no coordinates in any body, `message_sent` analytics event without text). Migrations V040–V042 (range V040–V049). Web messages panel, `/messages`, `/community` and Admin → Community complete (workflow `web-mvp-local-continue` stage 6, independently re-verified: 333 web unit tests / 68 files, lint + format clean, production build 847.13 kB initial with no warnings, 36/36 Playwright specs against `.local-dev/api-snapshots/api-phase6.jar`, 0 skipped); mobile: stage M4 (2026-10-05, see "Mobile app (stage M4)"). Contract deviations are documented in `apps/api/README.md` ("Deviations from the Phase 5 contract"; the contract document itself is not edited): `POST /conversations` 201 new / 200 existing; the recipient's messaging permission applies to new conversations only; additive fields/routes (`MessageResponse.conversationId`, `CardLink.cardId`, `ConversationSummary.createdAt`, `LastMessage.id`, `?archived=`, upload `width`/`height`/`expiresAt`, `PostResponse.channelSlug`/`moderationState`, `PATCH /community/posts/{id}`, `POST /admin/community/replies/{id}/remove`, `GET /admin/community/channels`, `POST /admin/moderation/flags/{id}/resolve`); `POST /uploads/images` `kind=INVENTORY` is 400; `moderation_flag` adds `author_id`/`resolution_note`; realtime pushes are sent from the request thread after commit._

- [x] Private conversations, messages (text, card/binder/offer links, images), read/unread — `apps/api/.../messaging`: `ConversationService` (one DIRECT conversation per pair via `conversation_pair`, cursor pages through `common/TimeCursor`, TEXT / CARD_LINK / BINDER_LINK (public binders only) / IMAGE messages, forward-only read markers, per-participant mute/archive, a new message un-archives), `ImageUploadService` (`POST /uploads/images` kind=MESSAGE: sniffed JPEG/PNG/WebP ≤ 8 MB, re-encoded without metadata, `ImageUploadInspector` hook, attach within 1 h, 30/hour) + `UploadCleanupJob` (`POST /internal/jobs/upload-cleanup`, every 15 min under `local`), `MessagingAccountData` (export + deletion participant), `MessagingSeedContributor` (collector1 ↔ collector2, six messages incl. card and binder links); shared `cards/CardLink` + `CatalogService.cardLink`, `binders/BinderLink` + `PublicBinderService.binderLink`, `profiles/MemberDirectory`/`MemberCard`; migration V040 (`conversation`, `conversation_participant`, `conversation_pair`, `message`, `message_attachment`, `image_upload`, `user_block`) — tests ConversationIT (9), MessagePreviewsTest (3), TimeCursorTest (7). OFFER_LINK messages are real since Phase 8 (an offer between the two participants; OFFER_LINK and SYSTEM messages show the live proposal through the offers module's `OfferLinkResolver`). Debt: message photos are served from unguessable media keys, signed URLs wait for the cloud storage work; `MessageSent`/`MessageRead` are in the event registry for Phase 6 notifications
- [x] WebSocket (STOMP) realtime + Redis fan-out across instances — `messaging/infra`: `RealtimeConfig` (native WebSocket `/ws`, no SockJS, origins = `CORS_ALLOWED_ORIGINS`), `TokenHandshakeInterceptor` (`Authorization` header or `?access_token=`, never logged; 401/403 at the handshake), `StompSecurityInterceptor` (CONNECT auth, SUBSCRIBE only to the caller's own `/user/queue/messages|receipts|typing|presence|notifications|errors`, SEND only to `/app/typing`), `RedisRealtimePublisher` / `RealtimeRedisListener` (`rt:user:{userId}` fan-out), `PresenceTracker` / `PresenceStore` (`presence:{userId}` TTL 60 s, shown only with `showOnlineStatus`; `PresenceProvider` makes profile/marker/conversation `onlineStatus` real), `RealtimeTypingController` — tests RealtimeIT (3: messages, receipts, typing and presence reach the partner over two real STOMP clients; foreign `/user/<id>/queue` subscriptions refused; bad or missing tokens never get a session). Debt: open sessions of an account suspended later are not closed (REST sends are refused)
- [x] Block user, report entry points, moderation hooks, rate limits — blocks: `BlockService`, `POST/DELETE /users/{id}/block`, `GET /me/blocks` (idempotent, private reason), messaging implements the profiles `BlockRelationProvider` (new batch `blockedAmong`, used by `MarkerAssembler`) so profiles, map markers, previews, public binders, binder links and community feeds honour blocks both ways; moderation: `ModerationService.check(scope, text, authorId)` (Redis per-author `RATE_LIMIT` rules, accent-insensitive `BANNED_TERM` regexes via `TextModerationService.matches`, `THRESHOLD` repeated-content detection on SHA-256 of normalised text; BLOCK → 422 `MESSAGE_BLOCKED`/`POST_BLOCKED` or 429, FLAG → `moderation_flag`), `AdminModerationController` (`GET /admin/moderation/flags`, `POST /admin/moderation/flags/{id}/resolve`, MODERATOR+ via the `AdminAuthorizationManager(requireMfa, allowModerators)` overload, audited); migration V042 (`moderation_flag`, rate-pattern check, seed rules: placeholder banned terms, 30 messages/min, 60 posts+replies/hour, repeated-content thresholds) — tests MessagingAuthorizationIT (4: non-participants 404, anonymous 401, blocks hide conversations both ways and forbid new ones, recipient messaging permission, suspended recipients), ModerationIT (4), ModerationRulesTest (11), ConversationIT `theRateRuleAllowsThirtyMessagesPerMinute`. Web (stage 6): block/unblock with confirmation from the thread menu and the community post menu (`shared/messaging/block-actions.service.ts`), Settings → Blocked users (`GET /me/blocks`, Unblock), 403 `MESSAGING_BLOCKED` / 422 `MESSAGE_BLOCKED` / `POST_BLOCKED` / 429 shown inline — Playwright `messaging.spec.ts`, `community.spec.ts`. "Report collector" entry points enabled in stage 8 (profile, map preview, thread menu, community post menu, public binder owner card → Phase 7 report dialog; Playwright `reporting.spec.ts`). Debt: blocks are not yet joined into the discovery SQL (Phase 4 debt)
- [x] Public community channels (game / region / looking-for / new listings / trades / general) — `apps/api/.../community`: `CommunityService` (channels with `postCount24h`, posts/replies with author cards, edit/delete, per-channel `post_rate_limit_per_hour`, 409 `DUPLICATE_POST` within 24 h, moderation), `AdminCommunityController` (channels list/create/update, post/reply removal resolving open flags; audited), `RegionChannelListener` (a REGION channel per public-label city as collectors appear), `CommunitySeedContributor` (five posts, three replies), export + deletion participant, gated by the `publicChat` flag; migration V041 (`community_channel` with the eight launch channels, `community_post` with `body_hash`, `community_reply`) — tests CommunityIT (8), RegionChannelsTest (2)
- [x] Web messaging panel + `/messages` + `/community` + Admin → Community — `apps/web-angular/src/app` (stage 6): `core/realtime` (`RealtimeService` started by `provideRealtime()` while a ready account is signed in; hand-written STOMP 1.2 client over a native WebSocket in a lazy chunk (`stomp-frames.ts`, `stomp-connection.ts`, no new dependency), `ws://<api>/ws?access_token=<ID token>`, subscribes only to `/user/queue/messages|receipts|typing|presence`, sends only `/app/typing`, heartbeats, exponential backoff 1 s → 30 s with jitter, fresh token after a refused handshake, `resync$` → REST re-read after every (re)connection); `features/messages` (`MessengerComponent` + `ConversationsStore` (cursor inbox, live previews/order/unread counts, presence, mute/archive `PATCH`, pages older conversations until a linked one is found) → `ConversationListComponent` (keyboard navigation) and `ThreadViewComponent` + `ThreadStore` (newest page first, older pages on scroll, read marker only while visible, typing notices throttled, "Sent" → "Seen" receipts, inline 403 `MESSAGING_BLOCKED` / 422 `MESSAGE_BLOCKED` / 429) with header (profile, mute, archive, block/unblock, "Report collector" disabled until Phase 7), message list/bubbles (text, card, binder, photo, offer, removed) and composer (Enter sends, card link via `/cards/suggest`, own public binder, JPEG/PNG/WebP ≤ 8 MB photo via `POST /uploads/images` kind MESSAGE), realtime status "Live"/"Reconnecting…"); map right-hand Messages panel with unread badge on its toggle and the preview's Message button; full-page `/messages`, `/messages/:id`; `shared/links` (card/binder link pickers, link card), `shared/messaging` (`ConversationStarterService`, `BlockActionsService`), `shared/pipes/media-url.pipe.ts` (API-relative media paths of pushed payloads); Settings → Blocked users; `features/community` (`/community`, `/community/:slug` behind `featureGuard('publicChat')`: `CommunityStore`, channel sidebar with game filter folding behind a button on narrow screens, post composer with card/binder links and inline 409 `DUPLICATE_POST` / 422 `POST_BLOCKED` / 429, post edit/delete, inline replies, author block, moderator removal with a required reason); `features/admin/community` (moderators and admins: channels create/edit/archive/restore, moderation flags by state with resolve + optional note, `?tab=flags`; community audit labels). Generated `@orenji/api-client` only. Tests: Vitest units (STOMP frames/connection, realtime service, message text, drafts, thread items, conversations/thread stores, composer, conversation list, community helpers/store, link choices, blocked-users settings, conversation starter, admin community labels, media URL pipe) — 333 web unit tests / 68 files; Playwright `e2e/messaging.spec.ts` (2: A finds B on the map → Message → text + card via autocomplete; B on `/messages` gets it live with unread badge 2, A sees "Seen", B's typing, reply and photo reach A live; A blocks B from the thread menu, B's next message is refused inline and `POST /conversations` answers 403 `MESSAGING_BLOCKED`; A unblocks in Settings; a conversation started from a collector profile full page: text file rejected, photo sent, 422 banned-term refusal inline, reopened from the list by keyboard; every JSON lat/lng ≤ 3 decimals) and `e2e/community.spec.ts` (2: post with a card link in Montréal / Pokémon, duplicate 409 and banned-term 422 inline, edit, reply from a second collector, delete; moderator removal with a reason and resolving the raised flag in Admin → Community). Existing specs adjusted (`map.spec.ts`/`settings.spec.ts` Message enabled, `smoke.spec.ts` exact "Sign in", `support/inventory.ts` bounded coordinate settle). Debt: no single-conversation REST endpoint (deep links page back through the inbox); STOMP payloads other than `MessageResponse` are typed by hand in `core/realtime/realtime-events.ts` (not in the OpenAPI document); "Report collector" enabled in stage 8; the composer cannot send OFFER_LINK messages yet (API ready since Phase 8; web offer UI is stage 9)
- [x] Mobile Messages tab — stage M4 (2026-10-05, branch `feature/mobile-m4`, merged into `main` as #47): the realtime STOMP client over the app's WebSocket (handshake `Authorization` header natively, `?access_token=` on the web build; backoff, background pause, NUL-safe frames on React Native), the Messages tab (Inbox | Community) with unread counts and the tab badge, the conversation at web parity (card / binder / offer links, photos, read markers, typing, "Seen", mute / archive / block with a confirmation, refusals explained) and the community channels (posts, replies, own edits and deletes, per-channel limits explained); since stage M5 the conversation options also rate and report the other collector, offer links open the offer and the composer shares one. See "Mobile app (stage M4)" and "(stage M5)"
- [x] Tests: participant authorization, blocking, rate limit, realtime delivery — ConversationIT, MessagingAuthorizationIT, RealtimeIT, CommunityIT, ModerationIT + unit TimeCursorTest, MessagePreviewsTest, ModerationRulesTest, RegionChannelsTest; extended GeoPrivacyContractTest `messagingAndCommunityResponsesNeverCarryCoordinates` (conversations, messages with card/binder links, channels, posts, replies, blocks; logs clean), AnalyticsIT (`message_sent`, `community_post_created` without text or raw ids), SeedDataRunnerIT, AdminAuthorizationManagerTest, OpenApiExportTest; web flow tests: Playwright `messaging.spec.ts` (2, two browser contexts over real STOMP) and `community.spec.ts` (2) against `api-phase6.jar`; mobile (stage M4): jest (`realtime/*`, `features/messaging`, `features/community`, `screens/messages-tab`, `screens/conversation`, `screens/community-channel`), Playwright `messages.spec.ts` (2) and `community.spec.ts` (1), Maestro `messages-inbox-thread.yaml` and `community-post.yaml`

## Phase 6 — Wishlist + Notifications

_Backend complete (workflow `web-mvp-local-continue` stage 6, independently re-verified: 560 API tests / 97 classes, 0 failures, 0 skipped on `./gradlew spotlessCheck build --rerun-tasks`; OpenAPI re-exported (117 paths, previously 105; the 12 contract routes present; no path, operation or schema lost or changed, 13 schemas added); clients regenerated (`WishlistService`, `NotificationsService`); live check on `.local-dev/api-snapshots/api-phase6.jar` (= `api-latest.jar`) with emulator tokens: V050/V051 applied, collector2's seeded wishlist, matches with collector markers at 3-decimal public points and `KM_5_10` buckets, notifications + unread count, collector2's public wishlist summary for collector1, push token register/delete 204, anonymous 401, rematch job without service auth 401; no tokens, e-mail addresses or coordinates in the log). Migrations V050–V051 (range V050–V059). Web `/wishlist` (matches drawer, add/edit dialog), top-bar notification bell and `/notifications` complete (workflow `web-mvp-local-continue` stage 7, independently re-verified: 392 web unit tests / 79 files, lint + format clean, production build 865.69 kB initial with no warnings, 38/38 Playwright specs against `.local-dev/api-snapshots/api-phase7.jar`, 0 skipped); mobile: stage M4 (2026-10-05, see "Mobile app (stage M4)"). Contract deviations are documented in `apps/api/README.md` ("Deviations from the Phase 6 contract"; the contract document itself is not edited): the daily alert limit is counted by the Phase 2 `Limits` service (`usage_counter` per UTC day + Redis mirror `orenji:usage:*`) instead of a `notif:{userId}:{type}:{day}` key (limit values still from `usage_limit`); additive `WishlistMatchResponse.wishlistItemId`, `WishlistItemResponse.updatedAt`, `?includeDismissed=`/`?limit=`, read-all answers `{updated}`, `notification.in_app` column; matching also requires a fresh item (ACTIVE/AGING) and applies the rarity filter, items priced in another currency never meet a maximum price; a wish created or edited is matched at once **without** notifications; `DELETE /me/push-tokens/{token}` needs tokens without `/`._

- [x] `wishlist`, `wishlist_item` (game, card, printing, rarity, condition, edition, language, max price, radius, trade pref) — `apps/api/.../wishlist`: migration V050 (`wishlist_item` with the contract indexes + owner/updated indexes, `wishlist_match` unique per pair with a distance bucket, never a point); `WishlistService` (`GET/POST /wishlist`, `PATCH/DELETE /wishlist/{id}`, `GET /wishlist/{id}/matches` cursor pages, `POST /wishlist/matches/{id}/dismiss`, `GET /collectors/{handle}/wishlist` only when `wishlistVisible` via new `PrivacyPolicyService.canSeeWishlist`), filters validated against the game's `GameSchema` (`WishlistRules`), radius capped by `map.radius.max_km` (429), `wishlist.items.max` (FREE 20 / PREMIUM 500 → 429), identical wish 409, other users 404, anonymous 401; match markers through new `CollectorDiscoveryService.markersFor` (one block lookup per page); export (with private notes) + deletion; seed `WishlistSeedContributor` (order 620: collector2 wishes collector1's public AZR-EN001 within 25 km, the real matcher notifies at seed time; `pkm-p002a` private lot to trigger a fresh match locally; `mtg-p005b` for trade) — tests WishlistIT (5), WishlistRulesTest (4), SeedDataRunnerIT (extended)
- [x] Matching worker: new public inventory → wishlist match → geo filter → prefs → notification (dedup + rate limit) — `WishlistInventoryListener` (`@ApplicationModuleListener` on `InventoryItemPublished`, Modulith outbox) → `WishlistMatcher` running the contract SQL (`WishlistMatchRepository.CANDIDATES`: effectively public + fresh item, printing or card, condition rank from the `GameSchema` order, edition, language, rarity, price in the same currency, trade preference vs availability, `ST_DWithin` between the two **stored public points** within the wish radius, active wisher, blocks excluded both ways), `ON CONFLICT DO NOTHING` inserts, dedup key `wishlist:<wish>:<item>`, body "… was listed ~5-10 km away"; `POST /internal/jobs/wishlist-rematch` (service auth, `job_run`) + daily `@Scheduled` under `local` (`WishlistRematchScheduler`); `WishlistItemCreated`/`WishlistMatched` → analytics `wishlist_item_created`/`wishlist_matched` (no notes, raw ids or coordinates) — tests WishlistMatchingIT (7), AnalyticsIT `phase6WishlistEventsCarryNoNotesIdsOrCoordinates`
- [x] Notification centre (in-app), push via FCM abstraction, email preference stub — `apps/api/.../notifications`: migration V051 (`notification` with unique `dedup_key`, `in_app`, `channel_state` jsonb; `push_token` unique token, `invalid_at`); `NotificationService.notify` (single entry point: idempotent per dedup key with an advisory lock, unreachable recipients skipped, preferences and master switch, quiet hours hold push only (`QuietHoursRules`), `wishlist.alerts.per_day` (FREE 5 / PREMIUM unlimited) through `Limits` with one "More wishlist matches are waiting" SYSTEM notice per UTC day, `ChannelPlan`), `NotificationDispatcher` (after commit: realtime `/user/queue/notifications` through the Phase 5 `RealtimePublisher`, `PushProvider` to the 20 most recent valid tokens, `EmailProvider` to verified addresses only; outcome in `channel_state`); `LogPushProvider` (default, never logs tokens) / `FcmPushProvider` only with `PUSH_PROVIDER=fcm` (multicast batches of 500, unregistered tokens invalidated, never throws); `LogEmailProvider` (default, masked address) — SendGrid/SES refused at start-up; `GET /notifications` (cursor, `unreadOnly`), `GET /notifications/unread-count`, `POST /notifications/{id}/read`, `POST /notifications/read-all`, `POST /me/push-tokens`, `DELETE /me/push-tokens/{token}` (never returned or logged); `ActivityNotificationListener` + `ActivityNotifications`: `MessageSent` → MESSAGE (never the text; not for muted conversations via new `ConversationService.isMutedFor`; one unread per conversation, 10-minute throttle; `MessageRead` marks them read), `BinderFreshnessWarning` → BINDER_STALE_WARNING, `BinderFreshnessChanged` HIDDEN + new `inventory/events/InventoryListingsHidden` (published by `FreshnessService`) → one BINDER_HIDDEN per binder/lot and day; export (latest 1 000 notifications, push token platforms/dates only) + deletion; seed `NotificationSeedContributor` (order 630, four history rows) — tests NotificationCentreIT (3), NotificationPreferencesIT (4), NotificationLimitIT (2), NotificationRealtimeIT (1, real STOMP client), ActivityNotificationsIT (2), PushDeliveryIT (1), NotificationRulesTest (6), PushAndEmailProvidersTest (5). Debt: `FcmPushProvider` unproven without Firebase Admin credentials (cloud half deferred, docs/deployment/DEFERRED.md); real e-mail adapters deferred; blocks still not joined into the Phase 4 discovery SQL (carry-over)
- [x] Web wishlist UI and notification list — `apps/web-angular/src/app` (stage 7): `core/realtime` also subscribes `/user/queue/notifications` (`notifications$`); `core/notifications` (`NotificationCenter` started by `provideNotifications()`: unread count `GET /notifications/unread-count`, latest 8 `GET /notifications`, optimistic `POST /notifications/{id}/read` / `POST /notifications/read-all`, each push counted once, count re-read after reconnection and after the caller's own read receipts; `notification-kinds.ts` icon/tone per type and safe in-app deep links (`data.deepLink` only when it is a same-app path, else rebuilt from ids; SYSTEM limit notice → `/premium`); `NotificationEntryComponent`); top-bar bell `core/layout/notification-bell` (live badge "99+", `aria-label` "Notifications, N unread", menu with mark read / mark all / see all, sign-in prompt when signed out); `features/notifications` (`/notifications`: `NotificationFeedStore` cursor pages, `?unread=1`, day sections, live prepends); `features/wishlist` (`/wishlist` + `/wishlist/:id` on one route via `core/routing/optional-param.matcher.ts`: `WishlistStore` with plan usage of `wishlist.items.max`, filters All / With matches / Paused, `WishCardComponent` (card art, printing or "Any printing", criteria chips, private note, alerts switch `PATCH {active}`, edit, remove with confirmation), `MatchReadinessComponent`; `WishlistMatchesStore` + side-sheet matches drawer (`GET /wishlist/{id}/matches` cursor pages, live matches for the open wish, collector approximate place + distance bucket + rating, listing chips/price/freshness, Message via `ConversationStarterService`, View binder, On the map, optimistic dismiss)); `shared/wishlist` (lazy add/edit dialog opened by `WishlistActions`: `/cards/suggest` → printing or any printing, minimum condition / edition / language / rarity from the `GameSchema`, max price + currency, radius slider bounded by `map.radius.max_km` from `GET /me/plan`, trade preference, private notes; inline 409, 429 `LIMIT_REACHED` inline + limit dialog, 400 field errors); "Add to wishlist" enabled on card detail (with `?printing=`), card holders view and the map holders panel; collector page "Looking for" section (`GET /collectors/{handle}/wishlist`, 404 hides it). Generated `@orenji/api-client` only, no new dependency. Tests: Vitest units (notification kinds, `NotificationCenter`, bell, feed store + day groups, optional-param matcher, wishlist labels and form, `WishlistActions`, `WishlistStore`, `WishlistMatchesStore`, wish card; realtime spec extended) — 392 web unit tests / 79 files; Playwright `e2e/wishlist.spec.ts` (2: A adds a wish through the dialog, the identical one is refused inline 409; B lists the card nearby → A's bell badge and match count rise live, the bell entry opens `/wishlist/<id>` with B's approximate place, distance bucket and price, a second copy arrives live and is dismissed, A messages B from the match, `/notifications` unread filter + mark all read, public wishlist on A's profile, every JSON lat/lng ≤ 3 decimals; a full FREE wishlist pauses alerts, filters, shows the trading-area hint and the `wishlist.items.max` limit dialog); `catalog.spec.ts` now opens the dialog instead of the old disabled button. Verifier fix (stage 7): `e2e/settings.spec.ts` reads response bodies through the bounded `watchCoordinates` helper (an unbounded `Promise.all` over response bodies hung once under full-suite load). Debt/limits: matching only works for wishers who are discoverable with a trading area (stored public points; the page explains it); no web push registration (no FCM locally)
- [x] Mobile wishlist UI and notification list — stage M4 (2026-10-05): the Wishlist tab (wishes with the API's criteria, radius bounded by the plan, plan usage, filters, alerts switch, edit, remove), the matches of a wish (card picture, price, distance bucket only, Message, profile, map, dismiss), "Add to wishlist" on the card detail, the bell with a live unread badge in every tab header and the notification centre (day sections, All / Unread, mark read / all, a deep link or an explanation per notification kind). Device push stays deferred (EAS project and real FCM needed): in-app and realtime only. See "Mobile app (stage M4)"
- [x] Tests: matching, dedup, rate limit, preferences respected — WishlistIT, WishlistMatchingIT, NotificationCentreIT, NotificationPreferencesIT, NotificationLimitIT, NotificationRealtimeIT, ActivityNotificationsIT, PushDeliveryIT + unit WishlistRulesTest, NotificationRulesTest, PushAndEmailProvidersTest; extended GeoPrivacyContractTest `wishlistAndNotificationResponsesOnlyCarryPublicPoints` (wishlist items carry no point, match markers are stored public points ≤ 3 decimals with a bucket, public summary and notifications free of coordinates/private notes, logs clean), AnalyticsIT, SeedDataRunnerIT, OpenApiExportTest; web flow tests: Playwright `wishlist.spec.ts` (2, stage 7); mobile (stage M4): jest (`features/wishlist`, `features/notifications`, `screens/wishlist`, `screens/notifications`, `app/tabs-layout`), Playwright `wishlist.spec.ts` (1), Maestro `wishlist-match-notification.yaml`

## Phase 7 — Ratings + Collector Reporting + Admin

_Backend complete (workflow `web-mvp-local-continue` stage 7, independently re-verified: 598 API tests / 108 classes, 0 failures, 0 skipped on `./gradlew spotlessCheck build --rerun-tasks`; OpenAPI re-exported (155 paths, previously 117; every contract route present; no path, operation or schema lost; 65 schemas added; changed existing schemas only additively: `ProblemDetail.errorCode` values, `ModerationFlag` reason `REPORT_THRESHOLD`, `AdminUserDetail.bannedAt`, `DelistPolicyResponse`/`UpdateDelistPolicyRequest.unansweredAfterHours`, `DelistJobResponse`); clients regenerated (new `AdminAnalyticsService`, `AdminBindersService`, `AdminConsoleService`, `AdminListingsService`, `AdminNotificationsService`, `AdminRatingsService`, `AdminReportsService`, `ListingHealthService`, `RatingsService`, `ReportsService`); live check on `.local-dev/api-snapshots/api-phase7.jar` (= `api-latest.jar`) with emulator tokens: V060–V063 applied, `/public/report-reasons` anonymous 200 in dialog order, collector1's ratings summary 4.5 from 2 seeded ratings, collector1 → collector2 eligibility (TRADE already rated, CONVERSATION_QUALIFIED open), `/me/reports` 200, admin reports as MODERATOR 200, dashboard 403 for MODERATOR / 200 for ADMIN, system health UP with db/redis, stale listings 200, self report 422 `CANNOT_REPORT_SELF`, anonymous admin reports 401; log without ERROR lines, tokens, e-mail addresses or coordinates). Migrations V060–V063 (range V060–V069). Web report dialog, My reports, ratings/references, paused-listings banner and admin console sections complete (workflow `web-mvp-local-continue` stage 8, independently re-verified: 441 web unit tests / 92 files, lint + format clean, production build 873.25 kB initial with no warnings, 42/42 Playwright specs against `.local-dev/api-snapshots/api-phase8.jar`, 0 skipped); mobile deferred by owner decision. Contract deviations are documented in `apps/api/README.md` ("Deviations from the Phase 7 contract"; the contract document itself is not edited): dotted audit action names besides `REPORT_RESOLVED`; the pause and strikes share `user_responsiveness` (+ `paused_at`, `pause_source`, `pause_reason`, `paused_by`, `strikes_reset_at`, `evaluated_at`) and `delist_policy.unanswered_after_hours` (72) is new policy data; a paused collector stays on the map (only listings hidden); ban mark `user_account.banned_at` (cleared by unsuspend); report decisions require `note`, `suspendUntil` carries the optional end, SUSPENDED/BANNED need ADMIN, DISMISSED needs NONE; references reuse 403 `RATING_NOT_ELIGIBLE` and answer 409 `CONFLICT` for a second one; additive routes `GET /admin/ratings`, `PUT /ratings/{id}`, `GET /admin/users/{id}/listing-status`, `GET /me/listings/status`, `POST /me/listings/resume`, `POST /admin/listings/{itemId}/hide`, `POST/DELETE /admin/moderation/rules`, `/admin/references/{id}/hide|unhide`, `?assignedTo=`; `GET /collectors/{handle}/ratings` answers `{items, nextCursor, hasMore, summary}`; dashboard `openDisputes`/`webhookFailures24h` are 0 until Phase 9._

- [x] Ratings (overall, communication, condition accuracy, shipping, meetup) with eligibility check — `apps/api/.../ratings`: migration V060 (`interaction` unique `(kind, subject_id)` with the pair in PostgreSQL uuid order, `rating` unique `(interaction_id, rater_id)` with `moderation_state`, `rating_summary`, `reference`); `InteractionService.record(kind, userA, userB, subjectType, subjectId)` (idempotent; the API Phase 8 calls for OFFER_ACCEPTED/TRADE), `ConversationQualificationListener` (`@ApplicationModuleListener` on `MessageSent`: CONVERSATION_QUALIFIED once both sides sent ≥ 3 messages, deleted/SYSTEM messages not counted, only counts leave messaging); `RatingService` (`GET /ratings/eligibility?userId=`, `POST /ratings` 201 / 403 `RATING_NOT_ELIGIBLE` / 409 `ALREADY_RATED`, `PUT /ratings/{id}` within 14 days else 409 `RATING_EDIT_WINDOW_CLOSED`, comments through the PROFILE banned-term rules, `rating_summary` refreshed on every write/hide/unhide, RATING_RECEIVED notification without the comment); `GET /collectors/{handle}/ratings` (cursor page + summary, HIDDEN ratings neither listed nor counted, 404 when the profile is hidden from the caller via new `CollectorProfileService.requireVisibleCollector`); the profiles `RatingSummaryProvider` is now real (profiles, previews, markers; batch `ratingsOf` read once per page by `MarkerAssembler` for the nearby ranking); `RatingSubmitted` → analytics `rating_submitted` (kind, score, comment flag, ratee hash); export + deletion (summaries refreshed); `RatingSeedContributor` (qualified collector1–collector2 conversation left unrated, a completed trade and an accepted offer on reserved Phase 8 ids, three ratings, one reference; collector1 4.5 from 2) — tests RatingEligibilityIT (5), RatingRulesTest (5), AnalyticsIT `phase7RatingAndReportEventsCarryNoIdsOrText`, SeedDataRunnerIT `seedsRatingsAReferenceAndAnOpenReport`. Web (stage 8): `features/collectors/ratings` (`CollectorRatingsStore`: summary + cursor pages of 5, references, `GET /ratings/eligibility?userId=`; `CollectorRatingsSectionComponent` with per-criterion bars, own-rating Edit while `editableUntil`, "Rate this collector" only with an unrated interaction, otherwise an explanatory hint; `?tab=ratings` scrolls there) and `shared/ratings` (`RateCollectorDialogComponent`: interaction picker, required overall, optional criteria, comment ≤ 600, `POST /ratings` / `PUT /ratings/{id}`, 403/409/banned terms inline; keyboard `StarRatingInputComponent`; `RatingActionsService`); "Rate <name>" in the conversation menu when eligible — Vitest (rating labels, dialog, star input, ratings section), Playwright `rating.spec.ts` (1)
- [x] References; duplicate prevention; admin moderation — `ReferenceService` (`POST /references` ≤ 400 chars, banned terms refused, needs an interaction (403 `RATING_NOT_ELIGIBLE`), 409 for a second reference; `GET /collectors/{handle}/references` cursor list); `AdminRatingController` (`GET /admin/ratings?rateeId=&raterId=&state=`, `POST /admin/ratings/{id}/hide {reason}` / `unhide`, `POST /admin/references/{id}/hide` / `unhide`; MODERATOR+, 409 when already (un)hidden, audited `rating.hide`/`rating.unhide`/`reference.hide`/`reference.unhide`, summary refreshed) — tests RatingEligibilityIT `referencesNeedAnInteractionAndAreUniquePerAuthor`, `moderatorsHideAndUnhideRatings`. Web (stage 8): `WriteReferenceDialogComponent` (≤ 400, `POST /references`) on the collector page after any interaction; Admin → Ratings (`features/admin/ratings`: visible / hidden, one collector, Hide with a reason, Restore) — Playwright `rating.spec.ts` writes a reference
- [x] Collector report modal (reasons list), lifecycle OPEN → UNDER_REVIEW → ACTIONED/DISMISSED — backend: `apps/api/.../reports`: migration V061 (`collector_report` with the partial unique open pair, `moderator_note`, `moderation_rule` kind REPORT_THRESHOLD + scope REPORT with seed rules RATE_LIMIT `5/86400` and REPORT_THRESHOLD `3/604800`, `moderation_flag` reason REPORT_THRESHOLD, `user_account.banned_at`); `CollectorReportService` (`GET /public/report-reasons` in dialog order, `POST /reports/collectors` 201 with context validation PROFILE/CONVERSATION/POST/BINDER, 409 `REPORT_ALREADY_OPEN`, 422 `CANNOT_REPORT_SELF`, 404 unknown collector, 429 beyond the REPORT rate rule, `Idempotency-Key` repeats the original answer for 24 h through Redis; `GET /me/reports` status only); `ReportThresholdService` + `ReportThresholdListener` on `CollectorReported` (≥ 3 distinct reporters of open reports within 7 days → one `moderation_flag` + listing pause source REPORT_THRESHOLD pending review, audited as SYSTEM, never a suspension or ban); `AdminReportService` (`GET /admin/reports?status=&reason=&reportedUserId=&assignedTo=&page=&size=`, `GET /admin/reports/{id}` with reporter, reported collector, context, `moderatorNotes`, `ModerationHistoryService` history and, only when the context names a conversation, that conversation's latest 50 messages audited `report.conversation.view`; `assign` OPEN → UNDER_REVIEW, `notes`, `resolve` ACTIONED with WARNING / LISTINGS_PAUSED / SUSPENDED / BANNED or DISMISSED with NONE, audited `REPORT_RESOLVED` in the same transaction, REPORT_DECISION to the reporter without specifics, threshold flags resolved and review pause lifted when no report stays open); `GET /admin/users/{id}/history`; `CollectorReported` → analytics `collector_reported` (reason and context source only); export + deletion (free text of decided reports erased); `ReportSeedContributor` (one OPEN SPAM report collector4 → collector6) — tests ReportFlowIT (4), ReportThresholdIT (2), ReportRulesTest (3). Web (stage 8): `apps/web-angular/src/app/shared/reports` (`ReportActionsService` → `ReportCollectorDialogComponent`: reasons of `GET /public/report-reasons` as radio buttons in server order (cached, retry), optional details ≤ 1000, Confirm disabled until a reason is chosen, `Idempotency-Key` fixed per dialog, context PROFILE / CONVERSATION / POST / BINDER, inline 409 `REPORT_ALREADY_OPEN` / 422 `CANNOT_REPORT_SELF` / 404 / 429 / 400 via `report-errors.ts`, "Report sent" confirmation) opened from the collector profile, the map preview (signed in), the conversation menu, the community post menu and the public binder owner card; Settings → My reports (`features/settings/reports`, `GET /me/reports`, status only; REPORT_DECISION links there); Admin → Reports (`features/admin/reports`: filters in the URL, detail with reporter/reported cards, context, the reported conversation only when present, history, moderator notes, Assign to me, resolve dialog with action / required note / notify reporter, SUSPENDED (optional end) and BANNED for admins only) — Vitest (report labels, report dialog, resolve dialog, My reports, map preview Report button), Playwright `reporting.spec.ts` (2)
- [x] Audit log on every admin/moderator action — every Phase 7 admin write goes through `AuditService.record` in the same transaction: `REPORT_RESOLVED`, `report.assign`, `report.note`, `report.conversation.view`, `rating.hide`/`unhide`, `reference.hide`/`unhide`, `listings.pause`/`resume`, `listing.restore`, `listing.hide`, `binder.unpublish`, `moderation.rule.create/update/delete`, `notification.broadcast`, `user.suspend`, `user.ban`, delist policy edits (earlier phases already audit user, catalog, rules and community writes) — tests ReportFlowIT, DelistingAdminIT, RatingEligibilityIT, AdminAuthorizationIT `superAdminsBroadcastToStaffAndTheBroadcastIsAudited`, AuditIT
- [x] Auto-delist policies (configurable table) + scheduler + warnings + restore — built early with Phase 3: `delist_policy` (V020), `GET/PUT /admin/delist-policies` (audited), hourly freshness job with WARNED/HIDDEN/RESTORED events — tests FreshnessJobIT, AdminDelistPolicyIT. Warning notifications done with Phase 6 (BINDER_STALE_WARNING, BINDER_HIDDEN; ActivityNotificationsIT). Strikes and pauses done with Phase 7 (`apps/api/.../delisting`): migration V062 (`user_responsiveness` strikes + pause columns, `delist_policy.unanswered_after_hours` = 72); `ListingPauseRules.NOT_PAUSED` joined into `binders/PublicVisibilityRules.OWNER_LISTINGS_PUBLIC` (items `LISTED`, `binderEffectivelyPublic`: every public read, map listing counts, search, card holders and wishlist matching ignore a paused collector's listings, the collector stays on the map); `ListingPauseService` + `ListingsPaused`/`ListingsResumed` events (inventory reconciles, SYSTEM notice without the reason); `ResponsivenessSource` SPI implemented by messaging (`MessagingResponsivenessSource`, blocked pairs excluded); nightly `DelistJob` (`POST /internal/jobs/delist` service auth + daily `@Scheduled` under `local`): unanswered conversations 30 d, strikes since the last resume, pause (source UNRESPONSIVE) at `max_strikes` (3) when something is public, timed pauses expire; `GET /me/listings/status`, `POST /me/listings/resume` (UNRESPONSIVE pauses only, strikes reset); admin `GET /admin/listings/stale?state=STALE|HIDDEN` (`StaleListing {item, owner, confirmedAt, state, warnedAt}`, never private notes), `POST /admin/listings/{itemId}/restore` / `hide`, `POST /admin/users/{id}/pause-listings` / `resume-listings`, `GET /admin/users/{id}/listing-status` — tests StrikesIT (2), DelistingAdminIT (3), StrikeRulesTest (4). Web (stage 8): owner's paused-listings banner on `/inventory` (`features/inventory/listing-status`: `GET /me/listings/status`, Resume with confirmation for UNRESPONSIVE pauses via `POST /me/listings/resume`, "under review" wording otherwise, strike reminder); Admin → Listings (`features/admin/listings`: STALE / HIDDEN review queue + search by card, game, freshness and owner; Restore, Hide with a reason), Admin → Auto-delist rules (`features/admin/delist`: policy editor with a live freshness timeline and the API's ordering rules checked inline, `unansweredAfterHours`, `maxStrikes`), user detail listing status with Pause (reason, optional end) / Resume and moderation history (`user-moderation-panel.component.ts`) — Vitest (paused banner, delist-policy validation), Playwright `admin-moderation.spec.ts` (hide a listing with a reason, pause → owner sees the banner without a Resume button → admin resume, delist editor validation without saving, audit entries). Restoring a STALE listing from the web review queue is covered end to end since the final verification (acceptance `stale-listings.spec.ts`: backdated confirmation → freshness job → Restore → audited; the former debt)
- [-] Admin console `/admin` (dashboard, users, listings, binders, games, cards, community, reports, moderation, transactions, disputes, payments, ratings, ads, subscriptions, usage limits, credits, notifications, analytics, auto-delist rules, feature flags, audit logs, system health) — Phase 7 API done: `GET /admin/dashboard` (`AdminConsoleService`: accounts, active collectors 7 d, public items/binders, open/unassigned reports, open flags, stale/hidden listings, paused owners, failed notifications 24 h; disputes/webhooks 0 until Phase 9), `GET /admin/system/health` (actuator components without details, outbox backlog, notifications waiting, last runs/failures of every job via `jobs/JobRunSummaries`), `GET /admin/listings?query=&state=&game=&ownerId=` (`AdminListingService`), `GET /admin/binders` + `POST /admin/binders/{id}/unpublish` (`AdminBinderService`), `GET/POST/PUT/DELETE /admin/moderation/rules` (`ModerationRuleService`: MODERATOR reads, ADMIN writes, kind/scope combinations and patterns validated, caches dropped after commit), `GET /admin/notifications/stats` + `POST /admin/notifications/broadcast` (SUPER_ADMIN, ALL/STAFF, dedup per user, audited), `GET /admin/analytics/summary` (local aggregate `analytics_daily_count`, migration V063, `JdbcAnalyticsAggregate`; a BigQuery reader is deferred cloud work); RBAC `SecurityConfig.MODERATOR_PATTERNS` adds `/admin/reports/**`, `/admin/ratings/**`, `/admin/references/**` — tests AdminAuthorizationIT (role matrix over every admin route), DashboardIT (2). Web Phase 7 sections done (stage 8, `apps/web-angular/src/app/features/admin`): nav enables Dashboard (admin tiles from `GET /admin/dashboard` with quick links; moderators get report/flag counts since the endpoint is admin-only), Reports, Moderation (rules editor read-only for moderators, flags queue), Ratings, Listings, Binders (Unpublish with a reason), Notifications (stats; broadcast for SUPER_ADMIN only), Analytics, Auto-delist rules, System health; moderators see only Dashboard, Community, Reports, Moderation, Ratings; every write asks for a confirmation or reason, ends with "The action is in the audit log." and has an Audit logs label — Vitest (dashboard tiles, analytics summary, moderation rule labels, resolve dialog, delist validation), Playwright `admin-moderation.spec.ts` (1), `reporting.spec.ts`. Phase 9 API adds transactions (+ pending shipment / confirmation), disputes, payments + refund, webhooks and payment settings (see Phase 9); the dashboard's `openDisputes` / `webhookFailures24h` are now real (stage 9 live check: 1 / 1 after the seeded dispute and a refused webhook; DashboardIT only asserts they are present). Pending: web transactions/disputes/payments sections (stage 10), ads/subscriptions/credits sections (Phase 10); admin user entitlements and plan editing UI (carry-over)
- [x] Web report dialog, ratings/references UI and admin console sections — stage 8 (see the rows above; generated `@orenji/api-client` only, no client change needed; notification kinds RATING_RECEIVED, REPORT_DECISION → `/settings/reports`, SYSTEM LISTINGS_PAUSED → `/inventory`, MODERATION_WARNING added in `core/notifications/notification-kinds.ts`); public chat moderation stays in Admin → Community. Mobile: stage M5 (next row)
- [x] Mobile report dialog, My reports, ratings and references — stage M5 (2026-10-05, branch `feature/mobile-m5`, merged into `main` as #48): "Report collector" (`app/report.tsx`: the API's reasons in order, details ≤ 1000, `Idempotency-Key`, 409 / 422 / 404 / 429 / 400 explained, the confirmation) from profiles, the map preview (PROFILE), conversations (CONVERSATION), community posts (POST) and public binders (BINDER); Settings → My reports (statuses only; REPORT_DECISION opens it); rating a collector after an eligible interaction (`app/ratings/rate.tsx`: the interaction, overall + communication / card condition / shipping / meetup reliability, comment ≤ 600, the own rating edited within 14 days) from profiles, conversations and completed trades; one reference per collector (`app/ratings/reference.tsx`, ≤ 400, banned terms explained); the profile's ratings and references with the API's cursor pages, the interaction kind and criteria of each rating, and why rating is not possible yet; RATING_RECEIVED opens the own profile at the ratings. Admin and moderator consoles stay web-only. See "Mobile app (stage M5)"
- [x] Tests: rating eligibility, report flow, admin RBAC, audit generation, delist state machine — RatingEligibilityIT, ReportFlowIT, ReportThresholdIT, AdminAuthorizationIT, DelistingAdminIT, StrikesIT, DashboardIT + unit RatingRulesTest, ReportRulesTest, ModerationRuleValidationTest, StrikeRulesTest; extended GeoPrivacyContractTest `ratingsReportsAndAdminConsoleResponsesNeverCarryCoordinates` (ratings, references, eligibility, `/me/reports`, `/me/listings/status`, report reasons and every new admin console response incl. report detail with history; logs clean), AnalyticsIT, SeedDataRunnerIT, OpenApiExportTest; web flow tests (stage 8): Playwright `reporting.spec.ts` (2), `rating.spec.ts` (1), `admin-moderation.spec.ts` (1), `messaging.spec.ts`/`community.spec.ts` now expect "Report collector" enabled, all asserting every JSON lat/lng ≤ 3 decimals; mobile (stage M5): jest (`features/reportsRatings`, `screens/reports`, `screens/ratings`, the report and rate entry points in `screens/{collector,conversation,map,binders,community-channel}`), Playwright `reports.spec.ts` (2) and the rating part of `offers.spec.ts`, Maestro `report-collector.yaml` and `offer-trade-rating.yaml`. Debt: blocks still not joined into the Phase 4 discovery SQL; binder names/descriptions and public notes still not checked by `TextModerationService` (Phase 3 debt); open STOMP sessions of accounts suspended through a report decision stay open (REST refused)

## Phase 8 — Offers + Trade Workflow

_Backend complete (workflow `web-mvp-local-continue` stage 8, independently re-verified: 631 API tests / 116 classes, 0 failures, 0 skipped on `./gradlew spotlessCheck build --rerun-tasks`; OpenAPI re-exported (168 paths, previously 155; every contract route present; no path, operation or schema lost; 24 schemas added; existing schemas changed only additively: `NotificationResponse.type` gains `OFFER_CANCELLED`/`OFFER_EXPIRED`, `ProblemDetail.errorCode` gains `OFFERS_NOT_ACCEPTED`, `OFFER_ALREADY_OPEN`, `STALE_OFFER`, `NOT_YOUR_TURN`, `INVALID_STATE_TRANSITION`, `ITEM_UNAVAILABLE`, `TRADING_BLOCKED`, `SendMessageRequest` descriptions); clients regenerated (new `OffersService`, `TradesService`); live check on `.local-dev/api-snapshots/api-phase8.jar` (= `api-latest.jar`) with emulator tokens: V070/V071 applied, 15 seed contributors, collector1's seller inbox (seeded OPEN offer on its turn + two ACCEPTED), offer detail with `allowedActions` ACCEPT/COUNTER/DECLINE, a stranger 404, trades COMPLETED with `nextAction` NONE, `/me/settings/offers`, accepting the superseded seeded offer 409 `STALE_OFFER` with `latestOfferId`, anonymous 401; parties carry only a region label and a distance bucket; log without ERROR lines, tokens, e-mail addresses or coordinates). Migrations V070–V071 (range V070–V079). Web Phase 8 complete (workflow `web-mvp-local-continue` stage 9, independently re-verified: 485 web unit tests / 102 files + 44/44 Playwright specs against the real local stack on `api-phase9.jar`, 0 skipped); mobile deferred by owner decision. Contract deviations are documented in `apps/api/README.md` ("Deviations from the Phase 8 contract"; the contract document itself is not edited): `parent_offer_id` is the answered proposal with an additive `root_offer_id` and `superseded_by` (the live proposal is the row without it); `accepts_mixed` lives in the offers module (`offer_preferences`, `GET/PUT /me/settings/offers`); kinds must also fit the card's availability; responses list `tradeItems [{inventoryItemId, quantity, item}]` and add `rootOfferId`, `latestOfferId`, `viewerRole`, `superseded`, `version`, `protectionRequested`, `allowedActions`, `tradeId`; `version` optional in action bodies; a counter-offer must change the deal (400); additive error codes; offers from blocked collectors 404; `meetup` needs both parties' marks and drops protection, `complete` is AGREED-only with both confirmations, `cancel` requires a reason; notifications add OFFER_CANCELLED/OFFER_EXPIRED and SYSTEM messages are posted for every offer transition and trade completion/cancellation._

- [x] Offers (cash/trade/mixed) lifecycle OPEN → COUNTERED → ACCEPTED → DECLINED/CANCELLED/EXPIRED with history — `apps/api/.../offers`: migration V070 (`offer` one row per proposal of a counter chain with `root_offer_id`, `parent_offer_id`, deferrable `superseded_by`, `current_turn`, optimistic `version`, `closed_at`, public `item_snapshot`, `protection_requested`; `offer_trade_item`; `offer_event` (snapshot, reason, seq); `offer_preferences`; partial unique `uq_offer_live_buyer_item` backing 409 `OFFER_ALREADY_OPEN`; unique `message.payload->>'systemKey'` making SYSTEM messages idempotent); `OfferService` (create: card effectively public and visible to the buyer, blocks → 404, 422 `OFFERS_NOT_ACCEPTED` for `acceptsOffers` false / NOT_AVAILABLE / COLLECTION_ONLY / kind not fitting the availability / MIXED without `acceptsMixed`, trade cards the buyer's own non-deleted items with enough copies, `offers.per_day` through `Limits` (429), `Idempotency-Key` (Redis, fail-open), `protectionRequested` needs a cash part and the `protectedPayments` flag; inbox `GET /offers?role=&status=&cursor=`; detail with the whole chain's history (VIEWED recorded once); counter / accept / decline / cancel; export + deletion (open trades block deletion, live negotiations withdrawn)); pure `OfferStateMachine` (409 `NOT_YOUR_TURN`, `INVALID_STATE_TRANSITION` with `currentStatus`, `STALE_OFFER` with `latestOfferId`/`currentVersion`, 403 seller cancel, 403 `TRADING_BLOCKED` under a block or with an inactive party); every transition appends an `offer_event` and publishes `OfferCreated`/`OfferUpdated` → `OfferActivityListener` (`@ApplicationModuleListener`) → `OfferActivity` (OFFER_RECEIVED / OFFER_COUNTERED / OFFER_DECLINED / new OFFER_CANCELLED to the other party, OFFER_ACCEPTED / new OFFER_EXPIRED to both; SYSTEM message with the offer link in the pair conversation through new `ConversationService.postSystemMessage`, deduplicated per key); acceptance opens the trade through the `AcceptedOfferHandler` extension point and records `InteractionService` OFFER_ACCEPTED; `POST /internal/jobs/offers-expire` (service auth, `job_run`) + hourly `OfferExpiryScheduler` under `local`; OFFER_LINK messages real (`OfferLinkResolver`); analytics `offer_created`, `offer_status_changed` (no amounts, ids or text); seed `OfferSeedContributor` (reserved `…9c00…0001`/`…0002` accepted, `…0003` OPEN on collector1's turn, `…0004`/`…0005` MIXED countered chain) — tests OfferStateMachineIT (4), OfferAuthorizationIT (6), OfferExpiryJobIT (2), OfferLimitIT (1), OfferStateMachineTest (4), OfferRulesTest (6), SeedDataRunnerIT `seedsOffersAndTradesOnTheReservedIds`. Debt: `Idempotency-Key` replay is fail-open when Redis is down
- [x] Trades: created from accepted offer, statuses, buyer/seller views — `apps/api/.../trades` (implements `AcceptedOfferHandler`): migration V071 (`trade` unique per offer with meetup/confirmation/cancel columns and `version`, `trade_event` with seq); `TradeService` (`GET /trades?role=&status=&cursor=`, `GET /trades/{id}` with `nextAction`, `allowedOperations`, timeline, `payment`/`dispute` null until Phase 9; `POST /trades/{id}/meetup` (both marks → `meetup`, protection dropped AWAITING_PAYMENT → AGREED), `complete` (AGREED only, both confirmations → COMPLETED, `InventoryService.reserveAndTransfer` lowers the seller's card by 1 and the buyer's trade cards by their quantities, last copy soft-deleted and unpublished, `interaction(TRADE)` → rating eligibility), `cancel` (reason required, AGREED / AWAITING_PAYMENT only)); accepting needs an unpromised copy (409 `ITEM_UNAVAILABLE`); `TradeUpdated` → `TradeActivity` (TRADE_UPDATE notifications, SYSTEM messages on completion/cancellation); analytics `trade_status_changed`; seed `TradeSeedContributor` (reserved `…9d00…0001` meetup COMPLETED, `…9d00…0002` COMPLETED) — tests TradeLifecycleIT (4), TradeRulesTest (3). Debt: receivers add received cards to their inventory themselves (`POST /inventory/items`; the web trade page links "Add to my inventory"); Phase 9 payment states (`/pay`, `/ship`, `/confirm-receipt`) built in stage 9 (see Phase 9)
- [x] Web offer UI — `apps/web-angular/src/app` (stage 9, generated `@orenji/api-client` only: `OffersService`, `TradesService`, `MessagingService`, `RatingsService`): `shared/offers` (offer/trade labels, `OfferTarget` view model + builders, `offer-form.ts` validation and create/counter bodies, `offer-problems.ts` error mapping, `MakeOfferButton` + `MakeOfferDialog` (only the kinds the card's availability and `acceptsOffers` allow: cash / trade / cash + cards; trade cards picked from the caller's own inventory incl. private cards with copy counts; note ≤ 500; expiry; `Idempotency-Key` fixed per dialog; inline 422 `OFFERS_NOT_ACCEPTED`, 409 `OFFER_ALREADY_OPEN` with a link to the open offer, 404/403/400; 429 through the limit dialog), trade card picker, reason dialog, `DealSummary`, `OfferPartyCard` (region label + distance bucket only), `StatusChip`, `OfferLinkCard`, `OfferLinkPicker`, `CursorList`, `OfferActionsService`); entry points on public binder cards, the collector page's public cards, card-holder results, the map's holders list and wishlist matches; `features/offers` (`/offers` inbox: Received / Sent tabs, status filter, cursor pages, "Your turn" badges, live reload on offer notifications; `/offers/:id`: card, deal side by side, both parties, full history timeline, Accept / Counter / Decline / Withdraw only from `allowedActions`, `version` always sent, 409 `STALE_OFFER` moves to `latestOfferId`, `NOT_YOUR_TURN` / `INVALID_STATE_TRANSITION` / `ITEM_UNAVAILABLE` re-read the offer, `TRADING_BLOCKED` explained, follows a counter live); `features/trades` (`/trades` list; `/trades/:id` with the next-action banner, both parties' meetup marks and confirmations, deal, timeline, Cancel with a required reason, "Rate <name>" and "Add to my inventory" (`/inventory?add=`) after completion); messaging renders OFFER_LINK and the API's SYSTEM offer messages as offer cards, composer "Share an offer", messages page links to Offers and Trades; Settings → Offers "Accept mixed offers" (`GET/PUT /me/settings/offers`); notification kinds OFFER_CANCELLED / OFFER_EXPIRED with offer/trade link fallbacks; account menu Offers and Trades; quantity stepper moved to `shared/ui/quantity-stepper` — Vitest (offer form, labels, problems, link card/picker, make-offer dialog, action bar, offer detail/inbox stores, trade detail store, notification kinds, message draft), Playwright `offers.spec.ts` (2: cash offer → 409 duplicate → shared in the composer → notification + SYSTEM/OFFER_LINK cards → refused unchanged counter → counter → accept from the inbox → meetup + both confirmations → COMPLETED, seller copies 2 → 1 → rating from the trade page; mixed offers off → inline 422, trade offer with two copies of a private card, stale answer 409 → live proposal, decline with a reason, withdraw, inbox status filter, stranger 404 page; every JSON lat/lng ≤ 3 decimals). Debt: the generated `ProblemDetail` does not declare the per-endpoint extensions `latestOfferId`, `offerId`, `currentStatus` (read defensively through `problemExtension()`)
- [x] Mobile offer and trade UI — stage M5 (2026-10-05, branch `feature/mobile-m5`, merged into `main` as #48): "Make an offer" on public cards from public binders, profiles, the map preview's holders and wishlist matches (`app/offers/new.tsx`: only the kinds the availability allows, amount and currency, the buyer's own cards with copies, note, expiry, `Idempotency-Key`; 422 / 409 with the open offer / 404 / 400 / 429 `offers.per_day` explained), the offers inbox (`app/offers/index.tsx`: Received / Sent, All / Active / Accepted / Closed incl. EXPIRED, "N offers wait for your answer", cursor pages), one offer (`app/offers/[id].tsx`: whose turn, only `allowedActions`, accept after a confirmation, counter (`app/offers/counter.tsx`), decline / withdraw with an optional reason, the deal, both parties with a region label and a distance bucket only, the chain's history, follows a counter-offer live, 409 `STALE_OFFER` → latest proposal), offer settings, offer links in chat open the offer and "Share an offer" in the composer; trades (`app/trades/{index,[id]}.tsx`: both sides, the next move, meetup, confirm the exchange, cancel with a reason, timeline, received cards, rating once completed; protected trades explain that paying, shipping and disputes stay on the website until the Phase 9 stage). Offer and trade notifications open their screens. See "Mobile app (stage M5)"
- [x] Tests: state machine, authorization, audit history — OfferStateMachineIT, OfferAuthorizationIT, TradeLifecycleIT, OfferExpiryJobIT, OfferLimitIT + unit OfferStateMachineTest, OfferRulesTest, TradeRulesTest; extended GeoPrivacyContractTest `offersAndTradesNeverCarryCoordinatesOrPrivateNotes` (offer detail for both parties, inboxes, countered chain, trades, offer settings: public listings only, parties with a region label and no point, strangers 404, logs clean), AnalyticsIT `phase8OfferAndTradeEventsCarryNoAmountsIdsOrText`, SeedDataRunnerIT, OpenApiExportTest; web flow tests (stage 9): Playwright `offers.spec.ts` (2), `messaging.spec.ts` updated for the "Attach a card, binder, offer or photo" button; mobile (stage M5): jest (`features/offers`, `features/trades`, `screens/offers`, `screens/trades`, the offer entry points and "Share an offer" in `screens/{collector,map,binders,wishlist,conversation}`), Playwright `offers.spec.ts` (2), Maestro `offer-trade-rating.yaml`

## Phase 9 — Payments + Disputes (feature-flagged)

_Backend complete (workflow `web-mvp-local-continue` stage 9, independently re-verified: 661 API tests / 126 classes, 0 failures, 0 skipped on `./gradlew spotlessCheck build --rerun-tasks`; OpenAPI re-exported (199 paths, previously 168; 227 operations, previously 195; 295 schemas, previously 257; every contract route present; no path, operation or schema lost; no duplicate operationIds; existing schemas changed only additively: `PaymentSummary`, `DisputeSummary`, `TradeResponse.shipment`, `TradeEvent` event values, `NotificationResponse.type` `DISPUTE_UPDATE`, `ProblemDetail.errorCode`); clients regenerated (new `PaymentsService`, `DisputesService`, `AdminPaymentsService`, `WebhooksService`); live check on `.local-dev/api-snapshots/api-phase9.jar` (= `api-latest.jar`) on the local stack with emulator tokens: V080/V081 applied, 16 seed contributors (new "payments"), anonymous `GET /me/seller-account` 401, collector1's fake payout account ACTIVE/ready, seeded protected trade `…9d00…0003` for collector8 SHIPPED/SECURED with `nextAction` CONFIRM_RECEIPT and CONFIRM_RECEIPT/OPEN_DISPUTE, seeded dispute `…9f00…0101` for collector5 OPEN (1 evidence, 2 messages), a stranger 404, a collector on `/admin/disputes` 403, a bad-signature webhook 400 `WEBHOOK_SIGNATURE_INVALID` stored IGNORED, admin dispute queue and dashboard `openDisputes` 1 / `webhookFailures24h` 1; log without ERROR lines, tokens, e-mail addresses or coordinates). Migrations V080–V081 (range V080–V089). Flag `protectedPayments` (seeded on locally): member routes 404 `FEATURE_DISABLED` when off; admin routes stay available. Web payment/dispute flows and admin sections complete (workflow `web-mvp-local-continue` stage 10, independently re-verified: 537 web unit tests / 113 files, lint + format clean, production build 875.02 kB initial with no warnings, 46/46 Playwright specs against `.local-dev/api-snapshots/api-phase10.jar`, 0 skipped); mobile deferred by owner decision. Contract deviations are documented in `apps/api/README.md` ("Deviations from the Phase 9 contract"; the contract document itself is not edited): adapter-friendly `PaymentProvider` signatures (+ `cancelPayment`, `PayoutRequest`, idempotency keys); the fake checkout adds `GET /payments/fake/{ref}` and the buyer's `POST /payments/fake/{ref}/confirm` (checkout URL = web path `/checkout/fake/<ref>`); webhook idempotency per `(provider, provider_event_id)`; additive columns and tables (`payment_refund`, `dispute_message`, `dispute_note`, `platform_settings` `payments.release_reminder_hours` / `payments.admin_refunds_enabled`); VIDEO evidence reserved (400); SPLIT or partial refunds followed by the payout end PARTIALLY_REFUNDED; FROZEN is an admin hold; additive error codes `SELLER_NOT_ONBOARDED`, `DISPUTE_WINDOW_CLOSED`, `EVIDENCE_LIMIT_REACHED`, `WEBHOOK_SIGNATURE_INVALID`; admin payment routes are not flag-gated._

- [x] `PaymentProvider` abstraction, `FakePaymentProvider`, Stripe Connect adapter skeleton — `apps/api/.../payments` (`domain/PaymentProvider`, `infra/PaymentProviderConfig` selects exactly one from `PAYMENT_PROVIDER`): `FakePaymentProvider` (default everywhere: no network, no money, instant ACTIVE onboarding, `fake_pi` refs, checkout URL `/checkout/fake/<ref>` (`FAKE_CHECKOUT_BASE_URL` prefix), idempotent payouts/refunds, synthetic webhooks signed `X-Fake-Signature` in the Stripe `t=…,v1=…` format with the local `FAKE_PAYMENTS_WEBHOOK_SECRET`); `StripeConnectProvider` (only with `PAYMENT_PROVIDER=stripe`; Connect Express accounts + account links, PaymentIntent with `transfer_group`, Transfer on release, Refunds, `Stripe-Signature` verification with a 5-minute tolerance; Spring `RestClient`, no SDK dependency; start-up fails without `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`; never required locally); seller payout accounts `GET /me/seller-account`, `POST /me/seller-account/onboarding` (`SellerAccountService`, return URL a web path) — migration V080 (`seller_account`, `platform_settings` with the `payments.*` rows) — tests FakePaymentProviderTest (3), StripeConnectProviderTest (5: signature verification with a test secret, event/account/form mapping, no network). Debt: the Stripe adapter is compile- and unit-tested only (no Stripe account; cloud/real-provider work deferred, docs/deployment/DEFERRED.md)
- [x] Protected transaction flow: secure payment → ship → confirm shipment → confirm receipt → payout — `ProtectedPaymentService` on the Phase 8 `trade` through the trades module's new `TradeProtection` extension point (fills `TradeResponse.payment` / `shipment` / `dispute`) and `TradeService.advance` / `recordProtectedEvent` / `completeProtected` / `cancelProtected` / `lockForPayment` (completion logic extracted into `finish()`, no rewrite): `POST /trades/{id}/pay` (buyer, AWAITING_PAYMENT, 409 `SELLER_NOT_ONBOARDED` until the seller is ACTIVE; fee `payments.platform_fee_percent`; open checkouts answered again, failed ones restarted) → webhook `payment.secured` → payment SECURED, trade PAID; `POST /trades/{id}/ship` (seller, optional carrier / tracking / notes; the dispute window starts); `POST /trades/{id}/confirm-receipt` (buyer) → RECEIVED → `releasePayout` → COMPLETED / PAID_OUT with inventory transfer and the TRADE interaction; `payment.failed` → FAILED (pay again restarts); a cancelled trade or agreed meetup cancels an unpaid checkout, a late `payment.secured` is refunded at once; `POST /internal/jobs/payments-auto-release` (service auth, `job_run`) + hourly `AutoReleaseScheduler` under `local` (buyer reminder `payments.release_reminder_hours` before the window end, releases only after the window without an open dispute, no-op while `payments.auto_release_enabled` is false); fake checkout `GET /payments/fake/{ref}` + buyer `POST /payments/fake/{ref}/confirm` and `POST /internal/fake-payments/{ref}/succeed|fail` through the regular webhook pipeline; money `numeric(12,2)` + currency, locks trade row then payment row, provider calls with idempotency keys, never card data, wording "payment protection"; PAYMENT_UPDATE / SHIPMENT_STATUS notifications (`PaymentActivity`), analytics `payment_status_changed` (event, status, provider; no amounts, ids or references); export section `payments`; seed `PaymentSeedContributor` (fake ACTIVE accounts for collector1/collector2, payments `…9f00…0001` SECURED + shipped and `…0002` SECURED with the payout frozen, protected trades `…9d00…0003` SHIPPED / `…0004` DISPUTED) — migration V080 (`payment` with `version`, `payment_event`, `payment_refund`) — tests ProtectedPaymentFlowIT (3: pay → ship → confirm → PAID_OUT with the full timeline; failed payment retried; secured after cancellation refunded), AutoReleaseJobIT (1), PaymentRulesTest (5), TradeRulesTest (4, PAY / SHIP / CONFIRM_RECEIPT / OPEN_DISPUTE), SeedDataRunnerIT
- [x] Dispute window, dispute entity, evidence model (extensible), admin dispute interface — `DisputeService`: `POST /trades/{id}/disputes` (buyer, PAID or SHIPPED within the window, 409 `DISPUTE_WINDOW_CLOSED`; payout frozen, trade DISPUTED), `GET /disputes/{id}` (parties + admins, 404 for anybody else; parties by handle and display name only), `POST /disputes/{id}/evidence` (JSON TEXT / TRACKING (https URL) or multipart IMAGE (re-encoded JPEG without metadata, ≤ 8 MB) / DOCUMENT (PDF ≤ 10 MB) through `ObjectStorage`; VIDEO reserved → 400; ≤ 10 per party → 409 `EVIDENCE_LIMIT_REACHED`), `GET /disputes/{id}/evidence/{evidenceId}/file` (`private, no-store`, CSP sandbox; never under `/public/media`), `POST /disputes/{id}/messages`; admin `PaymentAdminService` + `AdminDisputeController` / `AdminTransactionController` / `AdminPaymentController`: `GET /admin/transactions` (+ `/pending-shipment`, `/pending-confirmation`), `GET /admin/disputes[/{id}]` (both parties' Phase 7 moderation histories and rating summaries, internal notes, trade timeline, payment events, refunds, webhooks), `POST /admin/disputes/{id}/freeze|unfreeze|notes|resolve` (BUYER full refund → CANCELLED, SELLER payout → COMPLETED, SPLIT partial refund + payout minus the fee → COMPLETED), `GET /admin/payments[/{id}]`, `POST /admin/payments/{id}/refund` (SUPER_ADMIN, or ADMIN while `payments.admin_refunds_enabled`), `GET/PUT /admin/payments/settings` (SUPER_ADMIN writes); every admin write audited with the request id (`dispute.freeze` / `unfreeze` / `note` / `resolve`, `payment.refund`, `payments.settings.update`); DISPUTE_UPDATE notifications (new type), analytics `dispute_status_changed`; dashboard `openDisputes` / `webhookFailures24h` real (proven live, see above) — migration V081 (`shipment`, `dispute`, `dispute_evidence`, `dispute_event`, `dispute_message`, `dispute_note`) — tests DisputeFlowIT (3: open within the window, freeze, notes, resolve for the buyer with a refund and the audit trail; window closed, SPLIT payout; ten pieces of evidence per party), PaymentsAuthorizationIT (2), AdminAuthorizationIT (role matrix incl. Phase 9 routes), DashboardIT. Web dispute pages and admin sections: see the web item below (stage 10)
- [x] Webhooks: signature verification, idempotency, event history — `WebhookService` + `PaymentWebhookController` (`POST /api/v1/webhooks/payments/{provider}`, permitAll in `SecurityConfig`, only the active provider, 413 above 256 KB, rate limit 600/min per IP): signature verified (`WebhookSignatures`), bad signature → 400 `WEBHOOK_SIGNATURE_INVALID` and stored IGNORED, every verified event stored in `payment_webhook_event` and deduplicated by `(provider, provider_event_id)` (a retry answers 200 `duplicate: true`), applied after commit through `PaymentWebhookReceived` + `@ApplicationModuleListener`, failures marked FAILED and logged with the `payment.webhook.failed` marker; admin `GET /admin/payments/webhooks[/{id}]` — migration V080 (`payment_webhook_event` + `signature_valid`, `payment_id`) — tests WebhookIdempotencyIT (2), WebhookSignatureIT (2)
- [x] Tests: webhook idempotency, state transitions, refund path — WebhookIdempotencyIT, WebhookSignatureIT, ProtectedPaymentFlowIT, DisputeFlowIT, AutoReleaseJobIT, PaymentsAuthorizationIT, FeatureFlagOffIT (every payment route 404 `FEATURE_DISABLED` while the flag is off) + unit PaymentRulesTest, FakePaymentProviderTest, StripeConnectProviderTest, TradeRulesTest; extended GeoPrivacyContractTest `paymentsAndDisputesNeverCarryCoordinatesOrProviderAccounts` (protected trades for both parties, dispute for both parties, seller account, stranger 404, every admin transaction / dispute / payment / webhook / settings response; no coordinates, provider account ids or storage keys; logs clean), AdminAuthorizationIT, DashboardIT, SeedDataRunnerIT. Debt: AnalyticsIT does not yet exercise `payment_status_changed` / `dispute_status_changed` (payloads carry enum values only)
- [x] Web payment protection, shipping, dispute and admin payment UI — `apps/web-angular/src/app` (stage 10, generated `@orenji/api-client` only: `PaymentsService`, `DisputesService`, `AdminPaymentsService`, `TradesService`; wording always "payment protection", never "escrow" (unit + E2E checks); everything hidden while `protectedPayments` is off): `shared/payments` (payment labels and problem mapping, protection explainer, `SellerAccountService`, dispute overview / thread / timeline, evidence list and `EvidenceFilesService` loading photos/PDFs through the authenticated file route); offer dialog "Use payment protection" for cash and cash + cards offers (`protectionRequested`, "How it works" explainer, summary wording, counters keep the choice), protection chips on the offer page, trade page and trade list; Settings → Payouts `/settings/payouts` (`GET /me/seller-account`, "Set up payouts" → `POST /me/seller-account/onboarding`, return with `?onboarding=complete`, "Back to your trade" link); trade page (`features/trades`): five protected steps (accepted → payment secured → shipped → received or dispute → payout released), payment / shipment / dispute cards, timeline labels for every Phase 9 event, actions only from `allowedOperations` — Pay (409 `SELLER_NOT_ONBOARDED` explained), Mark as shipped dialog (carrier, tracking, notes), Confirm receipt, Open a dispute dialog (409 `DISPUTE_WINDOW_CLOSED` explained with the date), "Meet in person instead"; "Set up payouts" reminder for a seller awaiting payment; `features/checkout` `/checkout/fake/:ref` (local stand-in for the provider checkout with a "Local test payment" banner, Pay / "Simulate a failed payment", polls until the synthetic webhook lands, back to `/trades/:id?payment=secured|failed`); `features/disputes` `/disputes/:id` (parties only, not-found for anybody else; decision and refund summary, both sides' evidence, TEXT / TRACKING forms and IMAGE / PDF uploads validated and previewed locally counting down `evidenceLeft`, message thread, timeline, read-only while on hold or resolved); PAYMENT_UPDATE / SHIPMENT_STATUS / DISPUTE_UPDATE notification kinds refresh the trade and deep-link to it or the dispute; admin (`features/admin/payments`, `features/admin/disputes`, nav sections enabled): Transactions (all / pending shipment / pending confirmation), Disputes (queue, detail with both parties' rating summaries and moderation histories, internal notes, trade timeline, payment events, refunds, webhooks; hold / lift hold, notes, support messages, Resolve BUYER / SELLER / SPLIT with refund amount, note and a review step), Payments (list, detail, Refund only when `refundAllowed` with amount, reason and confirmation), Webhook events (payload on demand), Payment settings (SUPER_ADMIN edits after confirmation); every admin write ends with "The action is in the audit log."; audit labels for `dispute.*`, `payment.refund`, `payments.settings.update`; dashboard dispute/webhook tiles link to the queues. Tests: 52 new Vitest tests (485 → 537 / 113 files: labels, error wording, forms, stores, uploader, payout settings, payment card, dispute resolution and refund amounts, transaction rows, notification links); Playwright `e2e/payments.spec.ts` (2: a fresh seller sets up payouts, the buyer's protected offer is paid on the fake checkout, shipped with tracking, received and completed with the payout (amount minus fee) shown to both; a second protected trade is disputed with a photo and a message, a stranger gets not-found and a 404, an admin holds, notes and resolves it for the buyer with a refund, the payment shows the refund, the audit log shows `dispute.freeze` / `dispute.note` / `dispute.resolve`, the buyer sees the decision and the cancelled trade; every JSON lat/lng ≤ 3 decimals) — 46/46 Playwright specs green against `api-phase10.jar`, 0 skipped. Debt: the fake checkout polls up to ~45 s for the synthetic webhook; the generated `ProblemDetail` still lacks the Phase 8 extensions `latestOfferId` / `offerId` (read through `problemExtension()`; `currentStatus` is declared since Phase 10)
- [x] Mobile payment/dispute UI — stage M6 (2026-10-05, branch `feature/mobile-m6`, merged into `main` as #51): payment protection on the trade screen (pay on the app's fake checkout, ship, confirm receipt, payout status), disputes (statements, photos from the library, thread, timeline), Settings → Payouts, "Use payment protection" on offers; see "Mobile app (stage M6)"

## Phase 10 — Freemium + Credits + Ads + Donations

_**Removed by stage F1 (2026-10-14, ADR 0019), except the usage limits**, now the same for every collector in the `limits` module: see "Free for all: Premium, ads, credits and donations removed (stage F1, 2026-10-14)". The items below are the Phase 10 history; the code is on `archive/paid-features`._

_Backend complete (workflow `web-mvp-local-continue` stage 10, independently re-verified: 704 API tests / 140 classes, 0 failures, 0 skipped on `./gradlew spotlessCheck build --rerun-tasks`; OpenAPI re-exported (243 paths, previously 199; 276 operations, previously 227; 364 schemas, previously 295; every contract route present; no path, operation or schema lost; no duplicate operationIds; existing schemas changed only additively: `MyPlan.subscription`, `ProblemDetail` `currentStatus` / `subscriptionId` / `balance` / `cost` / `reason` and the error codes `ALREADY_SUBSCRIBED`, `INSUFFICIENT_CREDITS`, `REFERRAL_NOT_ALLOWED`, `NOT_IMPLEMENTED`); verifier fix: Jackson 3 `JsonNode` fields (webhook payloads, ledger and subscription event details) are documented as free-form objects by `OpenApiConfig` instead of a reflected, non-deterministic `JsonNode` bean schema, so two exports are byte-identical; clients regenerated (new `SubscriptionsService`, `CreditsService`, `AdsService`, `DonationsService`, `AdminBillingService`); live check on `.local-dev/api-snapshots/api-phase10.jar` (= `api-latest.jar`) on the local stack with emulator tokens: V090–V093 applied, 20 seed contributors, premium_user `GET /me/plan` PREMIUM with the ACTIVE fake subscription, collector1 credits 300 with `withdrawable`/`transferable` false and referral code `COLLECTOR1`, anonymous MAP_PANEL ads labelled "Sponsored", impression 204 and click 302 to the fictional `.example` landing, premium_user gets `[]`, supporters list without amounts, admin subscriptions 200 / collector 403, anonymous credits 401, mobile receipt 501 `NOT_IMPLEMENTED`, forged billing webhook 400 `WEBHOOK_SIGNATURE_INVALID`; log without ERROR lines, tokens, e-mail addresses or coordinates). Migrations V090–V093 (range V090–V099). Flags: `premiumPlans` (checkout; on by default in V010, **off since V105** — launch configuration, 2026-10-05), `credits` (on in V010, **off since V105**), `advertising` and `donations` (off by default); the local seed switches all four on with `protectedPayments`; member routes answer 404 `FEATURE_DISABLED` while their flag is off, admin routes stay available, live subscriptions keep working whatever `premiumPlans` says. Web Premium checkout, credits, "Sponsored" placements, donations and the admin billing/credits/ads/donations sections complete (workflow `web-mvp-local-continue` stage 11, independently re-verified: 704 API tests / 140 classes still green on `./gradlew spotlessCheck build --rerun-tasks`, OpenAPI export unchanged (243 paths, 276 operations, 364 schemas; every contract route present), clients regenerated without changes, 578 web unit tests / 120 files, lint + format clean, production build 877.57 kB initial with no warnings, mobile typecheck/lint/29 tests and shared-types typecheck green, 51/51 Playwright specs against `.local-dev/api-snapshots/api-latest.jar` (rebuilt from this tree, same code as `api-phase10.jar`), 0 skipped; live curls: collector1 credits and referral code, anonymous MAP_PANEL ad labelled "Sponsored" with `Cache-Control: no-store`, premium_user `[]` and PREMIUM/ACTIVE plan, admin subscriptions 200 / collector 403, anonymous credits 401; log without ERROR lines, tokens, e-mail addresses or coordinates); mobile deferred by owner decision. Contract deviations are documented in `apps/api/README.md` ("Deviations from the Phase 10 contract"; the contract document itself is not edited): subscription state PENDING and additive columns plus `subscription_event` / `billing_webhook_event`; checkout answers `{subscription, url, clientSecret, resumed}`; fake checkout routes `GET /billing/fake/{ref}` + `POST /billing/fake/{ref}/confirm` (web path `/checkout/fake-billing/<ref>`); admin subscription detail and cancel; the plan follows `user_account.plan_code` + PREMIUM_USER instead of SUBSCRIPTION entitlements; `credit_ledger_entry` adds `balance_after` / `details` / `note` / `seq` and `credit_balance` is a plain view behind a Redis cache; `POST /me/credits/spend` takes a `credit_product` key; `GET /me/referrals` + `referral_redemption`; admin credit products and settings (`platform_settings` `credits.*`); prefixed ad tables (`ad_placement`, `ad_campaign`, `ad_creative`, `ad_targeting_rule`) with additive columns and `ad_campaign_daily`; impressions need the serve token body, clicks `?token=`; conversions through `POST /internal/ads/clicks/{clickId}/conversions`; donations add `GET /me/donations`, fake checkout and admin routes and `donations.*` settings, only the fake donation provider exists._

- [x] Plans, plan features, usage limits, usage counters, entitlements (DB-configurable) — built early in stage 2 (plan item 2). `billing` module, migration V011 (`plan`, `plan_feature`, `usage_limit`, `usage_counter`, `entitlement`; FREE and PREMIUM seeded with the contract limits; `user_account.plan_code` now a FK to `plan.code`). `Limits.check/consume/checkValue/overview` (atomic conditional upsert, Redis mirror written after commit), `LimitReachedException` → 429 LIMIT_REACHED (`limitKey`, `limit`, `used`, `resetsAt`, `planCode`, `upgradeUrl: "/premium"`), `Entitlements.has` + admin grant/revoke (audited, most generous active entitlement wins), `PlanService` Redis cache, `LimitUsageSource` SPI for TOTAL counts (e.g. `binders.max` in Phase 3). Endpoints `GET /plans` (public), `GET /me/plan`, `GET/PUT /admin/plans[/{code}]`, `GET/PUT /admin/usage-limits[/{id}]`, `GET/POST /admin/users/{id}/entitlements`, `DELETE /admin/users/{id}/entitlements/{entitlementId}` — tests LimitsIT (5), LimitRulesTest (4). Subscriptions, checkout, billing webhooks and `GET /admin/subscriptions` landed in stage 10 (next item)
- [x] Subscriptions + `BillingProvider` abstraction (fake by default, Stripe Billing skeleton) — `apps/api/.../billing` (stage 10): migration V090 (`subscription` with a one-live-per-account partial unique index, `subscription_event`, `billing_webhook_event`); `SubscriptionService` (checkout for paid active plans only, an open checkout of the same plan answered again, 409 `ALREADY_SUBSCRIBED` while entitled, cancel at the period end or at once, webhook events applied under a per-account advisory lock; an entitling subscription (TRIAL / ACTIVE / PAST_DUE) sets `user_account.plan_code` + PREMIUM_USER through the new `UserAccountService.applyPlan`, its end sets FREE and revokes the role; a payment for an abandoned checkout is cancelled at the provider); `BillingWebhookService` (signed `X-Fake-Signature` / `Stripe-Signature` in the Stripe format through the shared `common/webhooks/SignedWebhooks`, 400 `WEBHOOK_SIGNATURE_INVALID` stored IGNORED, deduplicated per provider event id, applied after commit via `BillingWebhookReceived` + `@ApplicationModuleListener`); `SubscriptionPeriodJob` `POST /internal/jobs/subscriptions-period` + hourly `SubscriptionPeriodScheduler` under `local` (period-end cancellations, fake renewals through a synthetic signed `subscription.renewed`, real-provider expiry after the 3-day grace); `FakeBillingProvider` (default, `fake_cs_…` checkouts at the web path `/checkout/fake-billing/<ref>`, `GET /billing/fake/{ref}` + `POST /billing/fake/{ref}/confirm`), `StripeBillingProvider` (only with `BILLING_PROVIDER=stripe`, Checkout Sessions in subscription mode, `RestClient`, no SDK); routes `POST /me/subscription/checkout|cancel`, `POST /me/subscription/mobile-receipt` (reserved, 501 `NOT_IMPLEMENTED`), `POST /webhooks/billing/{provider}` (600/min per IP, 413 above 256 KB), `GET /me/plan` with `subscription`, `GET /admin/subscriptions[/{id}]`, `POST /admin/subscriptions/{id}/cancel` (audited `subscription.cancel`); `Entitlements` gains `normaliseOverride`, `grantBySystem`, `latestActiveExpiry`; export section `subscriptions`, deletion stops renewals and the purge ends the live subscription; seed "subscriptions" (premium_user ACTIVE fake subscription `…a000…0001`) — tests SubscriptionFlowIT (5: fake checkout → PREMIUM with raised limits → cancel; failed checkout retried and immediate cancellation downgrades at once; webhooks verified, stored once, renewals extend the period; validation, authorization and the reserved mobile-receipt route; admins browse and cancel), Phase10FeatureFlagOffIT (2), FakeBillingProviderTest (1), StripeBillingProviderTest (4, test secret, no network). Debt: the Stripe Billing adapter is compile- and unit-tested only (no Stripe account; cloud/real-provider work deferred, docs/deployment/DEFERRED.md); App Store / Google Play receipt validation is reserved (501)
- [x] Limit-reached UX with upgrade prompt — API side done (429 LIMIT_REACHED with extensions, generated `ProblemDetail` carries them; Phase 3 consumes `binders.max` (BinderIT) and `binder.views.per_day` (PublicBinderIT)); web limit-reached dialog + interceptor + `/premium` built in stage 3 (`core/limits`, `features/premium`; Vitest units); stage 4 web E2E `inventory.spec.ts` hits the real `binders.max` limit from `/inventory` (dialog "5 of 5" + inline message); Phase 4 caps the map radius with `map.radius.max_km` (NearbyCollectorsIT, CardHoldersIT); the checkout API exists since stage 10 (SubscriptionFlowIT: the fake checkout raises the limits); stage 11 wires the web upgrade: the dialog's "See Premium" closes every open dialog (`core/limits/limit-reached-dialog.component.ts`) and lands on `/premium`, "Upgrade to Premium" → fake billing checkout → PREMIUM limits — web E2E `freemium.spec.ts` (a FREE collector at `binders.max` 5 of 5 → "See Premium" → upgrade, a simulated decline then payment → binders 5 / 50, the sixth binder created, no ads; "Cancel now" → FREE again)
- [x] Credit ledger (append-only) + derived balance — `apps/api/.../credits` (stage 10, backend): migration V091 (`credit_ledger_entry` with `balance_after` running sum, unique `idempotency_key`, trigger `credit_ledger_entry_append_only` refusing UPDATE / DELETE / TRUNCATE + REVOKE, view `credit_balance`, `credit_product` (3 products: `premium_search_day`, `binder_views_day`, `map_radius_day`), `referral_code`, `referral_redemption`, `platform_settings` `credits.*`); `CreditLedger` (appends under a per-account advisory lock, never negative, idempotent keys, Redis balance cache evicted after commit, spends always summed under the lock), `CreditProducts`, `CreditSettings`, `ReferralService` / `ReferralCodes`, `CreditReconciliationJob` `POST /internal/jobs/credits-reconcile` + hourly scheduler under `local` (repairs cached balances, reports ledger mismatches, never edits the ledger); routes `GET /me/credits` (`withdrawable: false`, `transferable: false`), `POST /me/credits/spend` (idempotent, stacked `CREDIT_PURCHASE` entitlement, 409 `INSUFFICIENT_CREDITS` / `CONFLICT`), `GET /me/referrals`, `POST /me/referrals/redeem` (409 `REFERRAL_NOT_ALLOWED` with `reason`), `POST /admin/credits/grant` (± amounts, never below 0, audited `credits.grant`), `GET /admin/credits/ledger|products|settings`, SUPER_ADMIN `PUT /admin/credits/products/{key}` / `PUT /admin/credits/settings` (audited); export section `credits`; seed "credits" (collector1 200 welcome credits + code `COLLECTOR1` redeemed by collector8, premium_user 500) — tests CreditLedgerIT (4: ledger append-only in the database, balance = sum with idempotent spends unlocking stacked entitlements, audited admin grants never below 0, spend validation and products edited by super admins), ReferralIT (2), ReferralCodesTest (2). Web `/credits` page and admin credits: stage 11 (see the web item below)
- [x] Ads framework (campaign, advertiser, placement, creative, impression, click, conversion, budget, targeting) with internal admin-managed campaigns; "Sponsored" labelling — `apps/api/.../ads` (stage 10, backend): migration V092 (`advertiser`, `ad_placement` (5 placements), `ad_campaign`, `ad_creative`, `ad_targeting_rule` GAME / REGION_LABEL / GEO_CELL / TAG / PLAN, `ad_impression` / `ad_click` / `ad_conversion` with a pseudonymous `user_hash` and `serve_id`, `ad_campaign_daily`); `AdProvider` + `InternalCampaignAdProvider` (targeting kinds AND / values OR, per-viewer daily frequency caps, `AdPacing` total / daily / intraday pacing, priority ranking, one creative per campaign; slot for a future external network adapter); `AdService` (flag `advertising` + `ads.enabled` entitlement → `[]`; `AdContext` from public values only: requested game / grid cell, `LocationService.publicLocationOf` grid cell and region label, `ProfileService.publicPartsOf` games and tags, plan; viewer hash through the analytics `ActorHasher`); `AdToken` HMAC serve tokens (`ADS_TOKEN_SECRET`, development default refused outside local/test/dev) with one impression and one click per serve; routes `GET /ads` (`Cache-Control: no-store`, every ad `sponsored: true`, `label: "Sponsored"`), `POST /ads/{id}/impression` (204), `GET /ads/{id}/click` (302), `/admin/ads/**` CRUD + `GET /admin/ads/campaigns/{id}/stats` (validated: https URLs or site paths, no coordinates; every write audited `ads.*`), `POST /internal/ads/clicks/{clickId}/conversions`; seed "ads" (fictional advertiser "Maple Sleeve Co." on a `.example` domain with two campaigns, house ad "OrenjiTrade Premium") — tests AdsTargetingIT (3: targeting uses the public point only, never the centre or `home_point`; the ads module never reads private location data (source scan); PREMIUM and `ads.enabled` hide ads and PLAN rules split audiences), AdsDeliveryIT (3: impressions and clicks once per serve spending the budget; frequency caps; admin validation keeps coordinates out and writes are audited), TargetingTest (4), AdPacingTest (5), AdTokenTest (2), AdsConfigTest (1), Phase10FeatureFlagOffIT `adsAnswerAnEmptyListAndRecordNothingWhileAdvertisingIsOff`. Debt: `ADS_TOKEN_SECRET` / `ADS_WEB_BASE_URL` not yet in Secret Manager/Terraform (deferred; `ADS_WEB_BASE_URL` defaults to `http://localhost:4200`); no external ad network adapter. Web "Sponsored" placements and admin ads UI: stage 11 (see the web item below)
- [x] Donations via provider abstraction — `apps/api/.../donations` (stage 10, backend): migration V093 (`donation`, `donation_webhook_event`, `platform_settings` `donations.*`); `DonationProvider` + `FakeDonationProvider` (default and only provider; `fake_dn_…` checkouts at `/checkout/fake-donation/<ref>`, synthetic signed `donation.succeeded` / `failed` / `refunded` webhooks, idempotent refunds), `DonationService`, `DonationWebhookService`, `DonationSettings`; routes `POST /donations/checkout` ("Voluntary support", amounts and currencies from settings), `GET /me/donations`, `GET /donations/fake/{ref}` + `POST .../confirm`, `POST /webhooks/donations/{provider}`, `GET /public/donations/supporters` (opt-in display names and month only, never amounts, notes or handles), `GET /admin/donations[/{id}]`, SUPER_ADMIN `POST /admin/donations/{id}/refund` (audited `donation.refund`) and `PUT /admin/donations/settings` (audited); nothing in ratings, ranking or trust reads donations; export section `donations`, the purge erases notes and public thanks; seed "donations" (collector2 25.00 CAD with public thanks, collector5 10.00 CAD without) — tests DonationIT (3: success path with the fake provider and opted-in thanks, failures + validation + signed idempotent webhooks, admin totals with refunds and settings for super admins only; donations never touch ratings or interactions). Debt: no Stripe Checkout donation adapter yet (any other `DONATION_PROVIDER` fails the start-up). Web `/support` page and admin donations: stage 11 (see the web item below)
- [x] Tests: limit enforcement, entitlement override, ledger integrity — LimitsIT (429 with extensions, admin edits apply at once, PREMIUM plan and entitlements override the FREE limits), LimitRulesTest, BinderViewLimitIT (FREE `binder.views.per_day`, PREMIUM and entitlements unlimited), SubscriptionFlowIT, CreditLedgerIT (append-only, balance = sum, idempotent spend), ReferralIT, AdsTargetingIT (never `home_point`), AdsDeliveryIT, DonationIT (fake success path), Phase10FeatureFlagOffIT + unit StripeBillingProviderTest, FakeBillingProviderTest, ReferralCodesTest, TargetingTest, AdPacingTest, AdTokenTest, AdsConfigTest; extended GeoPrivacyContractTest `subscriptionsCreditsAdsAndDonationsNeverCarryCoordinates` (plan, credits, referrals, donations, supporters, every placement anonymous and signed in, every admin subscription / credit / ad / donation response: ≤ 3 decimals, no private location keys, no provider subscription refs or user hashes, every ad labelled "Sponsored", logs free of coordinates), AdminAuthorizationIT (role matrix incl. Phase 10 routes), SeedDataRunnerIT, OpenApiExportTest. Debt: no analytics events for subscriptions, credits, ads or donations yet, and AnalyticsIT does not yet exercise the Phase 9 `payment_status_changed` / `dispute_status_changed` events
- [x] Web plans checkout, credits, ads ("Sponsored" placements), donations and admin billing/credits/ads/donations UI — `apps/web-angular/src/app` (stage 11, generated `@orenji/api-client` only: `PlansService`, `SubscriptionsService`, `CreditsService`, `AdsService`, `DonationsService`, `AdminBillingService`, `AdminPlansService`; member screens follow `premiumPlans` / `credits` / `advertising` / `donations` (hidden or guarded while off, 404 `FEATURE_DISABLED` explained), admin sections stay available; wording and refusals in `shared/billing/billing-labels.ts`): `features/premium` `/premium` (`PremiumStore`; plan comparison from `GET /plans`, "Upgrade to Premium" → `POST /me/subscription/checkout` (409 `ALREADY_SUBSCRIBED` explained; only local fake checkout paths or https provider pages followed), "Continue to checkout" for an open one, `SubscriptionCardComponent` (status, price, renews / ends on, PAST_DUE note, "Cancel at period end" / "Cancel now" / "Close the checkout", each confirmed), `UsageMetersComponent` from `GET /me/plan` incl. "Boosted" overrides, active boosts, credits teaser); `features/checkout` `/checkout/fake-billing/:ref` and `/checkout/fake-donation/:ref` (`ProviderCheckoutStore` + billing / donation stores, shared `FakeProviderCheckoutComponent`: "Local test payment" banner, Pay / "Simulate a failed payment", polls until the synthetic webhook lands, a declined subscription stays open with "Try again", success reloads the session → `/premium?checkout=success` or `/support?donation=thanks`); `features/credits` `/credits` (account menu; balance with the "never withdrawable or transferable" wording, products to unlock for a day, `SpendCreditsDialogComponent` with one idempotency key per dialog and 409 `INSUFFICIENT_CREDITS` with balance and cost, active boosts, referral card with copy / share and redeem (404 and each 409 `REFERRAL_NOT_ALLOWED` reason on the field), cursor-paged ledger); `shared/ads` (`SponsoredSlotComponent` on `GET /ads?placement=&game=`: nothing while `advertising` is off, for `[]` (Premium / entitlements) or on errors, waits for the session and reloads on sign-in or upgrade; `SponsoredAdComponent` always labelled "Sponsored" with "Remove ads" → `/premium`; `adClickHref` follows only the API click route or https, new tab, `rel="sponsored noopener"`; `AdImpressionDirective` + `AdTrackingService` record one impression per serve token once half visible) placed in `/search` results and card holders (SEARCH_SPONSORED), the map list panel (MAP_PANEL), the `/inventory` sidebar (INVENTORY_SIDEBAR) and other collectors' profiles (COLLECTOR_PROFILE); `features/support` `/support` (footer "Support OrenjiTrade" and account menu; "Voluntary support" that never changes ratings, ranking or trust; preset or custom amount, currency, private message, public-thanks opt-in, the API's range errors on the field; public supporters wall (names and month only) and own donations); admin `features/admin/billing` (sections Plans, Subscriptions, Credits, Ads, Donations enabled): Plans (SUPER_ADMIN edits name, description, price, currency, availability, order, feature switches), Subscriptions (list/filter, detail with history and webhooks, cancel at the period end or now with a reason), Credits (ledger of all or one account with its balance, grant/adjust dialog, credit products and referral rules for SUPER_ADMIN), Ads (advertisers, placements, campaigns with schedule, budgets, pricing, activate / pause / end, `TargetingEditorComponent` refusing coordinates, creatives with https-or-site-path URLs, delivery stats), Donations (totals per currency, detail, refund and accepted amounts for SUPER_ADMIN), user page Subscriptions / Credits links and an Entitlements panel (grant with optional end and note, revoke) — clears the stage 3 carry-over (admin entitlements and plan editing); every write confirmed and "The action is in the audit log."; audit labels for `subscription.cancel`, `credits.*`, `ads.*`, `donation.refund`, `donations.settings.update`. Tests: 41 new Vitest tests (537 → 578 / 120 files: billing labels and refusals, `PremiumStore` and usage rows, provider checkout stores (outcomes, retry after a decline, give-up), `CreditsStore` (paging, spend, insufficient balance, redeem), `SponsoredSlotComponent` (label, click route, one impression, `[]`, flag off, session wait, reload on upgrade), donation form, admin campaign form, targeting without coordinates, creative URLs, entitlement values, the limit dialog closing every dialog); Playwright `e2e/freemium.spec.ts` (1: `binders.max` → "See Premium" → fake billing checkout with a simulated decline then payment → PREMIUM limits, sixth binder, no ads → "Cancel now" → FREE) and `e2e/credits-ads.spec.ts` (4: a fresh collector redeems another's referral code (unknown code explained) and spends the credits on a 24 h unlock, the referrer earns 100; a signed-out visitor's MAP_PANEL "Sponsored" ad records an impression (204) and its click lands on the target, a FREE collector sees a sponsored search result and none once Premium; a donation through `/support` and the fake donation checkout shows the opted-in name among the supporters without amounts or messages; an admin grants credits, creates / edits / targets (coordinates refused) / ends a campaign with a creative, finds `credits.grant` and the campaign entries in the audit log and grants then revokes an entitlement that overrides `wishlist.items.max`); every JSON lat/lng ≤ 3 decimals; `admin-rules.spec.ts` now expects the upgrade button enabled — 51/51 Playwright specs green, 0 skipped. Debt: the admin plan editor, admin subscription cancel and donation refund / settings have no E2E coverage yet; there is no member route for the accepted donation amounts (presets are suggestions, the API's 400 carries the range); the fake checkouts poll up to ~45 s for the synthetic webhook; a Leaflet `_leaflet_pos` console error (zoom transition ending after the map is torn down) shows in the dev-server log during the E2E run without failing any spec
- [x] Mobile premium/credits/donations UI — stage M6 (2026-10-05, branch `feature/mobile-m6`, merged into `main` as #51): Premium through the fake billing checkout, "See Premium" on reached limits, credits (ledger, unlocks, referrals), donations through the fake donation checkout, "Sponsored" placements; app-store purchase rules are an open owner question (ADR 0011); see "Mobile app (stage M6)"

## Local environment + web acceptance suite (stage 12, final verification)

_Workflow `web-mvp-local-continue` stage 12 (local tooling ∥ web acceptance suite) and the final
independent verification (2026-09-30): from a clean state (`npm run infra:reset -- --yes`),
`npm run test:all` passed (API 704 tests / 140 classes, 0 failures, 0 skipped · web lint + 579
Vitest tests / 120 files · mobile typecheck + lint + 29 jest tests · Playwright 67/67 against the
real local stack, 0 flaky, 0 skipped), `npm run infra:validate` passed (fmt + validate of dev,
staging, prod and Cloudflare; nothing planned or applied), `ng build` production bundle 877.57 kB
initial (900 kB warning budget), and `npm run dev` came up in 50.6 s (API ready 32.4 s, web 14.1 s)
for a manual walkthrough: 36/36 API steps with curl-style calls (sign-in, inventory, map, search,
messaging, wishlist match + notification, offer → counter → accept → trade, report → moderator
resolution → audit log, admin, Premium through the fake billing checkout and back to FREE; every
JSON response ≤ 3 decimals, no private location keys, no raw distances) and 28/28 UI checks in
Chromium (signed-in collector: map, inventory, search, cards, messages, wishlist, notifications,
offers, trades, community, premium, credits, support, collector profile, settings, legal; admin:
dashboard, users, reports, listings, audit log, subscriptions, disputes, system health; no API 5xx,
no coordinate with more than 3 decimals)._

- [x] One-command local stack — root `package.json` scripts backed by dependency-free Node scripts in `scripts/` (`scripts/lib/util.mjs` shared helpers, Windows/macOS/Linux): `npm run dev` (`docker compose up -d --build --wait` → `gradlew bootRun` with the `local` profile → readiness wait → `ng serve` → URL table; Ctrl+C stops the API and web, infrastructure keeps running; `--no-web`, `--skip-infra`; logs in `.local-dev/logs/`), `npm run api:dev`, `npm run web:dev`, `npm run infra:up` / `infra:down` (volumes kept), `npm run infra:reset` (confirmation or `-- --yes`; deletes only the `orenjitrade_*` volumes and `apps/api/.local-storage`, then brings the infrastructure back; the seed is re-applied at the next API start), `npm run infra:validate` (Terraform `fmt -check` + `init -backend=false` + `validate`, never plan/apply), `npm run test:api|web|mobile|e2e|all` (+ optional `test:ml` for the on-hold skeleton). `test:e2e` builds and runs a copy of the API jar on :8080 and `ng serve` on :4200, runs every Playwright spec with one retry and stops what it started (`--reuse-running` to use a running stack) — since 2026-10-04 on its own isolated stack (database `orenjitrade_e2e`, API :8180, web :4300; see "E2E isolation, test-data purge and 3 km zones")
- [x] Optional all-in-Docker stack — `docker compose --profile app up -d --build --wait` (API and web images on the same ports, `api-media` volume, fake/log providers, same database and emulator); Firebase emulator image pins `firebase-tools@14.27.0` and bakes the Emulator UI (offline resets); web `docker-entrypoint.sh` exports `AUTH_EMULATOR_ORIGIN` for the CSP; `.dockerignore` excludes `.local-dev`
- [x] Docs — `docs/development/local-setup.md` (prerequisites, first-time setup, everyday commands, URLs/ports, where data lives, reset and reseed, fake/log providers and where their output appears, troubleshooting, Windows notes), README quick start, `.env.example` (compose ports, fake provider secrets documented as local-only), `docs/deployment/DEFERRED.md` "Local replacement"
- [x] Web acceptance E2E suite — `apps/web-angular/e2e/acceptance/` (16 tests / 15 specs, README): registration, inventory, map, search, wishlist, messaging, offers, rating, reporting, freemium, privacy (the scanner catches planted leaks over HTTP and STOMP + a sweep of every geo surface), account deletion (grace period fast-forwarded, `/internal/jobs/account-deletion` with the service token, anonymised account, consents/audit kept), payment protection, community and (final verification) `stale-listings.spec.ts` (a listing's last confirmation backdated 44 days → `/internal/jobs/freshness` → STALE, never deleted → admin "Needs review" queue → Restore → ACTIVE → `listing.restore` in the audit log). Shared `support/` fixtures: the automatic ADR 0004 privacy scanner on every browser context and API shortcut (fails on lat/lng > 3 decimals, a stored trading-area centre or a raw numeric distance), `AcceptanceApi` seeding shortcuts with fresh fictional emulator accounts, staff demoted and binders unpublished afterwards, one latitude band per spec (`places.ts`). `E2E_REQUIRE_STACK=1` turns an unreachable stack into a failure; `.github/workflows/e2e.yml` runs the whole suite on pull requests touching apps/packages/compose, nightly and on demand, with random per-run CI secrets
- [x] Fixes during stage 12: `InventoryStore.deleteBinder` waits for queued binder-order saves (a save sent after the deletion named the deleted binder → 404 and a lost move; Vitest regression test); `e2e/map.spec.ts` picks trading-area centres on the public-grid latitude lines so the "never equals a stored centre" check cannot fail by chance; `e2e/payments.spec.ts` waits for the shipment dialog's focus before typing; production build optimisation block made explicit (`inlineCritical: false`)
- Debt: `docker compose --profile app` builds were verified during stage 12 only (not re-run in the final verification); rapid full-page reloads (≈ 15 page loads per minute, each re-fetching 5–27 API resources incl. placeholder card images) reach the default 120 requests/minute per-user limit (`RATE_LIMIT_DEFAULT_PER_MINUTE`) and the anonymous 60/minute per-IP limit that placeholder images count against — normal in-app navigation at a human pace stays well below (28/28 UI checks with a 4 s pause); revisit the limits in Phase 13

## Card images + real Yu-Gi-Oh! catalog (ADR 0015)

_Workflow `card-images`, task "backend" (2026-10-01, branch `feature/card-images`): game-agnostic
card image architecture with the YGOPRODeck adapter as the first real provider. Migrations V100–V102
(range V100–V109). Owner rules: the local image cache never exceeds 500 MB (raised to 5 GB on
2026-10-04, see "Card image cache raised to 5 GB" below); YGOPRODeck images are
never hotlinked (re-host only); metadata is always imported completely; real imports are explicit,
seeds/tests/CI stay offline. Verification: `./gradlew spotlessApply build` 756 API tests / 152 classes, 0 failures, 0 skipped (previously 704 / 140); `./gradlew exportOpenApi` (254 paths, previously 243; no path, operation or schema lost; 7 schemas added); `npm run generate:api`; `npm run build -w apps/web-angular` (877.57 kB initial, unchanged) and the web spec typecheck pass. Live smoke (API jar on :8090, profile `local`, database `orenjitrade_test`, Redis db 1, `CARD_IMAGE_LOCAL_CACHE_MAX_MB=5`, temporary cache directory, stopped and deleted afterwards): `npm run catalog:import -- --game yugioh --provider ygoprodeck --images limit:60 --api http://localhost:8090` → SUCCEEDED in 27 s, database 147.20, 14,592 cards created, 650 sets, 44,568 printings, 14,764 artworks referenced, 60 selected (the 8 demo printings first) → 52 downloaded + 8 deduplicated (identical artworks), 8.8 MB received, 2.31 MB of 5 MB used (= bytes on disk, 52 files), limit not reached; the second run: 0 created / 0 updated / 0 upserted, 60 already cached, 0 downloaded, 4.2 s; cached images served as 320 px JPEG (≈ 43 KB) with `immutable` caching; the demo binder's items carry `/api/v1/public/card-images/` URLs and no provider URL. Real provider traffic during the whole development: 1 snapshot (checkDBVer + cardinfo + cardsets), 2 more checkDBVer, 60 image downloads._

- [x] Data model — V100: `card_image` = one row per provider artwork (`game_id`, owner `card_id`
  + optional `printing_id`, `provider` + `provider_image_id` unique, `position`, server-side
  `source_url`, `cache_status` NOT_CACHED/CACHED/FAILED/MISSING_AT_SOURCE, storage key, type, size,
  dimensions, SHA-256, download/access times, attempts, last error), `card.image_id` (primary
  artwork; printings resolve their picture through their card), `card_image_cache_usage` (single
  row locked `FOR UPDATE`), `card_image_cache_reservation` (expiring), `catalog_sync_run` image
  mode / limit / provider version / phase / report. V101: printing variant key includes the rarity;
  yugioh GameSchema gains rank, link rating/arrows, pendulum scale, property, archetype, frame, all
  monster types, common rarities. Documented in `docs/database/schema.md`.
- [x] Provider abstraction — `CardProvider.imageHostingPolicy()` (`REHOST_REQUIRED` default /
  `HOTLINK_ALLOWED`), `supportsImageDownloads()`, `openImage()`; `ProviderCard.images` (card-level
  artworks), `ProviderImage.providerImageId`, `SyncResult.providerVersion`/`warnings`; reusable
  `ProviderHttpClient` (RestClient on the JDK client, timeouts, no redirects, User-Agent,
  `HostRateLimiter` per host default 5/s hard ceiling 15, `RetryPolicy` exponential backoff for
  timeouts/5xx/429 with `Retry-After`, never other 4xx).
- [x] `YgoProDeckCardProvider` (`cards/infra/ygoprodeck`) — checkDBVer first, raw snapshot per
  `database_version` under `PROVIDER_DATA_DIR/ygoprodeck/<version>/` (git-ignored) reused while
  unchanged, else one `cardinfo.php?misc=yes` + `cardsets.php` download; snapshot-only mode;
  `YgoProDeckMapper` (cards, metadata, sets per code with products, printings per code + rarity,
  USD indicative prices, one artwork per image id, provider data errors skipped as warnings); image
  URL allow-list (SSRF guard). Real catalog (database 147.20): 14,592 cards, 44,568 printings, 650
  sets, 14,764 artworks imported in ~14 s, unchanged re-import ~4.5 s with 0 changes.
- [x] `CardImageCache` (`cards/domain/images`) — `CARD_IMAGE_LOCAL_CACHE_MAX_MB` (default 5120 MiB
  = 5 GB, start-up refused above 5120, since 2026-10-04; 500 before), `CARD_IMAGE_CACHE_DIR`;
  reserve under lock → stream to
  `.tmp/<reservation>.part` (aborted above the reservation) → sniff/decode (HTML, empty, wrong type
  refused) → 320 px JPEG q0.82 without metadata → SHA-256 dedupe → commit usage + release
  reservation → atomic move; cleanup on every failure; expiring reservations; single-flight,
  4 parallel downloads; no request while less than a typical download fits; reconciliation at
  start-up and on demand (orphan temps, missing files, unreferenced files, usage from disk, LRU
  eviction when the limit was lowered); eviction and per-game clears release capacity; status.
- [x] Serving + URLs — `GET /api/v1/public/card-images/{imageId}` (cached JPEG `public,
  max-age=31536000, immutable` + SHA-256 ETag/304; otherwise a rate-limited single-flight on-demand
  fill (3 s) while capacity remains, else the placeholder SVG with 5 min caching; never a provider
  URL); `CardImageUrlResolver` is the only source of image URLs for `CardSummary.primaryImageUrl`,
  `CardDetail.primaryImageUrl`, `PrintingSummary.images[]` (card detail, printings, sets, printing
  detail, inventory items, public inventory items, offers/trades items, card holders),
  `CardSuggestion.imageUrl` (cards and unified search suggest, discovery results),
  `CardLink.imageUrl` (messages, community posts), binder `coverImageUrl` (own, public, collector
  binder lists), wishlist `card.imageUrl` (wishlist, matches, public wishlist summary),
  notification `data.cardImageUrl` (+ `cardName`, `game`) of `WISHLIST_MATCH`, `OFFER_*`,
  `TRADE_UPDATE`, `PAYMENT_UPDATE`, `SHIPMENT_STATUS`, `DISPUTE_UPDATE` (`NotificationCards`;
  stored API-relative, absolute in `GET /notifications`), `OfferLink.imageUrl` (OFFER_LINK and
  SYSTEM messages, resolved when read, never stored), `AdminListingItem.imageUrl` (admin listings
  and stale queue). Mock placeholders unchanged. Rate limit policy `card-images` 600/min per IP.
- [x] Importer — `CatalogImportService`: provider fetch (outage → FAILED with a clear message,
  catalog kept), metadata in chunks of 500 cards with prefetched state and JDBC batches (failing
  chunk retried card by card), `CatalogImportedEvent`, then image mode NONE / REFERENCED (default:
  inventory, binders, wishlists, offers/trades, message and community card links through the
  `CardImageReferenceSource` SPI) / ALL / LIMIT n (deterministic), never failing on a full cache;
  `CatalogImportReport` stored on the run (progress per phase); 409 while an import of the game
  runs; interrupted runs failed on the next run.
- [x] Triggers — admin `POST /admin/catalog/sync` (+ `imageMode`, `imageLimit`),
  `GET /admin/catalog/sync-runs/{id}/report`; internal `POST /internal/jobs/catalog-import`,
  `GET /internal/jobs/catalog-import/{id}`; root scripts `npm run catalog:import -- --game yugioh
  --provider ygoprodeck --images referenced|all|none|limit:<n>` (polls and prints the report),
  `npm run card-images:status`, `npm run card-images:clear -- --yes [--game <slug>]`,
  `npm run card-images:reconcile` (plain Node, `scripts/lib/internal-api.mjs`).
- [x] Admin cache console API (audited) — `GET /admin/card-images/status`,
  `POST /admin/card-images/clear`, `POST /admin/card-images/reconcile`,
  `DELETE /admin/card-images/{imageId}/cache`.
- [x] Local demo — `RealCatalogDemoSeedContributor` (`real-catalog-demo`, order 550, also after
  each YGOPRODeck metadata import): Blue-Eyes White Dragon LOB-EN001, Dark Magician LOB-EN005,
  Red-Eyes Black Dragon LOB-EN070 and the five Exodia pieces in collector1's public binder; silent
  without the real catalog.
- [x] Tests (offline: `YgoProDeckStub` = JDK HttpServer API + raw-socket image host, fictional
  fixtures, images generated in memory) — YgoProDeckMapperTest (6), YgoProDeckCardProviderTest (2),
  ProviderHttpClientTest (8), HostRateLimiterTest (3), CardImageConfigTest (5, rejects > 5120 since 2026-10-04, > 500 before),
  CardImageProcessorTest (4), CardImageFileStoreTest (3), YgoProDeckImportIT (5: complete metadata,
  idempotent re-imports downloading nothing, REFERENCED/LIMIT, image problems, outage, admin and
  internal triggers), CardImageCacheIT (7: rendition, dedupe, dropped connection, invalid content,
  reservation expiry, reconciliation, eviction/clear), CardImageCacheLimitIT (3, 1 MB cache: sampled
  disk + reservations and DB accounting never above the limit under parallel downloads, cache-full
  import, placeholder when full), CardImageServingIT (5), CardImageUrlContractIT (2: every DTO with
  card imagery, no provider URL; notifications WISHLIST_MATCH / OFFER_RECEIVED (listed absolute,
  stored relative), message offer links (never stored), admin listings + hide answer),
  NotificationCardsTest (2), OfferSnapshotsTest (1); WishlistRulesTest, WishlistMatchingIT,
  TradeLifecycleIT, ProtectedPaymentFlowIT and DelistingAdminIT assert the card picture of their
  notifications, offer links and listings; SeedDataRunnerIT and OpenApiExportTest extended.
- [x] Docs — ADR 0015 (+ README index, ADR 0005 link), `docs/providers/ygoprodeck.md`,
  `docs/database/schema.md`, `docs/development/local-setup.md` ("Card images and the real Yu-Gi-Oh!
  catalog"), `docs/development/seed-data.md`, `apps/api/README.md`, `ARCHITECTURE.md`,
  `.env.example`, `CLAUDE.md` rule, `.gitignore`.
- [x] Web card pictures (workflow `card-images`, task "web", 2026-10-01) — `apps/web-angular`:
  game-agnostic `shared/ui/card-image` (`<app-card-image>`, replaces `shared/catalog/card-image`):
  inputs `src` (API URL only; API-relative realtime paths resolved against the API origin), `alt`
  (card name; `''` only inside autocomplete options/pickers that already name the card), `size`
  (`xs`/`sm`/`md`/`lg`/`xl`/`fill`), `game` (placeholder tint), `eager` (hero); fixed 5:7 frame,
  explicit width/height, `loading="lazy"`, `decoding="async"`, shimmer skeleton until `load`
  (static under reduced motion), the game's placeholder card art on a missing URL or a load error
  (still announced as `role="img"` with the name), dark-mode tokens, `data-state`
  loading/loaded/placeholder/error, restyled through `--card-image-*` custom properties. Used on
  every card surface: top-bar and unified suggest lists, card/printing/link/wish pickers, add-card
  dialog search + printing picker, catalog grid tiles, card detail hero, printings tables (card
  detail, set checklist, admin card edit; new picture column), set page grid, inventory grid/table
  and edit sheet, public binder page + header, collector profile (public cards, binder previews,
  "Looking for"), map holders panel header + each listing + the preview card's matching listings
  (new `CardPictures` from `GET /cards/{id}` or `/printings/{id}`, `MatchingItem` carries ids
  only), search holders banner + collector results listings + printing chips, card-holders view,
  wishlist list, add/edit dialog, matches drawer and match cards, notifications bell + page (card
  picture with a type badge when the payload carries `data.cardImageUrl`), offers make-offer
  dialog, card picker, inbox rows, deal summary (offer and trade pages), trades list and the trade
  page's "Cards you received", message composer card/offer attachments, offer link picker, message
  and community card links, community post composer, admin cards list and edit page. Provider
  credits: `shared/catalog/card-data-attribution` (per game, wording of `docs/providers/ygoprodeck.md`)
  on Yu-Gi-Oh! card and set pages and in the footer. Tests: Vitest +12 (599 tests / 125 files:
  card image loading/skeleton/error fallback/alt/sizes/relative URLs, card pictures, attribution,
  notification card payloads and entry, printings table pictures, preview listings, store holders
  pictures, suggestion pictures); Playwright `e2e/card-images.spec.ts` (2, offline on the seed
  catalog, placeholders not stubbed: pictures render with a non-zero natural size from the API's
  own routes, none fail; provider hosts blocked and no request, `img` src or JSON answer points at
  `images.ygoprodeck.com`); `e2e/catalog.spec.ts` rarity option made exact (V101 added
  Platinum/Prismatic/... Secret Rare). Debt: initial bundle 887.59 kB (was 877.57 kB; budget
  warning 900 kB).
- [x] Image gaps (workflow `card-images`, task "image gaps", 2026-10-01) — backend: notifications
  about one card carry `data.cardName`, `data.game`, `data.cardImageUrl` (`WishlistMatcher` from the
  item's printing via `CatalogService.frontImageUrls`; offers, trades, payments and disputes through
  the offers module's new `OfferCard` = live item, else the offer's item snapshot printing,
  `OfferService.card` / `TradeService.card`); `OfferLink.imageUrl` and `AdminListingItem.imageUrl`
  (additive, nullable). Web: notification bell/page already rendered `data.cardImageUrl`
  (unchanged); `app-offer-link-card` shows the card picture with an offer badge (icon when no
  picture), admin listing rows show the card picture (`app-card-image`, placeholder art without
  one). Verification: `./gradlew spotlessApply build` 762 API tests / 154 classes, 0 failures,
  0 skipped; `./gradlew exportOpenApi` (254 paths and 371 schemas, unchanged counts; only
  `AdminListingItem`, `NotificationResponse` (description) and `OfferLink` changed);
  `npm run generate:api`; web lint and format clean, 603 Vitest tests / 126 files (+4), production
  build 887.59 kB initial (unchanged). Playwright left to the verifier. Mobile: no card image
  component exists in `apps/mobile` (deferred).
- [x] Independent verification (workflow `card-images`, 2026-10-01) — `npm run test:all` green on
  the final tree: API 764 tests / 155 classes (0 failures, 0 skipped), web lint + 603 Vitest tests /
  126 files, mobile typecheck + lint + 29 jest tests, Playwright 69/69 (0 flaky). Cache invariant
  reviewed and hardened: a temporary file is exempt from the capacity check only while its live
  reservation or the committed usage covers it (previously any download of the JVM was exempt, so
  the partial file of a download whose reservation expired was not counted; new
  `CardImageCacheIT.aDownloadWhoseReservationExpiredKeepsCountingItsTemporaryFile`, which fails on
  the old rule), and an attempt stops when its raw body cannot be deleted before the rendition is
  written; per-game `cachedBytes` count a deduplicated file once (status showed 15.13 MB for a
  14.88 MB / 15 MB cache). V102 `trg_card_image_fill_owner`: code that predates V100 (the `main`
  checkout sharing the local database, older revisions during a rolling deploy) failed its mock
  catalog seed with a not-null violation on `card_image.card_id`/`game_id`, so its API could not
  start; `CardImageLegacyWriterIT` runs that upsert verbatim. E2E: `catalog.spec.ts` and
  `card-images.spec.ts` no longer assume the seed catalog is the only Yu-Gi-Oh! catalog (they
  failed once the real catalog was imported locally), and `npm run test:e2e` starts its API with
  `CARD_IMAGE_ON_DEMAND_ENABLED=false` (a run had fetched 22 artworks from YGOPRODeck on demand).
  Live (dev database, profile `local`, default cache, 500 MB at the time): `npm run catalog:import -- --game
  yugioh --provider ygoprodeck --images referenced` → SUCCEEDED, YGOPRODeck database 147.22 (new
  snapshot, byte-identical to 147.21), 14,595 cards (0 created/updated), 650 sets, 44,568
  printings, 14,767 artworks referenced, 12,353 printings upserted (price date = provider
  `last_update`), 8 referenced artworks already cached, 0 downloaded; the re-run upserted and
  downloaded nothing (4.2 s). Cap proof (separate database and temporary cache directory,
  `CARD_IMAGE_LOCAL_CACHE_MAX_MB=15`, `--images all`): metadata complete (14,595 cards created,
  44,568 printings), 331 downloaded + 8 deduplicated, 14,428 skipped, `cacheLimitReached=true`,
  14.88 MB used = 15,600,834 bytes on disk (`du -sb`, sampled every 0.1 s during the run including
  `.tmp/`: maximum 15,600,834 ≤ 15,728,640); the re-run downloaded 0; database, folder and Redis db
  removed afterwards. Average cached rendition 47,132 bytes (320 px JPEG; raw downloads average
  ≈ 159 KB) → about 11,100 artworks fit in the former 500 MB cap (≈ 75 % of the 14,767; all of
  them, ≈ 696 MB, fit in the 5 GB cap since 2026-10-04). `CARD_IMAGE_LOCAL_CACHE_MAX_MB=501`
  stopped the start-up then (5121 since 2026-10-04). Browser (Playwright on the running stack): card detail of Blue-Eyes White
  Dragon and Dark Magician, `/cards?q=forbidden one` and `/search?q=forbidden one` render real
  pictures from `/api/v1/public/card-images/` (320×466, natural size > 0); no request to any
  `ygoprodeck.com` host and no provider URL in the DOM.
- [x] Mobile — `CardImage` (`apps/mobile/src/components/ui/CardImage.tsx`, stage M1): expo-image,
  API picture URLs only (`/api/v1/public/card-images/{id}`, placeholders, media; anything else →
  placeholder art), 5:7 frame, skeleton, provider credit line of the web; unit-tested. Card
  surfaces that use it arrive with the mobile Phase 2+ stages.
- Debt: the cache is local-disk only (cloud would need GCS + shared accounting, deferred with Phase
  14); on-demand fills are per instance; the real catalog has 13 invalid printing codes and 9 code
  + rarity pairs claimed by two cards (skipped, reported as warnings); production legal review of
  the YGOPRODeck terms, card image rights and attribution is required before any public launch.

## Map location privacy rendering (ADR 0004 "Client rendering", 2026-10-03)

_Workflow task "build" on branch `feature/map-privacy-zoom` (web + docs only; no backend, API,
database or grid change). Owner task: collector markers looked like exact home locations when
zooming in (Leaflet up to zoom 19, Google uncapped, 44 px avatars centred on the public point,
clustering off from zoom 16). Rule now: no map that shows other collectors suggests a position more
precise than an area about 2 km wide, at any zoom, with either adapter. Builder verification:
`npm run lint`, `npm run format:check`, `npm test` (129 files / 629 tests, previously 126 / 603)
and `npm run build` (initial 887.66 kB, no warnings) in `apps/web-angular`; `./gradlew test` of the
`location` and `search` packages: 56 tests / 10 classes incl. `GeoPrivacyContractTest`,
`LocationIT`, `ApproximateLocationServiceTest`, `NearbyCollectorsIT`, `SearchIT`, `CardHoldersIT`,
0 failures (no backend change). Playwright
not run by the builder (the owner's servers hold 4200/8080).
Independent verification (2026-10-03, verifier attempt 1): lint, format:check, `npm test`
(129 / 629) and `npm run build` (no warnings) re-run green; `./gradlew test` for
`*GeoPrivacyContractTest*`, `*location*`, `*search*`, `*Nearby*` patterns: 79 tests / 17 classes,
0 failures; no diff under `apps/api` or `packages/`. Isolated stack (API jar on :8081 against
database `orenjitrade_e2e` and Redis db 2, `ng serve` on :4201 with a temporary config): Playwright
`e2e/map.spec.ts`, `e2e/acceptance/map.spec.ts`, `e2e/acceptance/search.spec.ts`,
`e2e/acceptance/privacy.spec.ts`, `e2e/smoke.spec.ts` 11/11 green. Walkthrough as `collector1`:
zoom button, scroll wheel and keyboard "+" all stop at 14 (Leaflet `maxZoom` 14, "+" disabled);
search-box preview focus from zoom 8 lands on 14; every collector has a 1000 m disc measured at
150 px radius at zoom 14 / 45.5° N (expected 149.4 px); profile map: no pin, one 1000 m disc,
capped at 14; notes visible on the legend, preview and profile; no JSON lat/lng finer than 3
decimals (search centres 2), no DOM attribute, page state or console message with a finer
coordinate. Mutation check: removing the cap from both adapters fails 8 adapter tests._

- [x] Inspection: the only surfaces that draw another collector's public point are `/map`
  (`features/map/map-canvas` via `map-page`, markers from `data/map-markers.ts`) and the profile
  map `shared/map/approximate-area-map` (in `collector-profile-view`, used by `/collectors/:handle`
  for others and for the own public profile). The collector preview, list, search, card holders,
  binder headers, offers and wishlist matches show labels and distance buckets only, never a map.
  `shared/location/trading-area-picker` (onboarding, settings) only draws the user's own centre
  and radius to themselves; unchanged and not capped.
- [x] Zoom cap — `shared/map/approximate-area.ts` `COLLECTOR_MAP_MAX_ZOOM = 14`;
  `MapAdapterOptions.minZoom`/`maxZoom` + `clampZoom` (ADR 0010 amendment): Leaflet map
  `maxZoom` option (wheel, buttons with "+" disabled at 14, keyboard, touch, box zoom) plus clamped
  initial zoom / `setView` / `fitBounds` limit; Google `MapOptions.maxZoom`, clamped `setZoom` and a
  `zoom_changed` guard; `map-canvas` and `approximate-area-map` pass the cap; the store's preview
  focus and cluster zoom never ask for more. `FakeMapAdapter.created(options)` clamps like the real
  adapters.
- [x] Approximate areas — `APPROXIMATE_AREA_RADIUS_M = 1000` (2 km wide, metres) shared by `/map`
  and the profile map: `buildCollectorMarkers` returns `areas` (one `approximate` disc per collector
  drawn on their own, the selected one in the stronger `area` look; none for clustered collectors);
  `map-canvas` takes `circles` (search radius + discs); `circleStyle` shared by both adapters,
  circles restyled in place when their variant changes, unchanged discs not redrawn. Discs for every
  collector (≤ 200 per answer) rather than the selected-only fallback: cheap in both providers and
  hidden behind the avatar until zoom 12.
- [x] Clustering — `CLUSTER_MAX_ZOOM = COLLECTOR_MAP_MAX_ZOOM` (was 16); threshold and cell size
  unchanged.
- [x] Wording — legend "Locations are approximate (about 2 km) to protect privacy" + a legend key
  for the disc; preview note "Locations are approximate (about 2 km)" (`data-testid=
  preview-approximate`); map accessible name ends with the note; profile "Approximate area (about
  2 km) around …"; Privacy Policy "Public point" definition adds "Maps show it as an area about 2 km
  wide, never as an exact spot." (privacy `lastUpdated` 2026-10-03). The ~1 km grid wording
  (privacy settings, trading-area picker, legal grid sentence, admin grid-cell hint) is unchanged.
- [x] Tests — new `leaflet-map-adapter.spec.ts` (real Leaflet in jsdom: initial zoom, `setView`,
  `fitBounds`, zoom button, keyboard and wheel stop at 14; no cap keeps 18 / fitBounds 15; disc
  restyling), `google-maps-adapter.spec.ts` (fake `google.maps`), `approximate-area-map.component.spec.ts`;
  extended `map-adapter`, `map-markers`, `marker-clusters`, `map-discovery.store`, `map-page`
  (approximate-area cue, cap, emphasised disc, legend key) and `collector-preview-card` specs;
  Playwright `e2e/map.spec.ts` gains the preview note, discs and "zoom-in disabled at the cap"
  checks; legend text updated in `e2e/map.spec.ts`, `e2e/acceptance/map.spec.ts`,
  `e2e/smoke.spec.ts`. Mutation check: removing the cap from either adapter fails 9 adapter tests.
- Open question for the owner (ADR 0004): sparse rural grid cells may hold very few homes; grid
  left unchanged pending a decision.

## Card image cache raised to 5 GB (ADR 0015 amendment, 2026-10-04)

_Workflow task "build" on branch `feature/card-image-cache-5gb` (worktree, API + docs only; no
migration, no web/mobile/cloud change). Owner decision 2026-10-04 replaces the 500 MB rule of
2026-10-01: the local card image cache may hold up to 5 GB (5120 MiB) so the whole Yu-Gi-Oh!
catalog at 320 px (14,764 artworks ≈ 650 MB) fits locally with room for other games._

- [x] Limit — `CardImageCacheProperties.MAX_ALLOWED_MB` = 5120 and `@DefaultValue("5120")`,
  `application.yml` `max-mb: ${CARD_IMAGE_LOCAL_CACHE_MAX_MB:5120}`, `.env.example` 5120. Values
  above 5120 still stop the start-up ("must be between 1 and 5120 (configured: …); the local card
  image cache may never exceed 5120 MB (5 GB)"), smaller values are used as configured, never
  silently changed. Unchanged: 320 px JPEG q0.82, 2 MB per-download maximum, reservations and
  temporary files counting toward the cap, eviction, reconciliation, on-demand rate limits, only
  `/api/v1/public/card-images/{id}` reaches browsers, no full-size or cropped copies.
- [x] 64-bit audit (5120 MiB = 5,368,709,120 bytes > `Integer.MAX_VALUE`) — database:
  `card_image_cache_usage.used_bytes`, `card_image_cache_reservation.bytes`,
  `card_image.file_size_bytes` are `bigint` in V100 (no migration needed; the V100 SQL comment
  "<= 500 MB" stays because applied migrations are never edited). Java: `limitBytes()` multiplies
  by the `long` `BYTES_PER_MB` (now with an explicit `(long)` cast), every usage / reservation /
  remaining / temporary-file figure in `CardImageCache`, `CardImageCacheRepository` (`getLong`,
  `query(Long.class)`), `CardImageFileStore`, `CardImageCacheStatus`, `ReconcileResult`,
  `ClearResult`, `ImageFillResult` and `CatalogImportReport` is `long`/`double`; no `int` cast,
  `Math.toIntExact` or int multiplication on byte counts in production code; `limitMb`,
  `cacheLimitMb` and file counts stay `int` (5120 and ~120,000 files fit). OpenAPI: all byte
  fields `int64`. TypeScript: no web screen shows cache figures; `scripts/card-images.mjs` /
  `catalog-import.mjs` format with `Number(bytes) / (1024 * 1024)` (exact below 2^53, no bitwise
  ops). Test-side fix: `CardImageCacheLimitIT` allocated `new byte[(int) (limitBytes - 8 KiB)]`
  (would wrap with a large cap) → `Math.toIntExact` behind an assertion that its cap stays tiny.
- [x] Tests — `CardImageConfigTest` (5: default 5120 and `limitBytes() == 5120L * 1024 * 1024`
  > `Integer.MAX_VALUE`, 5120 / 5119 / 2048 / 500 / 5 / 1 accepted, 5121 and 6000 fail with
  "between 1 and 5120", 100000 / 5000000000 / 0 / -5 fail); `CardImageCacheIT` new
  `theDefaultFiveGigabyteLimitIsAccountedIn64Bits` (default config: 2.5 GiB pretended usage + a
  ~2.5 GiB phantom reservation, no gigabytes written; exact status and admin JSON figures, 8 KiB left
  → CACHE_FULL without a provider request, then a real download commits on top of 2.5 GiB);
  `CardImageCacheLimitIT` (still a 1 MiB cap) new `aSmallerLimitIsHonouredBelowTheFiveGigabyteCeiling`
  (admin status reports 1 MiB, not the default).
- [x] Docs — ADR 0015 amended in place ("Amendment 2026-10-04", Rejected bullet), CLAUDE.md
  card-images rule, ADR index, ARCHITECTURE.md, schema.md, local-setup.md (limit, disk space, old
  `.env` note), apps/api/README.md, `scripts/catalog-import.mjs` comment; OpenAPI description of
  `getCardImageCacheStatus` regenerated (`docs/api/openapi.json`, `packages/api-client`,
  `packages/shared-types`).
- Verification (builder): `./gradlew spotlessApply test` 766 tests / 155 classes, 0 failures,
  0 errors, 0 skipped (incl. CardImageConfigTest 5, CardImageCacheIT 10, CardImageCacheLimitIT 5);
  `./gradlew exportOpenApi` (only the `getCardImageCacheStatus` description changed, no path,
  schema or type change); `npm run generate:api` (description only in 3 generated files); in
  `apps/web-angular` `npm run lint` pass, `npm test` 129 files / 629 tests, `npm run build`
  (initial 887.66 kB, unchanged, no warnings); `npm run typecheck -w apps/mobile` pass. Live (API
  jar on :8081, profile `local`, database `orenjitrade_e2e`, Redis db 2, temporary
  `CARD_IMAGE_CACHE_DIR`, `CARD_IMAGE_ON_DEMAND_ENABLED=false`, `YGOPRODECK_ENABLED=false`): the
  default configuration logs "limit 5120 MB"; `GET /internal/jobs/card-images/status` and
  `node scripts/card-images.mjs status --api http://localhost:8081` report a limit of 5120 MiB =
  5,368,709,120 bytes (remaining 5,368,709,120); `CARD_IMAGE_LOCAL_CACHE_MAX_MB=6000` stops the
  start-up ("APPLICATION FAILED TO START … must be between 1 and 5120 (configured: 6000); the local
  card image cache may never exceed 5120 MB (5 GB)"). The admin endpoint's JSON (same
  `CardImageCacheStatus`) is asserted by `CardImageCacheIT`; a live admin call was not possible
  because the local infrastructure was reset externally during the session (emulator accounts and
  `orenjitrade_e2e` gone; the empty `orenjitrade_e2e` was re-created for the 6000 check, now at V102
  without seed data). No YGOPRODeck request was made.
- Verification (independent verifier, 2026-10-04): repo-wide search finds no current 500 MB card
  image cap (only dated history, the applied V100 SQL comment and the old-`.env` notes); 64-bit
  audit re-done (V100 `bigint` columns, `long` accounting in `CardImageCache` /
  `CardImageCacheRepository`, OpenAPI byte fields `int64`, no web screen shows cache figures, the
  scripts use `Number()` without bitwise ops) with no finding; `./gradlew test --rerun` 766 tests /
  155 classes, 0 failures, 0 skipped (CardImageConfigTest 5, CardImageCacheIT 10 in 9 s,
  CardImageCacheLimitIT 5 in 9 s); `exportOpenApi` + `npm run generate:api` reproduce the committed
  generated files exactly; web lint, `npm test` 129 files / 629 tests, build 887.66 kB; mobile
  typecheck pass. Live (jar on :8081, profile `local`, `orenjitrade_e2e` re-seeded, Redis db 2,
  temporary cache directory, on-demand fills and YGOPRODeck disabled, `CARD_IMAGE_LOCAL_CACHE_MAX_MB`
  unset): `GET /api/v1/admin/card-images/status` with the emulator admin token and
  `GET /internal/jobs/card-images/status` with the local service token both report `limitMb` 5120,
  `limitBytes` 5,368,709,120; `CARD_IMAGE_LOCAL_CACHE_MAX_MB=6000` stops the start-up with
  "must be between 1 and 5120 (configured: 6000)". No YGOPRODeck request was made.
- Note for the owner: a local `.env` copied from the old `.env.example` still sets
  `CARD_IMAGE_LOCAL_CACHE_MAX_MB=500` and keeps the old cap until that line is removed or set to
  5120.

## Mobile app (stage M1: foundation + Phase 1 accounts, 2026-10-04)

_Owner decision 2026-10-04: mobile development resumes (web MVP done); everything stays local and
free (Expo Go on a local Android emulator, Maestro CLI; no EAS, no Expo account, no Maestro Cloud,
no cloud resources). Branch `feature/mobile-m1` (worktree), builder done; the first independent
verification failed on one item (manual trading area without the web's map mechanism) and listed
cheap non-blocking fixes; all fixed below (2026-10-05) and `origin/main` (#39, #40) merged in;
re-verified and merged into `main` as #41._

- [x] Parked work resumed — `wip/mobile-auth-partial` (`1fb776a`) cherry-picked (`969cac7`) and
  reconciled with today's API (`docs/api/openapi.json`, `@orenji/shared-types`) and the web flows
  (`features/{auth,onboarding,settings,legal}`, `core`): stale pieces (`SessionProvider`,
  `accountState`, `queries/*`, `signUp.ts`, `links.ts`) replaced, sound ones kept (`0b790fe`).
- [x] Configuration — `src/config/env.ts` (API base URL, public Firebase config of
  `orenjitrade-local`, Auth emulator host; Android `10.0.2.2`, iOS simulator / web `localhost`),
  `apps/mobile/.env.example` (public values only). Firebase Auth: React Native persistence on
  AsyncStorage (session restore verified on Android after the app is killed), browser persistence on
  web, emulator when configured.
- [x] Auth, onboarding, Profile tab, Settings, building blocks — see the Phase 1 mobile row.
- [x] Device location — read once at reduced accuracy (`expo-location`, `Accuracy.Low`), last-known
  fix up to 10 min, 10 s timeout (the web's `maximumAge` / `timeout`), rounded to 3 decimals like
  the web and sent only to `PUT /me/location/trading-area`; never rendered, stored, persisted or
  logged. Discoverability defaults to off.
- [x] Mobile web E2E — `npm run test:mobile:e2e` (`scripts/lib/mobile-e2e.mjs`): Playwright
  (`apps/mobile/e2e`, 12 specs: `auth` 5, `profile` 1, `location` 1, `account` 2, `leaflet-page` 3) against the Expo web
  build on :19006 and an isolated API on :8090; CI job `mobile-web` in `.github/workflows/e2e.yml`
  (plus the guard tests). Isolation (owner rule 2026-10-04): database `orenjitrade_mobile_e2e`
  recreated per run; media and card-image cache under `.local-dev/mobile-e2e/` with a guard
  (`scripts/lib/mobile-e2e-guard.mjs`, 27 `node --test` tests since 2026-10-05) that refuses directories resolving to
  any checkout's developer directories, the developer database or port, or any card provider call;
  `--reuse-running` only reuses the API the harness started (identity block in `/actuator/info` +
  state file) and refuses the developer API on :8080; accounts `m-<run id>-...@mobile-e2e.test`
  deleted from the Auth emulator after the run; mock catalog only (YGOPRODeck disabled).
- [x] Native (Android, Expo Go) — `npm run test:mobile:maestro` (`scripts/lib/mobile-maestro.mjs`):
  isolated API on :8090, Metro on :8082 with `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8090`, bundle
  checked for that URL, Expo Go installed by Expo CLI when missing; 5 flows in `apps/mobile/.maestro`
  (`sign-in`, `sign-up-onboarding`, `profile-edit`, `discoverability`, `sign-out` with session
  restore). Defects found and fixed on the device: native bundles failed to transform
  (react-native-worklets Babel plugin resolved the web toolchain's hoisted Babel 8: root
  devDependencies pin `@babel/generator` / `@babel/traverse` 7.29.8, guarded by a jest test and an
  `expo export --platform android` CI step); every authenticated call failed after sign-in
  (openapi-fetch rejects React Native's Response class as a middleware result); forms hidden behind
  the keyboard (edge-to-edge, `KeyboardAvoidingView` in `Screen`); "Use my current location" spun
  forever without a fix (10 s timeout). Flow robustness: subflows dismiss the Expo Go developer menu
  and an "isn't responding" dialog, and scroll with edge swipes (a slow swipe starting on a filled
  TextInput becomes a text-selection long press on a slow emulator).
- [x] Verifier fixes (2026-10-05, after the first independent verification) — blocking: the manual
  trading area now uses the web picker's mechanism (`src/features/location/TradingAreaPicker.tsx` +
  `TradingAreaMap`): a tap on the map or a dragged pin moves the centre, "Use map centre" after
  panning, "Jump to a city" quick picks with their suggested radius (the web's `choosePreset`), the
  1–50 km radius drawn as a circle, loading skeleton and "Reload map" error state (quick picks keep
  working); hand-picked centres are rounded to 3 decimals and saved with source MANUAL; a
  device-derived centre is never drawn (no pin or circle, the camera looks at its 2-decimal
  neighbourhood); the centre is described in words only (`area-centre-summary`).
  **Map engine (ADR 0010 amendment 2026-10-05):** on the emulator the react-native-maps Google map
  stayed an empty grey surface: the Maps SDK refuses the key bundled with Expo Go ("Authorization
  failure"; the Map tab was just as grey, which the first verification mistook for a loaded map),
  so the camera never moved and "Use map centre" failed. `src/components/map/mapEngine.ts` now
  picks react-native-maps only for Apple Maps (iOS) or Google Maps in an Android build carrying
  `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` outside Expo Go, else Leaflet 1.9.4 + OpenStreetMap in a
  `react-native-webview` page (`src/components/map/leaflet/`: Leaflet from a pinned unpkg URL with
  Subresource Integrity equal to the npm bytes, no geolocation or storage, validated JSON messages,
  fit deferred until the WebView has a size, links open in the browser). The Map tab uses the same
  engine (browse only, zoom capped at 14). Tests: jest (`tradingAreaPicker.test.tsx` on the native
  map, `tradingAreaMapLeaflet.test.tsx` on the WebView: tap, drag, city focus, map centre, device
  area, disabled, malformed messages, error + retry, timeout; `maps.test.ts`: engine choice, SRI vs
  `node_modules`, escaping, messages; `collectorMap.test.tsx`), Playwright (`location.spec.ts`:
  city, map tap, pin drag, `PUT` body MANUAL with 3 decimals; `auth.spec.ts`: a map tap during
  onboarding; `leaflet-page.spec.ts`: the WebView page in Chromium, taps, pin drag, apply, focus,
  0 x 0 layout, Leaflet load failure) and Maestro (`discoverability.yaml`: city, tap on the map,
  save, `scripts/check-area.js` checks the API holds a MANUAL 3-decimal centre, pan + "Use map
  centre"; `sign-up-onboarding.yaml`: city on the onboarding map). Non-blocking: the Maestro
  harness waits (up to 6 min) for Expo CLI to install Expo Go instead of failing and stopping Metro
  mid-install (it was installed from scratch in this run); the blank band above stack headers on
  Android is gone (`src/navigation/headerInsets.ts`: in Expo Go the window starts below the status
  bar, so react-native-screens' native header must not add the status-bar height again; moving
  settings and legal into the root stack alone did not fix it); "Approximate area" (the API's
  generic label) never appears in "near …" sentences; friendly `auth/timeout` and
  `auth/internal-error` messages; a native build without React Native auth persistence keeps the
  session in memory instead of falling back to browser storage (unit tested); the Privacy Policy
  copy re-synced with the web's "about 3 km" wording after the merge. Merge of `origin/main`
  (#39 web E2E isolation, #40 Gradle on JDK 21): `scripts/test.mjs`, `e2e.yml`, docs merged with
  both sides kept; the mobile harness now reuses #39's helpers (`web-e2e-guard.mjs` path/storage/URL
  rules, `local-db.mjs`, `auth-emulator.mjs`) and gained their rules: its own realtime channels
  (`REALTIME_CHANNEL_PREFIX=e2e-mobile:rt:user:`, Redis pub/sub ignores the logical database),
  Redis db 1 enforced (not 0, not the web's 2), local database host, provider snapshots under
  `.local-dev/mobile-e2e/`, closed-port provider URLs, `STORAGE_PUBLIC_BASE_URL` empty, only
  `orenjitrade_mobile_e2e` droppable (27 guard tests).
- Checks (2026-10-05, Windows 11, Pixel_6_API_34 emulator, after the fixes and the merge):
  `npm run test:mobile` green (typecheck, lint, 231 jest tests / 33 suites, 27 harness guard
  tests); `npx expo-doctor` 21/21; `npx expo export --platform android` (4.2 MB Hermes bundle) and
  `--platform web` (42 static routes) OK; `npm run test:mobile:e2e` 12/12 passed, 0 skipped, 0 flaky
  (developer database `orenjitrade`, its 14,731 cached card images and the 12 seed emulator accounts
  unchanged before/after; the run's 6 accounts deleted); `npm run test:scripts` 53/53;
  `npm run test:e2e` (web, isolated stack after the merge) 69/69 passed; `npm run test:web` lint +
  632 unit tests; `npm run audit:gate` OK (react-native-webview added with `npx expo install`).
  Native: Expo Go 57.0.9 installed by the harness's Metro on a fresh emulator, then
  `npm run test:mobile:maestro` 5/5 flows passed (11 min 36 s) twice in a row, the second time with a
  freshly started Metro; a walk by hand (seed sign-in, Map tab on OpenStreetMap, Profile, Settings,
  Location with a dragged pin, Privacy, Notifications, Account, Legal, a deep link opening Location
  a second time) showed no red box, crash or coordinate in logcat or the Metro log. No API change.
- Checks of the first builder pass (2026-10-04, Windows 11, Pixel_6_API_34 emulator): `npm run test:mobile` green (192 jest
  tests / 27 suites + 19 guard tests); `npx expo-doctor` 21/21; `npx expo export --platform android`
  and `--platform web` OK; `npm run test:mobile:e2e` 9/9 passed, 0 skipped; `npm run test:mobile:maestro`
  5/5 flows passed; `npm run test:web` green after the lockfile change (lint + 629 unit tests) and
  `ng build` OK; `npm run audit:gate` OK. A by-hand walk of every Phase 1 screen on the emulator
  (sign-in, reset password, legal index and a document, the six tabs, profile and public preview,
  settings: privacy, notifications, appearance, legal, account, export share sheet, deletion request
  with export first, deletion-pending screen, cancel) showed no red box or crash. No API change.
- Gaps / debt: collectors on the Map tab (3 km zones, preview bottom sheet, zoom-14 cap on the
  native engine too) arrive with mobile stage M3; the Leaflet WebView loads Leaflet from unpkg and
  tiles from OpenStreetMap, so the map needs internet (the picker's quick picks and device location
  work without it); the Google Maps path on Android is unit-tested but not run on a device (it needs
  a development build with the project's own key; none exists, no cloud resources); the
  device-location success path is unit-tested but the emulator never produced a low-accuracy fix
  (the timeout path was verified on the device); standalone Android builds would declare
  `ACCESS_FINE_LOCATION` through expo-location (consider `android.blockedPermissions` when a
  development build is introduced); iOS not run (no macOS); device push delivery, fonts and the EAS
  project id unchanged; Maestro runs take about 12 minutes and are local only (not in CI).

## Mobile app (stage M2: Phases 2 and 3 — catalog, inventory, binders, 2026-10-05)

_Owner decision 2026-10-04 (mobile resumes, local and free only). Branch `feature/mobile-m2`
(worktree, created from `feature/mobile-m1`), builder done; merged into `main` as #45. Mirrors `apps/web-angular/src/app/features/{catalog,search,inventory,binders}` on the
same endpoints. No API, web or package change (scripts: the mobile E2E harness fix below)._

- [x] API layer — `src/api/hooks/{catalog,inventory,binders}.ts` on `@orenji/shared-types` +
  openapi-fetch (no hand-written DTOs; aliases in `src/api/types.ts`): `GET /cards` (infinite
  pages), `/cards/suggest`, `/cards/{id}`, `/sets`; inventory items (filters, infinite), one item
  (shown at once from a cached list), summary, `POST` / `PATCH` (changed fields only) / `DELETE`,
  `confirm`, bulk `MOVE_TO_BINDER` and `CONFIRM` ("Confirm all": stale + hidden ids, ≤ 500);
  `GET /me/listings/status` + `resume`; binders list / one / items, create, `PATCH`, publish,
  unpublish, confirm, delete (`deleteItems=false`); `GET /public/binders/{id}` and its items.
  Query keys under `['me', uid, 'inventory' | 'binders' | 'listing-status']`, `catalogKeys`,
  `publicKeys.publicBinder(id, uid)`; every inventory / binder write refreshes inventory + binders
  and never refetches what was just deleted. Public binder reads carry the ID token when signed in
  (`sendsIdToken`, the web's `ATTACH_ID_TOKEN`: `binder.views.per_day`, distance bucket).
- [x] Search tab + card detail — see the Phase 2 mobile row. Recent searches: per account (uid)
  on the device (zustand + AsyncStorage), card search texts only, never a location.
- [x] Inventory tab, add / edit / delete, binders, public binder view — see the Phase 3 mobile
  row. Intents exactly as the API models them: `availability` (trade or sale, trade, sale,
  collection only, not available) + `acceptsOffers`; "want" is a wishlist entry (later stage).
  Freemium limits explained in place (`src/lib/limits.ts`, `LimitReachedNotice`): `binders.max`
  on "New binder" ("You have used 5 of 5 binders on the Free plan…"), `binder.views.per_day` on a
  public binder, any other `LIMIT_REACHED` on the item forms.
- [x] Building blocks — `ChoiceChips` (radio chips), `SelectSheet` (field + bottom sheet of
  options), `Segmented` (tabs inside a tab), `ListFooter` (infinite-list spinner / retry);
  `npm run typecheck` regenerates the expo-router typed routes first (`scripts/typed-routes.mjs`:
  Expo CLI only rewrites `.expo/types/router.d.ts` while a dev server runs).
- [x] Fix found on the way (M1 code): onboarding picked its first step before `/me` answered when
  the other loads were faster (flaky `onboarding.test.tsx` once more suites ran in parallel); the
  screen now waits for `/me` too.
- [x] Harness fix (`scripts/lib/mobile-e2e.mjs`): a run started within a minute of another one
  recreated `orenjitrade_mobile_e2e` but kept Redis db 1, where the API caches games (60 s) with
  their ids, so the new API's catalog seed failed (FK violation on `catalog_sync_run`) and did not
  start. The harness now flushes db 1 whenever it recreates its database, like the web harness
  does for db 2; `assertFlushableRedis` (unit tested) refuses any other database or a non-local
  Redis.
- [x] Found on the device and fixed: the Search filter sheet listed every game's rarities before
  the short filters (now last); the inventory filter bar's first pill stretched and hid Intent and
  Sort (compact pills now size to their text).
- [x] Tests — jest/RNTL: 98 new tests (329 in 44 suites, was 231 in 33): `catalog.test.ts`,
  `inventory.test.ts` (labels, filters, limits), `itemForm.test.ts` (defaults, validation, POST
  body, PATCH of changed fields, temporary publication end, visibility status), `cardSearch.test.ts`
  (schema filters, recent searches), `catalogInventoryHooks.test.tsx` (paging, params, refresh,
  no refetch after delete, public binder token), `choice.test.tsx`, screens `search`,
  `card-detail`, `inventory`, `items`, `binders` (loading, empty, error-with-retry, offline,
  validation, limits, confirmations). Playwright (`apps/mobile/e2e`): `catalog.spec.ts` (2),
  `inventory.spec.ts` (2), `binders.spec.ts` (3); `openInApp` opens dynamic routes inside the
  running app (the static export served by `expo serve` has no rewrites for `/cards/<id>`,
  `/binders/<id>`: a full page load answers 404). Maestro: `search-card-detail.yaml`,
  `inventory-add-edit-delete.yaml`, `binder-create-add-item.yaml` with host scripts
  `scripts/add-card.js` and `scripts/check-inventory.js` (API checks after each step; refuse :8080,
  only `@mobile-e2e.test` accounts), `subflows/scroll-down-to-text.yaml`.
- Checks (2026-10-05, Windows 11, Pixel_6_API_34 emulator): `npm run test:mobile` green (typecheck with
  regenerated typed routes, lint, 329 jest tests / 44 suites, 28 harness guard tests), with the
  emulator running next to it (jest alone also green 3 times in a row after the onboarding fix); `npm run test:scripts` 54/54; `npx expo-doctor`
  21/21; `npx expo export --platform android` (4.4 MB Hermes bundle) and `--platform web` (46
  static routes) OK; `npm run test:mobile:e2e` 19/19 passed (12 earlier + 7 new), 0 skipped, 0
  flaky, twice (before and after the harness fix); `npm run audit:gate` OK (no dependency change). Native (Expo Go 57 on `Pixel_6_API_34`,
  harness-started API :8090 and Metro :8082): `npm run test:mobile:maestro` 8/8 flows passed
  (18 min) twice in a row, the second time started within a minute of an E2E run (the Redis flush
  at work); an earlier full run lost 2 Phase 1 flows to "Packager is not running at
  10.0.2.2:8082" / a stuck sign-in while files of the repository were being edited during the run
  (Metro re-crawls), and passed 8/8 once nothing was edited. A walk by hand (seed sign-in, Search
  with a filter sheet, card detail with the French printing, "Who has this near me" to the Map
  tab, Inventory with the binder and intent selects, the item editor, Binders, an own binder, its
  public page, the add flow, a binder deep link `exp://10.0.2.2:8082/--/binders/<id>`) showed no
  red box or crash: logcat without FATAL or ReactNativeJS errors (only Expo Go's own
  `ReactNoCrashSoftException` of its KeyboardControllerModule at start-up), no coordinates;
  Metro log clean; screenshots in the session scratchpad. No API, web or package
  change, so no Gradle, web or client regeneration run was needed; every process started for
  the checks (API, web server, Metro, emulator, the Gradle daemon) was stopped afterwards.
- Gaps / debt: "Add to wishlist" left out (added in stage M4); "Who has this near me" opens the Map
  tab with `?card=` (the Map tab filters by that card since stage M3); not on mobile
  yet: item owner photos, the multi-select bulk bar (visibility / availability / delete; moving
  cards into a binder is there), binder reordering, set pages (a set opens the Search tab filtered
  by it); the web build of the app mixes the static HTML's light colours with dark components when the
  browser prefers dark (pre-existing since M1: hydration keeps the server-rendered light styles;
  the E2E suite runs light; native follows the system); a Metro kept by `--keep-running` did not serve a later source change on Windows, and
  editing repository files while flows ran made Expo Go lose the packager (restart Metro after
  edits, `npm run test:mobile:maestro -- --stop`, and edit nothing during a run); iOS not run (no macOS).

## Mobile app (stage M3: Phase 4 — map discovery, 2026-10-05)

_Owner decisions 2026-10-04 (mobile resumes, local and free only; collectors only as zones 3 km
wide, radius 1500 m, never points or pins, every collector map capped at zoom 14). Branch
`feature/mobile-m3` (worktree, created from `feature/mobile-m2`), builder done; merged into
`main` as #46. Mirrors `apps/web-angular/src/app/features/{map,collectors}` on
the same endpoints. No API, web or package change; ADR 0004 is not edited here (the web PR owns
it), the mobile map details are an ADR 0010 amendment (2026-10-05, stage M3)._

- [x] Privacy rules and geometry — `src/lib/approximateArea.ts` (`APPROXIMATE_AREA_RADIUS_M =
  1500`, `COLLECTOR_MAP_MAX_ZOOM = 14`, "Locations are approximate (about 3 km)", `clampZoom`,
  3-decimal rounding), `src/lib/mapGeometry.ts` (zoom <-> react-native-maps region, bounds
  fitting capped at 14, the "past the cap" guard, `zoneAt` hit testing with a minimum touch
  target), `src/features/map/collectorLayer.ts` (a 1500 m zone per collector, clusters above 60
  that stop at 14 with 3-decimal centres, cluster expansion never past 14).
- [x] `CollectorMap` on three engines behind `mapEngine` (ADR 0010): `CollectorMapNative`
  (react-native-maps, Apple Maps / Google Maps with a key: `Circle`s, no `Marker` at any
  collector's point, `maxZoomLevel` 14, every camera request clamped, a guard animates back to 14),
  `CollectorMapLeaflet` (the Android WebView page `leaflet/collectorMapPage.ts`: Leaflet 1.9.4 with
  SRI, OSM tiles and credit, `maxZoom` 14 on map and tiles, `zoomend` guard, `L.circle` zones, count
  bubbles, validated messages `ready` / `error` / `tap` / `cluster` / `viewport`; the start view is
  applied again once the WebView has a size), `CollectorMap.web.tsx` (Leaflet directly). Loading
  skeleton and "The map could not load" + "Reload map"; zoom buttons bottom right (the toolbar
  covers the top). The Map tab's viewport is no longer persisted (app store version 3 drops it).
- [x] Map tab (`app/(tabs)/index.tsx`, `src/features/map/`): `GET /collectors/nearby` through
  `useNearbyCollectors` (react-query, previous answer kept while a pan loads); collectors with a
  trading area start on the server's answer (no centre leaves the device), others on a city
  (Montréal, city picker, "Set my area"), 400 falls back to the city; debounced viewport queries
  (centre 2 decimals, visible radius, only when leaving the covered circle); filters game /
  intent (the API's availability filter) / distance bounded by the plan's `map.radius.max_km`
  (`GET /me/plan`, else the FREE plan of `GET /plans`), 429 `LIMIT_REACHED` continues at the cap
  with a notice; "Who has this near me" (`?card=` from the card detail → `hasCardId`, banner with
  the card name, "Show every collector"); List view (rows with place, bucketed distance, rating,
  listings, the card's listings and lowest price); states: skeleton, "N collectors within 10 km",
  empty ("No collectors within 10 km yet", "Clear filters"), "You are hidden from the map" (not
  discoverable, "Location settings" / "Not now"), error with retry, offline (the last answer stays
  with "Collectors could not refresh"). No device location is read on the map (like the web map:
  the own area is the server's).
- [x] Preview bottom sheet (`CollectorPreviewSheet`, `GET /collectors/{handle}/preview`, a city
  centre only when the map shows a city): name, avatar, online dot, place, "Locations are
  approximate (about 3 km)", distance bucket ("Your public position" for oneself), rating, last
  active, listings with freshness, games, tags, the card's listings with API pictures; View profile,
  View public binder (first of `GET /collectors/{handle}/binders`), Message (only when
  `canMessage`; otherwise disabled with the web's reason: a block, or the collector's messaging
  permission), Show on map (the zone at zoom 13, never past 14); loading, "Collector unavailable"
  (404) and error with retry.
- [x] Message → `POST /conversations` (200 existing / 201 new; 403 `MESSAGING_BLOCKED` explained in
  a snackbar) → a minimal thread `app/messages/[id].tsx` (newest messages at the bottom, older
  pages on scroll, text composer with 403 / 422 / 429 explained, read marker, links to cards and
  binders, the other collector's profile); the mobile Messages stage adds the inbox, realtime,
  photos and links. Gate: `messages` is an app root.
- [x] Collector profile (`app/collectors/[id].tsx`, `src/features/collectors/`): header (place
  label, distance bucket, member since, last active, online), own profile ("Public preview",
  Edit profile, Privacy) or View public binder + Message (same rule as the preview), about / games /
  tags, the approximate area (`ApproximateAreaMap`: the same 1500 m zone at zoom 13, no gestures, no
  taps, "Approximate area (about 3 km) around …"), ratings and references (summary with breakdown,
  "Show more ratings" / "Show more references", read only until the mobile Phase 7 stage), public
  binders and cards. Visibility exactly like the web: signed out or 401 → "Collector profiles are
  for members" (sign in / create account); 404 (unknown, PRIVATE, suspended, deleted) → "This
  collector is not available"; other errors → retry. Deep links unchanged
  (`orenjitrade://collectors/<handle>`, `https://www.orenjitrade.com/collectors/<handle>`; signed
  out they lead to sign-in through the gate).
- [x] Card detail "Who has this near me" (M2) now opens the Map tab filtered by that card.
- [x] Found on the device and fixed: Expo Go's floating tools button covered the List toggle and
  the card banner's close button (top right): the switch now leads the filter row and the banner
  sits under it; the profile's WebView map drew its zone in a corner (start view set at 0 x 0);
  the conversation composer jumped to the top of the screen with the keyboard (Expo Go resizes
  the window, so padding by the keyboard height counted it twice: it now pads by the measured
  overlap); Leaflet's zoom buttons were under the toolbar (found by Playwright).
- [x] Tests — jest/RNTL: 87 new tests (416 in 51 suites, was 329 in 44): `mapGeometry`,
  `collectorLayer`, `mapDiscovery`, `collectorMap.test.tsx` (both native engines: 1500 m circles,
  no pin markers, maxZoomLevel 14, clamping of centre / bounds / cluster requests, the guard, taps,
  clusters, loading, error + retry, page config and injected layer), `screens/map.test.tsx`
  (own area without centre, city fallback, 400 fallback, hidden notice, empty, error + retry,
  offline refresh, filters, plan cap / 429, who has this near me, list, preview states, Message,
  refusals, messaging permission and blocks, own preview, Show on map), `screens/collector.test.tsx`
  (loading, ready with the area map, binders empty / error + retry, ratings and references, more
  pages, Message, permission and blocks, own profile, not on the map, PRIVATE / 404, MEMBERS signed
  out, 401, error + retry, offline), `screens/conversation.test.tsx`, `privacy/mapPrivacy.test.tsx`
  (every map / collector fixture, every prop handed to react-native-maps, the Leaflet page config and
  injected scripts, the profile map: no coordinate with more than 3 decimals, no private location
  field; nearby query centres with 2 decimals at most), store v3 migration, gate. Playwright:
  `map.spec.ts` (3) and `collector-map-page.spec.ts` (6). Maestro: `map-preview-profile.yaml`,
  `card-who-near-me.yaml` (+ `scripts/public-card.js`).
- Checks (2026-10-05, Windows 11, Pixel_6_API_34 emulator): `npm run test:mobile` green (typecheck
  with regenerated typed routes, lint, 416 jest tests / 51 suites, 28 harness guard tests);
  `npx expo-doctor` 21/21; `npx expo export --platform android` (4.5 MB Hermes bundle) and
  `--platform web` (47 static routes, `messages/[id]` new) OK; `npm run test:mobile:e2e` 28/28
  passed (19 earlier + 9 new), 0 skipped, 0 flaky in the final full run (an earlier full run found
  the zoom buttons under the toolbar and two spec mistakes, all fixed); `npm run audit:gate` OK
  (no dependency change; the two allow-listed advisories only). Native (Expo Go 57 on
  `Pixel_6_API_34`, installed by the harness's Metro on the cold-booted emulator, harness-started
  API :8090 and Metro :8082): `npm run test:mobile:maestro` 10/10 flows passed (20 min 35 s) on the
  final code, after a 10/10 run before the conversation keyboard fix. On the way: the new flows
  first failed because Expo Go's tools button covered the List toggle and the card banner's close
  button (fixed, see above); one full run lost the M2 inventory flow to Expo Go staying on
  "Loading from 10.0.2.2:8082… New update available, downloading..." for four minutes although
  Metro had served the bundle (`subflows/launch-fresh.yaml` now opens the project once more when
  no screen appears); another lost its last two flows when the session's 2-hour limit stopped the
  emulator mid-run (restarted, then the 10/10 run above). The map renders OpenStreetMap tiles and
  the orange 3 km zones without any Google key (screenshots `map-zones`, `map-zone-focus`,
  `map-who-has-card` in the session scratchpad). A walk by hand (seed sign-in as collector2 and
  collector1, the Map tab, a tap on a zone opening Ethan's preview, Message starting a new
  conversation and sending, the List view, Devon's preview and the seed thread with the keyboard
  open, his profile with the centred approximate area, ratings and binders, deep links
  `exp://10.0.2.2:8082/--/collectors/collector5`, `/collectors/nobody_here` ("not available") and
  `/collectors/collector7` ("Not on the map")) showed no red box or crash: logcat without FATAL or
  ReactNativeJS errors and without any coordinate, Metro log clean. No API, web or package change,
  so no Gradle, web or client regeneration run was needed; every process started for the checks
  (API, web server, Metro, emulator) was stopped afterwards.
- Gaps / debt: the native react-native-maps engine (Apple Maps, Google Maps with a key) is covered
  by jest only: iOS cannot run here (no macOS) and no Android development build with a project
  key exists (no cloud resources), so `maxZoomLevel` / the guard on a real Google or Apple map are
  unproven on a device; iOS also deprecates `maxZoomLevel` in favour of `cameraZoomRange`, which
  is not set (the JS guard pulls the camera back). The Map tab leaves out the web map's tag and
  freshness filters, the map search box and its Messages side panel; "Report" (Phase 7) and rating
  a collector are not on mobile yet; the conversation screen was minimal until stage M4 (no inbox, realtime,
  photos, card or binder links to send, mute / archive / block); the map reads no device location
  (the own trading area is the server's, like the web). The Leaflet WebView needs internet (unpkg
  and OpenStreetMap). At zoom 13 the profile's 3 km zone (about 225 dp) is slightly taller than its
  200 dp map (stage M4: the map fits the whole zone). Signed-out deep links to a profile lead to sign-in (the app has no signed-out
  screens) and the link was not resumed after signing in (resumed since stage M4).

## Mobile app (stage M4: Phases 5 and 6 — messages, community, wishlist, notifications, 2026-10-05)

_Owner decisions 2026-10-04 (mobile resumes, local and free only). Branch `feature/mobile-m4`
(worktree, created from `feature/mobile-m3`, `origin/main` with #41 and #45 merged in), builder
done; merged into `main` as #47. Mirrors `apps/web-angular/src/app/features/
{messages,community,wishlist,notifications}` and `core/{realtime,notifications}` on the same
endpoints. No API, web, package or dependency change (no `npx expo install` was needed:
`expo-image-picker`, `expo-image` and NetInfo were already in the app). Device push stays deferred
(it needs an EAS project and a real FCM sender): notifications arrive in the app, live over the
realtime channel._

- [x] Realtime channel (`src/realtime/`, port of the web's `core/realtime`): `stompFrames.ts`
  (STOMP 1.2 codec, UTF-8 `content-length`, heartbeat negotiation), `stompConnection.ts`
  (`v12.stomp` sub-protocol, CONNECT → CONNECTED within 10 s, heartbeats (10 s offered, the
  server's 20 s wins), ERROR frames, close codes for connect / heartbeat timeouts), `realtimeClient.ts`
  (`RealtimeClient`: follows the signed-in collector with a ready account, subscribes only to the
  caller's `/user/queue/messages|receipts|typing|presence|notifications`, sends only `/app/typing`,
  backoff 1 s → 30 s with ±20 % jitter, a fresh ID token after a refused handshake, `resync` after
  every (re)connection), `RealtimeProvider.tsx` (pauses in the background and reconnects in the
  foreground through `AppState`, skips the backoff when NetInfo reports the network back),
  `RealtimeCacheSync.tsx` (pushes applied to the react-query caches: threads, inbox order /
  previews / unread counts, receipts, presence, notification count and feeds once per id, wishlist
  match counts; REST re-reads after `resync`). The token goes in the handshake's `Authorization`
  header on native and in `?access_token=` on the web build (a browser cannot set headers); it is
  never logged or put in a frame. Found on the emulator and fixed: React Native's WebSocket drops
  the NUL that ends every STOMP frame, in both directions, so the CONNECT never completed; native
  builds now send frames as UTF-8 binary messages (NUL included) and restore the NUL of received
  text frames (`nulSafeFrames`).
- [x] Messages tab (`app/(tabs)/messages.tsx`: Inbox | Community, `?view=community`, live
  status "Live" / "Connecting…" / "Reconnecting…" / "Paused") — inbox (`InboxView`: cursor pages of
  30, previews per message kind, unread badges, muted / online marks, pull to refresh,
  skeleton / empty / error-with-retry states; offline, the cached inbox stays under the app's
  offline banner) and the tab's unread badge (unread messages of conversations that are not
  muted). Thread
  (`app/messages/[id].tsx` at web parity): newest page first, older pages on scroll, day dividers,
  text, shared cards / public binders / offers rendered as tappable cards (offers explain that
  they open in a later version), photos (`expo-image-picker` from the library, JPEG / PNG / WebP ≤
  8 MB checked before `POST /uploads/images?kind=MESSAGE`, then an IMAGE message; shown with
  `expo-image`), card links through the catalog autocomplete and own public binders through an
  inline picker, read marker only while the thread is on screen, "Sent" → "Seen", typing notices
  (throttled), mute / unmute, archive, block / unblock with a confirmation (blocked banner,
  composer disabled, the conversation leaves the inbox), 403 `MESSAGING_BLOCKED`, 422
  `MESSAGE_BLOCKED`, 429 (with `retryAfterSeconds`), oversized or unsupported photos and a denied
  photo permission explained under the composer. "Report collector" waits for the mobile Phase 7
  stage.
- [x] Community (`src/features/community/`, `app/community/[slug].tsx`): a game filter, then the
  channels grouped by region, game and topic with their posts of the last 24 h (`publicChat` off
  → "The community is closed right now", private messages still work); a channel's feed (cursor
  pages), the composer (card and own public binder links), edit / delete own posts (confirmation), replies
  (open per post, reply, delete own), block the author from a post's menu; 429 per-channel limit,
  409 `DUPLICATE_POST`, 422 `POST_BLOCKED` explained in place.
- [x] Wishlist tab (`app/(tabs)/wishlist.tsx`, `app/wishlist/{new,edit,[id]}.tsx`,
  `src/features/wishlist/`): summary (wishes, with matches, matches) and plan usage of
  `wishlist.items.max`, a notice when matches need a trading area or discoverability, filters
  All / Matches / Paused, wish cards (API picture, printing or "Any printing", criteria chips, private
  note, alerts switch, edit, remove with confirmation). The editor mirrors the web dialog with the
  API's criteria: card (catalog autocomplete) → printing, condition at least, max price + currency,
  trade preference, radius bounded by the plan's `map.radius.max_km`, note, alerts; 409 duplicate,
  429 limits explained. Matches (`wishlist/[id]`): cursor pages, the listing's card picture, price,
  condition, the collector's place and distance **bucket** only, Message (opens or starts the
  conversation), View profile, Show on map (the Map tab filtered by the card), dismiss. "Add to
  wishlist" on the card detail opens the editor with the card (and the printing of the link, else
  any printing) chosen.
- [x] Notifications (`app/notifications.tsx`, `src/features/notifications/`): a bell with a live
  unread badge ("99+") in every tab header, the centre (cursor pages, day sections, All / Unread,
  mark one / all read, preferences link, pull to refresh, live prepends counted once), and every
  notification kind opening its screen: `data.deepLink` when it is a safe same-app path, else a
  path rebuilt from its ids (the web's rules), mapped to the app (wishlist matches, conversations,
  community channels, binders, cards, collectors, settings, legal); offers, trades, disputes,
  Premium and credits explain in a snackbar that they open in a later version. Notification
  preferences were already complete in stage M1.
- [x] Leftovers of M1–M3: an ended session (a 401 on a token-carrying request while signed in)
  signs out and shows the sign-in screen with "Your session has ended" instead of looping back to
  the Map (the profile's "Sign in" included); a link opened while signed out (scheme, universal
  link or in-app) is kept and reopened after signing in (`src/account/pendingLink.ts`); the
  profile's approximate-area map fits the whole 3 km zone (`zoneFitZoom`, map 260 dp high); the
  Phase 0 default region and every coordinate literal in the app have at most 3 decimals
  (`privacy/coordinateLiterals.test.ts` scans the sources); the stale M2 / M3 lines of this file
  are corrected.
- [x] Found on the device and fixed: the STOMP NUL handling above; empty states collapsed inside
  auto-height scroll containers (the empty wishlist's "Browse cards" sat on its text): the
  wishlist, matches, community and notification lists now grow to the screen; Expo Go's floating
  tools button covered the conversation options button and the "Live" pill (top right under the
  header): the options button moved into the navigation header and the Inbox | Community toggle
  stays narrow so the pill follows it.
- [x] Tests — jest/RNTL: 119 new tests (535 in 64 suites, was 416
  in 51): `realtime/stompFrames`, `stompConnection` (handshake headers, heartbeats, timeouts, ERROR,
  NUL-safe framing), `realtimeClient` (follow, backoff with jitter, refreshed token after a refused
  handshake, pause / resume, resync, no token in frames), `realtimeProvider` (AppState, NetInfo),
  `features/{messaging,community,wishlist,notifications}`, `screens/{messages-tab,conversation,
  community-channel,wishlist,notifications}`, `app/auth-gate` (session ended, pending link), the
  client's 401 handling, `privacy/coordinateLiterals`. Negative `waitFor` assertions use
  `not.toBeOnTheScreen()` (a failed `toBeNull()` pretty-prints the whole tree on every poll: the
  jest run went from about 40 s to 16 s). Playwright: `messages.spec.ts` (2: inbox → thread with a
  second collector over the API, live delivery, reply, "Seen", a photo; a card link, mute, a block
  both ways), `community.spec.ts` (1), `wishlist.spec.ts` (1: wish → a listing nearby → live bell
  and match count → notification → matches → Message), `session.spec.ts` (2: a signed-out profile
  link reopens after sign-in; an ended session → sign-in with the notice → back). Maestro:
  `messages-inbox-thread.yaml`, `community-post.yaml`, `wishlist-match-notification.yaml` (+
  `scripts/messaging.js`, `community.js`, `wishlist.js`).
- Checks (2026-10-05, Windows 11, Pixel_6_API_34 emulator): `npm run test:mobile` green
  (typecheck with regenerated typed routes, lint, 535 jest tests / 64 suites, the harness guard
  tests); `npx expo-doctor` 21/21; `npx expo export --platform android` (4.7 MB Hermes bundle) and
  `--platform web` (52 static routes, was 47: `/notifications`, `/community/[slug]`,
  `/wishlist/new`, `/wishlist/edit`, `/wishlist/[id]`) OK; `npm run test:mobile:e2e` from scratch
  (jar build, fresh database, web export) 34/34 passed (28 earlier + 6 new), 0 skipped, 0 flaky.
  Native (Expo Go 57 on `Pixel_6_API_34`, harness-started API :8090 and Metro :8082):
  `npm run test:mobile:maestro` 13/13 flows passed (25 min 58 s) on the final code, after an
  earlier 13/13 run (26 min 27 s) before the header fix (above). On the way: the new flows first
  failed on real defects (the realtime channel never connected natively: the NUL handling above;
  the empty wishlist's overlapping button) and on flow mistakes (a pattern that matched the
  notification row's "Mark as read" button, a distance id on nested text, which Android does not
  expose, and the community channel's posts of earlier runs: the flow now writes texts with the
  run's handle and `community.js` only takes the caller's own post); one full run lost its last
  six flows when the session's 2-hour limit stopped the emulator (`device 'emulator-5554' not
  found`; the restarted emulator came back without Expo Go, so the harness's Metro reinstalled
  it), then the 13/13 run above. A walk by hand (adb screenshots in the session scratchpad,
  `walk-*.png`): seed sign-in as collector2, the Messages tab with "Live", the seed thread with the
  options sheet, a card shared through the attach sheet and sent ("Sent"), the community channels,
  a channel with its replies and post options, the Wishlist tab, a wish's matches (place and
  "5–10 km away" only), the wish editor, the notification centre and its deep links to the
  matches and to the conversation, the own profile's approximate area showing the whole zone.
  This walk found Expo Go's tools button over the conversation options button and the "Live"
  pill (fixed, above). Logcat without FATAL, ReactNativeJS errors, tokens or coordinates (only
  Expo Go's own `ReactNoCrashSoftException` at start-up); Metro log clean. No API, web, package or
  dependency change, so no Gradle (beyond the harness's jar), web, client regeneration or
  `audit:gate` run was needed; every process started for the checks (API, web server, Metro,
  emulator) was stopped afterwards.
- Gaps / debt: device push (Expo / FCM tokens need an EAS project and a real FCM sender; in-app +
  realtime only); "Report collector" / "Report post" and rating a collector (mobile Phase 7
  stage); the offers and trades screens (Phase 8 stage: offer links and offer notifications explain
  where to answer); moderators cannot remove posts from the app (web admin); no camera capture for
  message photos (library only, Phase 11 stays on hold); iOS not run (no macOS); the Expo Go
  tools button still covers the right end of some page headers' text (no control sits there).

## Mobile app (stage M5: Phases 7 and 8 — reports, ratings, offers, trades, 2026-10-05)

_Owner decisions 2026-10-04 (mobile resumes, local and free only). Branch `feature/mobile-m5`
(worktree, created from `feature/mobile-m4`), builder done; merged into `main` as #48. Mirrors the web's `shared/reports`, `shared/ratings`, `features/settings/reports`,
`features/settings/offers`, `shared/offers` and `features/{offers,trades}` on the same endpoints.
No API, web, package or dependency change (the generated `@orenji/shared-types` already had every
Phase 7 and 8 operation). Admin and moderator consoles stay web-only; the payment-protection steps
of Phase 9 (pay, ship, confirm receipt, disputes) are explained on the trade screen and done on
orenjitrade.com until the Phase 9 stage._

- [x] Collector reports (`app/report.tsx`, `src/features/reports/reportLabels.ts`,
  `src/api/hooks/reports.ts`): "Report collector" with the reasons of `GET /public/report-reasons`
  in the server's order (label + description, a radio group), optional details (≤ 1000, counted),
  the confidentiality note, Cancel / Confirm (disabled until a reason is chosen), sent with an
  `Idempotency-Key` fixed for the screen and the context of the entry point: the collector profile
  and the map preview (PROFILE), the conversation options (CONVERSATION + id), a community post's
  options (POST + id) and a public binder's owner card (BINDER + id). 409 `REPORT_ALREADY_OPEN`
  (reasons disabled, link to My reports), 422 `CANNOT_REPORT_SELF`, 404, 429 (five a day), 400
  are explained with the web's wording; success turns into "Report sent" with a link to My reports.
  Settings → My reports (`app/settings/reports.tsx`, `GET /me/reports`): reported collector,
  reason, sent / reviewed times, the reporter's status text ("Waiting for a moderator", "Reviewed
  — the team took action", …) and the status chip, the open / reviewed summary; empty, loading and
  error-with-retry states. REPORT_DECISION notifications open it.
- [x] Ratings and references (`app/ratings/rate.tsx`, `app/ratings/reference.tsx`,
  `src/features/ratings/`, `src/features/collectors/ratingLabels.ts`, `src/api/hooks/ratings.ts`):
  rate a collector after an eligible interaction (`GET /ratings/eligibility`): the interaction to
  rate when there are several, overall (required) and the criteria the API models (communication,
  card condition, shipping, meetup reliability; a 1–5 star radio group, clearable), a comment
  (≤ 600), the 14-day note; edit the own rating within its window (`PUT /ratings/{id}`); write one
  reference (≤ 400) per collector; 403 `RATING_NOT_ELIGIBLE`, 409 `ALREADY_RATED` /
  `RATING_EDIT_WINDOW_CLOSED` / a second reference, banned terms (400) explained. The profile's
  "Ratings & references" now offers "Rate this collector", "Write a reference", "Edit" on the own
  rating, shows each rating's interaction kind and criteria, and explains why rating is not
  possible yet; "Rate …" is in the conversation options and on a completed trade. RATING_RECEIVED
  notifications open the own profile scrolled to the ratings (`?tab=ratings`).
- [x] Offers (`app/offers/{index,[id],new,counter}.tsx`, `app/settings/offers.tsx`,
  `src/features/offers/`, `src/api/hooks/offers.ts`): "Make an offer" on public cards that accept
  one (not one's own) from public binders, a profile's public cards, the map preview's listings
  ("Who has this near me") and wishlist matches; the form offers only the kinds the card's
  availability allows (cash / trade / cash + cards), the amount and currency, the buyer's own
  cards with copy steppers (private cards included, up to 10), a note (≤ 500), the expiry, a
  summary, and is sent once with an `Idempotency-Key`; 422 `OFFERS_NOT_ACCEPTED`, 409
  `OFFER_ALREADY_OPEN` (with "View your open offer"), 404, 400 fields and 429 `LIMIT_REACHED`
  (`offers.per_day`: used / allowed and the reset) are explained in place. My offers: Received /
  Sent, All / Active / Accepted / Closed (expired, declined and withdrawn included), "N offers wait
  for your answer", cursor pages, links to the trades and the offer settings. One offer: status,
  kind, round, expiry, whose turn it is with only the API's `allowedActions` (accept after a
  confirmation, counter, decline and withdraw with an optional reason), the deal, both collectors
  (region label and distance bucket only), the whole negotiation's history; a replaced proposal
  links to the live one and the screen follows a counter-offer that arrives while it is open;
  409 `STALE_OFFER` moves to the latest proposal, `NOT_YOUR_TURN` / `INVALID_STATE_TRANSITION` /
  `ITEM_UNAVAILABLE` re-read it. Counter-offer: the current proposal, a seller can keep or drop
  the buyer's cards only, the same deal is refused before sending. Settings → Offers (mixed offers
  switch). Offer links in chat open the offer; the composer shares a negotiation with the other
  collector ("Share an offer", OFFER_LINK). Offer notifications open the offer (or its trade).
- [x] Trades (`app/trades/{index,[id]}.tsx`, `src/features/trades/`, `src/api/hooks/trades.ts`):
  the list (both sides, All / In progress / Completed / Cancelled, whose move it is) and one trade
  for the buyer and the seller: status and kind, the next move (`nextAction`), only the API's
  `allowedOperations` (mark the in-person meetup, confirm the exchange after a confirmation,
  cancel with a required reason), the progress with both parties' marks, the cards received with
  "Add" (to the inventory), the deal with a link to the offer's negotiation, the other collector
  (place label and bucket only), the timeline, "Message …" and, once completed, "Rate …" (TRADE
  interactions). Protected trades show their steps and say that paying, shipping, receipts and
  disputes are done on the website for now. Trade, payment, shipment and dispute notifications
  open the trade (disputes still explain the website).
- [x] Shared: the auth gate admits `report`, `ratings`, `offers` and `trades`; realtime pushes
  refresh offers (OFFER_*), trades (TRADE_UPDATE, OFFER_ACCEPTED, PAYMENT_UPDATE, SHIPMENT_STATUS,
  DISPUTE_UPDATE), the own ratings (RATING_RECEIVED) and My reports (REPORT_DECISION), and every
  reconnection re-reads them; the Profile tab gains Offers and Trades, Settings gains Offers and My
  reports; `ItemRow` gained a full-width footer (Make an offer), `Button` an accessible label,
  `RadioGroup` per-option test ids, `Screen` its scroll view ref.
- [x] Found on the way and fixed: the signed-in auth gate only allowed the route roots of earlier
  stages, so `/report`, `/ratings/*`, `/offers/*` and `/trades/*` bounced back to the Map tab
  (found by the first Playwright run); on the emulator, "You confirmed the exchange. Waiting for …"
  stayed above "Trade completed" after the other collector's live confirmation (success notices
  now belong to the trade status they were given for; refusals stay), and the rate screen did not
  show "Which interaction are you rating?" above its choices; `openInApp` of the Playwright
  support waited for the first screen of the DOM (a hidden tab screen) and matched query strings
  as a regex (now: a visible screen, the path taken literally); Maestro's `http.post` needs a body
  (`scripts/offers.js` posts `{}` to `POST /trades/{id}/complete`).
- [x] Tests — jest/RNTL: 69 new tests (604 in 71 suites, was 535 in 64):
  `features/offers` (labels, the form rules and bodies, counter-offer start and "same deal",
  problems, targets and the target store, the inbox query), `features/trades` (labels, next
  action, steps incl. payment protection, the list filter), `features/reportsRatings` (report
  labels, problems and route params; rating rules, hints, problems and route params),
  `screens/reports` (report: reasons, Confirm disabled without a reason, body and
  `Idempotency-Key`, 409 / 429 / details limit / reasons error with retry, invalid link; My
  reports: statuses, empty, error with retry), `screens/ratings` (rate: overall required, criteria
  and clear, several interactions, `TRADE` only, not eligible, edit with `PUT`; reference: required,
  ≤ 400, banned term; the profile's Rate / Write a reference / hint / Edit), `screens/offers`
  (inbox: rows, your turn, tabs and filters, empty and error states; make an offer: missing card,
  validation, cash and trade bodies, `Idempotency-Key`, 409 with the open offer, 429, 422; one
  offer: withdraw, accept with the trade link, decline, counter, `STALE_OFFER`, superseded, 404;
  counter-offer: same deal refused, `NOT_YOUR_TURN`, not allowed; offer settings), `screens/trades`
  (list, filters, empty and error; trade: meetup, confirm with a dialog, cancel needs a reason,
  refusal, completed → rate / add / offer link, protected trade, 404), and the entry points in
  `screens/{collector,conversation,map,binders,community-channel,wishlist,profile,settings,
  notifications}`, `features/notifications` (deep links) and `account/gate`. Playwright:
  `reports.spec.ts` (2) and `offers.spec.ts` (2), 38 specs in all (was 34). Maestro:
  `offer-trade-rating.yaml`, `report-collector.yaml` (+ `scripts/offers.js`), 15 flows in all.
- Checks (2026-10-05, Windows 11, Pixel_6_API_34 emulator): `npm run test:mobile` green
  (typecheck with regenerated typed routes, lint, 604 jest tests / 71 suites, the 28 harness guard
  tests; Prettier clean); `npx expo-doctor` 21/21; `npx expo export --platform android` (4.9 MB
  Hermes bundle) and `--platform web` (63 static routes, was 52: `/report`, `/ratings/rate`,
  `/ratings/reference`, `/offers`, `/offers/[id]`, `/offers/new`, `/offers/counter`, `/trades`,
  `/trades/[id]`, `/settings/reports`, `/settings/offers`) OK; `npm run test:mobile:e2e` from
  scratch (jar build, recreated database, web export) 38/38 passed (34 earlier + 4 new), 0
  skipped, 0 flaky. Native (Expo Go 57 on `Pixel_6_API_34`, harness-started API :8090 and Metro
  :8082): `npm run test:mobile:maestro` 15/15 flows passed in 30 min 22 s on the final code,
  after an earlier 15/15 run (33 min 44 s) before the two last fixes above. On the way the new
  flows failed on flow mistakes (`tab-map` instead of `tab-index`; a pill's text matched through
  its id, which Android does not expose for a View's nested text; the body-less `POST` above),
  never on an app crash. A walk by hand (adb screenshots in the session scratchpad, `walk-*.png`,
  plus the flows' `offer-*`, `trade-*`, `rate-form`, `report-*`, `my-reports` screenshots): seed
  sign-in as collector1, Profile → Offers (Received with collector5's open offer, "1 offer waits
  for your answer"), the offer (your turn, the deal, both collectors with a place and a bucket
  only, the history), the decline dialog above the keyboard, the trades list and a protected,
  shipped trade (its five steps, the payout wording), collector5's profile ("Rate this
  collector", "Write a reference", "Make an offer" on her public cards, Report), the rate screen,
  the report screen with the seven reasons of the API, My reports (empty), Offer settings, the
  conversation options (Rate, Block, Report collector) and "Share an offer" in the composer with
  the accepted negotiation; this walk found the missing interaction question (fixed). Logcat
  without FATAL, ReactNativeJS errors, tokens or coordinates (only Expo Go's "Cannot connect to
  Expo CLI" warning after the harness stopped Metro); Metro log clean. No API, web, package or
  dependency change, so no Gradle (beyond the harness's jar), web, client regeneration or
  `audit:gate` run was needed; every process started for the checks (API, web server, Metro,
  emulator, the harness's Gradle daemon) was stopped afterwards.
- Gaps / debt: the payment-protection steps of Phase 9 (pay, ship, confirm receipt, disputes,
  payouts) are explained on the trade and stay on the website until the Phase 9 stage; admin and
  moderator consoles stay web-only; "Make an offer" is on the map preview's listings but not on
  the map list rows (the web has it on its holders list); `offers/new` takes the card in memory
  from its entry point (no endpoint reads one public item), so a reloaded web page or a cold start
  of that screen asks to choose the card again; offer and trade notifications deep-link correctly
  but the seed has none for collector1 to try by hand (covered by jest and live in the Playwright
  and Maestro offer flows); the generated `ProblemDetail` still does not declare `offerId` /
  `latestOfferId` / `currentStatus` (read defensively, as on the web); device push stays
  deferred; iOS not run (no macOS); Expo Go's tools button covers the right end of some top rows
  (no control sits there).

## Mobile app (stage M6: Phases 9 and 10 — payment protection, disputes, Premium, credits, donations, ads, 2026-10-05)

_Owner decisions 2026-10-04 (mobile resumes, local and free only). Branch `feature/mobile-m6`
(worktree, created from `feature/mobile-m5`), builder done; merged into `main` as #51. Mirrors the web's `features/{trades,checkout,disputes,premium,credits,support}`,
`features/settings/payouts`, `shared/{payments,billing,ads}`, `core/limits` and the offer dialog's
protection option on the same endpoints and the same local fake providers (`FakePaymentProvider`,
`FakeBillingProvider`, `FakeDonationProvider`: no card, no money). No API, web, package or
dependency change (the generated `@orenji/shared-types` already had every Phase 9 and 10
operation). The wording is always "payment protection", never "escrow". Store builds: no in-app
purchase and no real provider are added; the app-store purchase rules are recorded as an open
owner question in ADR 0011 (options: in-app purchase, link out to the web, web-only purchases)._

- [x] Payment protection (`app/trades/[id].tsx`, `app/checkout/fake/[ref].tsx`,
  `src/features/payments/`, `src/features/trades/{TradeProtectionCards,ProtectedDialogs}.tsx`,
  `src/features/checkout/`, `src/api/hooks/payments.ts`): "Use payment protection" on a new cash
  or cash + cards offer while `protectedPayments` is on (the "How it works" explainer, the summary
  says "with payment protection", a counter-offer keeps it); on the trade only the API's
  `allowedOperations`: Pay (`POST /trades/{id}/pay` → the app's fake checkout screen, an https
  provider page in the browser, anything else refused), Mark as shipped (carrier ≤ 80, tracking
  ≤ 100, note ≤ 500, the "without tracking" tip), Confirm receipt (the payout amount in the
  confirmation; releases the payout and completes the trade), Open a dispute (reason + description
  ≥ 10 characters, the window's end; then the dispute screen), View the dispute; the payment card
  (what the buyer pays, the platform fee, refunds, the payout released or what the seller
  receives, the dispute window or the hold, the provider, the explainer), the shipment card, the
  dispute card, a seller's "Set up payouts to get paid" while the buyer cannot pay yet; refusals
  worded like the web (`SELLER_NOT_ONBOARDED`, `DISPUTE_WINDOW_CLOSED` with the date,
  `FEATURE_DISABLED`, Phase 8 conflicts re-read the trade). The checkout (`useProviderCheckout`:
  read, Pay / "Simulate a failed payment", poll until the synthetic webhook lands, about 45 s at
  most; a 409 reads how it ended) has the "Local test payment" banner and goes back to the trade
  with `?payment=secured|failed` (`router.dismissTo`), which shows the outcome once at the top. All
  protected steps are hidden (with an explanation) while the flag is known to be off.
- [x] Disputes (`app/disputes/[id].tsx`, `src/features/disputes/`): the parties only (not-found for
  anybody else): reason, dispute and payment statuses, the buyer's description, the decision
  (outcome, refund, note) or the hold, the facts (both parties by name and handle only, paid,
  refunded, payout, carrier, tracking); evidence as the API's model allows from the app: a
  statement (TEXT ≤ 2000) or a photo from the library (JPEG / PNG / WebP ≤ 8 MB checked before the
  multipart upload, an optional caption; no camera, card scanning stays on hold), "You can add N
  more"; photos of either party fetched with the ID token from `/disputes/{id}/evidence/{eid}/file`
  and shown from memory as `data:` URIs (never a public URL or a disk cache), PDFs listed by name
  and size, https tracking links only; the thread with the other collector and OrenjiTrade; the
  timeline; closed while on hold or decided (explained); `EVIDENCE_LIMIT_REACHED`, 413, 415 and a
  frozen dispute explained. DISPUTE_UPDATE notifications deep-link to the dispute and refresh it
  live (realtime), every reconnection re-reads it.
- [x] Payouts (`app/settings/payouts.tsx`, Settings link only while `protectedPayments` is on):
  status, what it means, provider, payouts enabled, last update, the "Local test provider" note;
  "Set up payouts" / "Continue the setup" / "Update your details" through `POST
  /me/seller-account/onboarding` (the fake provider answers this screen with
  `onboarding=complete`; https pages open in the browser), "Back to your trade" when a trade sent
  the seller here (`?returnTo=/trades/<id>` validated); `FEATURE_DISABLED` explained.
- [x] Premium (`app/premium.tsx`, `app/checkout/fake-billing/[ref].tsx`, `src/features/billing/`,
  `src/api/hooks/billing.ts`): the plans from `GET /plans` (price, limits, features, "Your plan",
  "Most popular"), "Upgrade to Premium" → `POST /me/subscription/checkout` → the app's fake billing
  checkout (a declined attempt stays open with "Try again"; success re-reads the account, the plan,
  the ads and discovery and welcomes the member at the top), "Continue to checkout", the
  subscription card (status, price, member since, renews / ends on, PAST_DUE note, "Cancel at
  period end" / "Cancel now" / "Close the checkout", each confirmed with the web's wording), the
  usage of every limit (bars, resets, "Boosted"), active boosts, the credits teaser;
  `ALREADY_SUBSCRIBED` explained; "Premium is not available yet" while `premiumPlans` is off and no
  subscription is live. Limit-reached prompts lead here: "See Premium" (while premium plans are
  sold) on `LimitReachedNotice` (binders, cards), the public binder views limit, the offers per day,
  a full wishlist and the map radius cap; SYSTEM `LIMIT_REACHED` notifications open Premium.
- [x] Credits (`app/credits.tsx`, `src/features/billing/CreditParts.tsx`): the balance with the
  "never withdrawable or transferable" wording, the products to unlock for a day (cost, duration,
  "You need N more"), the spend dialog with one idempotency key per dialog (409
  `INSUFFICIENT_CREDITS` with the balance and the cost), active boosts, the referral code (selectable,
  "Share" through the system share sheet, redemptions) and the redemption of another member's code
  (pattern checked; 404 and each `REFERRAL_NOT_ALLOWED` reason on the field), the append-only
  ledger in cursor pages (reason, type, date, signed amount, balance after; "Load more" / "Try
  again"); unavailable while `credits` is off.
- [x] Donations (`app/support.tsx`, `app/checkout/fake-donation/[ref].tsx`,
  `src/features/billing/{DonationParts.tsx,donationForm.ts}`): "Voluntary support" that never
  changes ratings, ranking or trust; preset ($5 / $10 / $25 / $50) or custom amount (two decimals),
  currency, a private message (≤ 280), the public-thanks opt-in, the API's range errors on the
  fields; the fake donation checkout, then "Thank you!" at the top; the supporters wall (names and
  month only) and the member's donations; unavailable while `donations` is off.
- [x] Sponsored placements (`src/features/ads/`): wherever the web shows ads on an equivalent
  screen — the Search tab's results (SEARCH_SPONSORED), the Map tab's list (MAP_PANEL), the
  Inventory tab (INVENTORY_SIDEBAR) and other collectors' profiles (COLLECTOR_PROFILE) — `GET
  /ads?placement=&game=` for this viewer and plan; nothing while `advertising` is off, for Premium
  (`[]`), on errors or for an unsafe click URL; always labelled "Sponsored" (with why it is shown
  as the accessibility hint) and "Remove ads" while premium plans are sold; one impression per
  serve token once the ad is laid out (`POST /ads/{id}/impression`); a tap opens the API's click
  route (`/api/v1/ads/{id}/click?token=`, recorded once, 302 to the landing page) or an https page
  in the browser.
- [x] Shared: feature flags are read per signed-in collector (`useFeatureFlags` / `useFeature`, the
  ID token now goes with `GET /public/feature-flags` like the web's `ATTACH_ID_TOKEN`; an
  unreadable answer leaves the decision to the API); the Profile tab gains Premium, Credits and
  "Support OrenjiTrade" (each while its flag is on), Settings gains Payouts; the auth gate admits
  `checkout`, `disputes`, `premium`, `credits` and `support`; notifications deep-link to disputes,
  Premium (`?checkout=success` kept), credits, support and payouts (only blocked users stay a
  website note); `FormDialog` (a scrollable modal form above the keyboard) joins the UI kit.
- [x] Found on the way and fixed: back from a fake checkout, Premium, Support and the trade could
  still be scrolled down to the button that opened it, hiding the welcome / thanks / payment notice
  (found by the first Premium flow on the emulator); the Premium credits teaser squeezed its text
  next to its button (walk by hand); a payment-protection step re-read the trade on screen after
  its answer, which hid its success notice (jest).
- [x] Tests — jest/RNTL: 57 new tests (661 in 75 suites, was 604 in 71):
  `features/paymentsBilling` (payment, dispute, payout and provider labels, payment rows, the dispute
  timeline, evidence photo checks, payment refusals, the ship and dispute forms, checkout targets
  and outcomes, dispute facts and closed texts, evidence views, plan / credit / entitlement labels,
  usage rows, subscription texts, billing / credit / referral / donation refusals, the donation
  form, ad links), `features/providerCheckout` (the checkout gives up with "pending", a 409 reads
  the outcome, another refusal keeps the pay buttons), `screens/payments` (trade: pay with
  SELLER_NOT_ONBOARDED then the checkout, the flag off, `?payment=secured|failed`, the payout
  reminder, ship with validation, confirm receipt, open a dispute with validation and
  DISPUTE_WINDOW_CLOSED, a disputed trade; checkout: pay, decline, done / not-found / error with
  retry; dispute: overview, statement, message, photo with the evidence limit, refused photos and
  permission, hold / decision / not-found; payouts: setup and return, flag off, error with retry,
  the Settings link), `screens/billing` (Premium: plans, upgrade with ALREADY_SUBSCRIBED, welcome
  and cancel at period end, continue / close an open checkout, flag off and plans error with
  retry; billing checkout: decline, "Try again", pay, not-found; credits: balance, unlock with one
  idempotency key and INSUFFICIENT_CREDITS, the ledger's next page, referral refusal and
  redemption, flag off, error with retry; support: preset donation, custom amount validation and
  the API's field error, thanks, flag off; donation checkout; sponsored: label, one impression,
  click route, "Remove ads", nothing while off / for unsafe links / on the own profile; entry
  points: Profile links per flag, "See Premium" on a reached limit), `screens/offers` (payment
  protection option on and off), `screens/trades`, `screens/notifications`,
  `features/notifications` and `account/gate` updated. Playwright: `payments.spec.ts` (3) and
  `billing.spec.ts` (4), 45 specs in all (was 38). Maestro: `payment-protection.yaml`,
  `premium.yaml` (+ `scripts/payments.js`), 17 flows in all (was 15).
- Checks (2026-10-05, Windows 11, Pixel_6_API_34 emulator): `npm run test:mobile` green
  (typecheck with regenerated typed routes, lint, 661 jest tests / 75 suites, the 28 harness guard
  tests; Prettier clean); `npx expo-doctor` 21/21; `npx expo export --platform android` (5.1 MB
  Hermes bundle) and `--platform web` (71 static routes, was 63: `/checkout/fake/[ref]`,
  `/checkout/fake-billing/[ref]`, `/checkout/fake-donation/[ref]`, `/disputes/[id]`, `/premium`,
  `/credits`, `/support`, `/settings/payouts`) OK; `npm run test:mobile:e2e` from scratch (jar
  build, recreated database, web export) 45/45 passed (38 earlier + 7 new), 0 skipped, 0 flaky
  (no retry used). Native (Expo Go 57 on `Pixel_6_API_34`, harness-started API :8090 and Metro
  :8082): `npm run test:mobile:maestro` 17/17 flows passed in one full run (51 min 59 s) on the final code, after the two new flows had passed on their own (`payment-protection.yaml` first time; `premium.yaml` once the welcome was scrolled into view, see the fix above). A walk by hand (adb screenshots in the session scratchpad, `m6-walk-*.png`,
  plus the flows' `payment-*` and `premium-*` screenshots): seed sign-in as collector1, the Profile
  tab's Premium / Credits / Support rows, Premium (plans, usage, the credits teaser), Credits
  (balance 300, products, referral code COLLECTOR1, the ledger), Support (the form, the supporters),
  Settings → Payouts (ready, local test provider, the explainer), the seeded protected trade
  waiting for collector8's receipt (steps, payment card with the fee, shipment, timeline),
  "Sponsored" results on the Search tab, the map list and the Inventory tab; then as collector5 the
  disputed trade and its dispute (overview, facts by name and handle, evidence, messages, timeline);
  this walk found the teaser layout (fixed). Logcat without FATAL, ReactNativeJS errors, tokens or
  coordinates; Metro log clean. No API, web, package or dependency change, so no Gradle (beyond the
  harness's jar), web, client regeneration or `audit:gate` run was needed; every process started for
  the checks (API, web server, Metro, emulator) was stopped afterwards.
- Gaps / debt: store builds would need the owner's decision on app-store purchases (ADR 0011
  open question) before real money; PDF evidence is listed and opened on the website (the app adds
  statements and photos; the API's TRACKING evidence is shown, not added); impressions are counted
  once an ad is laid out on screen (the web waits until half of it is in the viewport); the house ad
  of the MOBILE_FEED placement is not shown (the web has no equivalent screen); the referral code
  is shared through the system share sheet (no clipboard dependency was added; the code is
  selectable); admin and moderator consoles (dispute resolution, refunds, plans, campaigns, donation
  refunds) stay web-only; device push stays deferred; iOS not run (no macOS); Expo Go's tools
  button covers the right end of some top rows (no control sits there).

## Mobile app (stage M7: web parity — Google sign-in, search segments, card holders, blocked users, photos and bulk actions, 2026-10-06)

_Owner decisions 2026-10-04 (mobile resumes, local and free only). Branch `feature/mobile-m7`
(worktree, created from `feature/mobile-m6`; `origin/main` with #49 and #51 merged in), builder
done; not pushed. Closes the gaps a read-only completeness critic found between the web app and
the mobile app after stage M6; every item mirrors the web feature on the same endpoints. No API,
web or package change; dependency added with `npx expo install`: `expo-auth-session` (pinned,
`npm run audit:gate` green). ML Phase 11 stays on hold (photos from the library only)._

- [x] Google sign-in and sign-up — "Continue with Google" / "Sign up with Google" on the sign-in and
  sign-up screens (web: `google-button`, `signInWithGoogle`): the auth port gets
  `signInWithGoogle` / `reauthenticateWithGoogle` on one credential vocabulary
  (`src/auth/googleCredential.ts`): Firebase's pop-up on the web build, an OAuth ID token through
  expo-auth-session on a device (platform client ids `EXPO_PUBLIC_GOOGLE_{WEB,ANDROID,IOS}_CLIENT_ID`,
  public values documented in `apps/mobile/.env.example`, empty locally), and, against the local
  Auth emulator, a simulated Google account chosen in the app
  (`SimulatedGoogleAccountDialog`) and sent as the emulator's fake OAuth ID token (a JSON object
  with `sub`, `email`, `email_verified`, `name`) through `signInWithCredential` — the credential
  path a device takes with a real token. A Google sign-up continues on the consent screen like the
  web and skips the e-mail verification; an existing e-mail/password account of the same verified
  e-mail is linked (an unverified one is taken over: Firebase's trusted-provider rule, the same on
  the web). Settings → Account names the sign-in methods; deleting an account without a password
  re-authenticates with Google. Friendly messages for the Google error codes; a dismissed chooser
  says nothing. **Proven only against the emulator**: the real OAuth client ids belong to the
  deferred Firebase project (DEFERRED.md item 4).
- [x] Search tab with Cards | Collectors | Binders segments (web `/search`): collectors by name or
  handle on `GET /search?types=collectors` with the API's distance bucket (never a position in the
  request: the server uses the trading area, or a public city centre before one is set), the 3 km
  rule's approximate note, opted-out collectors absent; public binders by name with their owner
  (`types=binders`); recent searches per segment; empty / error / offline states; rows open the
  existing profile and public binder screens.
- [x] Card holders list — `app/holders.tsx` on `GET /search/card-holders` (the web's holders view):
  "Who has this near me" on the card detail opens the list (sort: closest / lowest price / freshest;
  availability, condition, price range (validated), freshness, edition, language, accepts-offers
  filters in a sheet; paged; "Make an offer" and "View binder" per row; the holder's place and
  bucket only); "Show on the map" opens the Map tab filtered by the card (`?card=` as before).
  Acceptance row 19's mobile half now matches the web.
- [x] "Looking for" on a collector's profile (`GET /collectors/{handle}/wishlist`; card, printing or
  any printing, minimum condition; never prices, radii or notes; hidden on 404).
- [x] Settings → Blocked users (`GET /me/blocks`, `DELETE /users/{id}/block`): list and unblock,
  linked from Settings, from a blocked profile's Message reason, from the block dialog's wording
  and from the settings deep links of notifications.
- [x] Inventory: owner photos on a card (`ItemPhotos`: view, add from the library through
  `POST /inventory/items/{id}/images` with the web's rules — JPEG / PNG / WebP, 8 MB, four at most —
  remove; the web picker's refusal of a non-image is worded like the type check), multi-select
  bulk actions (`BulkBar` on `POST /inventory/items/bulk`: visibility incl. temporary, move to
  binder, availability, confirm, delete after a confirmation, with the skipped items explained),
  the visibility filter, binder reordering (`PUT /binders/reorder`, move up / down sheet).
- [x] Cheap low gaps: Map tab freshness and tags filters and the search box (query of
  `/collectors/nearby`); set pages (`app/sets/[id].tsx` on `GET /sets/{id}`, from a card's set
  link). Signed-out browsing stays out: the web's anonymous routes would need a signed-out shell
  around every public screen (documented as a remaining gap, not trivially mirrored).
- [x] Tracker and docs — this section; the acceptance rows' mobile halves (1, 3, 6, 10, 12, 16, 18,
  19, 20, 21, 40); the M1–M6 caveats replaced with their merged PRs; `apps/mobile/README.md`,
  `docs/development/local-setup.md`, `docs/deployment/DEFERRED.md` (the OAuth client ids).
- [x] Tests — jest: `auth/google` (the emulator credential, the native request, the strategy),
  `screens/auth` and `screens/settings` (the Google buttons, dialog, errors, sign-in methods),
  `features/searchSegments`, `screens/search-segments`, `screens/holders` (filters, pages, errors),
  `screens/collector` ("Looking for"), `screens/blocked`, `screens/inventory` (bulk actions,
  reordering, visibility filter), `screens/items` (photos incl. the picker's refusal),
  `screens/sets`, `screens/map` and `features/mapDiscovery` (freshness, tags, search).
  Playwright (`apps/mobile/e2e`, 7 new spec files, 9 specs): `google.spec.ts` (3), `search-segments.spec.ts`,
  `holders.spec.ts`, `collector-wishlist.spec.ts`, `blocked.spec.ts`, `item-photos.spec.ts`,
  `bulk-actions.spec.ts`; `map.spec.ts` follows the card's new buttons; 54 specs in all (was 45).
  Maestro: `google-sign-in.yaml`, `collector-search-looking-for.yaml`, `holders-filters.yaml`,
  `blocked-users.yaml` (+ `scripts/parity.js`), 21 flows in all (was 17).
- Checks (2026-10-06, Windows 11, Pixel_6_API_34 emulator, on the merged branch): `npm run test:mobile`
  green (typecheck with regenerated typed routes, lint, 713 jest tests / 81 suites, the 28 harness guard tests; Prettier clean); `npx expo-doctor` 21/21; `npx expo export --platform android`
  (5.3 MB Hermes bundle) and `--platform web` (74 static routes, was 71: `/holders`, `/sets/[id]`, `/settings/blocked`) OK; `npm run test:mobile:e2e` from
  scratch (jar build, recreated database, web export) 54/54 passed (45 earlier + 9 new), 0 skipped, 0 flaky (no retry used), 1.5 min of specs, 3 min 42 s in all. Native (Expo Go 57 on `Pixel_6_API_34`,
  harness-started API :8090 and Metro :8082): `npm run test:mobile:maestro` 21/21 flows passed in one full run (43 min 6 s of flows, 44 min 47 s in all) on the final code; on their first full run the four new flows had failed for flow reasons fixed in `94057c0` (the Google flow's password account needs a verified e-mail, Firebase's rule; back to the inbox before the Profile tab; the "Looking for" text sits below the section's top edge; the availability filter "Sale" also matches "trade or sale" copies, so the flow narrows by condition) and then passed on their own (4/4 in 8 min 1 s); the emulator was restarted before the full run (quick-boot drops Expo Go, a fresh Metro reinstalled it).. A walk by hand of the new screens (a scratch Maestro flow outside the repository, 15 screenshots `m7-walk-01…15` in the session scratchpad): the sign-in screen's Google button and the simulated-account dialog, the Map tab's search box and freshness sheet, the Collectors segment (collector5 with "Locations are approximate (about 3 km)" and a 1–5 km bucket) and the Binders segment, a card's holders list and its filter sheet, a set page, the inventory's Select mode with the bulk bar and the visibility sheet, a card's photos section, the binder reorder sheet, Settings → Blocked users (empty) and Settings → Account (sign-in methods). The walk's logcat (43 547 lines) has no FATAL, no ReactNativeJS error, no red box, no token and no coordinate with more than 3 decimals (the 5 regex hits are Android system lines: a launcher bitmap data URL, WebView version numbers, a service timing); the Metro log is clean (110 bundles, 0 errors).
  `npm run audit:gate` green (expo-auth-session added). No API, web or package change, so no Gradle,
  web or client regeneration run was needed; every process started for the checks (API, web server,
  Metro, emulator) was stopped afterwards.
- Gaps / debt: Google sign-in proven only against the Auth emulator (no OAuth client ids, no
  Firebase project; the web build's pop-up and the device flow have not run against a real
  project); the card holders list proves pagination in jest only (the E2E lists two copies);
  signed-out browsing not mirrored; the message, dispute and avatar pickers (M4/M6) do not word
  the web picker's refusal of a non-image file (nothing happens; the item photos do); the 18+
  confirmation (sign-up and onboarding for existing accounts) waits for the launch-readiness API
  change; the Expo SDK 58 upgrade is its own PR; device push and iOS stay deferred.

## Mobile app (stage M8: launch readiness on the Expo app — 18+ confirmation, French legal pages, safety notice, money-off, 2026-10-06)

_Branch `feature/launch-readiness` (worktree), on top of launch readiness parts 1–5 with
`origin/feature/mobile-m7` merged in (455456c) and then `origin/main` once #53 had merged there
(1d233e7, no file change), builder done; not pushed. The mobile
half of the launch-readiness work, so PR #52's "Mobile web build against the local stack" check
turns green: every mobile flow that messages, posts, toggles discoverability or makes offers hit the
new `403 AGE_CONFIRMATION_REQUIRED` gate until the app and its harnesses learned the 18+
confirmation. Everything local and free; no API, web or package change (the generated clients
already carried `OnboardingStatus.ageConfirmed`, `ConsentRequest.language` and the
`AGE_CONFIRMATION` document type); one dependency added with `npx expo install`:
`expo-localization` (pinned `~57.0.2`, `npm run audit:gate` green). Nothing here claims legal
compliance: the legal texts stay drafts (banner kept on both languages)._

- [x] **18+ confirmation** (mirror of the web's `age-confirmation-checkbox`, sign-up, consent and
  onboarding pages): `src/features/legal/ageConfirmation.ts` + `AgeConfirmationCheckbox.tsx`
  (English and French label and validation message, never ticked by default, never part of
  "Accept all"); `app/(auth)/sign-up.tsx` posts `{ documentType: 'AGE_CONFIRMATION', version }`
  after the required documents through the existing `acceptConsents` (`registration.ts`: the
  version comes from `GET /public/legal/documents`, which lists `AGE_CONFIRMATION` with
  `requiredAtRegistration: false`, so `requiredAtRegistration()` keeps it out of the "I have read
  and accept" list; `validateSignUp` gets an `age` error while the attestation is published and
  unticked); `app/(account)/consent.tsx` shows the same checkbox while `me.onboarding.ageConfirmed
  === false` (Google sign-ups land there) and records it with the pending documents;
  `app/onboarding.tsx` + `OnboardingSteps.tsx` `AgeStep`: a first, non-editable "Age" step
  ("Are you 18 or older?", the terms link, the checkbox, Continue, Sign out so nobody is stuck;
  skeleton / retry while the document list loads), the steps of a visit decided once so indexes
  never shift, an existing collector who only misses the confirmation gets "Thanks for
  confirming. Welcome back!" and returns to where they came from (`useAuthGate` remembers the
  resumable link when it sends an app screen to onboarding, like the web's `returnUrl`);
  `accountStatus.needsOnboarding` is true while `ageConfirmed === false` (`undefined` → an older
  API never asks); `ApiError.isAgeConfirmationRequired`, a friendly message for
  `AGE_CONFIRMATION_REQUIRED` in `errorMessages.ts` and a new account signal
  (`age-confirmation-required`) that reloads `/me`, so the gate shows the step from any screen.
- [x] **Test harness:** `apps/mobile/e2e/support/stack.ts` `apiConfirmAge` /
  `apiAgeConfirmed`, `createOnboardedCollector` records the consent unless `confirmAge: false`
  (an account from before the rule); the Playwright global setup records it for the seed
  collectors the specs sign in to (`collector1`, `collector2`: the seed predates the rule, the
  consent row lands in the isolated database, the emulator account is only signed in to); every
  Maestro host script that creates a collector (`create-collector.js` with `CONFIRM_AGE`,
  `messaging.js`, `offers.js`, `payments.js`, `wishlist.js`, `parity.js`) records it, the seed
  flows (`sign-in.yaml`, `map-preview-profile.yaml`) run `scripts/confirm-age.js` first and
  `scripts/check-age.js` checks `onboarding.ageConfirmed` on the API.
- [x] **Consent language:** `src/features/legal/legalLanguage.ts` (the web rule: French when the
  device's primary language is French through `expo-localization`, an explicit EN / FR choice
  remembered on the device in AsyncStorage wins); `AccountProvider.acceptConsents` sends
  `language` with every consent (`consent.language` when the caller sets one), so the API records
  which translation was read; the sign-up and consent checkboxes name the documents in that
  language.
- [x] **French legal pages:** `npm run sync:legal` now generates `src/legal/legalContent.fr.ts`
  from the web's `legal-content.fr.ts` next to the English file (the type import rewritten; a jest
  test keeps both copies identical to the web files, never hand-copied); `legalTexts.ts` serves the
  texts, draft banner, translation marking, effective-date placeholder and chrome labels of the
  active language; `LegalLanguageSwitch` (EN / FR, a radio group) on `app/legal/index.tsx` and
  `app/legal/[key].tsx`; `LegalDraftBanner` shows the French draft banner and the translation
  marking exactly as the web (« Traduction de l'ébauche anglaise, à faire valider par un
  conseiller juridique. »); the `trading-safely` key is listed (both languages). The UI around the
  texts stays English (the full French UI translation is the recorded next task).
- [x] **Safety notice and Block on the profile:** `src/features/safety/TradingSafetyNotice.tsx`
  (the web's wording per context, link to the "Trading safely" page, Report, Block, Dismiss;
  a labelled note whose title is a header, never one grouped accessibility element, so the guide
  link and the Report / Block / Dismiss buttons stay reachable one by one with a screen reader)
  under the conversation header (hidden once the
  thread is blocked, never over the composer) and at the top of `offers/[id]` and `trades/[id]`;
  `safetyNoticeStore.ts` keeps the dismissal per collector and per context on the device
  (AsyncStorage `orenjitrade.safety-notice.v1`: no server-side preferences mechanism exists;
  nothing is shown before the stored dismissals are read; the hydration flag lives in a separate
  non-persisted store because a persisted store writes on every `setState`, which broke the web
  build's static rendering). `BlockCollectorDialog.tsx` (one confirmation dialog, used by the
  notices and the profile) and `useUnblockCollector`; `CollectorProfileView` offers Block /
  Unblock next to Report (`profile.isBlocked`; the profile reloads through the existing cache
  invalidation). Stage M7 had Settings → Blocked users and the conversation menu only.
- [x] **Money-off consistency:** `errorMessages.ts` `LIMIT_REACHED` is neutral ("It resets
  soon."); `lib/limits.ts` `limitReachedMessage` names Premium only with `premiumOffered`
  (`LimitReachedNotice` passes the `premiumPlans` flag, "See Premium" was already flag-gated);
  `notificationKinds.ts` opens Premium for the plan-limit notice only when the payload carries
  `upgradeUrl` / `deepLink` (else the wishlist for a held-back match, or the list, as the web);
  `__tests__/features/moneyOff.test.tsx` proves no pay / subscribe / credits / donate entry point
  (Profile tab, Settings, limit notice, another collector's profile) with every money flag off.
- [x] **Tests.** jest: `account/ageConfirmation` (4), `account/registration` (+3),
  `features/legalLanguage` (5), `features/safetyNotice` (6), `features/moneyOff` (4),
  `screens/auth` (+2), `screens/account-states` (+1), `screens/onboarding` (+5), `screens/legal`
  (rewritten: FR default, switch remembered, both copies synced), `screens/collector` (+2),
  `app/auth-gate` (+2), `features/notifications` and `lib/inventory` updated — `npm run
  test:mobile` 748 tests in 85 suites green (typecheck, lint, Prettier, the harness guard tests).
  Playwright (`npm run test:mobile:e2e`): 60 specs (54 + `age-confirmation.spec.ts` 2,
  `legal-french.spec.ts` 2, `safety-notice.spec.ts` 2; `auth.spec.ts` ticks the checkbox at
  sign-up and on the consent screen) — 60 passed, 0 flaky, 0 skipped, no retries (2026-10-06,
  2 m 43 s with the stack). Maestro (`npm run test:mobile:maestro` on
  `Pixel_6_API_34`): 24 flows (21 + `age-step-existing-account.yaml`, `legal-french.yaml`,
  `safety-notice.yaml`; `sign-up-onboarding.yaml` ticks the checkbox) — 24/24 passed in one run
  (49 m 17 s, 2026-10-06). Walked by hand on the emulator once (adb screenshots): the sign-up
  checkbox ("Accept all" leaves it unticked, the bilingual refusal), the legal index and "Trading
  safely" in French with the banner and the marking, the "Age" step of the unconfirmed seed
  `collector5` (refused unticked, then "Welcome back" on the Map; the consent row recorded with
  `language = fr`, the language chosen on the legal pages), Block / Unblock on a profile, the
  notice in a first conversation (a message sent under it, dismissed, still gone after a relaunch),
  and the consent-screen checkbox of a simulated Google sign-up (refused unticked, then onboarding
  from the profile step; the emulator account deleted afterwards); logcat without crash, red box,
  token or coordinate, Metro without error.
  `npx expo-doctor` 20/21 (the known newer-patch-versions notice only), `npx expo export` for
  android and web green, `npm run audit:gate` OK.
- **Docs:** `apps/mobile/README.md` (status, architecture, scripts, specs and flows),
  `docs/development/local-setup.md`, `docs/development/test-accounts.md` (seed accounts see the
  age step once; the mobile suites record the consent in their isolated database).
- **Debt / follow-ups:** the UI around the legal texts stays English (next task: the full French
  UI translation); the safety notice dismissal is per device (signing in elsewhere shows it
  again, acceptable for a safety reminder, same as the web); the seed accounts of a developer
  stack confirm their age once on the next sign-in (web or mobile); an existing collector's
  age-only visit shows the full step indicator ("Step 1 of 4 · Age") before going straight back,
  like the web's stepper; the Expo SDK 58 upgrade stays its own PR.

## E2E isolation, test-data purge and 3 km zones (2026-10-04)

_Workflow task on branch `fix/e2e-isolation-3km-zones` (worktree, not pushed). Owner request: the
E2E/acceptance suite had filled the developer database with 583 `@example.test` collectors
(`accmapa_*`, `privacy_*`, `paused_*`, `picowner_*`, `wisha_*`, "E2E <prefix> collector"), about 170
of them discoverable at the default Place des Arts trading area, all stacked on one map cell.
Root cause confirmed: `scripts/test.mjs` started the E2E API jar with the `local` profile against
the developer database `orenjitrade`, the same Auth emulator and the same `apps/api/.local-storage`
(`--reuse-running` reused the developer API itself); `AcceptanceApi.cleanUp()` only demoted staff
and unpublished binders, and never ran on interrupted runs. The 583 accounts were already gone
(owner's `infra:reset` the same morning): the developer database held 0 `@example.test` accounts,
12 seed accounts and 12 `user_location` rows; the emulator held 28 `m-e2e-…@example.test`
accounts left by earlier mobile E2E runs._

- [x] **Part 1 — isolated web E2E stack** (`scripts/lib/web-e2e.mjs`, guards in
  `scripts/lib/web-e2e-guard.mjs`): database `orenjitrade_e2e` dropped and recreated per run
  (Flyway + local seed, mock catalog only; created by the postgres init script on fresh volumes and
  by the harness otherwise; `--keep-db`), Redis db 2 (flushed with the database), realtime channels
  `e2e-web:rt:user:*` (new `orenji.realtime.channel-prefix`, Redis pub/sub ignores the logical
  database; `RealtimeChannelPrefixTest` (4)), API jar on :8180 with media, card image cache and provider snapshots under
  `.local-dev/e2e/` (its working directory), on-demand downloads off, YGOPRODeck disabled and pointed
  at a closed port, the `orenjiWebE2e` identity block under `/actuator/info`;
  `ng serve --configuration e2e` on :4300 serving `e2e/.runtime/config.json` (API :8180, written per
  run, Angular persistent cache off). Healthy infrastructure containers are never touched
  (`docker compose up` from a worktree would recreate the developer's PostgreSQL: its bind-mounted
  init directory is part of the compose config hash). Emails `e2e-<run id>-…@example.test`; the
  run's emulator accounts are deleted at the end (harness + Playwright global teardown, best effort
  on Ctrl+C). `--keep-running` / `--stack-only` / `--stop`; `--reuse-running` only reuses that kept
  stack (same instance id, web config pointing at it) and refuses the developer API with a clear
  message; Playwright's global setup refuses any API without the identity block. Guards (unit
  tests in `scripts/lib/web-e2e-guard.test.mjs`, `npm run test:scripts`, run before every
  `test:e2e` and in CI): wrong database, Redis db 0, developer realtime prefix, developer/mobile
  ports (8080, 4200, 8081, 8082, 8090, 19006), media or card image cache directory resolving
  (links, case, `..`) to a developer directory of any checkout/worktree or of `.env` — one test
  fails when the E2E cache dir equals the developer one. CI (`e2e.yml`) uses the same layout.
- [x] **Part 2 — teardown**: `AcceptanceApi` tracks every collector it creates; `cleanUp()`
  (bounded to 20 s, never failing a test, never touching `@orenjitrade.test`) requests their
  deletion through `POST /me/deletion-requests` (off the map at once), sets `discoverable: false`
  when an open trade blocks it, and deletes their emulator accounts.
- [x] **Part 3 — `npm run e2e:purge`** (`scripts/e2e-purge.mjs`): the database part runs in the API
  jar's one-shot maintenance mode (`TestAccountPurgeCommand`, `orenji.maintenance.purge-test-accounts`;
  no web server, Flyway off, seed off, scheduled jobs off via the new `orenji.scheduling.enabled`,
  no republication of other instances' events, no card image reconciliation; refuses otherwise, and
  unless the profile is local/dev, PostgreSQL is local and identities live in the local emulator).
  `TestAccountPurgeService` (admin module) cancels open trades between two test accounts, creates a
  deletion request (`AccountDeletionService.request`) and processes exactly that request at once
  (new `AccountDeletionService.processNow`: the job's steps); blocked accounts stay, off the map.
  The CLI shows the plan, asks (`--yes`), deletes the remaining `@example.test` emulator accounts
  (waiting up to `--wait-minutes` while a mobile or web E2E run is active) and prints the removed
  accounts, locations, binders, items and emulator accounts. No endpoint added; a running API is
  not needed. The mode is refused before the context starts when a switch is missing
  (`TestAccountPurgeModeGuard`, an `EnvironmentPostProcessor`). Tests: `TestAccountPurgeIT` (3),
  `TestAccountPurgeCommandTest` (5), `TestAccountPurgeModeGuardTest` (3),
  `scripts/lib/e2e-purge.test.mjs` (6).
- [x] **Part 4 — 3 km zones on the web** (ADR 0004 amendment 2026-10-04):
  `APPROXIMATE_AREA_RADIUS_M = 1500`, zoom cap 14 and clustering tied to it unchanged, "about
  3 km" on the legend, preview, map accessible name, profile and the Privacy Policy definition
  (text lives in `legal-content.ts`, not in a migration; consent version unchanged, no re-consent:
  a clarification of how the existing public point is displayed, no new data, purpose or sharing).
  New unit specs (radius, wording, zoom clamping, Leaflet pixel size at 14) and E2E checks
  (`e2e/map.spec.ts`, `e2e/acceptance/map.spec.ts`: wheel, "+" button, keyboard and double click
  never pass 14, no tile beyond 14, the zone measures 1500 m with the avatar on its centre, no DOM
  attribute with a coordinate finer than 3 decimals via the new `PrivacyScanner.scanDom`).
- [ ] **Part 4 — mobile** (Map tab collector zones, preview bottom sheet, collector profile):
  owned by the parallel mobile workflow (stage M3); `apps/mobile` is not touched here. ADR 0004's
  2026-10-04 note already states the mobile rule.
- Verification (builder, 2026-10-04): `npm run test:scripts` 26/26 (20 isolation-guard tests incl.
  "FAILS when the E2E card image cache directory equals the developer one", 6 purge-rule tests);
  `npm run test:web` lint + 129 files / 632 Vitest tests (was 629); `npm run test:mobile` typecheck +
  lint + 6 suites / 29 jest tests (no `apps/mobile` change); `npm run test:api` (`gradlew test
  --rerun check`, Spotless included) 781 tests / 159 classes, 0 failures, 0 skipped; OpenAPI
  re-exported (`./gradlew exportOpenApi`) without any change (no endpoint added). **Two consecutive
  full `npm run test:e2e` runs from the worktree: 69/69 passed, 0 flaky, 0 skipped (311 s and
  342 s), each deleting its 66 emulator accounts (0 left).** Developer state before the first and
  after each run identical: `user_account` 12 (all `@orenjitrade.test`,
  0 `@example.test`), `user_location` 12 (8 discoverable), `binder` 10, `card` 14,675, `card_image`
  14,927, developer card image cache 14,731 files / 695,442,661 bytes with the same sorted
  name+size+mtime list hash, 0 other media files, emulator `@example.test` 28 (the mobile leftovers)
  and 12 seeds unchanged. `--reuse-running` refused `E2E_API_PORT=8080` ("belongs to the developer
  API") and a stand-in API without the identity block, and reused a kept stack (8/8 map + smoke
  specs); Playwright's global setup refused the stand-in too. The new map checks (no zoom past 14,
  1500 m zone at zoom 14, avatar centred, no DOM coordinate finer than 3 decimals) passed in every
  run; the map/admin specs were hardened after a loaded `--repeat-each` run (28/28 and 24/24 after).
- Purge proof on test data (E2E database, `npm run e2e:purge -- --e2e --yes`): three
  `@example.test` collectors at Place des Arts (two discoverable, each with a public binder and an
  item, a conversation with 2 messages, an accepted offer = open trade AGREED between them, one with
  a pending deletion request) → maintenance mode started without Flyway or seed, cancelled 1 trade,
  3 found / 3 deleted / 0 blocked / 0 failed / 0 remaining, locations 3 → 0, binders 3 → 0, items
  3 → 0, rows anonymised (`deleted+<id>@anonymized.invalid`, "Deleted collector"), text messages
  erased, 3 `account.deletion.complete` audit entries, consents kept, 12 seeds with their 12
  locations and 10 binders and the 80 cards / 160 printings / 160 card images untouched, 0 pending
  event publications. A jar started with only `--orenji.maintenance.purge-test-accounts=true`
  stopped before start-up (no Flyway, no seed) listing the six missing switches.
- Developer database purge: after `pg_dump -Fc orenjitrade` (scratch, outside the repo) and
  the before-counts above, `npm run e2e:purge -- --yes` found 0 `@example.test` accounts in
  `orenjitrade` (the 583 had gone with the owner's reset), so no jar was started and the database
  was left as it was (removed 0 accounts / 0 locations / 0 binders / 0 items); it waited 4 minutes
  while the mobile E2E stack (:8090, :8082) was up, then deleted the 28 `m-e2e-…@example.test`
  emulator accounts of earlier mobile runs (0 left). Afterwards the discoverable collectors are the 8
  seed ones only (collector1–6, collector8 "exoking", premium_user), every count and the card image
  cache list hash are unchanged, the cache accounting row reads 695,442,661 bytes / 14,731 files
  (its `reconciled_at` moved to 22:52:03Z because the owner restarted the developer API at 22:51Z,
  not because of this work), and Redis db 0's nearby generation stayed at 13 (nothing was deleted,
  so no cached page could hold a removed collector).
- Incident during verification: at 22:59:01Z someone else ran `docker compose down` on the shared
  infrastructure (containers and network destroyed, volumes kept) while an E2E run was in progress;
  the next `npm run test:e2e` found the containers missing and, as designed, brought them back with
  `docker compose up -d --build --wait` (from this worktree; same images, volumes and data: the
  developer database and card image cache were verified unchanged). The owner's developer API
  (`gradlew bootRun` from `C:\dev\OrenjiTrade`) was stopped at 22:04:36Z and again at about
  22:57Z (Gradle: "client disconnection detected"); it was not restarted by this work, so
  `npm run card-images:status` and the discovery check as a seed user could not be run against it
  (the cache was checked file by file and through its accounting row instead). If the owner meant
  the infrastructure to stay down, `npm run infra:down` stops it again.

## Launch readiness, part 1 — users must be 18 or older (2026-10-05)

_Branch `feature/launch-readiness` (from `main` at `ded5470`), builder done. Owner request
"Prepare OrenjiTrade for its first real users", section 1. Self-declaration only (no identity or
document verification). The French legal pages, the Trading safely page, the launch
configuration and the Law 25 operating docs are the following parts of the same workflow._

- [x] **Server-side record.** The attestation "I confirm I am 18 years of age or older" is a
  consent like any other: migration `V103__age_confirmation.sql` adds the document type
  `AGE_CONFIRMATION` (named check `ck_legal_document_type` replaces the unnamed V003 check) and
  its current row `2026-10-05` with `required_at_registration = false` and
  `url = '/legal#age-confirmation'` (not a page: the clients map only `/legal/<slug>` urls to
  in-app texts, and `AGE_CONFIRMATION` sorts before `TERMS` in the public list). `POST
  /me/consents {AGE_CONFIRMATION, 2026-10-05}` stores version, timestamp, salted IP hash, user
  agent and an audit row, idempotently (`ConsentService.accept`, unchanged). `GET /me` reports
  `onboarding.ageConfirmed` (`OnboardingFlag.AGE_CONFIRMED`, bean `AgeConfirmedCheck`; schema
  `NOT_REQUIRED`, so the generated clients get `ageConfirmed?: boolean` and the mobile fixtures
  keep compiling). The confirmation shows up in the admin user detail and the data export (Law
  25 evidence). Any recorded version counts (`ConsentService.hasConfirmedAge`), so republishing
  the wording never un-confirms anyone.
- [x] **Service-layer gate** `ConsentService.requireAgeConfirmed(userId)` → `403
  AGE_CONFIRMATION_REQUIRED` (new `ErrorCode`; Problem Details with `errorCode`, safe `message`,
  `requestId`, `timestamp` and the existing `requiredConsents` extension naming the document to
  record). Called by `PrivacySettingsService.update` when `discoverable` is requested (the map;
  `searchDiscoverable` stays ungated), `ConversationService.start` / `send`,
  `CommunityService.createPost` / `createReply` (after the `publicChat` flag) and
  `OfferService.create` / `counter`. Reading, accepting / declining / withdrawing offers, the
  terms filter and every `/api/v1/admin/**` route are untouched: an unconfirmed ADMIN or
  MODERATOR keeps working (`AgeConfirmationIT.adminAndStaffPathsAreNotGated`). Additive API:
  no existing request gained a required field; the mobile client's sign-up, `/me`, consent and
  profile calls are unchanged.
- [x] **Existing accounts** (seed and local test accounts included) are never pre-confirmed: the
  seed only inserts `required_at_registration` consents, so collector1… confirm through the
  onboarding "Age" step on their next sign-in (the web routes them there: `needsOnboarding`
  is true while `ageConfirmed === false`, the session interceptor sends a 403
  `AGE_CONFIRMATION_REQUIRED` to `/onboarding`). Tests provision compliant accounts with the
  confirmation (`TestUsers.confirmAge`, `AbstractIntegrationTest.provisionCompliant`) and
  unconfirmed ones with `provisionWithoutAgeConfirmation`.
- [x] **Web.** `AgeConfirmationCheckboxComponent` (shared, bilingual label "I confirm I am 18
  years of age or older" / "Je confirme avoir 18 ans ou plus", unticked, `role="alert"` message,
  keyboard and screen-reader accessible): on the sign-up page (a separate `requiredTrue` control;
  "Accept all" never ticks it; the confirmation is posted with the required documents), on the
  consent page for Google sign-ups and new document versions while `ageConfirmed === false`, and
  as the first, non-editable step of the onboarding stepper. An existing collector that only
  misses the confirmation is sent straight back ("Thanks for confirming. Welcome back!"); a new
  one continues to the profile step. `friendlyError` explains `AGE_CONFIRMATION_REQUIRED`.
  E2E helpers (`apiAcceptConsents`, `apiConfirmAge`, acceptance `collector()`) record the
  confirmation for fresh collectors; `auth.spec.ts` covers the sign-up checkbox, the consent
  page and the seed collector's age step; `admin.spec.ts` accepts `/onboarding` after the
  staff-only snack bar (seed collectors are unconfirmed in the fresh E2E database).
- [x] **Legal wording (English drafts; the French translation follows in part 2).** Terms
  "Acceptance" clause 2: 18 or older, confirmation recorded with its date, accounts of people
  under 18 closed. Privacy "International transfers and age requirement": for people 18 and
  older, no knowing collection from minors, accounts of minors closed and their data deleted
  subject to retention periods and the law. `LAST_UPDATED` 2026-10-05; the `legal_document`
  versions stay `2026-09-01` (pre-launch drafts, zero users): publish a new version row when
  the lawyer-reviewed texts land. `apps/mobile/src/legal/legalContent.ts` regenerated with `npm
  run sync:legal` (mechanical; the mobile test "ships exactly the texts of the web app" needs it).
- [x] **Tests.** API: `ConsentServiceTest` (4), `OnboardingServiceTest` (3), `AgeConfirmationIT`
  (4: recording with timestamp / IP hash / UA / audit and the 409 for a stale version; never
  required at registration; the gate on discoverability, messaging, community posts, offers and
  counters with the `errorCode` and `requiredConsents`; admin and staff paths), `ConsentIT`,
  `FlywayMigrationIT`, `AdminUsersIT`, `ExportIT` updated (9 documents, 5 consents). Web:
  `age-confirmation-checkbox.component.spec.ts` (3), `sign-up-page.component.spec.ts` (3),
  `onboarding-page.component.spec.ts` (4), `session.service.spec.ts` (+3),
  `api-error-messages.spec.ts` (+1). Full runs: `npm run test:api` 790 tests green after the two
  count updates, `npm run test:web` 646 green + lint + Prettier, `npm run test:mobile` 416 green
  (typecheck, lint, jest) against the regenerated `packages/api-client` / `packages/shared-types`
  (`./gradlew exportOpenApi`, `npm run generate:api`).
- **Docs:** `docs/api/contracts/phase1-auth-users.md` (18+ rule), `docs/database/schema.md`
  (V103, `legal_document`), `docs/product/product-overview.md` (trust and safety).
- **Debt / follow-ups:** the mobile app's sign-up checkbox, consent-screen checkbox and
  onboarding confirmation, and the mobile harnesses' `AGE_CONFIRMATION` consent, are done in
  mobile stage M8 (2026-10-06, same branch; see "Mobile app (stage M8)"); `searchDiscoverable`
  (name search, on by default) is deliberately not gated — revisit if the owner wants search
  hidden too.

## Launch readiness, parts 2 and 3 — trading safety and French legal pages (2026-10-05)

_Branch `feature/launch-readiness`, builder done. Owner request "Prepare OrenjiTrade for its first
real users", sections 2 ("Trading safety") and 3 ("French versions of the legal pages"). The legal
texts stay drafts (banner kept on both languages); nothing here claims legal compliance._

- [x] **"Trading safely" page** (`/legal/trading-safely`, key `trading-safely` in
  `apps/web-angular/src/app/features/legal/legal-content.ts` and `legal-content.fr.ts`; route,
  index card, "See also" links and footer link follow automatically): meet in busy public places
  in daylight (some police stations offer safe exchange zones), bring someone along for valuable
  cards, never share your home address, check the cards before handing over money, warning signs
  (pressure, too-good deals, payment outside the agreed method), what OrenjiTrade shows (3 km
  zones, discoverability off by default), how to report and block, no payments at launch.
- [x] **Safety notice** `shared/safety/trading-safety-notice.component.ts` (`role="note"`, design
  tokens, keyboard / screen-reader accessible, link to the page, Report and Block buttons, Dismiss)
  in every conversation (`thread-view`, hidden once the thread is blocked; the composer is never
  blocked) and at the top of `/offers/:id` and `/trades/:id`. `SafetyNoticeService` stores the
  dismissal **per collector and per context (conversation / trade) in local storage**
  (`orenji.safety-notice.v1`): there is no generic server-side preferences mechanism (only typed
  privacy, notification and offer settings), and a new table for one hint was not worth a
  migration; signing in on another device shows the reminder again. Report from the notice opens
  the existing Report collector modal (`PROFILE` context on offer / trade pages), Block the
  existing confirmation dialog.
- [x] **Report and Block verified end to end.** Report already worked from the profile, the map
  preview, the conversation menu, community posts and public binders (`reporting.spec.ts`,
  ReportFlowIT). Block worked from the conversation menu and Settings → Blocked users
  (`messaging.spec.ts`, MessagingAuthorizationIT) but was **missing from the collector profile**:
  the profile now offers Block / Unblock next to Report (`collector-profile-view` outputs,
  `collector-page` + `BlockActionsService`, profile reloaded afterwards). No other redesign.
- [x] **French legal pages (Bill 96).** `legal-content.fr.ts` holds a careful Quebec-French
  translation of every English draft (vous form; « renseignements personnels », « Commission
  d'accès à l'information du Québec », « responsable de la protection des renseignements
  personnels », « cartable », « zone d'échange »), with the same keys, versions, section ids and
  clause counts (`legal-content.fr.spec.ts` enforces the parity and the `[à confirmer]`
  placeholders), its own draft banner and a "translation to be validated by a lawyer" notice.
  `LegalLanguageService`: French when the browser prefers it (`navigator.languages[0]` starts with
  `fr`), an explicit choice remembered per browser (`orenji.legal.language`), `?lang=en|fr` deep
  links; `LegalLanguageSwitchComponent` (EN / FR toggle) on every legal page and the index; pages
  carry `lang="fr"` / `"en"`. `LegalTextsService` holds the texts of the active language and is
  only imported by the lazy legal and auth chunks (the session service reads the light
  `LegalLanguageService`), so the initial bundle stays at 897 kB (900 kB warning budget) instead of
  the 933 kB a single service produced. The app UI around the pages stays English (see the
  assessment below).
  **French review fixes (2026-10-05):** the translation notice is a marking only (« Traduction de
  l'ébauche anglaise, à faire valider par un conseiller juridique. ») — the French-only sentence
  that made the English draft prevail in case of divergence was removed, because a
  language-precedence rule is legal content (asymmetric, and of doubtful effect against Quebec
  consumers under the Charter of the French language s. 55 and CPA s. 26); if the lawyer wants
  one, it goes inside the documents in both languages. Quebec typography applied to every French
  string (` ` before a colon and inside guillemets, no space before `; ! ?`), four wordings
  aligned with the English source (« pays de résidence » / « tribunal compétent » in the
  governing-law placeholder, « personne identifiée ou identifiable », « ou la nuit », « service de
  police local », « Vous n'avez jamais l'obligation de conclure un échange »); the parity spec now
  guards the notice, the typography and case-insensitive placeholders. Owner / lawyer calls left
  as they are: « gradation » (community term for grading), « entiercement (escrow) », « Politique
  du marché », « Mint » kept as the app's condition label.
  **Second French review (2026-10-05), fixed:** Marketplace Policy 2.3 said « la carte réellement
  mise en vente », which narrowed "the actual card being listed" to cards for sale; it now reads
  « la carte réellement annoncée » (the sentence about stock images « lorsqu'une carte est à
  vendre » is unchanged). Wording alignments: « Votre position précise (coordonnées
  géographiques) » instead of « Vos coordonnées précises » (coordonnées = contact details),
  « un collectionneur de bonne foi » instead of « un échangeur » (a highway interchange),
  « selon les lois qui vous sont applicables » for "in your jurisdiction", epicene rewrites of the
  two participles addressed to the reader (« Ne cédez jamais à la pression de… », « pour maintenir
  votre session ouverte »), the French `lastUpdated` label is « Dernière mise à jour : » (the
  ISO date follows, as in English), and the Trading-safely short title is « Échanger en
  sécurité » (« Sécurité » alone could be read as account security). The 18+ validation message
  is now shown in both languages like the checkbox label. Left to the lawyer / owner, as before:
  « gradation », « proxys », « premium » and « conseiller juridique » (correct; « avocat » is the
  everyday word). Note for the UI translation: the French legal texts name UI controls in French
  (« Signaler le collectionneur », « Paramètres → Compte (« Exporter mes données ») »,
  « Utilisateurs bloqués ») that the English UI does not show verbatim until step 2 of the plan
  translates those screens; keep the legal glossary and the UI catalog aligned then.
- [x] **Consent references the version and the language shown.** V104 adds
  `user_consent.language` (`en` / `fr`, default `en`); `POST /me/consents` accepts an optional
  `language` (older clients unchanged), the admin detail, the export and the audit row expose it.
  One `legal_document (document_type, version)` row covers both languages on purpose: the French
  text is a translation of the same draft, not separate legal content, so the version identifies
  the content and the consent records which rendering was read (per-language rows would collide
  with `uq_legal_document_current` and double `requiredConsents`). The web sends the active legal
  language with every consent, and the sign-up / consent checkboxes show the document titles in
  that language (the linked pages open in it). The mobile app keeps sending English consents until
  it ships the French texts (see NEXT TASK).
- [x] **Privacy Policy additions (EN + FR, placeholders where the repository does not say):** the
  Privacy Officer / Responsable de la protection des renseignements personnels (`[name to
  confirm]`, `[title to confirm]`, `privacy@orenjitrade.com`, `[postal address to confirm]`); how
  to exercise access, correction and deletion (Settings, Export my data, Delete my account with
  the 7-day grace and 30-day deletion, `privacy@` answered within 30 days, complaint to the CAI);
  confidentiality incidents (register kept; CAI and affected people notified when there is a risk
  of serious injury); where data is stored and which providers may store it outside Quebec:
  Google Cloud Montréal region `northamerica-northeast1` (Terraform default, `[to confirm at
  launch]`), Firebase Authentication, Firebase Cloud Messaging, Cloudflare (`[to confirm]` each)
  and Stripe only when payment / premium features are enabled (`United States [to confirm]`).
  **Terms additions:** OrenjiTrade is a discovery and messaging venue, not a party to trades, sales
  or meetings; collectors are responsible for their own trades and meetings (pointer to "Trading
  safely"); the limitation of liability stays qualified by "to the extent permitted by law" and
  never limits what consumer protection law forbids; no arbitration clause, class-action waiver or
  bodily-injury exclusion. Community Guidelines "Meet and trade safely" aligned. `LAST_UPDATED`
  2026-10-05; `legal_document` versions stay `2026-09-01` (pre-launch drafts, zero users).
- [x] **Tests.** API: `ConsentIT` (+2: language recorded / English by default / idempotent across
  languages / admin detail, 400 for an unsupported code), `ConsentServiceTest` (+1), re-export of
  the OpenAPI and regeneration of the clients (`language?:` optional), `npm run test:mobile` green
  against them (416 tests). Web: `legal-language.service.spec.ts` (5), `legal-content.fr.spec.ts`
  (5: parity, placeholders, Law 25 vocabulary, notice without legal content, typography),
  `legal-page.component.spec.ts` (9 keys, French rendering, EN/FR toggle persisted, `?lang`),
  `trading-safety-notice.component.spec.ts` (4), `session.service.spec.ts` (language on consents);
  `npm run test:web` 662 green + lint + Prettier. E2E `launch-safety.spec.ts`: sign up with the
  checkbox → discoverable from onboarding (API confirms, consents exported with `language: en`)
  → first conversation from a profile shows the notice (link, Report and Block dialogs, keyboard
  dismiss, hidden after reload, messaging never blocked) → Block / Unblock from the profile;
  legal pages French by default for a `fr-CA` browser, EN/FR switch remembered, `?lang=fr`, index
  and the new page in both languages, footer link. Full `npm run test:e2e`: 71 passed after fixing
  the acceptance registration spec, which part 1 had left without the 18+ checkbox step.
- **Docs:** `docs/database/schema.md` (V104, `user_consent.language`),
  `docs/api/contracts/phase1-auth-users.md`, `docs/product/product-overview.md`,
  `docs/security/README.md` (privacy officer named in the policy, consents evidence).
- **Follow-ups:** the mobile app (French legal texts, the "Trading safely" page, the safety
  notice, `language` on its consents, Block on its profile) is done in mobile stage M8
  (2026-10-06, same branch; see "Mobile app (stage M8)"); the `[to confirm]` placeholders
  for the owner / lawyer (privacy officer name, title and postal address; data locations of
  Firebase Authentication, FCM, Cloudflare and Stripe; Google Cloud region at launch; log
  retention; governing law and venue; cookie consent requirement; effective dates); the French
  translation itself awaits the lawyer's validation.

### Full UI translation (French) — assessment, not implemented

- **Today:** no i18n scaffolding in either client. Web: no `@angular/localize`, `$localize`,
  `i18n` attributes, Transloco or ngx-translate; `angular.json` has no i18n block; `index.html` is
  `lang="en"`; `LOCALE_ID` is only read by `relative-time.pipe.ts`; ~20 `Intl` / `toLocale*` calls
  hard-code `en-CA`. Mobile: no i18next / expo-localization; 8 `Intl` calls with `en-CA`. The legal
  texts are the only translated surface (runtime switch, this stage). The launch-stage strings
  around them are English-only and belong to the first batch of the follow-up: the safety notice
  copy and its Report / Block / Dismiss labels (`trading-safety-notice.component.ts`; two strings
  keyed by context, cheap to switch on `LegalLanguageService` once a UI language exists), the
  onboarding age step (`onboarding-page.component.html`), the consent list wording ("I have read
  and accept the", `legal-consent-list.component.ts`) and the `legal_document.title` row "Age
  confirmation (18 years or older)" (V103, shown in admin and `requiredConsents`). The 18+
  checkbox label and its validation message (`age-confirmation-checkbox.component.ts`) are already
  shown in both languages.
- **User-facing strings (heuristic count of template text nodes, static attributes and TS string
  literals, ± 20 %):** web `features/` ≈ 4,000 across 300 files — admin 1,650 (100 files), inventory
  330, settings 290, legal 190 (the texts), trades 185, auth 140, map 120, messages 120, search 110,
  wishlist 105, collectors 105, catalog 95, community 95, premium 90, offers 85, checkout 65, credits
  60, support 45, binders 40, disputes 40, onboarding 30, notifications 30; `shared/` ≈ 810 (116
  files); `core/` ≈ 210 (mostly `api-error-messages.ts`). Total ≈ 5,000, of which ≈ 3,200 are
  consumer-facing (excluding the admin console and the legal texts). Mobile ≈ 1,400 (≈ 1,100 without
  the legal texts): `app/` routes 400, `src/features` 475, `src/api` error / status messages 130.
- **Recommendation: a runtime translation library (Transloco on the web, i18next +
  expo-localization on mobile) with shared JSON catalogs in `packages/i18n`**, rather than the
  built-in `@angular/localize`. Built-in i18n gives compile-time extraction and zero runtime cost
  but produces one build per locale (two deployables or a locale-prefixed nginx layout), switches
  language only by reload, needs `$localize` for every TS string (error messages, snack bars,
  dialogs — ≈ 1,000 literals here), and shares nothing with the React Native app. A runtime library
  keeps one bundle, switches instantly (the legal pages already do), lazy-loads a JSON scope per
  feature, and lets the mobile app load the same `common`, `errors`, `inventory`, … namespaces,
  which halves the translation and review work. Costs: a small runtime (~15 kB), keys instead of
  inline English (a typed key helper mitigates typos), and `Intl` locale plumbing (`fr-CA` dates,
  numbers, currency). Either way Angular Material's own strings (`MatPaginatorIntl`, datepicker)
  need a French provider, and the server-sent `message` / `errorCode` wording stays English on the
  API (clients already map `errorCode` → local text, so translating `api-error-messages.ts` covers
  it).
- **Effort (one developer, rough):** web scaffolding + extraction tooling 1 week; consumer-facing
  web strings ≈ 3,200 → 3–4 weeks of keying and French copy (legal pages excluded, already done);
  admin console ≈ 1,650 → 2 weeks (can lag: staff-only); mobile ≈ 1,100 → 2 weeks after the web
  catalogs exist; professional French review of the whole catalog ≈ 1 week; QA (both languages,
  pseudo-locale pass, screenshots) 1 week. About 9–11 weeks web + mobile, 6–7 weeks for the
  consumer-facing web only. Recorded as a follow-up in NEXT TASK; not started.

## Launch readiness, parts 4 and 5 — launch configuration and Law 25 operating docs (2026-10-05)

_Branch `feature/launch-readiness`, on top of parts 1–3 (builder, workflow `launch-readiness`).
Owner decision: launch as **discovery + messaging only** with every money feature switched off;
operating documents for Quebec Law 25 and incidents; the full French UI translation assessed and
recorded as the next task, not built. Nothing deployed; cloud, Terraform, payments logic, Stripe,
credits logic and prices untouched._

- [x] **Flag inventory and launch values** (`docs/deployment/runbooks.md` section 12, "Launch
  configuration": one row per flag with what it switches on in the API and the web, why it is off,
  how a `SUPER_ADMIN` changes it in `/admin > Feature flags`, the prerequisites before switching a
  money feature on): `protectedPayments` off, `premiumPlans` off, `credits` off, `donations` off,
  `advertising` off, `mlScanning` off (owner hold), `publicChat` on. Section 6 ("Emergency
  feature-flag off") corrected on the way: real flag keys (`publicChat`, not
  `publicCommunityChannels`), `updated_by` is a uuid foreign key (the SQL set a string), the Redis
  key is `orenji:cache:feature-flags:v1` (not `rules:*`).
- [x] **Migration default risk and handling.** `V010__feature_flags.sql` created `premiumPlans`
  and `credits` **enabled**: a production database migrated from scratch would have shown "Upgrade
  to Premium" with a live checkout through the *fake* billing provider (`BILLING_PROVIDER` is
  `fake` unless configured; nobody would have paid) and the credits / referral ledger, until a
  super admin with MFA switched them off. Handling: **`V105__launch_money_flags_off.sql`** switches
  both rows off as data, respecting rows an admin already edited (`updated_by IS NOT NULL`);
  `FeatureFlagSeedContributor` (local/dev only) now re-enables `protectedPayments`, `premiumPlans`,
  `credits`, `advertising` and `donations` so development and both E2E suites keep exercising the
  fake-provider flows; V010 untouched. Staging/prod never run the seed and start with every money
  feature off. Not chosen: editing V010, a manual post-deploy step alone, constants in code.
- [x] **Gaps fixed.** API: the daily-limit SYSTEM notification (`NotificationService.limitNotice`)
  only carries the "upgrade to Premium" sentence, `upgradeUrl` and the `/premium` deep link while
  `premiumPlans` is on for the recipient (otherwise "The limit resets tomorrow.", no link). Web:
  `wishlist-summary` ("Need more room? See Premium"), `map-filters-bar` ("Up to N km on your plan",
  now a plain `<span>` with `data-testid="radius-cap"` while the flag is off), the public binder
  page's daily-views limit state ("See plans" → "Back to the map"), the generic `LIMIT_REACHED`
  message and the offer-limit problem (no "Premium raises it"), and `notificationLink` (a plan-limit
  notice opens `/wishlist` or `/notifications` unless the API offered `/premium`). Verified already
  gated before this stage: route guards (`/credits`, `/support`, `/community`, `/settings/payouts`),
  the account menu, the footer, `/premium` ("Premium is not available yet", no Upgrade button), the
  limit dialog's "See Premium", the sponsored slots, the make-offer dialog's "Use payment
  protection", the trade page's Pay / Ship / Confirm / Dispute (by trade state; an accepted offer
  opens `AGREED` when the flag is off for the buyer), and every money service in the API
  (`PaymentFeature`, `SubscriptionService.checkout`, `FakeBillingController`, `CreditLedger`,
  `ReferralService`, `DonationService`, `DonationWebhookService`, `AdService`,
  `CommunityService.requireFeature`).
- [x] **Ungated by design (documented in the runbook):** `GET /plans` (public plan list with
  prices) and `GET /me/plan` (the mobile app reads the map radius cap from both; `upgradeUrl` is
  data), the `429 LIMIT_REACHED` Problem Details' `upgradeUrl`, `POST /me/subscription/cancel`
  and the billing webhook (a live subscription stays manageable), every `/admin/**` console.
  `mlScanning` has no consumer anywhere (nothing to gate; the hold stands).
- [x] **Tests.** API: `LaunchConfigurationIT` (3: the public map shows the six money flags off and
  `publicChat` on; with all six off a seller and a buyer are found on the map, list a card and a
  public binder, wish, message, make a cash offer — a protection request is refused
  `404 FEATURE_DISABLED protectedPayments` — accept it into an `AGREED` trade with no payment and
  `/pay` refused, complete it in person, rate and report, while `/plans` and `/me/plan` stay
  readable; every subscription, credits, referral, donation and seller-account route refuses with
  the Problem Details (`errorCode`, `feature`, `requestId`) and `GET /ads` answers `[]`);
  `FeatureFlagsIT` (migration state now `premiumPlans=false`, `credits=false`; the seed enables
  all five fake-provider flags); `NotificationLimitIT` (+1: no Premium pitch and no deep link while
  the flag is off, the pitch and `/premium` while on); `AbstractPhase10IT` switches `premiumPlans`
  and `credits` on before each Phase 10 test and every money flag off afterwards;
  `GeoPrivacyContractTest` enables the four flags it reads through. Already covering the refusals:
  `billing/Phase10FeatureFlagOffIT`, `payments/FeatureFlagOffIT`,
  `offers/OfferAuthorizationIT.paymentProtectionNeedsItsFlagAndACashPart`, `community/CommunityIT`.
  Web (Vitest): `wishlist-summary.component.spec.ts` (3), `map-filters-bar.component.spec.ts` (3),
  `public-binder-page.component.spec.ts` (2, the 429 limit state with and without Premium),
  `footer.component.spec.ts` (2), `notification-kinds.spec.ts` (links updated). E2E:
  `e2e/launch-config.spec.ts` in its own Playwright project `launch-config` (`dependencies:
  ['chromium']`, so it runs alone after every other spec because it switches the real flags of
  the E2E stack through the admin API and restores them): map radius cap as text, no sponsored
  slot, account menu and footer without Premium / Credits / Support, `/premium` without Upgrade,
  `/credits`, `/support`, `/settings/payouts` redirect with "… is not available right now.", an
  offer without the protection checkbox, the agreed trade with the safety notice and no Pay
  button, the money routes' `404 FEATURE_DISABLED`, `GET /ads` empty. Run it alone with
  `npm run test:e2e -- e2e/launch-config.spec.ts --no-deps`. Fixed on the way: the E2E helpers
  (`e2e/support/stack.ts` `apiConfirmAge`, `e2e/acceptance/support/api.ts` `collector()`) read
  the public document list with the collector's token — anonymously, every worker shared the
  per-IP budget (`RATE_LIMIT_ANONYMOUS_PER_MINUTE`, 60/min) and a fast full run failed seven
  collector-heavy specs with `429`. Results (2026-10-05): `npm run test:api` 162 classes /
  797 tests, 0 failures (6 min); `npm run test:web` lint clean, 139 files / 672 tests;
  `npm run test:mobile` typecheck + lint + 416 jest tests; `npm run test:e2e` 72 specs: 71 passed,
  1 flaky (`acceptance/search.spec.ts`, unrelated, passed on its retry), `launch-config` passed
  after `chromium`; `./gradlew exportOpenApi` + `npm run generate:api` left `docs/api/openapi.json`
  and the generated clients unchanged (no contract change in this stage).
- [x] **Operating docs (Law 25, incidents, authorities, owner accounts)**, linked from
  `docs/security/README.md` section 11: `docs/security/confidentiality-incident-register.md`
  (register template with date, description, data and people affected, risk-of-serious-injury
  assessment, notifications, measures; the procedure contain → assess → notify the Commission
  d'accès à l'information and the people concerned when there is a risk of serious injury →
  record every incident even when not notified → follow up; a fictional example entry),
  `docs/security/law-enforcement-requests.md` (valid legal process only, documented emergency
  involving a risk to life, verification, minimum disclosure, precise locations never exported
  unless specifically compelled, request log template, preservation requests),
  `docs/security/owner-account-security-checklist.md` (two-factor sign-in on the Google /
  Firebase, GitHub, Cloudflare + registrar, Stripe, mailbox and future store accounts; the
  **actual** `orenji.security.admin.require-mfa` per Spring profile read from `application.yml`:
  `true` in the base document hence in `dev`, `staging`, `prod`, `false` under `local` and `test`,
  `false` for a JVM with no profile because `spring.profiles.default: local`; the code checks the
  presence of `firebase.sign_in_second_factor` only, no freshness window). README section 7
  corrected accordingly (it claimed a 12-hour `auth_time` check that does not exist).
  `docs/product/product-overview.md` gained "Launch without payments"; `docs/database/schema.md`
  and `docs/development/seed-data.md` describe V105 and the seed.
- **Findings reported, not fixed (out of scope):** Terraform sets `SPRING_PROFILES_ACTIVE` to
  `development` / `production` while `application.yml` declares `dev` / `prod`, so in cloud dev
  and prod only the base document applies (`require-mfa` stays `true`, but the `prod` overrides
  and the staging/prod `ServiceTokenStartupValidator` would not run) — align before any deploy;
  no second-factor freshness check; the account-deletion job has no legal hold for preservation
  requests; the mobile app's `src/api/errorMessages.ts` `LIMIT_REACHED` wording still says
  "Premium raises it" and its notification deep-link handling is untouched (mobile follow-up).
- **`[to confirm]` placeholders for the owner / lawyer (this stage):** Privacy Officer name,
  title and postal address (also in the policies); the lawyer who reviews the three operating docs
  and the notices; the CAI notification form / address; the register retention period (at least
  five years assumed); the internal notification timelines (3 working days assumed); the policy
  on telling a user about a disclosure; the handling of foreign authorities; the preservation
  period; whether the Google account is a Workspace organisation; the domain registrar if not
  Cloudflare; the Stripe account (none until payments are switched on); the mailbox provider for
  `privacy@` / `security@` / `no-reply@`; Apple / Google Play / Expo accounts (none yet); the
  password-manager emergency access; the date of the first quarterly review.

### Full UI translation (French) — plan (next task)

The assessment is in "Launch readiness, parts 2 and 3" ("Full UI translation (French) —
assessment, not implemented"): no i18n scaffolding in either client; ≈ 5,000 user-facing web
strings (≈ 3,200 consumer-facing, admin ≈ 1,650, legal texts 190 already bilingual) and ≈ 1,400
mobile strings; recommendation **runtime translation library** (Transloco on the web, i18next +
`expo-localization` on mobile) with shared JSON catalogs in `packages/i18n`, rather than
`@angular/localize` (one build per locale, reload to switch, `$localize` for ≈ 1,000 TS literals,
nothing shared with React Native); effort ≈ 9–11 weeks web + mobile, 6–7 weeks consumer web
only. The plan as the exact next task is in NEXT TASK.

## Platform regions and the self-declared location (stage S1, ADR 0017, 2026-10-08)

_Branch `feature/regions-geography` (from `main` at `7420905`, V105). Stage S1 of the owner's
2026-10-08 product change (six stages, one PR each): spec sections 1 and 3 plus everything the
removal of coordinates forces elsewhere. Builder done; not pushed (the ship step pushes)._

**Decision.** OrenjiTrade stops handling positions: no coordinates, distances, radii, GPS, IP
geolocation, geocoding or map provider anywhere ([ADR 0017](docs/architecture/adr/0017-platform-regions-instead-of-geolocation.md),
supersedes ADR 0004, amends ADR 0010). Collectors declare a country, an ISO 3166-2 state or
province and an optional city; discovery is scoped to a platform region (`americas-north`
default, `americas-south`, `europe`).

- [x] **Regions model** — V106 (`platform_region`, `country`, `subdivision`), V107 (3 regions, 104
  countries, 1,259 subdivisions, generated by `scripts/regions/build.mjs` from Natural Earth
  5.1.1 with mapshaper 0.7.59; provenance in `docs/development/regions-boundaries.md`).
  `RegionCatalog` (Redis `regions:v1` 60 s + 10 s memo), `GET /api/v1/regions` (public),
  `PUT /api/v1/admin/regions/countries/{code}` (ADMIN, audited `region.country.update`), web
  `/admin/regions`. Tests: RegionsIT, LocationIT, `scripts/lib/regions.test.mjs`.
- [x] **Self-declared location** — V108 drops the old `user_location` (centre, radius, public
  point, label, grid cell, GiST index) and `privacy_settings.show_distance`, recreates
  `user_location(country_code, subdivision_code, city ≤ 80, show_city)`; every collector becomes
  not discoverable until they declare a location (seed accounts get theirs back from
  `db/seed/locations.json`). `GET/PUT/DELETE /api/v1/me/location` (unknown codes 400; city
  moderated, never geocoded); discoverable needs a location (409 `LOCATION_REQUIRED`); `GET /me`
  gains `homeRegion` (users SPI `HomeRegionProvider`) and `onboarding.locationSet`.
  Removed: `ApproximateLocationService`, `StaticRegionGeocoder`, `LOCATION_JITTER_SECRET` (code,
  `.env.example`, CI, Terraform), `DistanceBucket`, the radius logic, `/collectors/nearby` and
  the collector preview.
- [x] **Region-scoped discovery** — `region` on `/search`, `/search/suggest`,
  `/search/card-holders`, `/ads`; the map's `GET /regions/{region}/binder-counts` and
  `GET /regions/{region}/subdivisions/{code}/binders` (cursor pages); `DiscoveryCache`
  (`orenji:cache:discovery:*`). Holders sort `freshness` / `price`. Every collector block
  carries `place` (state or province + country); the city appears only on its owner's profile
  while shown.
- [x] **Forced elsewhere** — wishlist matcher compares platform regions (V109 drops
  `wishlist_item.radius_km`, `wishlist_match.distance_bucket`, the matches and match alerts);
  analytics carry `region_code` / `subdivision_code` (BigQuery schema too; `city`, `distance*`,
  `radius*`, `grid_cell`, `geo_cell` refused); ads target `REGION` / `COUNTRY` / `SUBDIVISION`
  (V109); community: one REGION channel per platform region, the city channels archived (V110),
  the admin channel endpoints refuse a non-region label; the `map.radius.max_km` limit, its
  entitlements, the `map_radius_day` credit product and the "wider map" copy are gone.
- [x] **Privacy contract** — `GeoPrivacyContractTest` signs in as every seed account (and signed
  out) over every public and member surface: no coordinate / distance / radius key, no number with
  more than 3 decimals, no "km away", each city only on its owner's profile, nothing
  coordinate-like in the logs. Web acceptance PrivacyScanner and the mobile Playwright privacy
  fixture fail on the same keys and on any map provider request.
- [x] **Web** — region switcher top left (signed in: home region; signed out: `localStorage`,
  else `americas-north`; every scoped call sends `region`); onboarding "Where are you?" and
  Settings → Location (`LocationFieldsComponent`), a gentle prompt; `/map` is one Leaflet vector
  map of the bundled boundaries (lazy per region, no tiles), states shaded by binder counts, an
  accessible state list, a state panel with cursor pages, skeleton, empty state, error with
  retry and `/map?region=&subdivision=`. Removed: Google Maps and its adapter, the `MapAdapter`
  abstraction, markers, the preview, the trading-area picker, city presets, distance and
  approximate-area wording. Initial bundle 899.83 kB (900 kB warning budget); Leaflet in the
  lazy `leaflet-src` chunk.
- [x] **Mobile (Expo SDK 57)** — location step and Settings → Location with pickers fed by
  `GET /regions`; region-scoped calls send the home region (default `americas-north`); no
  distance text anywhere; the Map tab is a placeholder (names the home region, leads to search);
  `expo-location` removed (package, plugin, permission strings); `react-native-maps` stays
  installed (plugin without a key); persisted store v4 drops the distance unit.
- [x] **Seeds** — the 12 seed accounts are spread over the three regions
  (`docs/development/test-accounts.md`); the deck-box ad targets Quebec. The fictional bios,
  binder descriptions and community posts name no city (the city is a location field, shown only
  on its owner's profile).
- [x] **Infra** — nginx CSP without map or tile hosts, `Permissions-Policy: geolocation=()`;
  Cloudflare's edge rate limit covers `/api/v1/regions` instead of the removed nearby route.
- [x] **Docs** — ADR 0017 (new), ADR 0004 superseded, ADR 0010 and 0016 amended, ADR index,
  CLAUDE.md (privacy rule, Maps row), README, local setup, test accounts, seed data, schema,
  API README + `docs/api/contracts/s1-regions-location.md` (phase contracts point to it),
  architecture, product overview, deployment, security, incident register, law-enforcement
  guide; legal drafts (EN and FR, still drafts) no longer mention map tiles; `npm run sync:legal`.

**Verification fixes (2026-10-08, after the independent functional check and privacy audit):**
- The web `index.html` meta description (search engines, link previews) said "geographic
  discovery network ... find who near you owns"; it now says "regional discovery network ... find
  who in your region owns" (privacy audit's blocking item). The OpenAPI description follows.
- Each binder row of a state panel shows its owner's state/province + country (`owner.place`),
  not only the panel heading.
- Tests added: `RegionCatalogTest` (7) and `LocationServiceTest` (11), pure unit tests of the
  region, country, subdivision and city validation; `RegionMapIT` covers paused listings and
  suspended accounts in the counts and the state list, signed in and signed out;
  `region-switcher.component.spec.ts` (3). Notification fixtures of web and mobile specs no
  longer carry "km away" texts; the mobile onboarding age specs wait for the checkbox (a
  skeleton shows while the legal documents load).
- Docs: `.env.example` drops `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`; the web README drops the Maps key
  of `config.json`; `schema.md` (`discoverable`), the billing-budget README (no Maps quota), ADR
  0002 (amended, links ADR 0017) and the API README (reserved `nearby` handle) are current; the
  region-map caching is described as it is (server side only, `Cache-Control: no-cache,
  no-store`); unknown request fields such as an old client's `lat`/`lng` are documented as ignored
  and never stored (the repo's Jackson convention; `user_location` has no column for them).
- Mobile: the hint under "Show my city on my profile" follows the switch (it always said others
  only see the state or province, also while the city is shown on the profile).
- Seeds: no fictional bio, binder description or community post names a city any more.
- Test stability: cloned test printings carry the whole random token in their collector number
  (three letters collided once across a full run).
- The discoverability hints: both now name Settings → Privacy (verification fix 2; the mobile app
  also shows the switch in Settings → Location).

**Owner decisions to confirm (S1 defaults):** Europe excludes Russia, Turkey and the Caucasus
(Armenia, Azerbaijan, Georgia); Greenland is not in Americas (North); the country outlines are
dissolved from Natural Earth admin-1 (not admin-0), so a country and its states always line up;
the V110 region channel descriptions read "trades, meetups, locals" (wording only; no events feature). All are
data (admin-editable country mapping, channel texts) and can change without code.

**Migrations:** V106 `platform_regions`, V107 `platform_regions_seed`, V108
`self_declared_location`, V109 `remove_distance_features`, V110 `platform_region_channels`,
V111 `region_model_comments` (database comment only, added by the second verification fix).
The owner's local database migrates on the next `npm run dev` and **loses its trading areas by
design** (every collector declares a location again).

**Checks (2026-10-08, re-run after verification fix 2 on the final code):**
- `./gradlew exportOpenApi --rerun` then `npm run generate:api`: the working tree stays clean.
- `npm run test:api` (Spotless + `check`): 800 tests in 161 classes plus 12 in the separate
  `catalogTest` task (the catalog fixture suites run in their own JVM), 0 failures, 0 skipped.
- `npm run test:web`: lint clean, 138 files / 637 tests. `npm run build -w apps/web-angular`:
  initial 899.96 kB (214.54 kB transfer) against the 900 kB warning budget (1.5 MB error), no
  warning; Leaflet in the lazy `leaflet-src` chunk (149.42 kB); the boundary files
  (`public/boundaries/*.json`, 241 / 145 / 316 kB) are fetched per region, never bundled.
- `npm run test:e2e`: 73 passed, 0 skipped, 0 flaky (every spec, isolated stack :8180 / :4300).
  A first full run had one flaky spec (`acceptance/search.spec.ts`: its passive response
  listener lost a body after the page navigated); fixed in `3bf3e61` (search and privacy specs
  read the answers with `waitForResponse` before navigating), then the whole suite re-run. That
  read still failed under load (verification fix 3): since then `npm run test:e2e -- --retries=0`
  twice in a row, 73 passed each, 0 failed, 0 flaky, 0 skipped.
- `npm run test:mobile`: typecheck, lint, 76 suites / 648 jest tests, 28 harness guard tests.
  `npx expo export --platform android` (Hermes bundle 5.2 MB) and `--platform web` (74 static
  routes) succeed (output in the session scratchpad); neither carries a map provider URL, a
  location API or the old "near them" wording.
- `npm run test:mobile:e2e`: 51 passed, 0 skipped. Maestro on the Pixel_6_API_34 emulator
  (Android 14, Expo Go, SDK 57, cold boot): 24/24 flows in one full run (48 min 46 s of flows,
  50 min 17 s in all) after the last mobile source change; a manual walk (sign-in of a fictional
  emulator account, onboarding → "Where are you?" with Canada → Quebec and a city, the
  discoverability hint naming Settings → Privacy → Map tab placeholder → the Terms in English and
  French with the "in their region" / "dans leur région" clause) with adb screenshots, the saved
  place confirmed on the API, logcat, Metro and the API log without errors, tokens, coordinates
  or the city; the walk account deleted, Metro, the API and the emulator shut down afterwards.
- `npm run infra:validate` (fmt + validate of dev / staging / prod and Cloudflare),
  `npm run audit:gate` (OK; the two allow-listed advisories unchanged), `npm run test:scripts`
  (64/64), `node scripts/sync-legal.mjs --check` in `apps/mobile` (up to date); there is no
  `i18n:check` script and no root `scripts/sync-legal.mjs`.
- Fresh database (`orenjitrade_e2e`, recreated and migrated to V111 by the last E2E run): no
  geometry or geography column, no column named like point / lat / lng / latitude / longitude /
  radius / grid_cell / geo_cell / distance and no GiST index outside PostGIS's own tables (now
  also asserted by `FlywayMigrationIT`); `user_location` = user_id, country_code,
  subdivision_code, city, show_city, created_at, updated_at; PostGIS 3.5.2 still installed; 3
  regions, 104 countries (39 / 14 / 51), 1,259 subdivisions; the `rating_summary` comment is the
  V111 one. The owner's database `orenjitrade` is still at V105 (not migrated by this work).
- Earlier live checks (first verification round, API :8480, Redis db 5): region map answers
  carry `Cache-Control: no-cache, no-store, max-age=0, must-revalidate`; binder counts
  americas-north CA-ON 1 / CA-QC 2 / US-CA 1, americas-south AR-C 1 / BR-SP 1, europe ES-MD 1 /
  FR-IDF 1; state-list rows carry `owner.place` without a city; `sort=distance` 400; unknown
  region 404.

**Removed settings and perks:** the `showDistance` privacy switch; the trading area (centre,
radius, device location); the wishlist radius; the `map.radius.max_km` plan limit (FREE 25 /
PREMIUM 100), its entitlements and the `map_radius_day` credit product ("Wider map for a day");
the Premium "wider map radius" copy; `LOCATION_JITTER_SECRET`, `GOOGLE_MAPS_API_KEY` /
`GOOGLE_MAPS_MAP_ID` (web) and `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (mobile); the city community
channels (archived).

**Mobile follow-ups (not in S1, owner spec section 7; record of what the app still lacks):**
1. **Done in mobile stage M9 (2026-10-12).** A region switcher on mobile (the app browsed the
   collector's home region, else `americas-north`).
2. **Done in mobile stage M9 (2026-10-12).** The state/province binder list (the web's `/map`
   panel: `GET /regions/{region}/binder-counts` and
   `GET /regions/{region}/subdivisions/{code}/binders`) and the boundary map in the Map tab (the
   same boundaries, drawn with `react-native-svg` from a projected copy of the bundled GeoJSON,
   not with `react-native-maps` polygons or a WebView).
3. The printing picker of the card page (S3: "Any printing", per-printing rows with rarity and
   holder counts, rarity/set/edition/language filters).
4. The have/want lists of the card page ("Who has it" / "Who wants it", S3 section 2b) and
   "Wanted by N" on inventory items.
5. **Done in mobile stage M9 (2026-10-12).** Remove `react-native-maps` once the Map tab no
   longer needs it (kept installed in S1 by the owner's instruction), and `react-native-webview`
   if nothing else needs it (the Leaflet page was its only user); the app's `leaflet` dependency
   went with them.
6. The wishlist matches screens are interim until S2 removes matches.

**Known gaps:**
- Mobile: the Map tab did not draw the boundary map and there was no region switcher (the home
  region was browsed). Closed by mobile stage M9 (2026-10-12), see "Mobile app: regions and the
  region map".
- The web initial bundle is 0.04 kB under its 900 kB warning budget (899.96 kB; the legal texts
  are part of the initial bundle): the next feature on the initial path needs a deferral (for
  example lazy legal texts) or a budget decision.
- `card-images.spec.ts` (picture loading) timed out once under the parallel load of a full run
  and passed on retry and in the final run; not related to S1, watch for it.
- Region-scoped answers list the whole platform region: specs isolate by region, handle or item,
  and wishlist matching can pair collectors far apart in a large state or across a region.
- Region-map answers are cached server side only (Redis discovery cache, 60 s); like `/meta`,
  `/cards` and `/search` they carry `Cache-Control: no-cache, no-store`, so no browser or CDN
  stores them. Edge caching of the anonymous answers would be a separate change (a `public`
  header on anonymous answers plus a Cloudflare cache rule).
- The admin channel list still shows the raw region code of REGION channels (admin-only).
- `PUT /me/location` ignores unknown body properties (such as `lat` / `lng`) and
  `GET /search/card-holders` ignores unknown query parameters, like every other endpoint of the
  repo (Jackson's unknown-property default); nothing can be stored because no such column exists,
  and `sort=distance` is a 400.
- `search_performed` / `search_no_results` analytics events still carry the raw query text (as
  on `main`; not a declared place). S3's search-history rule ("never in analytics beyond counts")
  reduces it.
- The seed's Americas (South) shades two states (AR-C, BR-SP): collector6's only public binder
  (CL-RM) is 50 days unconfirmed on purpose (the seed's example of a listing HIDDEN until
  confirmed, `docs/development/seed-data.md`) and stays off the map.
- The passive network scanners of the web E2E suite (the acceptance privacy fixture,
  `watchCoordinates`, the card-images provider guard) read every JSON answer from Chromium's
  DevTools buffer and skip a body Chromium no longer holds (the cause of verification fix 3):
  they are a safety net beside the specs' recorded answers, the scanned API shortcut answers and
  the API's `GeoPrivacyContractTest`. Routing every answer through `route.fetch()` would make
  them complete; not done in S1.
- The discoverable switch keeps its "Show me on the map" label (the owner's existing wording):
  the map lists the public binders of discoverable collectors per state, and the help text says
  what is shown (state or province, public binders, searches).
- The Cloudflare README documents an optional edge WAF rule on `/admin` by
  `ip.geoip.country` (predates S1, edge-only, never reaches collector data): an accepted exception
  for the owner to confirm against the "no IP geolocation" rule.

**Verification fix 2 (2026-10-08, after the second independent verification):**
- The Terms "What OrenjiTrade is and is not" clause no longer promises "who near them" (FR "qui,
  près d'eux"): "who in their region" / "qui, dans leur région", web drafts and the mobile copy
  (`sync:legal`), still drafts. The Terms location clause, the Trading safely "what we show" and
  "report and block" clauses and the Community Guidelines summary no longer put people on the
  map (binders appear on it); the block dialogs (web, mobile ×3) say the same. Guard tests in
  both languages: `legal-content.spec.ts` (web) and `legalLanguage.test.ts` (mobile).
- The mobile onboarding discoverability hint names Settings → Privacy like the web.
- V111 refreshes the last stale database comment (`rating_summary`, "nearby ranking");
  `FlywayMigrationIT` now proves on the migrated schema that no spatial-typed or coordinate-,
  radius-, grid- or distance-named column, no GiST index and no old-model comment remains.
- Stale docs: the root README (no maps key), `apps/mobile/README.md` (the privacy fixture),
  `docs/security/README.md` (no Maps browser key), the acceptance tracker rows 3, 18, 20, 28, 35
  and the older deployment / owner-step lines.

**Verification fix 3 (2026-10-08, the two blocking findings of the second verification):**
- Web E2E: `acceptance/privacy.spec.ts` ("every place-bearing surface ...") failed on its first
  attempt in every full run and passed on retry or alone. Its card-holders answer, read back with
  `waitForResponse` + `response.json()` (the `3bf3e61` approach), threw "Network.getResponseBody:
  No data found for resource with given identifier" although the page had rendered it and had
  not navigated: the body comes from Chromium's DevTools network buffer, which does not keep
  every fetch body under load. New `e2e/acceptance/support/answers.ts` `recordAnswers(page, url)`
  records the answers in a page route (`route.fetch()` of the page's own request, parsed, then
  `route.fulfill()` with that very answer), before the page can render them. The privacy spec
  (state binder list and card holders) and the search spec (card holders) use it with the same
  assertions; no other spec asserts on the body of a page answer (the others read
  APIRequestContext answers or only statuses).
- Messages empty state (web conversation list, mobile inbox): "Find a card or a binder in search,
  open the collector's profile and press Message to start trading." instead of "Open a
  collector's preview on the map ..."; the mobile action is "Open search" (Search tab) instead of
  "Open the map" (the placeholder Map tab). Unit tests assert the text, no map / preview / near
  wording and the navigation.
- Wording sweep (web, mobile, API, Maestro, docs): the Blocked users descriptions (web, mobile)
  now say what the block dialogs say (each other's binders, profiles and posts); a web
  notification fixture no longer reads "Listed nearby"; the product overview, the launch runbook
  (section 12) and the design system no longer put collectors, markers or previews on the map.
  Remaining hits are the discoverable switch's own wording ("Show me on the map", "Visible on /
  Hidden from the map", "Not on the map", "to be shown on the map"), binders and cards that
  appear on the map, privacy assurances and test guards ("never a position or a distance",
  `assertNotVisible '.*km away.*'`), unrelated identifiers (`CollectorMarker` API schema,
  `markerTone`, read markers, map-marker icon names, the reserved handle "nearby", scroll and
  relative-time "distance", the subdivision code `HU-KM`), applied migrations (never edited)
  and history sections (ADR 0004, ADR 0010, the Phase 1/3/4/6 contracts, `schema.md` V005 and
  Phase 4). Two internal code comments still mention the removed collector preview
  (`MessagesPanelComponent.incoming`, mobile `BottomSheet`); not user-facing.
- Checks on the final code: `npm run test:e2e -- --retries=0` twice in a row (73 passed each,
  0 failed / flaky / skipped; privacy and search specs green on the first attempt both times),
  `npm run test:web` (lint clean, 138 files / 637 tests), `npm run test:mobile` (typecheck, lint,
  76 suites / 648 tests, 28 harness guard tests), `npm run test:mobile:e2e` (51 passed),
  `npm run format:check -w apps/mobile`. No Maestro flow asserts the changed texts; Maestro was
  not re-run.

## A simpler wishlist, wishlist alerts, no matches (stage S2, 2026-10-09)

_Branch `feature/regions-s2-wishlist` (from `feature/regions-geography`, S1, at `d02308a`;
`origin/main` had no commit the branch lacked). Stage S2 of the owner's 2026-10-08 product
change: spec section 4 in full. Contract: [`docs/api/contracts/s2-wishlist.md`](docs/api/contracts/s2-wishlist.md).
Builder done; not pushed (the ship step pushes)._

**What replaced matches (the spec's own default, for the owner to confirm):** no match is stored.
Wishes drive "Who wants it" and "Wanted by N" (stage S3, computed live from visible wishlists) and
a simple **wishlist alert**: when a collector of the wish owner's platform region lists a public
item that fits (card / printing / rarity, plus Near Mint or better when asked), the owner gets one
`WISHLIST_ALERT` — "<card> <code> <rarity> was just listed by @handle in <state>, <country>." —
that opens the card page with the wish's selection (`?printing=<id>`, `?rarity=` or, since review
fix 3, `?printing=any` for an "any printing" wish). One on/off switch
in the notification settings; one alert per collector and item (a sent-alert key); owners without
a location get none and the wishlist page asks them to set country and state.

- [x] **The wish** — only which copy (any printing; any printing of one rarity of the card's
  printings; one printing), a public note (first field, ≤ 280 code points, plain text,
  `TextModerationService` PROFILE scope), "Near Mint only" and at most one price term from the
  admin list (platform setting `wishlist.price_terms`, seeded `80% TCG, 85% TCG, 90% TCG,
  100% TCG, 100% TCG+`; `GET /wishlist/price-terms`; `GET|PUT /admin/wishlist/settings`, ADMIN,
  audited `wishlist.settings.update`; web `/admin/wishlist`). A term the list no longer offers
  stays on the wish that chose it. Removed from form, API, DTOs and database (V112, data dropped,
  private notes **not** copied into the public note): maximum price + currency, trade/buy
  preference, radius, private notes, language, minimum condition, edition, the per-wish alert
  switch, match counts. Old request members are **ignored** like every unknown member of the API
  (`spring.jackson` `fail-on-unknown-properties: false`, `PartialUpdate`) and never stored.
  One wish per selection (409; unique index `uq_wishlist_item_selection`); the plan limit
  `wishlist.items.max` (FREE 20 / PREMIUM 500) is kept.
- [x] **Market price** — `MarketPrice.source` (`YGOPRODECK` = `YgoProDeckMapper`'s `set_price`,
  TCGplayer-based USD, dated by the provider database's last update; `SAMPLE` = the fictional
  mock catalog, CAD; `CATALOG` = staff-entered). Web: "TCG market price" / "Sample market price" /
  "Market price" with the source and date in a tooltip; mobile: the same text as a hint. "85% TCG ≈
  21.25 USD" next to a term when the wish names one printing with a price, the term alone for any
  printing.
- [x] **Matches removed** — `wishlist_match` (V112), `WishlistMatchRepository`, `WishlistMatcher`,
  `WishlistMatchView`, `WishlistRules`, `TradePreference`, the matches and dismiss endpoints, match
  counts, `lastMatchedAt`, the nightly `wishlist-rematch` job (controller, local scheduler, Cloud
  Scheduler entry: 9 jobs now, ADR 0016 amended), `WishlistMatched` and the `wishlist_matched`
  analytics event, the WISHLIST_MATCH notifications and their limit notices (deleted by V112), the
  WISHLIST_MATCH preference category; web matches drawer, match cards, `WishlistMatchesStore`,
  match readiness, "With matches" / "Paused" filters, the summary's match stats, the per-wish
  "Match alerts" switch and `/wishlist/:id` (redirects to `/wishlist`); mobile matches screen
  (`app/wishlist/[id]`), `WishMatchCard`, filters, counts and the alert switch; their tests and
  docs.
- [x] **Wishlist alerts** — `WishlistAlerts` + `WishlistAlertRepository` on
  `InventoryItemPublished` (same rules as S1's matcher for visibility, freshness, region,
  discoverability, blocks and the wisher's account; plus the selection and Near Mint rules), the
  most specific fitting wish per collector, `wishlist_alert_sent (user_id, inventory_item_id)` and
  the notification dedup key `wishlist-alert:<user>:<item>`; `NotificationSettings.wishlistAlerts`
  (column `notification_preferences.wishlist_alerts`, default on: in-app + push following the
  master switches and quiet hours, never email); the daily limit `wishlist.alerts.per_day`
  (FREE 5) still applies ("More wishlist alerts are waiting").
- [x] **Printing picker** — `shared/catalog/printing-picker` (web), reusable by the card page in
  S3: "Any printing" first and default, every printing with its picture (API card-image URLs), set,
  code, rarity, edition, language, finish and market price (source tooltip); filters rarity / set /
  edition / language (shown only where printings differ), the rarity alone meaning any printing
  of that rarity; an optional `holderCounts` input (region collectors per printing, holders
  first) for S3; a native radio group (keyboard). It powers the wish dialog now.
- [x] **Web** — wish dialog (card autocomplete → public note → Near Mint only → terms → picker),
  wishlist page (picture, which copy, note, NM / % TCG chips, edit, remove; plan usage; "Let
  others see what you want" bound to `wishlistVisible`; the location prompt), Settings →
  Notifications "Wishlist alerts" switch, `/admin/wishlist`, the public "Looking for" (note and
  chips), alert deep links to the card page, the card page passes `?rarity=` to "Add to wishlist",
  wording without matches (bell, notifications, privacy option "Let others see what you want",
  admin, the privacy policy draft EN/FR "send wishlist alerts"). Initial bundle 899.92 kB
  (899.96 before; the now unused optional-param route matcher was removed).
- [x] **Mobile (Expo SDK 57)** — wish editor (note, Near Mint only, terms with amounts and the
  price source, a simple "Which copy" chooser: any printing / any printing of one rarity / each
  printing, each with its finish), Wishlist tab (same list as the web, the visibility switch, the
  location prompt), no
  matches screen, Settings → Notifications "Wishlist alerts", alerts open the card screen with
  `?printing=` / `?rarity=` (old `/wishlist/<id>` links open the list), "Looking for" with note
  and chips, legal texts synced.
- [x] **Seeds** — collector2's wishes carry a public note, Near Mint only and price terms;
  collector1's Near Mint Azure-Eyes listing alerts collector2 through the real pipeline.
- [x] **Docs** — new `docs/api/contracts/s2-wishlist.md`; Phase 6 / S1 contracts point to it;
  `schema.md`, API / web / mobile READMEs, ADR 0017 (amended), ADR 0016 (scheduler), ADR 0009,
  architecture, seed data, test accounts, local setup, product overview, CLAUDE.md wording,
  tracker rows 23–25.

**Migration:** V112 `simplified_wishlist` (drops `wishlist_match` and the removed columns; first
normalises the selection — a printing wish without `card_id` gets its printing's card, a rarity
stored next to a printing is cleared — and only then collapses the wishes that became equal to the
oldest (review fix 2: the reverse order failed the unique index); `card_id` NOT NULL; adds
`public_note`, `near_mint_only`, `price_term`, `wishlist_alert_sent`, `wishlist.price_terms`,
`notification_preferences.wishlist_alerts`; deletes WISHLIST_MATCH notifications and their limit
notices and the category key). Proven on a populated pre-V112 database by
`SimplifiedWishlistMigrationIT` (part of `npm run test:api`: Flyway builds a scratch database in
the Testcontainers server up to V111, fictional S1-model wishes — removed-filter duplicates,
(P, its rarity) next to (P, no rarity) and (P, another rarity), a printing wish without its card
next to the same printing with its card, an any-printing rarity wish, another collector's equal
wish — a match, notifications and preferences are inserted, V112 runs): the duplicates collapse to
the oldest, printing wishes lose their stray rarity, the card is filled in, the rarity wish keeps
its rarity, no private note leaks, the match table and the match notifications go, the MESSAGE
notification and the MESSAGE category stay; the scratch database is dropped. The owner's database
`orenjitrade` is not touched (still unmigrated). Review fix 3 edited V112 one last time before it
freezes at the merge (opt-outs carried over, paused wishes deleted, incomplete outbox rows
completed, more normalisation, the test widened to 10 cases): see "Review fix 3" below.

**Decisions:**
- "Near Mint only" accepts Near Mint **or better** (Mint), by the game's ordered conditions.
- One alert per collector and item, whatever the number of fitting wishes (the link uses the most
  specific wish); the sent-alert key is written even when the alert is switched off or over the
  daily limit, so a later republication never alerts about an item already decided.
- The one switch is a dedicated `wishlistAlerts` setting (in-app + push, never email) instead of
  a category row of the channel matrix, so the matrix and the switch never disagree.
- The nightly rematch job is removed rather than turned into an alert catch-up: alerts say "just
  listed", and the Spring Modulith registry already republishes an undelivered publication event.
- Price terms are stored as their label (`"85% TCG"`); the admin list holds labels whose format
  carries the percent and the "or more" flag, so a removed term still reads correctly.
- A rarity on a one-printing wish equal to the printing's is accepted and dropped, another one is
  400; "any printing of a rarity" must name a rarity of the card's printings.
- The public wishlist summary now lists every wish (there is no paused wish any more). **A wish
  its owner had paused under the old model is deleted by V112** (lead decision of 2026-10-10,
  review fix 3): a wish hidden on purpose must not become public and alerting, the spec says to
  drop data rather than migrate it, and only fictional data exists.
- An alert's link always says the wish's selection, "any printing" included
  (`/cards/<id>?printing=any`), and the card page then picks no printing (review fix 3). Stage S3
  makes "Any printing" the card page's default; the marker then names the default.
- A typed printing code is not a printing: the wish form preselects a printing only when exactly
  one printing of the card carries the code, otherwise it starts on "Any printing" with the
  picker narrowed to the code (review fix 3; spec section 2, "never a silent pick").
- V112 carries an alert opt-out over only when the old WISHLIST_MATCH category had both in-app
  and push off (the two channels the new alert uses); email alone never keeps alerts on, because
  wishlist alerts are never emailed.
- `PUT /me/settings/notifications` without `wishlistAlerts` keeps the stored switch (the rest of
  the body stays a full replacement).
- `CollectorDiscoveryService.markersFor` (only used by the old matches) is kept for S3's "Who
  wants it" rows.
- Mobile "Which copy" is a select sheet (any printing, one entry per rarity when the card has
  several, then every printing) rather than the web's full picker; the card page picker is S3.
- A wish's "which copy" label names the printing's finish when it is not Normal ("PFT-002 ·
  Common · Prismatic Frontier · Reverse holo"): two printings of a set often differ only by it.

**Known gaps:**
- "Who wants it" and "Wanted by N" are stage S3 (the spec puts them there); until then wishes are
  visible only on the owner's public profile when shown.
- The card page (web and mobile) shows "Any printing in <rarity>" for `?rarity=` (review fix 1)
  but no holders for it yet: "Find this card" with the shared picker and per-printing holder
  counts is S3.
- A staff-edited price on an imported printing still reports its provider as the source (the
  printing's `external_ref`); the next import overwrites it anyway.
- The web printings table ("Market price" column) and the mobile printing list ("Market
  42.00 CAD") still show prices without their source (the "Selected printing" price of the web
  and mobile card pages names it since review fix 1): S3 replaces them with the shared picker,
  which already labels the source.
- The web initial bundle is at 899.93 kB against the 900 kB warning budget (a 70-byte margin
  after review fix 3; 899.92 kB before): S3 has to make room (or the budget has to move, with a
  reason) before it adds to the initial chunks.
- `BinderIT.countsFollowTheItemsAndTheOwnersSettings` can fail with PostgreSQL's "deadlock
  detected" (the binder-count trigger against the listing reconciler after a privacy change;
  inventory code that S2 does not touch, the same on `main`). It is fixed on its own branch;
  until that merges, a full `npm run test:api` can fail once on it and pass on the rerun.
- The native Maestro suite was last run on the code of review fix 1. It was **not** re-run after
  the round-2 polish (`be24294`) nor after review fix 3: the Mac has no Android SDK or emulator,
  and an iOS path for the harness is the next task.
- A wishlist alert names the printing code and rarity but not the edition, and two copies of one
  printing listed by one collector give two alerts that read the same (one alert per item):
  naming the edition or grouping them is for S3.
- The mobile "Add a card" (inventory) flow still preselects the first printing of a typed code
  in its visible printing step; S3 reworks that step ("the add dialog asks the user to pick
  one").
- The web header search still shows one row for a printing code that several printings share and
  opens the card on the first of them (`?printing=<id>`); "Add to wishlist" from that page then
  starts on that printing. The page and the dialog both name the printing, but the pick was not
  the collector's: this is the card search of spec section 2 (S3). Review fix 3 removed the
  silent pick from the wish form only.
- On the web at 375 px, the notice that a shared code picked no printing ("2 printings share the
  code ...") sits below the fold of the wish dialog while "Add to wishlist" stays in view; the
  wish saved is the safe one (any printing). S3 places the picker.
- A full wishlist (20 of 20) still opens the whole add form and refuses only at save.
- Small leftovers of the round-3 product/UX verification, for S3 (it reworks these components):
  the "Printing code" chip is clipped at 375 px for long card names; "Retry" for the price terms
  drops keyboard focus to the page; closing the wish dialog during a save that is then refused
  logs an `NG0911` console error (and a double activation within about 80 ms sends two POSTs,
  201 then 409); the shared-code hint counts printings a filter hides; the mobile suggestion chip
  still says "Printing"; with six entries the bell menu's two footer actions are below its fold;
  a multi-line note opens scrolled to its last line in the edit dialog.
- `wishlist_alert_sent` rows are kept until the account or the item goes (no time-based purge;
  the table is small: one row per collector and listing alerted).
- Mobile follow-ups: the full printing picker on the card screen with holder counts (S3), "Who
  wants it" and "Wanted by N" (S3); the S1 follow-ups (map, region switcher) remained until
  mobile stage M9 (2026-10-12).

**Native check (Android emulator; the adb walk found one label bug):** while
walking the changed screens, the mobile "Which copy" chooser showed Emberfang Fox's two PFT-002
printings (normal and reverse holo) as two identical lines. Fixed in `f9405e1`: the chooser ends
each printing with its finish and the which-copy label of a wish (web and mobile) names a finish
other than Normal (unit tests on both). The stale "match" wording of `test-accounts.md`,
`local-setup.md`, `seed-data.md` and the Phase 3 contract went too (`c1dfb74`), and the exported
OpenAPI document caught up with the NotificationResponse title example (`7ca7786`).

**Checks on the final code (2026-10-09, branch `feature/regions-s2-wishlist`):**
- `./gradlew exportOpenApi` + `npm run generate:api`: the first re-run after `f37fdda` changed
  only the NotificationResponse title example ("Wishlist alert: Azure-Eyes", committed `7ca7786`);
  the second re-run reproduces every committed file byte for byte (the Windows generator rewrites
  `packages/api-client/src/.openapi-generator/FILES` with CRLF, which git shows as stat-dirty
  with an empty diff; `git checkout` of it leaves the tree clean).
- `npm run test:api` (Spotless + `gradlew check`): BUILD SUCCESSFUL in 6 m 14 s; `test` 805 tests /
  161 classes, `catalogTest` 12 tests / 2 classes, 0 failures, 0 errors, 0 skipped.
- `npm run test:web`: lint clean, 140 files / 648 tests. `npm run build -w apps/web-angular`:
  initial total 899.92 kB (214.46 kB transfer), under the 900 kB budget, no warning.
- `npm run test:e2e -- --retries=0`: 73 passed (2.6 m) on the first attempt, 0 failed / flaky /
  skipped.
- `npm run test:mobile`: typecheck, lint, 76 suites / 648 jest tests, 28 harness guard tests.
- `npx expo export` (Expo SDK 57) into the scratchpad: Android (Hermes bundle 5.16 MB, 1759
  modules) and web (73 static routes), both exit 0; neither bundle contains a matches / rematch
  endpoint, `WISHLIST_MATCH` or a map provider URL.
- `npm run test:mobile:e2e`: 51 passed (1.3 m).
- `npm run audit:gate`: OK (the 2 allowlisted advisories, `braces` and `node-forge`, until
  2026-11-30). `npm run test:scripts`: 64 / 64. `npm run infra:validate` (scheduler module, 9
  jobs): passed.
- Native Maestro check (Pixel 6 emulator, Android 14, Expo Go SDK 57):
  `npm run test:mobile:maestro` ran every flow once: **24 / 24 flows passed in 48 m 49 s**
  (including "Wishlist alert, notification and card page" and "Collector search, profile and
  Looking for"). After the label fix, Metro was restarted and both wishlist flows re-ran: 2 / 2
  passed. adb screenshots of the changed screens (wishlist tab with the visibility switch, the
  note and the NM / % TCG chips; the wish editor with terms, amounts and the price source; the
  "Which copy" chooser before and after the fix; Settings → Notifications "Wishlist alerts"; the
  notification centre with the alert "... was just listed by @collector1 in Quebec, Canada."; the
  card page it opens). Logcat: no ReactNativeJS error, no crash, only Expo Go internals; Metro
  log: bundling lines only; no token or coordinate in logcat, Metro or API logs. Metro, the
  harness API and the emulator were shut down; no process of this stage still listens.
- V112 on a populated pre-V112 database (scratch database `orenjitrade_regions_check`, dropped
  afterwards): see "Migration" above.

**Review fix 1 (2026-10-09, after the independent functional and product/UX reviews):** the
functional review passed; the product/UX review found two blocking issues, both fixed at the root
together with the cheap non-blocking ones:
- **Wish dialog errors out of view (blocking).** The error block (409 same selection, plan limit,
  summary) sat at the end of the scrolling content, below the picker, so a refused save looked
  like nothing happened. It now sits between the content and the buttons (outside the scroll, in
  view at 1280 px and 375 px); an invalid field gets the focus; when every problem sits next to
  its field the summary says "Check the highlighted fields." instead of "Validation failed"; the
  note's API errors read as sentences ("The note contains a word that is not allowed here.
  Please rephrase it.").
- **Alert link showed another printing (blocking).** The card page (web and mobile) ignored the
  `?rarity=` of a wishlist alert for "any printing in a rarity" and showed the first printing
  (another rarity) as "Selected printing". It now shows "Any printing in <rarity>" with that
  rarity's printings (highlighted in the web printings table) and picks none; "Add to wishlist"
  starts on the same choice; "Add to inventory" preselects a printing only when the rarity has
  one; choosing a printing replaces `?rarity=` in the URL; an unknown printing or rarity is
  ignored. The selected printing's price names its source ("TCG market price", "Sample market
  price", tooltip / hint with the source and date).
- Non-blocking: the price term boxes render from the form value on every change (two clicks in
  one change detection left two boxes checked); the chosen card's name takes the focus after the
  autocomplete pick, and closing the dialog returns the focus to the button that opened it (it
  lost the focus while disabled during the chunk load); which copy names an edition other than
  Unlimited (web and mobile; two printings of one code can differ only by it); Edit / Remove,
  the remove confirmation and its snack bar name which copy (web and mobile); the % TCG chip
  names its price source and date (wishlist page, public "Looking for"); the terms hint says
  amounts appear once one printing is chosen; the picker says that set, edition and language
  filters only narrow the list; a stale "matches" comment went.
- Not changed (documented decisions): price terms stay mutually exclusive checkboxes (the spec's
  wording) inside a labelled fieldset; the sent-alert key is still written while alerts are off;
  notes stay plain text rendered escaped, as everywhere in the repo; the seed has no printing
  code in several rarities (S3 adds one for its picker walk).

**Checks after review fix 1 (2026-10-09, branch `feature/regions-s2-wishlist`):**
- `./gradlew exportOpenApi` + `npm run generate:api`: no content change (the fix touches no API);
  only the known CRLF stat-dirty `packages/api-client/src/.openapi-generator/FILES`, restored
  with `git checkout`; the tree is clean.
- `npm run test:api`: BUILD SUCCESSFUL in 6 m 31 s; `test` 805 tests / 161 classes, `catalogTest`
  12 tests / 2 classes, 0 failures, 0 errors, 0 skipped.
- `npm run test:web`: lint clean, 141 files / 656 tests (new: the wish dialog spec, the
  quick-double-click term test, the trigger focus test, note wording, labels, picker hint).
  `npm run build -w apps/web-angular`: initial total 899.92 kB (214.49 kB transfer), under the
  900 kB budget, no warning (the fixes live in lazy chunks).
- `npm run test:e2e -- --retries=0`: 73 passed on the first attempt, 0 failed / flaky / skipped
  (final run 2.6 m). The first run of this fix failed once in `map.spec.ts` on a false positive of
  the DOM coordinate scanner (the signed ad click token read "NN.NNNN" across its dots, a few
  percent of tokens); the scanner now counts standalone numbers only (`e8f7a45`) and the suite
  was re-run in full twice (73 / 73 each time). New checks: the 409 error in view at 1280 px and
  375 px, the focus on the chosen card and back on "Add to wishlist" after Escape, the card page
  `?rarity=` view ("Any printing in Ultra Rare", no selected printing, the wish dialog on the
  same choice, a printing replacing the rarity) and the "Sample market price" label.
- `npm run test:mobile`: typecheck, lint, 76 suites / 650 jest tests (new: the rarity view, a
  rarity the card lacks, the price source), 28 harness guard tests.
- `npx expo export` (Expo SDK 57) into the scratchpad: Android (Hermes bundle 5.16 MB, 1759
  modules) and web (73 static routes), both exit 0; neither bundle contains a matches / rematch
  endpoint, `WISHLIST_MATCH`, `matchCount`, `radiusKm` or a map provider URL.
- `npm run test:mobile:e2e`: 51 passed (1.3 m).
- `npm run audit:gate`: OK (the 2 allowlisted advisories, until 2026-11-30).
  `npm run test:scripts`: 64 / 64.
- CI commands: `npm run lint -w apps/web-angular`, `npm run format:check -w apps/web-angular`,
  `npm run typecheck -w apps/mobile`, `npm run lint -w apps/mobile`,
  `npm run format:check -w apps/mobile`: all clean.
- Native check (Pixel 6 emulator, Android 14, Expo Go SDK 57): `npm run test:mobile:maestro` ran
  every flow once: **24 / 24 flows passed in 48 m 31 s** (harness 49 m 49 s). Then a scratch
  walk (flows outside the repository, `--keep-running --skip-build`, seed collector2) with adb
  screenshots: the Wishlist tab ("AZR-EN001 · Ultra Rare · Azure Dawn · 1st Edition", the note,
  "Near Mint only", "90% TCG ≈ 37.80 CAD"), the remove confirmation naming which copy, the card
  screen opened with `?rarity=Ultra%20Rare` (caption and section "Any printing in Ultra Rare",
  "2 printings of this card in Ultra Rare: any of them fits", no selected printing), then
  AZR-FR001 chosen (the rarity gives way; "Sample market price: fictional price of the local
  sample catalog · updated 2026-09-01"). The walk's first sign-in typed a garbled e-mail once
  (an emulator input glitch; the retry passed). Logcat: no FATAL EXCEPTION, no ReactNativeJS
  error (only Expo Go's "Cannot connect to Expo CLI" once Metro stopped), no token, no
  coordinate; Metro log clean; API log only Flyway's "extension already exists" notices. Metro,
  the harness API and the emulator were shut down; nothing listens on 8082, 8090, 19006, 8180,
  4300, 8480 or 4480.

**Review fix 2 (2026-10-09, last work on the Windows machine):** the second functional review
found that V112 failed on a populated pre-V112 database (the rarity of printing wishes was cleared
after the duplicate collapse, so the unique index met duplicates). `c1b9df7` normalises the
selection before collapsing and adds `SimplifiedWishlistMigrationIT` (see "Migration"); `be24294`
is the review polish: market prices read amount then currency code ("42.00 CAD", web and mobile),
an "or more" term shows a floor ("100% TCG+ ≥ 25.00 USD"), "TCG market price" keeps its capitals
inside a sentence, the price-terms error also shows when an edited wish keeps its own term,
Settings → Notifications explains wishlist alerts and prompts for a location when none is set
(web and mobile), and the profile's place reads "City, State, Country". No check run was recorded
for that round; the independent re-review of 2026-10-10 on the Mac ran every suite on `b52211a`
(809 API + 12 catalog tests, 659 web, 651 mobile jest, 73 web E2E, 51 mobile web E2E, all green
apart from the BinderIT deadlock described under "Known gaps") and no Maestro run.

**Review fix 3 (2026-10-10, first run on the Mac mini):** the independent re-review of `b52211a`
(functional verifier and migration auditor: approve; product/UX reviewer: changes required, two
major findings, both silent printing picks). Every major and minor finding was reproduced first
(the two majors by running the new E2E tests against the previous web and mobile code).

- **An "Any printing" alert landed on a printing nobody chose (major, web and mobile).** The alert
  linked to the bare card page, which shows its first printing as "Selected printing": an Unlimited
  copy was listed and the page showed the 1st Edition at 6.75 CAD. The alert link now always says
  the selection: `/cards/<id>?printing=any` for an any-printing wish (`55b3352`), next to
  `?printing=<id>` and `?rarity=`, which are unchanged. The card page (web `8c5a2c4`, mobile
  `5fcb29d`) shows an "Any printing" block for it: no "Selected printing", no highlighted or
  checked row, no price of one printing, the card's own picture; choosing a printing replaces
  "any". A wish's own link (wishlist page, "Looking for") uses the same marker.
- **A typed printing code picked one of the printings sharing it (major, web and mobile).**
  `SHV-EN003` (a 1st Edition and an Unlimited printing) started the wish on "Only … 1st Edition",
  and that wish then got no alert for an Unlimited copy. A code is no longer taken for a printing
  (`c96ec26`, `5fcb29d`): the form preselects a printing only when exactly one printing of the
  card carries the code; otherwise it starts on "Any printing", the web picker is narrowed to the
  code's printings with the reason ("2 printings share the code SHV-EN003: choose one below for
  that copy only", "Show every printing"), and the mobile "Which copy" lists them first.
- **Minor, fixed:** the picker's "Any printing" row says what the click does under a rarity
  filter; after a refused save (409, plan limit) the keyboard focus stays on the wish dialog's
  save button; the bell menu shows a wishlist alert in full (the place was cut off); onboarding
  tags "help collectors find you" (web and mobile); the seed fills the three stable-id wishes of a
  database seeded before S2 while they are untouched and sends the sample alert once (`569b3a4`;
  the owner's dev database is exactly that case); `PUT /me/settings/notifications` without
  `wishlistAlerts` keeps the stored value (`d9f5f94`); `schema.md`'s sensitive-data table no longer
  lists private wishlist notes.
- **V112, edited one last time before it freezes at the merge (`25c26b4`, still one
  transaction):** a collector whose old WISHLIST_MATCH category had in-app and push off starts
  with `wishlist_alerts = false`; paused wishes are deleted before the column is dropped (lead
  decision, see "Decisions"); incomplete `event_publication` rows of the removed `WishlistMatched`
  class and of the reshaped `WishlistItemCreated` are completed (the first start no longer fails
  on them); before the duplicate collapse, rarity strings are trimmed, a printing wish takes its
  printing's card and game, and a rarity no printing of the card has is cleared; the
  `analytics_daily_count` rows of `wishlist_matched` go; `ck_wishlist_item_target` (redundant with
  `card_id NOT NULL`) is dropped. `SimplifiedWishlistMigrationIT` proves each of these (10 tests:
  one duplicate per dropped column, a `created_at` tie, the opt-outs, paused wishes, outbox rows,
  an unknown and a padded rarity, a card / printing mismatch); 8 of the 10 fail against the
  previous V112.
- **V112 was edited before any merge** (`0f35296` checksum -825541891, `c1b9df7` 558235031, now
  -323109679). Only databases that applied an earlier version are affected, and they then refuse
  to start with a Flyway checksum mismatch: scratch and E2E databases (`orenjitrade_e2e` and
  `orenjitrade_mobile_e2e` when kept with `--keep-db` or by a kept stack, reviewers' scratch
  databases, on either machine). The remedy is to **drop and recreate that database** (the E2E
  harnesses do it on every run); never `flyway repair` (an earlier V112 leaves a different
  schema), and `npm run infra:reset` is not needed. The owner's dev database is at V105 and never
  applied any V112.
- **Nits, fixed:** the wish dialog's error icon keeps its size and the note counter stays on one
  line at 375 px, with the count still shown once the note is over the limit ("281 / 280"); a
  Retry for price terms that failed to load (web and mobile); "Your wishlist alerts work either
  way" is not said while the collector has no location (web and mobile); "1 term"; a term the
  admin removed is listed at its percent (web and mobile); the remove confirmation reads "Your
  wish for <card> (any printing) will be removed."; a click on the backdrop no longer closes the
  wish dialog while the form holds unsaved input (Escape and Cancel still do); the mobile "Which
  copy" hint writes the chosen printing out in full; a note keeps its line breaks in "Looking
  for"; the plan-limit dialog no longer shows the technical limit key; the profile no longer
  scrolls sideways at 375 px (it was a one-line fix: `minmax(0, 1fr)`); the Maestro leftovers
  (`parity.js` comment, the vacuous `assertNotVisible` of the "Looking for" flow, which now
  asserts the note and the price term).
- **Not in this round:** naming the edition in the alert text and grouping same-printing alerts
  (S3); the Netty macOS DNS resolver warning at API start (the macOS branch); the duplicate
  collapse of V112 stays quadratic per collector (20,000 wishes of one collector take about half
  a minute on the emulated PostgreSQL; the API never allowed more than 20 or 500).

**Checks after review fix 3 (2026-10-10, Mac mini: Apple M6, macOS 27, OrbStack, JDK 21, Node 24;
code at `19fdf71`, retries off):**
- `npm run test:scripts`: 64 / 64 (13 suites).
- `npm run lint -w apps/web-angular`, `npm run format:check -w apps/web-angular`,
  `npm run typecheck -w apps/mobile`, `npm run lint -w apps/mobile`,
  `npm run format:check -w apps/mobile`: all clean.
- `npm run audit:gate`: OK (the 2 allowlisted advisories, `braces` and `node-forge`, until
  2026-11-30).
- `./gradlew exportOpenApi` + `npm run generate:api`: git stays clean (the regenerated
  descriptions of the settings request and of the notification `data` were committed with their
  changes; no CRLF noise on macOS).
- `npm run test:api`: BUILD SUCCESSFUL in 2 m 48 s; `test` 816 tests / 162 classes, `catalogTest`
  12 tests / 2 classes, 0 failures, 0 errors, 0 skipped; Spotless clean. Two earlier runs of this
  round failed: the first on `BinderIT` (the known deadlock) and on the new seed test, which
  relied on a second alert notification while other suites had used up the seeded collector2's
  daily alert limit in the shared test database (the test now keeps the notification and removes
  only the sent-alert key, `19fdf71`); the second only on that seed test.
- `npm run test:web`: lint clean, 142 files / 678 tests (new: the card page spec, the typed code,
  the focus after a refusal, the backdrop, the picker's "Any printing" row, the note count, the
  term order, the bell clamp). `npm run build -w apps/web-angular`: initial total 899.93 kB
  (214.55 kB transfer), under the 900 kB budget, no warning. The first build of the round was
  900.10 kB (104 bytes over): the two files of the initial chunks were shortened (the fallback
  notification link, an inline class binding) instead of touching the budget.
- `npm run test:mobile`: typecheck, lint, 76 suites / 656 jest tests, 28 harness guard tests.
  `npx expo export --platform android` (Hermes bundle 5.2 MB) and `--platform web` into
  `apps/mobile/dist/` (git-ignored, deleted afterwards): both exit 0.
- `npm run test:e2e -- --retries=0`: 74 passed (1.3 m) on the first attempt, 0 failed / flaky /
  skipped; the run's 72 emulator accounts were deleted.
- `npm run test:mobile:e2e`: 52 passed (48 s), no retry used.
- `npm run test:mobile:maestro`: **not run** (no Android SDK, adb or emulator on the Mac). The
  flows and host scripts were read against the screens: the alert flow now also asserts the "Any
  printing" section of the card screen, the "Looking for" flow the note and the price term.
- V112 and the seed on real paths (scratch databases `orenjitrade_s2fix_*`, API on :8460, Redis
  db 9, all dropped / flushed afterwards): a `pg_dump` copy of the owner's dev database (V105, 3
  seed wishes) took V106–V112 in 0.11 s, the API started in 4.5 s, the seed logged "0 wishlist
  items (2 migrated ones filled in)", collector2 had the note, "Near Mint only" and the price
  terms of `test-accounts.md` and one WISHLIST_ALERT; a second start migrated nothing and added
  nothing. On a V111 copy loaded with the migration auditor's hostile data (5,069 wishes, 1,503 of
  them paused, opt-outs, three incomplete outbox rows) V112 took 0.69 s and left 2,031 wishes, no
  duplicate selection, no card / printing mismatch, no rarity foreign to its card, the opt-out
  carried over, no incomplete outbox row, and **the first start succeeded** (it failed once on
  the outbox row before). The owner's database was only read (still V105, 3 wishes).
- Nothing listens on 8180, 4300, 8090, 19006, 8082 or 8460; the shared containers were never
  restarted.

**Independent verification of review fix 3 (2026-10-10, same Mac):** a functional verifier and a
product/UX reviewer, each on its own stack, both **approve** (no blocker, no major finding).
- Functional: every check above re-run on the branch head (API 816 + 12 tests green on the first
  run, web 678, mobile 656 jest + 28 guard tests, mobile web E2E 52 / 52); every item of the
  round found fixed with its test; V112 re-applied to a copy of the owner's dev database (V105)
  and to the hostile V111 data (2,031 wishes left, opt-outs off only where in-app and push were
  both off, no incomplete outbox row, the first start succeeding), still one transaction (a
  failure forced at its last statement rolls back byte for byte), and a mutation check: removing
  each of the 8 new statements makes `SimplifiedWishlistMigrationIT` fail.
- Product/UX, on the web at 1280 x 800 and 375 x 812 (light and dark) and on the Expo web build
  at 375 px: the three alert link shapes land as wished (any printing, one printing, a rarity)
  and survive a reload; codes shared by 2, 2 and 4 printings start on "Any printing" with the
  reason given, a code with one printing is preselected, and the resulting wishes alerted for
  exactly the right copies. Its two minor findings and its nits are in "Known gaps" above.
- Two flaky E2E checks surfaced that day, neither in S2 code, both hardened on this branch:
  the signed-out specs of the web suite share the anonymous per-IP rate limit (60 a minute), and
  on this fast machine the 61st call of a minute failed `launch-config.spec.ts` in one full run
  and `smoke.spec.ts` in another (the E2E API now gets `RATE_LIMIT_ANONYMOUS_PER_MINUTE=600` from
  the harness and from `e2e.yml`, and the launch spec asserts the answer's status; the limits
  stay proven by the API's integration tests); the provider guard of `card-images.spec.ts` awaited response bodies
  without a bound and timed out on GitHub CI for the macOS pull request when Chromium never
  delivered one (it now bounds each read at 5 s, like the two other scanners).
- Not verified by anyone this round: the native Maestro suite (no Android emulator on the Mac;
  the iOS path for the harness is the next task) and screen reader output.

## Phase 11 — ML

**[!] ON HOLD — owner instruction (2026-09-29): do not start the Python ML card recognition work until a new order is given. The Phase 0 FastAPI skeleton stays as-is.**

_Final verification (2026-09-30): `apps/ml` untouched since Phase 0, `mlScanning` feature flag off in every seed, the API never calls the ML service locally; `npm run test:ml` (optional) runs the skeleton's pytest suite when `apps/ml/.venv` exists._

- [!] Card scanning pipeline: upload → storage → event → ML worker → candidates → user confirmation → inventory
- [!] ML service `/v1/identify` with confidence, graceful degradation
- [!] Mobile camera scan flow
- [!] Tests: pytest for service; API tolerance when ML unavailable

## Phase 12 — Data Platform

_Final verification (2026-09-30): the local half works (log transport by default, every event checked for PII/coordinates); the cloud half (Pub/Sub topic, BigQuery) is deferred with the rest of the cloud deployment (docs/deployment/DEFERRED.md)._

- [-] Analytics event schema + publisher (Pub/Sub adapter, local logging adapter) — minimal set built with Phase 4 (stage 4): `apps/api/.../analytics` — `AnalyticsEvent` (BigQuery column names `event_id`, `event_type`, `event_version` 1, `occurred_at`, `actor_hash`, `region_label`, `geo_cell`, `payload`), `AnalyticsText`, `ActorHasher` (HMAC with `ANALYTICS_ACTOR_SALT`; start-up guard, default salt only in local/test), `AnalyticsPublisher` (async, never throws), `LogAnalyticsTransport` (default), `PubSubAnalyticsTransport` (Pub/Sub REST with ADC or the emulator, only with `EVENTS_TRANSPORT=pubsub`, no new dependency), `AnalyticsEventListener` mapping in-process notifications (`SearchPerformed`, `CollectorPreviewed`, `CollectorProfileViewed`, `PublicBinderViewed`, `CardViewed`) to `search_performed`, `search_no_results`, `collector_viewed`, `binder_viewed`, `card_viewed` (no module depends on analytics); Phase 5 adds `message_sent` and `community_post_created` (after commit, no text and no raw ids; `message_sent` carries a hashed recipient); Phase 6 adds `wishlist_item_created` (game, target kind, radius, price flag, trade preference) and `wishlist_matched` (game, distance bucket, notified, owner hash; AnalyticsIT `phase6WishlistEventsCarryNoNotesIdsOrCoordinates`); Phase 7 adds `rating_submitted` and `collector_reported`; Phase 8 adds `offer_created` (kind, game, message and protection flags, seller hash), `offer_status_changed` and `trade_status_changed` (never amounts, ids or text; AnalyticsIT `phase8OfferAndTradeEventsCarryNoAmountsIdsOrText`) — tests AnalyticsIT (2), AnalyticsConfigTest (3), ActorHasherTest (2). Pending (local, backend debt): Phase 10 events (subscription, credit spend, ad served/clicked, donation; no amounts, ids or text) and AnalyticsIT coverage of the Phase 9 `payment_status_changed` / `dispute_status_changed` events. Deferred (cloud): the Pub/Sub transport is unproven against the emulator or cloud; `ANALYTICS_ACTOR_SALT` not yet in Secret Manager/Terraform
- [ ] BigQuery dataset/tables (Terraform) + sample queries — deferred with the cloud deployment
- [x] No PII/precise location in events (test) — AnalyticsEventTest (12: lat/lng/latitude/email/handle/user_id/centre keys and floating-point values refused, e-mails, decimal numbers and long digit runs masked, text truncated to 64 characters, `*_hash` keys must be hex digests, geography = grid cell + region label), AnalyticsIT `phase4FlowsEmitPrivacySafeEvents` (log output of real Phase 4 flows scanned)

## Phase 13 — Hardening

- [-] E2E coverage for all acceptance flows (Playwright + Maestro) — web done: 67 Playwright tests in 33 spec files (51 feature tests + the 16-test acceptance suite, every spec § 60 web flow incl. restoring a stale listing) green against the real local stack in the final verification; Maestro flows wait for the mobile app (deferred by owner decision)
- [-] Security review, secure headers, CORS, rate limits, upload validation — built along the phases (Problem Details without internals, request ids, RBAC + admin MFA outside local, `/internal/**` service auth, Redis token-bucket rate limits with per-route policies, CORS allow-list, HSTS outside local, web CSP from the entrypoint, image re-encoding with decompression-bomb guards and EXIF stripping, `GeoPrivacyContractTest` + the acceptance privacy scanner); a dedicated security review, header audit and rate-limit tuning (see the stage 12 debt) are still to do
- [ ] Accessibility pass, load test script, DB index review, backup/restore docs, failure testing

## Phase 14 — Production Deployment

**Apply still deferred by owner decision (2026-09-29): no cloud deployment; see docs/deployment/DEFERRED.md.** Since 2026-10-05 the production configuration itself is prepared (ADR 0016, section below): `npm run infra:validate` keeps the Terraform (16 modules, dev/staging/prod, Cloudflare) formatted and valid without credentials; nothing is planned or applied.

- [-] Terraform for prod (low-cost first-year profile), Cloudflare rules and records, secrets, scheduler jobs, budget — code and docs done on `feature/prod-low-cost` (see "Low-cost first-year production profile"); `terraform apply`, the Cloudflare apply and the console steps are the owner's (docs/deployment/README.md sections 1–11)
- [x] Deployment documentation (`docs/deployment/`) — first-deploy order with the Cloudflare DNS + certificate steps, environments matrix, runbooks (scale-up path, secret rotation, Redis sidecar, budget alert, restore), backup/restore incl. restore to a different instance, console safeguards (Firebase key, budget; the Maps key restrictions went with the map provider, ADR 0017), temporary staging, per-line cost table (`docs/deployment/README.md` section 13)

## Low-cost first-year production profile (ADR 0016, 2026-10-05)

_Branch `feature/prod-low-cost` (worktree, from `origin/main` at `ded5470`), builders done (infra, API, docs), not pushed, nothing applied. Owner request: prepare the Google Cloud production configuration for a low-cost first year (target ≈ US$115–130/month at list prices) and fix the known go-live blockers without deploying anything._

- [x] ADR 0016 `docs/architecture/adr/0016-low-cost-first-year-production-profile.md`: the 13 choices, the Redis-sidecar trade-off with the per-key table of what an empty restart loses, the single-instance limit, the scale-up signals (sustained api CPU / memory alerts, Cloud SQL connections > 40 or CPU > 80 %, a few thousand actives or > ~200 concurrent WebSocket sessions, any need for two instances) and path (Memorystore Basic 1 GB + `api_max_instances > 1`, then `db-custom-1-3840` and REGIONAL, then 2 vCPU / 2 GiB), the cost table with the official pricing-page sources (Montreal, 2026-10-05): api ≈ 67, web ≈ 1, Cloud SQL ≈ 31, LB ≈ 19, Cloud Armor ≈ 8–10, egress ≈ 4–12, GCS ≈ 1, AR ≈ 0.3, Secret Manager ≈ 0.2, Scheduler 0.70, Pub/Sub + BigQuery ≈ 0–0.5, the rest 0 → **≈ US$131–142/month** (≈ 125 at minimal traffic; the 115–130 target holds only at low egress because Montreal is Cloud Run Tier 2 without a GCS Always Free allowance; US$300 trial credit for 90 days). Previous topology ≈ US$575–775.
- [x] Terraform (commits `25050ca`, `32202ad`, `fc644d0`, `77e3c0a`, `cbee16b`): Cloud SQL `db-g1-small` ZONAL with `edition = ENTERPRISE` explicit (PG16+ defaults to Enterprise Plus), 10 GB SSD auto-resize, 7 backups, PITR 7 d, deletion protection; Valkey 8.1.10-alpine sidecar pinned by digest through an Artifact Registry Docker Hub remote (`127.0.0.1 -::1`, `save ''`, `appendonly no`, `maxmemory 200mb allkeys-lru`, 0.1 vCPU / 512Mi, TCP startup probe, api `depends_on`, `REDIS_URL=redis://localhost:6379` plain env, no `redis-url` secret); api 1 vCPU / 1Gi with the heap capped at 50 % (measured 2026-10-05 on the production image: 513 MiB idle, 595 MiB under ~36 req/s, ~390 MiB non-heap, JVM up in 33 s), **min 1 / max 1** (validated while `redis_mode = sidecar`), CPU always allocated, startup boost, session affinity; Direct VPC egress `/24` `PRIVATE_RANGES_ONLY` (connector + Cloud NAT only behind `ml_enabled`, which stays false); web min 0 / max 2 / 512Mi with every `docker-entrypoint.sh` variable wired (`WS_BASE_URL`, Firebase web config, Maps key + Map ID (both removed in S1, ADR 0017), `ENVIRONMENT`; public values only); Certificate Manager with DNS authorization (+ Origin CA and classic modes); 10 Cloud Scheduler jobs = every scheduled `/internal/jobs/*` route, called over the api's `run.app` URL with audience = public API URL (`INTERNAL_AUDIENCE` / `INTERNAL_INVOKERS` set; ping, catalog-import, card-images status/clear excluded and refused by validation); Spring profile mapping `dev | staging | prod` (was `development`/`production`); generated secrets `location-jitter-secret`, `analytics-actor-salt`, `ads-token-secret`, `consent-ip-salt` (+ `db-password`, `service-token`), `stripe-billing-webhook-secret` container; unread env removed; `STORAGE_PUBLIC_BASE_URL` → the API media route (bucket enforces public access prevention); `domain-events` push off until the receiver exists; `google_billing_budget` module (US$150, 50/90/100 % + forecast, credits excluded, owner-applied); AR cleanup keeps ~10 versions per image; monitoring: api CPU/memory + Cloud SQL disk alerts, connection threshold 40, no Memorystore/connector references. The three roots share one `main.tf`. `deploy.yml` updates the `api` container only (`--container api`), ML opt-in via `DEPLOY_ML`.
- [x] Cloudflare (`fc644d0`): one Free-plan rate-limit rule (merged path prefixes, 60/10 s/IP; per-group thresholds, POST-only and host scoping dropped at the edge, all still enforced in the API's Redis windows), cache rules making `/api/v1/public/card-images|placeholder-images|media` cache-eligible with origin `Cache-Control` (`public, immutable` as the code sends; authenticated responses carry Spring Security's `no-store` and are never cached), DNS-only `_acme-challenge` CNAMEs from the GCP output, SSL Full (strict), optional `/internal/**` edge block; READMEs corrected.
- [x] API (`409b93d`, `740c832`, `ff76df5`): card image renditions behind a dedicated `cardImageStorage` `ObjectStorage` (local files at `CARD_IMAGE_CACHE_DIR` as before; `card-images/` prefix of the media bucket with `STORAGE_PROVIDER=gcs`; `CARD_IMAGE_STORAGE_PROVIDER` / `CARD_IMAGE_GCS_BUCKET` / `CARD_IMAGE_OBJECT_PREFIX`), the 5 GB cap counting objects + temps + reservations, reconciliation listing the bucket and never deleting an unreferenced object younger than the reservation TTL, serving with one read (304 without), imports with one listing snapshot; prod `DATABASE_POOL_SIZE` default 20 → 10 (`max_connections` 50); `application.yml` notes. ADR 0015 amendment 2026-10-05. Tests: `LocalFileObjectStorageTest` (6), `GcsObjectStorageTest` (6, google-cloud-nio in-memory bucket), `CardImageObjectStorageIT` (6: wiped-disk restart keeps and serves every object, vanished object repaired, cap with objects + temps + reservations, fresh unreferenced objects kept), `CardImageCacheIT` age-guard test, `CardImageFileStoreTest` policy test; full `npm run test:api` green after the isolation fix; `npm run test:scripts` 54/54; web image built and `config.json` rendered with every new variable; local dev unchanged (API jar on :8380 against `orenjitrade_prodcost_check`, Redis db 4).
- [x] Docs (this section's commit): ADR 0016 + index, `docs/deployment/README.md` (prod-only year one, first-deploy order 1–11 incl. Firebase web app before the apply, Cloudflare DNS + certificate verification, `--container api` deploy, console safeguards, temporary staging, cost table), `environments.md`, `runbooks.md` (scale-up path, rotation incl. the jitter-secret warning, Pub/Sub note, sidecar, budget alert, restore pointers as separate sections), `backup-restore.md` (inventory, Enterprise/ZONAL settings, restore to a different instance with `--backup-instance`, drills), `DEFERRED.md` status, `infrastructure/terraform/README.md` cross-links, ARCHITECTURE.md §10 note, ADR 0003 cross-reference, CLAUDE.md Cache row parenthetical (Redis stays cache-only).
- Decisions needing the owner's eye: `db-g1-small` has **no Cloud SQL SLA** (test/dev tier per Google; data is protected, availability is not guaranteed; `db-custom-1-3840` ≈ US$54 is the first SLA tier); the Cloudflare edge rate limit is coarser; the `Idempotency-Key` stores for offers/reports live only in Redis (a retry right after a restart can duplicate); `card-images/reconcile` scheduled daily at 04:45 UTC by judgement (no cadence in the code); the budget resource must be applied by the owner (billing-account permission); year one runs prod only (dev optional, staging temporary), images built into the prod registry when there is no dev project.
- To confirm at the first `terraform apply` (cannot be verified without a project): the loopback-bound Valkey against Cloud Run's TCP startup probe (fallback `redis_sidecar_bind_address = "0.0.0.0"`), a 0.1 vCPU sidecar next to a 1 vCPU main container, Certificate Manager DNS authorization on the Cloudflare zone, the exact free-tier arithmetic on a Tier 2 region. `terraform plan` was not run (needs a real project); `fmt -check` + `validate` pass for all four roots.

---

## Acceptance criteria tracker (spec §60)

Final independent verification, 2026-09-30, from a clean local state (`npm run infra:reset -- --yes`
→ `npm run test:all` → `npm run infra:validate` → `npm run dev` + manual walkthrough). Status:
**PASS** (proven by the named tests/evidence) · **PARTIAL** · **DEFERRED-CLOUD** (owner decision:
no cloud deployment) · **DEFERRED-MOBILE** (owner decision: web first) · **ON-HOLD-ML** · **FAIL**.
"Acceptance" = `apps/web-angular/e2e/acceptance/*.spec.ts`; "walkthrough" = the manual `npm run dev`
walkthrough above. No criterion is FAIL; none is ON-HOLD-ML (card scanning is not one of the 44).
Mobile halves (owner decision 2026-10-04: mobile resumed, local and free only): stages M1–M7 (2026-10-04/06) implement the mobile half of every user-facing criterion, and each row names its mobile evidence: `apps/mobile/e2e/*.spec.ts` (Playwright on the Expo web build against the isolated stack, 60 specs after stage M8, every JSON answer of the API scanned for coordinate, radius and distance keys and every request checked for map providers since S1) and `apps/mobile/.maestro/*.yaml` (Maestro in Expo Go on the Android emulator, 24 flows after stage M8), plus the jest suites named. DEFERRED-MOBILE now remains only for device push (25: needs an EAS project and a real FCM sender); iOS (40) is proven on the simulator since 2026-10-10 (the same Maestro flows in Expo Go on the iOS 27 simulator of the owner's Mac, see "Mobile app on the iOS simulator"), a physical iPhone and a store build are not; the admin and moderator criteria (30–34) are web-only by scope (the admin consoles stay on the web; their mobile part is what a collector sees). The statuses are those of the final web verification, with the mobile results added; the mobile evidence is the builder's of each stage; M1–M6 were verified and merged into `main` as #41, #45, #46, #47, #48 and #51; the stage M7 evidence (branch `feature/mobile-m7`) and the stage M8 evidence (branch `feature/launch-readiness`, the 18+ rule and the legal pages in both languages) are the builder's. After stage M7 every row's mobile half matches the web's or states the exact difference: 1 (Google sign-in proven only against the Auth emulator), 25 (device push), 30–34 (admin consoles web-only), 38 (draft texts, same as the web), 40 (iOS on the simulator only).

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Register and log in | PASS | acceptance `registration.spec.ts` (consents → emulator e-mail verification → sign out → sign in), `auth.spec.ts`; AuthenticationIT; walkthrough sign-in (emulator ID token → `GET /me`, anonymous 401); mobile (M1): `auth.spec.ts` (sign-up with the legal documents → emulator verification → onboarding → tabs → sign-out; a seed sign-in with session restore; friendly errors; consent screen; password reset), Maestro `sign-up-onboarding.yaml`, `sign-in.yaml`, `sign-out.yaml`; mobile (M7): `google.spec.ts` (Google sign-up through the Auth emulator's simulated account: the fake OAuth credential checked, consent → onboarding → tabs, Google the only sign-in method; the chooser dismissed; Google with the e-mail of a verified password account signs in to it and links Google, an unverified one is taken over — Firebase's trusted-provider rule, as on the web), Maestro `google-sign-in.yaml`, jest `auth/google`, `screens/auth`, `screens/settings`. Difference: mobile Google sign-in is proven only against the emulator (the web build's pop-up and the device flow through expo-auth-session need the Firebase project's OAuth client ids, DEFERRED.md item 4); mobile (M8, launch readiness): the bilingual 18+ checkbox at sign-up and on the consent screen, the onboarding "Age" step for an existing account with the remembered link (`auth.spec.ts`, `age-confirmation.spec.ts`, Maestro `sign-up-onboarding.yaml`, `age-step-existing-account.yaml`, jest `screens/auth`, `screens/account-states`, `screens/onboarding`, `account/ageConfirmation`, `app/auth-gate`), every consent recorded with the language shown |
| 2 | Create/edit profile | PASS | acceptance `registration.spec.ts` (profile step), `settings.spec.ts` (edits shown on the public profile); ProfileIT, TagIT; mobile (M1): `auth.spec.ts` (profile step), `profile.spec.ts` (edit, validation, tags, public preview), Maestro `profile-edit.yaml` |
| 3 | Configure privacy settings | PASS | `settings.spec.ts` (discoverability needs a location, then saved; the state or province only, S1); acceptance `map.spec.ts` / `privacy.spec.ts` (discoverable collectors); SettingsIT, PrivacyPolicyServiceTest; mobile (M1): `account.spec.ts` (privacy switches saved, notification preferences), `location.spec.ts` (discoverable opt-in, off by default, needs a location, the state or province only, S1), Maestro `discoverability.yaml`; mobile (M7): Settings → Blocked users (`blocked.spec.ts`, Maestro `blocked-users.yaml`), "Show my wishlist on my profile" shown on profiles (`collector-wishlist.spec.ts`) |
| 4 | Choose approximate trading location → **declare a location (ADR 0017)** | PASS (S1) | acceptance `registration.spec.ts` (region, country, state and city pickers; no map, no GPS), `auth.spec.ts`, `settings.spec.ts`; LocationIT, RegionsIT, GeoPrivacyContractTest; mobile (S1): `location.spec.ts`, `auth.spec.ts` (pickers), Maestro `sign-up-onboarding.yaml`, `discoverability.yaml` (+ `scripts/check-location.js`) |
| 5 | Select TCG interests | PASS | acceptance `registration.spec.ts` (interests step), `auth.spec.ts`; ProfileIT, TagIT; mobile (M1): `auth.spec.ts` (interests step), `profile.spec.ts`, Maestro `sign-up-onboarding.yaml`, `profile-edit.yaml` |
| 6 | Open dedicated inventory page | PASS | acceptance `inventory.spec.ts`, `inventory.spec.ts`, `smoke.spec.ts`; walkthrough `/inventory`; mobile (M2): Inventory tab, `inventory.spec.ts` (2), Maestro `inventory-add-edit-delete.yaml`; mobile (M7): owner photos on a card (`item-photos.spec.ts`), multi-select bulk actions (`bulk-actions.spec.ts`), the visibility filter and binder reordering (jest `screens/inventory`) — the web's inventory extras; mobile (S5, 2026-10-13): "Import" fills the inventory from a .ydk deck file or a Collectr CSV through a preview (`inventory-import.spec.ts`, Maestro `inventory-import-deck.yaml`, `inventory-import-csv.yaml`, `inventory-import-assumed.yaml`; InventoryImportIT); the web has no import screen (paused); mobile (R2, 2026-10-14): the Inventory of the phone redesign (own header, the filter sheet, rows of the price as typed), Add cards → Choose the printing → Add to inventory with photos, Edit card, delete with Undo (jest `screens/inventory`, `screens/items`; `inventory.spec.ts`, `bulk-actions.spec.ts`, `item-photos.spec.ts`; Maestro `inventory-add-edit-undo.yaml`; `InventoryPhoneFormIT`) |
| 7 | Create private inventory | PASS | acceptance `inventory.spec.ts` (card added Private by default); InventoryIT (owner-only reads, others 404); mobile (M2): `inventory.spec.ts` (cards added private by default, edit, delete), Maestro `inventory-add-edit-delete.yaml` (checked on the API), jest `screens/items` |
| 8 | Create multiple binders | PASS | acceptance `inventory.spec.ts`, `inventory.spec.ts` (five binders, keyboard reorder, delete, `binders.max` dialog); BinderIT; mobile (M2/M6): `binders.spec.ts` (create, rename, delete; `binders.max` explained), `billing.spec.ts` (a sixth binder once Premium), Maestro `binder-create-add-item.yaml`, `premium.yaml` |
| 9 | Move cards between binders | PASS | acceptance `inventory.spec.ts` (card moved into a binder), `inventory.spec.ts` (bulk move); BulkOperationsIT `MOVE_TO_BINDER`, InventoryIT; mobile (M2): `binders.spec.ts` (a card added to a binder and removed), Maestro `binder-create-add-item.yaml` ("Add cards", checked on the API), jest `screens/binders` / `screens/items` (move to a binder) |
| 10 | Toggle private/public visibility | PASS | acceptance `inventory.spec.ts` (made public), `inventory.spec.ts` (bulk public 24 h / private); VisibilityIT, BulkOperationsIT; mobile (M2): `binders.spec.ts` (publish for 24 hours → make private), jest `screens/items` / `features/itemForm` (card visibility), Maestro `binder-create-add-item.yaml` (temporarily public, checked on the API); mobile (M7): `bulk-actions.spec.ts` (bulk public, temporarily public for 24 h, private with the skipped card explained) |
| 11 | Publish a binder | PASS | acceptance `inventory.spec.ts` (publish → another collector sees it); BinderIT, PublicBinderIT; walkthrough (publish → second collector opens the public binder); mobile (M2): `binders.spec.ts` (publish → another collector's view of it), Maestro `binder-create-add-item.yaml` |
| 12 | Another user opens the map | PASS (S1) | acceptance `map.spec.ts` (boundary map of the browsed region, states shaded by binder counts, region switcher), `map.spec.ts`, `smoke.spec.ts`; RegionMapIT; mobile (M9, 2026-10-12): the Map tab draws the region map of the browsed region with the region switcher and the same places as a list (`map.spec.ts`, `regions.spec.ts`, Maestro `map-region-binders.yaml`, `region-switch.yaml`, `map-gestures-links.yaml`; jest `screens/map`) |
| 13 | Public collectors at approximate positions → **per state or province (ADR 0017)** | PASS (S1) | no position exists: acceptance `map.spec.ts` + `privacy.spec.ts` (states only, no coordinate or distance key, no map provider request, cities only on profiles); GeoPrivacyContractTest; mobile: `placePrivacy.test.tsx`, Playwright privacy fixture |
| 14 | Click collector marker → **choose a state** | PASS (S1) | markers are gone by design (ADR 0017): acceptance `map.spec.ts` (click or keyboard on a state, the accessible state list, `/map?region=&subdivision=`); mobile (M9): a tap or the list opens a state, links `/?region=&subdivision=` (`regions.spec.ts`, Maestro `map-region-binders.yaml`, `map-gestures-links.yaml`) |
| 15 | Collector preview appears → **state panel** | PASS (S1) | the preview is removed (ADR 0017); the state panel lists the state's public binders in cursor pages with skeleton, empty state and error with retry (acceptance `map.spec.ts`, `map.spec.ts`; RegionMapIT); mobile (M9): the place screen `regions/[region]/[code]` with the same cursor pages, skeleton, empty state and retry (jest `screens/place`, `regions.spec.ts`, Maestro `map-region-binders.yaml`) |
| 16 | Open full profile | PASS (S1) | acceptance `map.spec.ts` (state panel → binder → profile), `registration.spec.ts` (the city on the profile only while discoverable and shown); CollectorProfileIT; mobile (S1, M9): `map.spec.ts` (profile with the state and the shown city), `holders.spec.ts`, Maestro `map-region-binders.yaml` (a binder of Quebec, then its owner's profile with the state and the shown city) |
| 17 | View public binder | PASS | acceptance `map.spec.ts` / `inventory.spec.ts`, `inventory.spec.ts` (the owner's state only, no private notes); PublicBinderIT; mobile (M2/M5/S1): `binders.spec.ts` (another collector's public binder: public cards, the owner's state, never the city), Maestro `binder-create-add-item.yaml` |
| 18 | Search for a card | PASS | acceptance `search.spec.ts` (top-bar search), `catalog.spec.ts` (autocomplete, filters, printing codes); CatalogSearchIT; walkthrough `/search`, `/cards`; mobile (M2): Search tab, `catalog.spec.ts` (filters, card detail, printing codes), Maestro `search-card-detail.yaml`; mobile (M7): the Search tab's Collectors and Binders segments on `GET /search` like the web's `/search` tabs (`search-segments.spec.ts`: by name or handle with their state or province (no distance since S1), opted-out collectors absent, recent searches per segment; public binders by name with their owner), set pages `sets/[id]` (jest `screens/sets`) |
| 19 | Nearby collectors with that card → **holders in my region** | PASS (S1) | acceptance `search.spec.ts` ("Who has this in my region" → card holders of the browsed region with the holder's state; another region does not list them), `map.spec.ts`; SearchIT, CardHoldersIT; mobile (S1): `holders.spec.ts`, Maestro `card-holders-region.yaml`, `holders-filters.yaml` |
| 20 | Exact coordinates never exposed | PASS (S1: nothing to expose) | no coordinate is stored (FlywayMigrationIT on the migrated schema: no geometry/geography or coordinate-, radius- or distance-named column, no GiST index, no comment describing the old model; plus the fresh-database check); GeoPrivacyContractTest over every response family as every seed account + logs; acceptance PrivacyScanner (coordinate / distance / radius keys, cities outside profiles, map provider requests) on every acceptance test; mobile `placePrivacy.test.tsx`, `coordinateLiterals.test.ts`, the Playwright privacy fixture |
| 21 | Private messaging | PASS | acceptance `messaging.spec.ts` (realtime delivery, unread badge, "Seen", live answer), `messaging.spec.ts` (blocks, photos); ConversationIT, MessagingAuthorizationIT, RealtimeIT; walkthrough (third collector gets 404); mobile (stage M4): `apps/mobile/e2e/messages.spec.ts`, Maestro `messages-inbox-thread.yaml`; mobile (M7): block → Settings → Blocked users → unblock (`blocked.spec.ts`, Maestro `blocked-users.yaml`) |
| 22 | Public community chat | PASS | acceptance `community.spec.ts`, `community.spec.ts` (moderation); CommunityIT, ModerationIT; mobile (stage M4): `apps/mobile/e2e/community.spec.ts`, Maestro `community-post.yaml` |
| 23 | Create wishlist | PASS (S2: simplified wish) | acceptance `wishlist.spec.ts`, `wishlist.spec.ts` (printing picker, public note, Near Mint only, one % TCG term; same selection 409, FREE limit dialog); WishlistIT (only the new fields, old members ignored, note moderation and length, admin price terms); mobile (S2): `apps/mobile/e2e/wishlist.spec.ts`, Maestro `wishlist-alert-notification.yaml` |
| 24 | New public inventory triggers match → **wishlist alert** | PASS (S2: alert, no stored match) | acceptance `wishlist.spec.ts` (Lisbon pair), `wishlist.spec.ts` (Americas South pair; Near Mint only, one alert, card page link); WishlistAlertsIT (same region yes, other region no, NM-only, rarity, one alert per item, no location, switch off, blocks); mobile (S2): `apps/mobile/e2e/wishlist.spec.ts`, Maestro `wishlist-alert-notification.yaml` |
| 25 | In-app/push notification received | PASS (in-app + log push) · DEFERRED-CLOUD (real FCM) · DEFERRED-MOBILE (device push: needs an EAS project and a real FCM sender, owner cost rule) | acceptance `wishlist.spec.ts` (live STOMP notification), `wishlist.spec.ts` (bell, `/notifications`); NotificationCentreIT, NotificationRealtimeIT, PushDeliveryIT (log push provider); walkthrough (`WISHLIST_MATCH`, unread 0 → 1; `WISHLIST_ALERT` since S2); mobile in-app (stage M4/S2): `apps/mobile/e2e/wishlist.spec.ts`, Maestro `wishlist-alert-notification.yaml` (live bell badge, alert → card page) |
| 26 | Send offers | PASS | acceptance `offers.spec.ts` (create → counter → accept → decline), `offers.spec.ts`, `payments.spec.ts`; OfferStateMachineIT, OfferAuthorizationIT, TradeLifecycleIT; walkthrough (offer → counter → accept → trade); mobile (stage M5): `apps/mobile/e2e/offers.spec.ts`, Maestro `offer-trade-rating.yaml` |
| 27 | Eligible users can rate | PASS | acceptance `rating.spec.ts` (no rating without interaction, unrelated 403), `rating.spec.ts`; RatingEligibilityIT, RatingRulesTest; mobile (stage M5): `apps/mobile/e2e/offers.spec.ts` (rate from the completed trade, a reference), Maestro `offer-trade-rating.yaml`, jest `screens/ratings` (no interaction: no rating, the reason explained) |
| 28 | Report collector via popup | PASS | acceptance `reporting.spec.ts`, `reporting.spec.ts` (all entry points); ReportFlowIT, ReportThresholdIT; mobile (stage M5): `apps/mobile/e2e/reports.spec.ts` (profile, conversation), Maestro `report-collector.yaml`, jest entry points (collector profile, community post, public binder; the map preview is gone since S1) |
| 29 | Reason required + confirm | PASS | acceptance `reporting.spec.ts` (reason → confirm), `reporting.spec.ts` (Confirm disabled without a reason); ReportFlowIT; walkthrough (no reason → 400); mobile (stage M5): `apps/mobile/e2e/reports.spec.ts` (Confirm disabled without a reason, "Report sent"), jest `screens/reports` |
| 30 | Admin reviews reports | PASS | acceptance `reporting.spec.ts` (admin sees → acts → audit log → reporter informed); ReportFlowIT, AdminAuthorizationIT; walkthrough (moderator resolves, collector 403); mobile: web-only by scope (admin consoles stay on the web); the reporter's side is mobile (M5: My reports with the status, `reports.spec.ts`) |
| 31 | Auto-delisting detects stale inventory | PASS | acceptance `stale-listings.spec.ts` (`/internal/jobs/freshness` → STALE, nothing deleted); FreshnessJobIT, FreshnessPolicyTest, StrikesIT, DelistingAdminIT; `admin-moderation.spec.ts` (policy editor); mobile: the job is server-side; the collector's side is mobile (M2: stale / hidden cards with "Confirm all", paused listings with "Resume", jest `screens/inventory`); no mobile E2E (the job's timing is proven by the web acceptance spec) |
| 32 | Admin reviews stale listings | PASS | acceptance `stale-listings.spec.ts` (admin "Needs review" queue → Restore → ACTIVE → `listing.restore` audited; closes the stage 11 gap), `admin-moderation.spec.ts` (hide, pause/resume); DelistingAdminIT; walkthrough `/admin/listings`; mobile: web-only by scope (admin console) |
| 33 | Admin suspends accounts | PASS | `admin.spec.ts` (suspend + unsuspend, role restrictions); AdminUsersIT; mobile: web-only by scope (admin console); a suspended collector sees the suspended screen in the app (M1, jest `screens/account-states`) |
| 34 | Admin actions in audit log | PASS | acceptance `reporting.spec.ts`, `stale-listings.spec.ts`, `account-deletion.spec.ts`; `admin.spec.ts`, `admin-moderation.spec.ts`, `payments.spec.ts`, `credits-ads.spec.ts`; AuditIT and the per-phase audited-write ITs; walkthrough (`REPORT_RESOLVED`); mobile: web-only by scope (admin console) |
| 35 | Freemium limits work | PASS | acceptance `freemium.spec.ts`, `freemium.spec.ts`, `inventory.spec.ts`, `admin-rules.spec.ts`; LimitsIT, BinderIT, BinderViewLimitIT; mobile (M2/M6): limits explained where they happen (`binders.spec.ts` `binders.max` 5 of 5; jest binder views, offers per day, wishlist; the map radius cap is gone since S1, ADR 0017) with "See Premium" (`billing.spec.ts`, Maestro `premium.yaml`, jest `screens/billing`) |
| 36 | Premium entitlements override | PASS | acceptance `freemium.spec.ts` (fake billing checkout → Premium lifts `binders.max`), `freemium.spec.ts`, `credits-ads.spec.ts`; LimitsIT, SubscriptionFlowIT, CreditLedgerIT; walkthrough (FREE → PREMIUM → no ads → FREE); mobile (M6): `billing.spec.ts` (fake billing checkout, a decline then a payment → PREMIUM lifts `binders.max` (sixth binder), no "Sponsored" result → "Cancel now" → FREE; a credits unlock adds a day's boost), Maestro `premium.yaml` (plan checked on the API) |
| 37 | Account deletion works | PASS | acceptance `account-deletion.spec.ts` (hidden at once; deletion job anonymises, identity deleted, consents/audit kept), `settings.spec.ts`; DeletionIT, ExportIT; mobile (M1): `account.spec.ts` (deletion request with re-authentication → the deletion-pending screen → cancelled; data export), jest `screens/account-states` |
| 38 | Legal pages exist | PARTIAL | 9 pages served under `/legal/*` in English and French (EN/FR switch, French by default for a French browser, `launch-safety.spec.ts`) with versioned consent recording the language shown (TermsIT, ConsentIT, `smoke.spec.ts` draft banner, walkthrough `/legal/terms`); mobile (M8): the same 9 texts in-app in both languages, synced from the web files, an EN/FR switch on the index and every document, French by default on a French device, the draft banner on both and the translation marking in French, consents with the language shown (`legal-french.spec.ts`, Maestro `legal-french.yaml`, jest `screens/legal`, `features/legalLanguage`); texts are drafts until counsel review and the French translation awaits the lawyer's validation (owner action) |
| 39 | CI runs automatically | PASS | GitHub Actions CI green on `main` for the stage 11 merge (`7bb5c27`) and on stage PRs (API incl. Testcontainers, web, mobile, ML, Terraform); `e2e.yml` now runs the whole Playwright suite on PRs, nightly and on demand (first GitHub run with the next PR); `npm run test:all` mirrors it locally; mobile: CI runs the mobile typecheck, lint, jest and the `mobile-web` Playwright job; the Maestro flows are local only (they need an Android emulator or a Mac's iOS simulator) |
| 40 | E2E covers critical workflows | PASS (web) · PASS (mobile, Android emulator and iOS simulator) | 67/67 Playwright tests (51 feature + 16 acceptance) against the real local stack, 0 flaky, 0 skipped; mobile (M1–M7): 54/54 Playwright mobile web specs (`apps/mobile/e2e`, isolated stack, 0 flaky, 0 skipped) and 21 Maestro flows in Expo Go on the Android emulator (`apps/mobile/.maestro`), covering accounts, Google sign-in, inventory (photos, bulk actions), binders, the map, card holders, collector and binder search, messages, blocked users, wishlist, offers, trades, ratings, reports, payment protection, disputes and Premium; iOS (2026-10-10): the 24 Maestro flows of today's suite, one set for both platforms, in Expo Go 57 on an iOS 27.0 simulator (`npm run test:mobile:maestro -- --platform ios`: 24/24 passed in one run from a cold start, 33 min 28 s), with the iOS defects they found fixed (the back button's "(tabs)", dialogs opened from a sheet, photo picking and upload, the doubled home-indicator inset); the Android run was not repeated on the Mac (no Android SDK), a physical iPhone and a store build are not proven. Latest (2026-10-14, stage S6): 74 web Playwright tests, 60 mobile web specs and **30/30 Maestro flows on the owner's iPhone 18 Pro simulator** (30 since S5's review fix 2), all with retries off |
| 41 | Runs locally | PASS | `npm run infra:reset -- --yes` → `npm run test:all` green → `npm run dev` ready in 50.6 s → 36/36 API + 28/28 UI walkthrough checks; fake payments/billing/donations, log push/e-mail/analytics, no external credentials; mobile: Expo Go on a local Android emulator, or on the iOS simulator of a Mac, against the local stack; `npm run test:mobile:e2e` (isolated API :8090, web build :19006) and `npm run test:mobile:maestro` (Metro :8082; `-- --platform android\|ios`, the iOS simulator created and booted by the harness) run locally and free (no EAS, no Expo account, no Maestro Cloud) |
| 42 | Deploys to Google Cloud | DEFERRED-CLOUD | owner decision (docs/deployment/DEFERRED.md); Terraform validates (`npm run infra:validate`), never planned or applied |
| 43 | Cloudflare configuration documented | PASS | `infrastructure/cloudflare/README.md` + Cloudflare Terraform (validated by `npm run infra:validate`); applying it is DEFERRED-CLOUD |
| 44 | Production architecture supports www.orenjitrade.com | DEFERRED-CLOUD | designed (ARCHITECTURE.md, ADRs, Terraform for Cloud Run + Cloudflare, validated); not deployed |

### Remaining gaps (after the final verification)

- **Cloud (apply deferred by owner; configuration prepared 2026-10-05, ADR 0016):** the owner runs `terraform apply` (GCP project, state bucket, WIF, the low-cost prod profile incl. the generated `ANALYTICS_ACTOR_SALT` / `ADS_TOKEN_SECRET` / `SERVICE_TOKEN` secrets), the Cloudflare apply and the console steps (`docs/deployment/README.md`); still missing in code: the `/internal/events/pubsub` receiver (domain-events push stays off), sendgrid/ses e-mail adapters (`log` only), the Stripe live keys, device push (FCM) and the first real Pub/Sub → BigQuery run; the sidecar probe / fractional CPU / Certificate Manager questions listed in that section can only be settled at the first apply.
- **Mobile (resumed 2026-10-04, local and free only):** Phases 1–10 done in stages M1–M6 (merged as #41, #45–#48, #51) and the web parity gaps closed in stage M7 (see "Mobile app (stage M1)" to "(stage M7)"; admin consoles stay web-only); the launch-readiness mobile half done in stage M8 (18+ confirmation, French legal pages, safety notice, money-off; branch `feature/launch-readiness`); open: the Expo SDK 58 upgrade (owner-approved, its own PR), the full French UI translation (after the upgrade), Google sign-in against a real Firebase project (OAuth client ids; proven only against the Auth emulator), signed-out browsing (the web's anonymous routes are not mirrored), the owner's decision on app-store purchases before any store build sells Premium or takes donations (ADR 0011 open question: in-app purchase, link out to the web, or web-only purchases), device push delivery (needs an EAS project and real FCM), fonts; EAS stays unused (project id placeholder). **iOS (2026-10-10):** proven in Expo Go on the iOS 27 simulator with the whole native suite (`npm run test:mobile:maestro -- --platform ios`, "Mobile app on the iOS simulator"); not proven: a physical iPhone and a store or TestFlight build (an Apple developer account and a native build, owner cost rule). **Android on the Mac:** not re-run (no Android SDK; skipped by owner decision); photo uploads from the Android app are expected to fail as they did on iOS (same Expo fetch) and keep their old code until an Android run can prove the fix; the API drops the EXIF orientation of uploaded photos on every client (see that section's "Open").
- **ML (on hold):** Phase 11 card recognition and scanning.
- **Legal:** counsel review of the 9 draft legal pages and validation of their French translation (criterion 38); the `[to confirm]` placeholders of the Privacy Policy (privacy officer, data locations).
- **Backend debt (local):** Phase 10 analytics events (subscription, credit spend, ad served/clicked, donation) and AnalyticsIT coverage of the Phase 9 payment/dispute events; declare the Phase 8 `ProblemDetail` extensions (`latestOfferId`, `offerId`, `currentVersion`) in OpenAPI, regenerate the clients and drop the web's `problemExtension()` reads; join blocks into the Phase 4 discovery SQL; binder names/descriptions and public notes through `TextModerationService`; `Idempotency-Key` replay fail-open without Redis; avatars re-encoded as JPEG (no WebP encoder); OpenAPI `info.license` lacks `identifier`/`url`; generated client sends `application/problem+json` on 204 operations (web `accept-header.interceptor.ts` workaround).
- **Web debt:** `/sets` index page; admin set/printing creation UI; E2E for the admin plan editor, admin subscription cancel and donation refund/settings; `metadata.<key>` catalog filters not exposed; Leaflet `_leaflet_pos` console error on map teardown during zoom; fake checkouts poll up to ~45 s for the synthetic webhook; initial bundle 887.66 kB close to the 900 kB warning budget (887.59 kB before the map privacy rendering, 877.57 kB before the card pictures); the admin seed account lands on `/onboarding` after sign-in (staff profile not onboarded).
- **Hardening (Phase 13):** dedicated security review and header audit, rate-limit tuning (rapid full reloads reach the 120/min per-user and 60/min anonymous per-IP limits, see stage 12 debt), accessibility pass, load test script, DB index review, backup/restore docs, failure testing; first GitHub run of the E2E workflow.

---

## macOS / Apple Silicon development (2026-10-10)

First run on the owner's Mac mini (Apple M6, macOS 27.0.1, OrbStack 2.2.3 with Docker Engine 29.4,
Temurin 27 as the only system JDK). The per-item record is in `docs/development/macos-setup.md`
(first-run section, 4.4, 5 and 12).

- **Docker:** `docker-compose.yml` names `platform: linux/amd64` for the amd64-only PostGIS image
  (an Apple Silicon engine refuses the unpinned pull). Testcontainers needs no change: it pulls
  linux/amd64 by itself after the refusal. Proven under OrbStack with `FlywayMigrationIT` and
  `FeatureFlagsIT` (12 tests, 16-19 s for the Gradle run, PostGIS container up in 3.5 s).
- **Gradle:** the daemon is pinned to Java 21 (`apps/api/gradle/gradle-daemon-jvm.properties`), so
  `spotlessCheck` passes when the default JDK is newer (it failed on a JDK 27 daemon). CI and the
  Dockerfile launch with Temurin 21 and are unaffected; the image's build stage was built locally.
- **Scripts** (unit-tested, `npm run test:scripts`: 111 tests): the E2E harnesses run the API jar on
  an exact Java 21 when one exists (`ORENJI_JAVA_HOME`, exported or in `.env`, overrides the choice;
  a newer `JAVA_HOME` does not; a newer Java only as the last resort, with a warning);
  macOS paths and hints for adb, Maestro, Terraform and the ML Python; the E2E isolation guard folds
  path case on macOS; `test:e2e -- --stop` recognises java and node there.
- **Docs:** OrbStack as a supported engine, the JDK statements, the Playwright cache path, macOS
  examples; `claude-handoff.md` names the real machine.
- **Not verified on the Mac in that first session:** the full `npm run test:api`, the web and
  mobile E2E suites, the Maestro suite, iOS, and Docker Desktop. The Maestro suite and iOS followed
  the same day: see "Mobile app on the iOS simulator" below.
- **Open:** the arm64 PostGIS image decision before macOS 28, and the owner items of
  `claude-handoff.md` section 6 (OrbStack licence terms, dev ports exposed on the LAN, the Android
  SDK). The iOS path of the Maestro harness (macos-setup.md 12 item 2) is done (next section).

---

## Mobile app on the iOS simulator (2026-10-10)

Owner decision (2026-10-10): on the Mac the native tests run on the iOS simulator (the Android SDK
is skipped for now). Branch `feature/ios-maestro-harness`, on top of stage S2 and the macOS fixes.
The Expo app had only ever been proven natively on an Android emulator; the same Maestro flows now
run in Expo Go 57 (57.0.9) on an iOS 27.0 simulator (iPhone 17), locally and for free (no EAS, no
native build, no Maestro Cloud).

- **Harness** (`npm run test:mobile:maestro -- --platform ios|android`, or
  `ORENJI_MAESTRO_PLATFORM`; without a choice: Android when a device is ready, otherwise iOS on a
  Mac with Xcode). `scripts/lib/mobile-maestro.mjs` keeps its Android path as it was and gains an
  iOS one; `scripts/lib/ios-simulator.mjs` owns the simulator and `scripts/lib/host-tools.mjs` the
  pure helpers (platform choice, app id and URLs per platform, runtime and iPhone model choice,
  the simulator's preferences), unit-tested in `host-tools.test.mjs` and `mobile-maestro.test.mjs`
  (`npm run test:scripts`: 133 tests, 111 before).
  - **A simulator of its own**, "OrenjiTrade Maestro": created when missing (the newest standard
    iPhone on the newest installed iOS runtime), booted with `simctl` alone (no Simulator /
    DeviceHub window), awaited with `simctl bootstatus`, shut down at the end unless
    `--keep-running`. A developer's simulators are never booted or changed.
    `ORENJI_IOS_SIMULATOR_NAME`, `_TYPE` and `_UDID` choose another one.
  - **Settings inside that simulator only**, never in the Mac's: AutoFill Passwords off (iOS put
    its "Save Password?" sheet over the app after a sign-in), US English (a simulator inherits the
    Mac's languages and region), a keyboard without auto-correction or predictions, `exp://` links
    that open in Expo Go without a question. iOS reads them at boot, so the first run restarts the
    simulator once.
  - **Expo Go** is installed on that simulator by Expo CLI's own installer
    (`scripts/lib/expo-go-ios.mjs`), whatever other simulator is booted; `expo start --ios` is not
    used (it opens the project on the first booted simulator and brings its window forward).
  - Metro points the app at `http://localhost:8090` and the Auth emulator at `localhost:9099`; the
    iOS bundle is checked for that API address before any flow runs; a Metro kept for the other
    platform is refused (the address is inlined into the bundle); `--stop` also shuts the kept
    simulator down; the run's emulator accounts are deleted at the end as on Android.
- **Flows: one set for both platforms, no copies.** Every flow and subflow takes Expo Go's id from
  the harness (`appId: ${APP_ID}`). What the platforms do differently sits in
  `apps/mobile/.maestro/subflows/`, in `when: platform:` blocks: `hide-keyboard.yaml` and
  `hide-keyboard-in-dialog.yaml` (Maestro's own `hideKeyboard` flicks the middle of the screen on
  iOS and pressed "Forgot your password?"), `go-back.yaml` (the header's back button),
  the three scroll subflows (iOS also lists what a page holds under the tab bar and the header, so
  the element is brought clear of them with `scrollUntilVisible` and `centerElement`),
  `assert-checked.yaml` / `assert-unchecked.yaml` (iOS has no checkbox control: React Native puts
  "checkbox, checked" in the element's value), `dismiss-dev-menu.yaml` and
  `hide-tools-button.yaml` (Expo Go 57 on iOS floats its developer-tools gear over the notification
  bell: the flows switch it off, as the Expo SDK 58 branch does on Android). No flow is skipped
  on iOS.
- **What an Android run would notice** (the Android steps could not be re-run: no Android SDK on
  the Mac). Every step that ran before still runs, in the same order, with these exceptions:
  1. `appId` comes from `${APP_ID}`: the harness passes `host.exp.exponent`, the value the flows
     had; a manual `maestro test` now needs `-e APP_ID=host.exp.exponent`.
  2. `hideKeyboard`, `back`, `assertVisible … checked:` and the edge-swipe scroll loops moved into
     the subflows' Android blocks, unchanged; the two Android-only steps of `dismiss-dev-menu.yaml`
     (the "isn't responding" dialog, the back key) carry `platform: Android`.
  3. Two patterns are wider: `'.*Je confirme avoir 18 ans ou plus'`
     (`age-step-existing-account.yaml`) and `'Wishlist alert: Emberfang Fox.*'`
     (`wishlist-alert-notification.yaml`). Both still match the text Android lists.
  4. `google-sign-in.yaml` hides the keyboard through `hide-keyboard-in-dialog.yaml` (the same
     `hideKeyboard` on Android).
  5. The harness records the platform of a kept Metro and refuses the other platform's; without
     `--platform` a Mac with Xcode and no Android device now runs on iOS instead of stopping with
     "No Android device is ready".
  6. The app: nothing. Every fix below is behind `Platform.OS === 'ios'` or an iOS-only property.
- **Defects of the app on iOS, found by these runs and fixed** (each with a jest test; Android and
  the web render and behave as before):
  1. **The back button said "‹ (tabs)"** on every screen opened from a tab, and "‹ (auth)" on the
     legal pages opened from sign-in (iOS shows the previous screen's title; the route groups had
     none). It now names the screen behind it: "‹ Profile", "‹ Messages", "‹ Sign in"
     (`src/navigation/backTitles.ts`).
  2. **A dialog or sheet opened from a sheet never appeared.** "Block" in a conversation's menu
     did nothing: iOS refuses a second modal while the first is still sliding away. The app's
     modals now take turns on iOS (`src/components/ui/modalTurns.tsx`, used by `BottomSheet`,
     `ConfirmDialog`, `FormDialog`, `ReasonDialog`); the bulk bar's "Temporarily public" sheet,
     which follows another sheet, is fixed by the same change. Found by `blocked-users.yaml`.
  3. **Photos could not be attached or uploaded at all** (no flow picks a photo; found and proven
     by hand on the simulator with a photo sent in a conversation, a card photo and a profile
     picture): "Attach a photo" in a conversation did nothing (the picker left with the attach
     sheet); an iPhone's HEIC photos were refused with "Use a JPEG, PNG or WebP photo." (the picker
     is now asked for its "compatible" representation, `src/lib/photoPicker.ts`); and every upload
     ended in "We could not reach OrenjiTrade." because Expo's fetch does not take React Native's
     `{ uri }` file part (iOS now sends an `expo-file-system` File, `src/api/localFilePart.ts`).
  4. **Forms ended 34 pt too high** (the home-indicator inset was applied twice on scrolling
     screens), which put the last button exactly under the snackbar: after "Save changes" on a
     card, "Card saved." covered "Delete card" until it faded (`ownSafeBottom` in `Screen.tsx`).
     Found by `inventory-add-edit-delete.yaml`.
  5. **The icon of a form message was part of its VoiceOver name** ("<glyph>, No account matches
     these credentials."); the icon is hidden from iOS accessibility (`FormControls.tsx`).
  6. **The 18+ checkbox was named in English only** for VoiceOver although it shows both languages
     (Bill 96); on iOS its name carries both (`ageConfirmationAccessibleLabel`).
- **Result:** **24/24 flows passed in one run from a cold start** on the owner's Mac mini
  (`npm run test:mobile:maestro -- --platform ios` with nothing running and no dedicated simulator:
  the harness created the simulator, built and started the API, started Metro and installed Expo
  Go): 31 min 52 s of flows, 33 min 28 s in all; afterwards the simulator was shut down, ports
  8082 and 8090 were free and the run's 29 emulator accounts were deleted. The cold run before it
  had 22/24: `search-card-detail.yaml` and `safety-notice.yaml` failed in the keyboard subflow
  (the right edge is not inside the Search results nor a conversation's message list), fixed in
  `hide-keyboard.yaml` before the passing run. `--keep-running`, `--stop`, `--skip-build`,
  `ORENJI_MAESTRO_PLATFORM` and the choice without `--platform` were exercised by hand
  afterwards.
- **Checks**, on the code of the passing run (the commit after it adds documents only):
  `npm run test:scripts` (133 tests); `node --check` on the changed scripts;
  `npm run typecheck -w apps/mobile`; `npm run lint -w apps/mobile`;
  `npm run format:check -w apps/mobile`; `npm run test:mobile` (jest: 676 tests in 79 suites, 662
  in 77 before; 28 harness guard tests); `npx expo export --platform android`, `--platform ios`
  and `--platform web` into throw-away directories; `npm run test:mobile:e2e` (52 passed on the
  first attempt); the full `npm run test:mobile:maestro -- --platform ios` above.
- **Independent verification (2026-10-12, by the lead, on the head merged with `main`):**
  `npm run test:scripts`, `npm run typecheck -w apps/mobile`, `npm run lint -w apps/mobile` and
  `npm run test:mobile` green; then `npm run test:mobile:maestro -- --platform ios` on the
  dedicated simulator **erased first** (`simctl erase`: no Expo Go, no settings): **24/24 flows in
  32 min 2 s**, 33 min 37 s in all; `npm run test:mobile:e2e` 52 passed; `npx expo export
  --platform ios`. The mock catalog's card pictures render in Search and on the card page on iOS
  (the screenshots of `search-card-detail.yaml`). A first independent check on 2026-10-10 compared
  the steps an Android run executes in every flow with the ones before the branch: the same steps
  in the same order, apart from the exceptions listed above.
- **Found by the pull request's first CI run (2026-10-12), fixed:** `holders.test.tsx` ("applies
  every filter and the sort to the request, then clears them") failed on the slower CI runner and
  passed on the Mac. Cause, in the app and not in the test: a sheet asked for again while it was
  still sliding away waited for its own turn, so it was taken down and put up again (on an iPhone:
  "Show results" then a quick "Filters" made the sheet leave and come back), and the test pressed
  a button of the sheet that had just gone. `BottomSheet` now brings such a sheet back at once: it
  is the modal on screen, there is nothing to wait for. New jest test (it fails without the fix;
  677 tests); the unit suite was re-run on throttled cores (`taskpolicy -b`), which reproduces the
  CI timing; `blocked-users`, `holders-filters` and `inventory-add-edit-delete` re-run on the
  simulator (3/3).
- **Not verified:** the Android run of the flows and of the harness (no Android SDK on the Mac:
  the Android steps are the ones that ran before, read but not executed); a physical iPhone and a
  store or TestFlight build (Expo Go on the simulator only: no Apple developer account, no native
  build, owner cost rule); photo picking in a permanent flow (the system photo picker is outside
  the app's accessibility tree: checked by hand, see defect 3) and the camera (none on a
  simulator); dispute evidence photos (same upload code as the three proven ones, not driven);
  device push (needs an EAS project and a real sender); Google sign-in against a real Firebase
  project (emulator only, as on Android); Maestro on Java 27 (the runs used a JDK 21 as
  `JAVA_HOME`).
- **Open (owner):**
  - **Photo uploads on Android.** Android runs the same Expo fetch, so by reading the code every
    native photo upload fails there the same way ("We could not reach OrenjiTrade."). The iOS fix
    was not applied to Android because nothing here can prove it: `localFilePart` needs its
    platform check removed and one Android run with a photo.
  - **Uploaded photos can come out rotated (API, every client).** The API re-encodes an upload and
    drops its metadata without applying the EXIF orientation first (`ItemImageProcessor`,
    `AvatarImageProcessor`, the message upload): a photo stored rotated by its camera, which is
    how phones store portrait shots, is shown sideways or upside down. Seen with a simulator
    sample photo sent in a conversation. Not changed here (backend, outside this branch).
  - A notification row's name ends in "Uruguay.. Unread" (two full stops, both platforms):
    cosmetic, left as it is.
  - Installing the Android SDK on the Mac stays optional; until then nothing there proves the
    Android half of a mobile change (`docs/development/claude-handoff.md`).

## Mobile app: regions and the region map (stage M9, 2026-10-12)

Owner order of 2026-10-12: mobile only, the web app is paused until a new order. Branch
`feature/mobile-regions-map`, on top of `main` at `00714a9`. This stage closes the S1 "Mobile
follow-ups" 1, 2 and 5: the phone gets the region switcher, the region map with the binders of a
state or province, and loses its map libraries. Nothing changed in `apps/api`, in
`apps/web-angular` or in the seeds: every endpoint the phone needs existed (`GET /regions`,
`GET /regions/{region}/binder-counts`, `GET /regions/{region}/subdivisions/{code}/binders`).

**What a collector can now do on the phone**
- **Choose the region to browse.** "Region: Americas (North)" sits on top of the Map and Search
  tabs and, as a round button, in the header of the card holders. It opens a sheet with the three
  regions, the collector's own marked "Your region". Search (collectors and binders), the card
  holders, sponsored placements, the map and its binder lists follow at once, and every one of
  those calls names the region. In another region than their own the switcher takes the accent
  colour, a line says "Not your region." and "Back to Americas (North)" goes home in one press;
  titles and empty states name the region instead of "your region" ("Who has Cinderpeak Dragon in
  Europe", "Who trades in Europe?"). A new visit starts in the collector's own region.
- **See the region as a map.** The Map tab draws the countries of the region with their states
  and provinces, shaded by their number of public binders in the web's five steps (none, 1, 2 to
  4, 5 to 9, 10 and more), with the count of the region above it. A tap on a state or province
  opens its public binders; holding it names it first (its name, its number of public binders,
  "Open"). A pinch or the + and − buttons zoom (up to 16 times); once zoomed in a drag moves the
  map, and "Show the whole region" comes back. While the whole region is on screen a finger
  dragged over the map scrolls the page. The state opened last is outlined; a place with binders
  is outlined in a strong colour, and one too small to be seen gets a dot (review fix 1).
- **Or as a list.** "Map | List" shows the same region as a list of its states and provinces by
  country, each with its count ("Quebec, 2 public binders"), with a filter field (accents and case
  ignored, a country name keeps its places) and "Only places with binders". The list is a way in
  of its own, not a fallback: the tab opens on it while VoiceOver or TalkBack is on, and remembers
  the view chosen.
- **Open the binders of a state or province**: each binder with its name, kind, number of cards
  and games, its owner by name and handle, the owner's state or province and country (never a
  city), when it was last updated, and a link to the public binder. The list is read page after
  page by cursor (20 at a time), with a skeleton, "No public binders here yet", and an error with
  "Try again".
- **Follow a link**: `/?region=europe&subdivision=FR-IDF` opens the tab on a region and one of its
  states (the web's `/map?region=&subdivision=`), also after signing in, and every time it is
  opened; a link to a region that does not exist changes nothing (review fix 1).
- A collector without a location still gets "Where are you?" on the tab.

**Decisions and why**
- **How the map is drawn: `react-native-svg` on the device** (15.15.4, part of Expo Go 57, pinned;
  `src/features/map/RegionMap.tsx`). No tile, no map provider, no WebView, no request for
  geography, no device location. A region is two SVG paths (every state and province as one,
  every country border as another), one more per state that has binders and one for the state
  opened last: 4 to about 10 elements with today's data instead of 243 to 653. During a drag or a
  pinch nothing is drawn again: the drawn picture is slid and scaled with a transform, and the
  vectors are drawn once more when the fingers lift (line widths stay in screen points at every
  zoom). A tap is resolved in JavaScript on the drawing (bounding boxes, then an even-odd test on
  the rings, then the closest border within ten points for small states), so one responder view
  takes every gesture and VoiceOver sees the map as one image that points to the list. Pure
  arithmetic in `mapWindow.ts`, `regionOutline.ts`, `shading.ts` and `places.ts`, tested without
  a renderer.
- **How the boundaries reach the app: a generated copy, checked by a test**
  (`npm run sync:boundaries -w apps/mobile`, like `sync:tokens` and `sync:legal`). The web's
  files (`apps/web-angular/public/boundaries`, Natural Earth 5.1.1, public domain) are neither
  moved nor edited. `scripts/lib/boundaryOutlines.js` projects them once (Web Mercator, the
  projection of the web's Leaflet map; one unit is 0.01° of longitude, the precision of the
  source) and writes `assets/boundaries/<region>.json` as SVG path data with relative steps. The
  app therefore holds **no degrees at all** (ADR 0017; `coordinateLiterals.test.ts` still scans
  `src/` and `app/`), does no projection at run time, and the files are 104 / 62 / 139 kB instead
  of 241 / 145 / 316 kB. `--check` and `regionOutlines.test.ts` fail when a copy drifts from its
  web file, when a state the web draws is missing, or when the first view differs from the web's
  `REGION_VIEW`. Native bundles carry the three files and build a region's drawing the first time
  that region is shown (`outlineFiles.ts`: a `require` inside a function); the web export puts
  each in its own chunk, downloaded from the app's origin when that region is shown
  (`outlineFiles.web.ts`; an E2E spec checks that only the region on screen was downloaded).
  Shipping them as downloadable assets instead was not chosen: it would add a request and a
  loading state for 305 kB.
- **Where the switcher lives**: where the phone browses by region and nowhere else. A pill on top
  of the Map and Search tabs (it names the region, so nobody has to open it to know); a round
  button in the navigation header of the card holders, whose title, subtitle and count already
  name the region and whose list needs the room. One component, `RegionBar`, on the existing
  `SelectSheet` bottom sheet (modals keep taking turns on iOS).
- **Which region**: the pick of this session, else the collector's home region (`GET /me`), else
  the last region picked on this device, else Americas (North)
  (`src/features/regions/browsingRegion.ts`). A signed-in collector with a location therefore
  always starts at home, as on the web; the device memory serves a collector who has not said
  where they are. Only a region code is kept on the device (AsyncStorage, in try / catch), never
  a place. A pick belongs to the account and home region it was made under: another account on
  the same phone, or a location saved in another region, starts from its own region. Wishlist
  alerts stay tied to the home region (server side), which the empty state of the card holders
  says ("we'll tell you when a collector of your region lists it").
- **A finger on the map scrolls the page until the map is zoomed in** (changed by review fix 1;
  the first version kept every touch for the map, and a map that filled the screen left its own
  buttons and legend out of reach). While the whole region is on screen the map has next to
  nothing to move, so a drag belongs to the page; zoomed in, or with two fingers, the gesture is
  the map's and the page stands still. The parts of the region the first view leaves out (the
  far north of Canada) are reached by zooming in and dragging.
- **`react-native-maps`, `react-native-webview`, `leaflet` and `@types/leaflet` are gone** from
  `apps/mobile` (nothing else used them: checked by search), with their jest mocks, the config
  plugin entry and the jest transform entry. The lockfile follows (`npm install` at the root;
  `npm ci` is what CI runs). The web keeps its own `leaflet`.
- **Wording follows the web**: "Binders in <region>", "<n> public binders in <region>", "States
  and provinces", "Only places with binders", "No public binders here yet", the same map name for
  screen readers, "Made with Natural Earth". `regionWording.test.ts` keeps "near", "nearby",
  "close to you", "around you" and "km away" out of `src/` and `app/` ("Near Mint" is a card
  condition and stays).

**Measurements**
- Drawings: Americas (North) 348 states and provinces, 599 rings, 12,056 points; Americas (South)
  243 / 293 / 7,070; Europe 653 / 862 / 15,414. On screen: 2 paths plus one per shaded state.
- Bundles (`npx expo export`, Expo SDK 57; "before" is `00714a9` exported the same way):

  | | Before | After |
  | --- | --- | --- |
  | iOS (Hermes) | 4,874,359 B, 1,641 modules | 5,425,787 B, 1,771 modules |
  | Android (Hermes) | 5,167,699 B, 1,765 modules | 5,723,727 B, 1,895 modules |
  | Web entry | 2,753,111 B, 73 static routes | 2,837,262 B, 74 static routes |
  | Web, per region | none | 132,238 B (Europe), 99,913 B (Americas (North)), 59,297 B (Americas (South)), each loaded when shown |

  The native bundles grow by about 0.55 MB: `react-native-svg`'s JavaScript (about 130 modules),
  the three drawings (305 kB of source) and the new screens. The removed map libraries were not
  in the JavaScript bundle any more (nothing imported them since S1); they leave the native
  dependencies and the install.
- Time, on the iOS 27 simulator of the Mac mini, in Expo Go with Metro's development bundle
  (temporary logs, removed): reading a region's file 4 to 8 ms (47 ms for the first one, right
  after the app starts); building the one path of all states under 0.5 ms; **first drawing
  committed 132 ms after the tab asked for it on a cold start and on screen two frames later, at
  218 ms**; switching to Europe, the heaviest region: drawn 11 to 13 ms after the pick, on screen
  within 37 ms, and once more when its counts arrive. A drag of 1.1 s: 65 touch moves, 66 React
  commits of 0.75 to 0.97 ms on average (2.6 ms at most) and no path drawn; the redraw after the
  fingers lift, or after a zoom button, is on screen 15 to 35 ms later.

**Tests**
- jest (84 suites / 757 tests; 79 / 677 before): `browsingRegion.test.tsx`
  (the order of the choice, the home region, the device memory, another account, a storage that
  cannot be read or written, a pick made while the device is read, the switcher and its sheet),
  `regionOutlines.test.ts` (the projection, the path format, every copy against its web file,
  every state the web draws, hit testing with islands and holes, the shading steps against the
  web table, the window arithmetic of panning and zooming), `places.test.ts` (the list: grouping,
  filter, whole-country entries, link codes), `map.test.tsx` (the tab: counts, drawing, tap,
  zoom with buttons and two fingers, the page standing still, the switcher, errors and retries,
  the link, the list with its names, the view remembered, a screen reader), `place.test.tsx` (the
  binders: skeleton, rows and their one name, never a city even if an answer carried one, cursor
  pages and a failed page, empty, error and retry, a malformed link), `regionWording.test.ts`,
  and additions to `placePrivacy`, `holders`, `card-detail`, `search-segments`, `choice`,
  `tabs-layout`, `auth-gate`, `gate` and `useAppStore`.
- Mobile web E2E (`apps/mobile/e2e`, 55 specs, 52 before): `regions.spec.ts` (a state from the
  map and from the list, its binders with the owner and the state and never the owner's city, a
  binder opened, a state without a binder, only the drawing of the region on screen downloaded;
  the switcher re-scopes search, with the region in the request, and the map; a link) and
  `map.spec.ts` reworked (every request of the tab goes to the app's origin or the isolated API).
- Native flows (`apps/mobile/.maestro`, 25 flows, 24 before): `map-region-binders.yaml` replaces
  `map-placeholder-profile.yaml` (the map and its name, the zoom buttons, the list, a state
  without a binder, Quebec and its binders, a binder opened, then a profile with its state and
  shown city); `region-switch.yaml` is new (the sheet, Europe on the map, in its list and in
  Search, "Not your region", the way home, a link). `scripts/region-map.js` reads on the host
  what a state holds through the two public endpoints. The seeds were enough: Americas (North) 4
  public binders (Quebec 2, Ontario 1, California 1), Europe 2 (Île-de-France, Community of
  Madrid), Americas (South) 2. They are too thin to show the two darkest shades (5 to 9, 10 and
  more) and a second page of binders on a device: both are covered by jest.

**Found on the simulator and fixed** (each with a jest test; for 2 and 3 the test can only pin
the style, the fault is one of layout that a device shows)
1. A sheet's region name ended in "…" at large text sizes: the switcher shows its whole name and
   wraps (`SelectSheet` `wrap`), with corners that stay a pill on one line and become a rounded
   box on several (three lines of large text made an oval).
2. A country header stuck to the top of the list let the rows show through above it (dark mode):
   its space is padding, not margin.
3. "Who trades in Europe?" showed only its icon over the field on iOS: the invitation of an empty
   Search segment had no height of its own.
4. **The title of every tab header was cut in half at the largest text sizes** (not new: the six
   tabs since M1). The bar keeps its height, so its title no longer follows the text size, like
   the stack headers iOS draws and the tab bar (`headerTitleAllowFontScaling`).
5. At the largest size "Binders in Americas (North)" cut "Americas" in two: the large title of
   the Map tab and of a place follows the text size up to twice its size
   (`TITLE_MAX_FONT_SCALE`), still larger than body text at that size.
6. At the largest size the name, region and count of a place kept half of the screen and left the
   binders a strip: they are the head of the list and scroll away with it.
7. The map was drawn twice when the tab first showed (once for the provisional height of the
   frame, then for the real one): `RegionMap` waits for the height the screen gives it.

**The keyboard subflow of the native suite (not caused by this stage)**
After a restart of the Mac the simulator, booted without a window, puts the keyboard away while
Maestro types and brings it back at the next touch, the field still focused. A list only lets go
of a keyboard that is on screen, so `subflows/hide-keyboard.yaml` (a drag, then a tap beside the
form) no longer hid it on list screens: `collector-search-looking-for.yaml` and
`search-card-detail.yaml` failed there too, also with the Search tab as it is on `main`, while
the form flows passed. Before the restart the same flows passed (the keyboard stayed up while
Maestro typed). The iOS block now drags once more when the keyboard is still on screen after the
tap; the Android block is untouched. Both behaviours are handled. The app is not involved: with
the keyboard on screen a drag of the list hides it, on a list of one row as well.

**Checks on the final code** (2026-10-12, the owner's Mac mini, retries off)
- `npm run typecheck -w apps/mobile`, `npm run lint -w apps/mobile`,
  `npm run format:check -w apps/mobile`: clean.
- `npm run test:mobile`: typecheck, lint, jest 84 suites / 757 tests (79 / 677 before), 28
  harness guard tests.
- `npx expo export --platform ios`, `--platform android` and `--platform web` into throw-away
  directories: the three succeed (sizes above; 74 static routes, 73 before).
- `npm run test:mobile:e2e -- --retries=0`: 55 passed on the first attempt (49.7 s; 1 min 12 s
  in all).
- `npm run test:mobile:maestro -- --platform ios` with no API and no Metro running:
  **25/25 flows passed in one run** (38 min 1 s of flows, 38 min 27 s in all; 24/24 in 32 min
  before: one flow more, and the keyboard subflow waits longer where the keyboard came back).
  Afterwards ports 8082 and 8090 were free and the run's 29 emulator accounts were deleted. The
  simulator, shut down four minutes earlier by `-- --stop`, was found booted when the run began
  (what booted it was not found), so the run left it booted: it was shut down by hand.
- `npm run test:scripts`: 133 tests. `npm run audit:gate`: OK (the 2 allowlisted advisories,
  `braces` and `node-forge`, until 2026-11-30).
- Because the lockfile changed, once: `npm run build -w apps/web-angular` (initial total
  899.93 kB, 214.55 kB transfer, under the 900 kB warning budget, no warning) and
  `npm run test:web` (lint clean, 142 files / 678 tests). The web was not changed.
- `npm run sync:boundaries -w apps/mobile -- --check`: the three copies are up to date.
- The branch is nine commits; each of the six that change the app or its unit tests was
  type-checked, linted, format-checked and unit-tested on its own before the next one was made.
- Walked on the simulator (iPhone 17, iOS 27.0, Expo Go 57): the three regions on the map, the
  region sheet, a state with binders (Quebec, Île-de-France) and one without (Northwest
  Territories), Search, a card and its holders in another region and back, in light and in dark, then the Map tab, the sheet, the list, a place and Search at the largest
  accessibility text size; the names VoiceOver reads were read from the accessibility tree
  (the region button, the title and count, "Map or list", the map as one image named "Map of
  Americas (North): states and provinces shaded by their number of public binders", "Zoom in" /
  "Zoom out", the radio buttons of the sheet, "Not your region." and "Back to Americas (North)",
  "France, 1 public binder", "Île-de-France, 1 public binder", the back button "Map", one link
  per binder with its whole name).
- Git status clean; no API, Metro or simulator left running; the simulator is back to light
  mode and the default text size, and shut down.

**Not verified**
- **Android**: no Android SDK on this Mac. The Android run of the flows could not be verified,
  nor the app on an Android device. By reading: the map uses no iOS-only API
  (`react-native-svg`, the responder system, `transform`; `onStartShouldSetResponder` returns
  true so the page behind does not take the gesture over); the new flows keep platform
  differences in the shared subflows; `npx expo export --platform android` succeeds.
- A physical phone: the timings above are a simulator on an Apple M6 with a development bundle.
  A mid-range phone is several times slower; the design keeps the work during a gesture to a
  transform for that reason, but nothing here measures it.
- A pinch on a device or simulator (Maestro has one finger): covered by jest only (two touches on
  the responder, the zoom about the fingers).
- VoiceOver itself was not switched on: the names were read from the accessibility tree
  (`maestro hierarchy`), which is what VoiceOver reads; TalkBack not at all (Android).
- The two darkest shades and a second page of binders on a device (seed data too thin, see
  Tests).

**Open (owner)**
- Done in the ship step (2026-10-13, by the lead): the two sentences of `CLAUDE.md` that this
  stage made stale now say that the mobile Map tab draws the same boundaries with
  `react-native-svg` from `apps/mobile/assets/boundaries` (`npm run sync:boundaries`) and that
  region-scoped calls send the browsed region (the region switcher; the home region by default).
- OrbStack does not start at login: after the restart of the Mac on 2026-10-12 every test stack
  stopped with "Docker is not running" until `orbctl start` (the three shared containers then
  came back by themselves, and the Auth emulator had lost its accounts with the restart).
- Seen, not changed (older than this stage, every screen): changing the text size while the app
  is open leaves the screen on display laid out for the old size until it is drawn again (React
  Native's new architecture). (The Cards | Collectors | Binders control of Search, which broke
  its words at the largest text size, is fixed by review fix 1.)
- The web's map page shows a sponsored placement (`MAP_PANEL`); the phone's Map tab and the
  binders of a place show none (review finding U9). Whether the phone gets one, and where (under
  the list, on the place screen), is a placement decision for the owner; the README no longer
  claims it.
- A pass of every screen at the largest text sizes was never done before this stage; only the
  screens of this stage were walked.
- Left for the next stage (S3, needs API work): the printing picker with holder counts, "Who has
  it" / "Who wants it", "Wanted by N" (S1 follow-ups 3 and 4).

**Review fix 1 (2026-10-13)**

Two independent reviews of the branch (a walk on the simulator, and a functional review with 64
mutants) found 17 problems, none of them a blocker: five majors and twelve minors. Each is fixed
at its cause with a test that would have caught it, or answered below. The native checks of this
round ran on an iPhone 18 Pro simulator the owner keeps booted (`ORENJI_IOS_SIMULATOR_UDID`),
another model than the stage was built on.

- **U1, Search at large text (major).** The region switcher, the segments, the field, the game
  pills and the filters were all pinned above the list: at the largest text size nothing was left
  for the results, and in another region not even the field. Search is now one list per segment:
  only the switcher (with its "Not your region" line) and the segments stay on screen, and they
  follow the system text size only a little (`PINNED_MAX_FONT_SCALE` 1.35; 1.2 for three
  segments), like the tab bar and the navigation header; a long press shows them enlarged on
  iOS. The field, the pills, the filters, the skeleton, the empty and error states and the
  results scroll under them. A segment label is one line and never breaks in a word.
  Tests: jest (`search-segments`, `search`, `choice`), the new native flow `large-text.yaml`.
- **U2, the map swallowed every drag (major).** While the whole region is on screen a finger on
  the map now scrolls the page (the map has next to nothing to move then); the map keeps a
  gesture only once it is zoomed in, or for two fingers. The map takes the height the page has
  left under the switcher, the title and the Map | List switch (240 to 520 points) instead of
  58 % of the page, so its buttons are on screen without scrolling, and the "Where are you?"
  prompt is compact and can be put away for the visit. Tests: jest (`map`), the new native flow
  `map-gestures-links.yaml` (a collector without a location, a drag from the middle of the map,
  then a zoomed-in map that keeps the drag) and `large-text.yaml`.
- **F1 and U7, a region that does not exist (major).** A well-formed code was enough to be
  browsed and kept on the device. Now only a region that exists is: the three the app ships until
  `GET /regions` was read, then what that list holds (`useKnownRegions`). A link to another code
  changes nothing; a code an older install kept is forgotten, on the device too, once the
  server's list says so; the list of places says that the region has no place instead of loading
  for ever when the server lists none. Tests: jest (`browsingRegion`, `map`), E2E
  (`regions.spec.ts`: `?region=asia` inside the app and as a page load, "oceania" left on the
  device), native flow.
- **U3 and F2, the region of the sponsored placements (major, a missing test).** The code was
  right. jest now asserts `region` on `GET /ads` at home, after a switch, back home, and for a
  collector whose region comes from the device (nothing is asked before it is settled); the E2E
  asserts it on the real request, at home and in Europe.
- **U4 and F3, results of the region before.** Search and the card holders keep the previous
  results only within one region (`previousOfSameRegion`); a change of region shows the skeleton.
- **U5, the list kept its place.** Another region starts at the top of its list, and pressing
  the Map tab again scrolls the list (or the map page) back up.
- **U6 and F4, the same link twice.** A link is used up once followed (its parameters are
  cleared), so the same link opens its place every time.
- **U8, a map that named nothing.** Holding a place names it (its name, its number of public
  binders, "Open") without opening it; a place with binders is outlined in a strong colour; one
  too small to be seen at the current zoom gets a dot that can be tapped (Île-de-France and
  Madrid at the first view of Europe). The shades themselves stay the web's.
- **U9, no sponsored placement on the Map tab.** The README claimed one; it is corrected. Whether
  the phone gets the web's `MAP_PANEL` slot is left to the owner ("Open (owner)").
- **U10, a request that hangs.** A read (`GET`, `HEAD`) is given up after 20 seconds
  (`withReadTimeout`) and is not tried again by itself: the screen shows "No answer from
  OrenjiTrade" with "Try again" instead of a skeleton for minutes. Writes are left alone. Seen on
  the simulator with the isolated API paused: the error after 27 seconds, the binders after
  "Try again" once the API ran again.
- **F5 and F6, the tests the mutants asked for.** jest now sees the region of a place opened in
  another region (a tap, a list row, the requests of the place screen) and the "region settled
  first" gate of search, of the counts, of the placements and of the device read; a native flow
  taps the map itself and holds a place.
- **F7, blocking.** Blocking or unblocking a collector refreshes the map's counts and binder
  lists (`meKeys.regionMap`).
- Also covered now, from the mutants that survived without a finding of their own: the accent
  colour of the switcher away from home, a tap beside a place too small to hit, a failed page
  that reaching the end of the list does not ask again, and the web build never assuming a
  screen reader. "The outline of the place opened last, whatever the region" stays untested: a
  code belongs to one region, so the mutant changes nothing a collector could see.

**Found while fixing** (each with its test)
1. The first version of the segment labels shrank to fit (`adjustsFontSizeToFit`): on iOS that
   drew every label four points high at the default text size, in every segmented control of the
   app. Labels are one line with a capped size instead (seen on the simulator at the default and
   at the largest size).
2. With the field in the head of the list, the Collectors and Binders fields lost the keyboard
   after the first letter: the list got its pull-to-refresh control with its first results, and
   React Native builds a list's content again when that control is added (it changes place among
   the scroll view's children on iOS and wraps the scroll view on Android). The control is now
   always there. `collector-search-looking-for.yaml` types in two steps and checks that the
   field holds the whole name (it failed on the code before this fix); jest pins the control.
3. On the web export, "back" from a place opened by a link came back to the link, which opened
   the place again: the place could not be left. Clearing the link and opening the place in the
   same turn left the link in the history entry of the tab. The place now opens one turn after
   the link has left the tab's address. Caught by the existing E2E link spec.
4. The mobile E2E suite shared the anonymous request budget of one visitor (60 a minute per
   address; the app reads `/api/v1/public/*` without a token): with one more spec the report
   dialog got a 429 for its reasons. The isolated test API now has the setting the web suite
   already had (`RATE_LIMIT_ANONYMOUS_PER_MINUTE=600`, `scripts/lib/mobile-e2e-guard.mjs`).
5. The largest text size can be asked for by a flow: `subflows/relaunch-large-text.yaml` starts
   Expo Go with the launch argument `UIPreferredContentSizeCategoryName`, for that launch only
   (no setting of the simulator changes), and the flow checks that the text really is that
   large. Android has no such argument; the flow walks the same paths at the device's size there.

**Checks after the fixes** (2026-10-13, the owner's Mac mini, retries off)
- `npm run typecheck -w apps/mobile`, `npm run lint -w apps/mobile`,
  `npm run format:check -w apps/mobile`: clean.
- `npm run test:mobile`: typecheck, lint, jest 84 suites / 796 tests (757 before the review),
  28 harness guard tests.
- `npx expo export` into throw-away directories: iOS 5,441,193 B (1,771 modules; 5,425,787 B
  before the review), Android 5,738,933 B (1,895 modules; 5,723,727 B), web entry 2,846,757 B
  (74 static routes; 2,837,262 B), the three region chunks unchanged.
- `npm run test:mobile:e2e -- --retries=0`: 56 passed on the first attempt (50.2 s; 1 min 12 s in
  all). Without `--retries=0` the harness retries twice.
- `npm run test:mobile:maestro -- --platform ios` on the owner's iPhone 18 Pro simulator
  (iOS 27.0, Expo Go 57.0.9): **27/27 flows
  passed in one run** (41 min 32 s of flows, 41 min 55 s in all; 25 flows before the review, 27
  with `map-gestures-links.yaml` and `large-text.yaml`). Afterwards ports 8082 and 8090 were
  free and the run's 30 emulator accounts were deleted.
- `npm run test:scripts`: 133 tests. `npm run audit:gate`: OK (the 2 allowlisted advisories).
- Once, as a regression check of the lockfile: `npm run build -w apps/web-angular` (initial total
  899.93 kB, as before) and `npm run test:web` (lint clean, 142 files / 678 tests). The web was
  not changed; neither was the API.
- `npm run sync:boundaries -w apps/mobile -- --check`: the three copies are up to date.
- The fixes are nine commits on top of the nine of the stage; each of the seven that change the
  app or its unit tests was type-checked, linted, format-checked and unit-tested on its own
  (764, 766, 771, 772, 788, 794 and 796 tests).
- Git status clean; no API or Metro left running. The owner's simulator was found booted and is
  left booted, in light mode and at its default text size (no simulator was booted, shut down,
  created or erased in this round).

**Not verified in this round**
- **Android**: no Android SDK on this Mac; the Android run of the flows could not be verified.
  By reading: the map still uses the responder system only; the refresh control fix matters there
  too (the scroll view is wrapped on Android); `relaunch-large-text.yaml` reopens the app at the
  device's own size on Android; `npx expo export --platform android` succeeds.
- A pinch on a device (Maestro has one finger): jest only, as before.
- The read timeout on a real network that stalls: jest, and one walk with the test API paused.

**Review fix 2 (2026-10-13)**

The second review (an independent verification of fix 1: the whole check list, 44 mutants and a
walk on the simulator) approved the branch with no blocker and no major, and left three minors.
Each is fixed at its cause with a test that fails without the fix. The native checks ran on the
same iPhone 18 Pro simulator the owner keeps booted.

- **R1-1, the "region settled first" gate of the sponsored placements (a test that did not
  test).** The code was right, but the case added in fix 1 could not see the gate: a slot only
  asks once the account is ready and the flags are read, and by then the storage of a test has
  answered, so the one request was in the right region with or without the gate. The case now
  holds the device's answer until the account and the flags are there: nothing is asked
  meanwhile, then one request in the region the device kept. Checked against the reviewer's
  mutant (the gate taken out of `useAds`): one request in Americas (North), and the case fails.
  The sentence of fix 1 about this gate ("... of the placements ...") is true now.
- **R1-2, the search field out of reach down a list.** Since fix 1 the field, the game pills
  and the filters scroll away with the results (so that they can be reached at the largest text
  sizes), and only scrolling all the way back up brought them back. Each list of the Search tab
  (Cards, Collectors, Binders) is now given to the tab (`useScrollToTop`): pressing Search again
  scrolls it to its top, as the Map tab does. The other way the review named (the field pinned at
  ordinary text sizes, scrolling at the accessibility sizes) was not taken: two layouts of one
  screen, switched by a setting of the device, for what the platform's own gesture does. Tests:
  jest (`search-segments`: in each segment the list on screen is the one the tab was given), the
  E2E `catalog.spec.ts` and the native flow `search-card-detail.yaml` (down the catalog the field
  is gone, the tab is pressed again, the field is back). The E2E spec and the flow were each run
  once on the code before the fix: both fail at "the field is back".
- **R1-7, a collector just blocked still found by search (older than this stage).** Blocking and
  unblocking now also read every search of the viewer again, the unified results and the card
  holders alike (`meKeys.searches`), in whatever region they were read. jest: the same kind of
  assertion as for the region map; it fails without the line.

**Found while fixing**
1. The first version of the E2E step scrolled 600 points deep with the wheel in a poll, passed
   alone and failed in the full run. On the web export a list draws its first ten rows, then the
   others in an idle moment; a jump of the wheel made before that moment lands at the end of
   the ten rows, and a wheel that keeps turning holds the idle moment back (a probe saw ten rows
   through three seconds of wheel events and 24 rows two seconds after the last one; with steps
   of 120 points, or after a pause of a second and a half, the rows come as the list scrolls). A
   hand is not affected: a wheel turned by hand moves in small steps, and the native lists are
   not built this way. The step now only needs the field to be above the screen, which the first
   rows are enough for: 10 of 10 with `--repeat-each=10`, and still a failure on the code before
   the fix.

**Left as they are** (the four nits of the second review, not part of this round)
- R1-3: jest does not see a link to an unknown region that also names a state (the router mock
  never clears the parameters), nor the wait for `GET /regions` for a region the app does not
  ship; on the device both behave (walked by the reviewer).
- R1-4: the dot of a place too small to be seen is the solid tint, which is also the legend's
  colour for "10+", whatever the place's count. **Closed in stage S6** (the dot has the tint of
  its count's step; "Small fixes before the final documents (stage S6, 2026-10-13)").
- R1-5: at the largest text size the name card of a held place covers the top third of the
  240-point map, sometimes the place it names.
- R1-6: jest prints "A worker process has failed to exit gracefully" once per run since the read
  timeout of fix 1 (no open handle is reported when the suite runs in one process). **Closed in
  stage S6** (a test left the read timeout armed; a guard in `jest.setup.ts` now names such a
  file; same section).

**Checks after the fixes** (2026-10-13, the owner's Mac mini, retries off)
- `npm run typecheck -w apps/mobile`, `npm run lint -w apps/mobile`,
  `npm run format:check -w apps/mobile`: clean.
- `npm run test:mobile`: typecheck, lint, jest 84 suites / 798 tests (796 after fix 1), 28
  harness guard tests.
- `npx expo export` into throw-away directories: iOS 5,441,366 B (1,771 modules), Android
  5,739,309 B (1,895 modules), web entry 2,846,226 B (74 static routes), the three region chunks
  unchanged (132,238 / 99,913 / 59,297 B).
- `npm run test:mobile:e2e -- --retries=0`: 56 passed on the first attempt (51.4 s; 1 min 14 s in
  all).
- `npm run test:mobile:maestro -- --platform ios` on the owner's iPhone 18 Pro simulator
  (iOS 27.0, Expo Go 57.0.9): **27/27 flows passed in one run** (42 min 5 s of flows, 42 min 29 s
  in all), `search-card-detail.yaml` with its new steps among them. Afterwards ports 8082 and
  8090 were free and the run's 30 emulator accounts were deleted.
- `npm run test:scripts`: 133 tests. `npm run audit:gate`: OK (the 2 allowlisted advisories).
- Once more, as a regression check (the lockfile did not change in this round):
  `npm run build -w apps/web-angular` (initial total 899.93 kB, as before) and `npm run test:web`
  (lint clean, 142 files / 678 tests). The web was not changed; neither was the API.
- The fixes are three commits (one per finding); git status clean; no API or Metro left running.
  The owner's simulator was found booted and is left booted, in light mode and at its default
  text size (no simulator was booted, shut down, created or erased in this round).

**Not verified in this round**
- **Android**: no Android SDK on this Mac; the Android run of the flows could not be verified.
  By reading: `useScrollToTop` is React Navigation's own hook and calls the list's
  `scrollToOffset` on both platforms; the new steps of `search-card-detail.yaml` use nothing of
  one platform; `npx expo export --platform android` succeeds.
- **The status-bar tap of iOS** (the system gesture that scrolls the list on screen to its top):
  a synthetic tap on the status bar does nothing on this simulator, on the Search tab and on
  the Map tab's list alike, so it proves nothing either way. With a finger it may do nothing in
  Search > Cards, where a second scroll view is on screen (the row of game pills): iOS ignores
  the gesture when more than one scroll view could answer it. For the owner to try on a phone;
  if it matters, that row can opt out of the gesture (`scrollsToTop={false}`).

**Independent verification of review fix 2 (2026-10-13, head `03cd64f`): approved, no blocker and
no major finding.** The verifier ran the whole check list itself, retries off: typecheck, lint,
format check; jest 84 suites / 798 tests (11 of 12 runs green; one run lost a worker to a Node
garbage-collector segfault and passed when repeated); the three exports; the mobile web E2E 56
passed on the first attempt; the native suite 27/27 on the owner's iPhone 18 Pro simulator (41 min
59 s); script tests 133; the audit gate; the web build (initial total 899.93 kB, unchanged) and
web tests as a regression check. R1-1, R1-2 and R1-7 are fixed (14 mutants around the three fixes,
14 killed). Left open, none introduced by this branch:
- **The card holders count includes collectors in a block relation with the viewer (API, both
  clients).** After a block the row leaves the list but "1 listing in your region" stays:
  `SearchService.cardHolders` drops blocked owners after `CardHolderRepository.page` has counted
  them, so `totalItems` is too high and a page can come back short. To fix in the API (both
  directions of a block in the SQL of the page and of the count, with an integration test).
  **Closed in stage S6** ("Small fixes before the final documents (stage S6, 2026-10-13)", which
  also lists the other lists of the search module).
- **At the largest text size every line of a collector row in Search is cut with "…"** (the state
  or province is not visible; VoiceOver reads the whole row). `CollectorResultRow`, not touched by
  this stage; check `BinderResultRow` the same way. **Closed in stage S6** (the line with the
  place wraps, in both rows).
- Small: the status-bar tap of iOS probably does nothing in Search > Cards (a second scroll view
  is on screen; not provable on a simulator); the dot of a place too small to see has the solid
  colour the legend uses for "10+" (**closed in stage S6**); at the largest text size the name
  card of a held place covers the top third of the map; jest does not see a link to an unknown
  region that also names a state; jest prints "A worker process has failed to exit gracefully"
  once per run (**closed in stage S6**).
From this stage on the native suite runs on the simulator the owner keeps booted (owner order of
2026-10-12: `ORENJI_IOS_SIMULATOR_UDID=<its UDID>` on every run; nothing boots or shuts down a
simulator, because each boot makes the desktop app ask the owner for permission).

## Binder count deadlock: owner lock, one row order, a freshness job that skips locked rows (2026-10-10)

Branch `fix/binder-count-deadlock`, shipped as `fix/inventory-lock-order` (the same commits merged
with `main` on 2026-10-13), no migration, no API change.
`DELETE /api/v1/inventory/items/{id}` answered 500 ("deadlock detected" in
`inventory_item_binder_count()`) when it met the listing reconciliation of a privacy change: the
delete held the item and waited for its binder (the item count trigger), the reconciler held the
binder and waited for the item. Seen once in `BinderIT` on 2026-10-10; in production a collector
deleting a card right after changing a privacy setting.

- **Rule** (docs/database/schema.md, "Locks of binders and inventory items"), four parts:
  1. **Owner lock.** Every write to a collector's binders or inventory items first takes a
     transaction-scoped advisory lock of that collector (`BinderService.lockOwners`), before any
     row: item create, update, move, delete, confirm, bulk, admin restore, admin hide, trade
     transfer (both collectors, in one order), every binder write, `ListingReconciler.owner`, the
     account purge, the seeds. The writes of one collector run one after the other. **A new write
     path starts with this call.**
  2. **Row order** below it: binder rows before item rows, each in ascending id
     (`InventoryService.lockForWrite`, ordered locking clauses in every multi-row statement). It is
     the second line behind the owner lock.
  3. **Row lock mode `FOR NO KEY UPDATE`**, for binders and items. `FOR UPDATE` conflicts with the
     key-share lock of a foreign key check, and such checks reach these rows from outside the owner
     lock in two ways: another module inserts a row that references an item (offer, trade line,
     trade, wishlist match), and PostgreSQL checks the foreign keys of a row again when a
     transaction updates it a second time (a second update of an item takes a key-share lock on its
     binder). Only a binder delete and the account purge end with the full row lock.
  4. **The freshness job takes no lock in front of the writes and never waits for a row.** Each of
     its eight statements takes its rows `FOR NO KEY UPDATE SKIP LOCKED`; a binder or item that
     another transaction holds at that moment is aged, warned, hidden or unlisted by the next hourly
     run. The statements of the collectors' writes do not skip.
- **Also fixed on the way:** requests adding cards to the same binder at the same moment could
  deadlock with each other (each held the foreign key's key-share lock on the binder and then asked
  for the full row lock; seen with four parallel requests); the bulk endpoint read its items before
  it locked them; the freshness job wrote the state it had computed before waiting for a row, so a
  confirmation committed during the wait was overwritten until the next run; an item or binder
  created while the listing reconciliation of a privacy change ran could keep a stale listed flag
  until the next job run; a card an admin hid while a privacy change of its owner was being
  reconciled was flagged as listed (and announced as published) until the next job run.
- **Review round 1 (same day):** the first version had the row order only. The reviewer showed that
  a bulk write (or a trade transfer of several cards) could still deadlock with two other requests
  of the same collector, because it read the binders of its items before another request filed
  them; the freshness job could still deadlock with a write that takes several binders; and item
  writes could answer a 409 that the OpenAPI did not declare. The owner lock closes the first and
  the 409 is gone (no API change: nothing can move an item between the read and the locks any
  more). For the job, that round added a second advisory lock under which the job ran alone.
- **Review round 2 (same day):** the second reviewer measured what that job lock cost and
  recommended to replace it by `SKIP LOCKED` in the job's statements. Reproduced on the branch
  before the change: a `PATCH` of a collector the job does not touch waited for the whole job
  transaction; with one write in flight the job waited its 10 seconds and failed, eight queued
  writes held the rest of the pool of 10 connections, and `GET /inventory/items` and `GET /me`
  answered after 8.5 s. The job lock is gone (part 4 above). Proving the replacement turned up
  three more lock cycles, all reproduced and fixed with a test each:
  - **`SKIP LOCKED` alone was not enough.** The job hides an item and then unlists it; the second
    update re-runs the foreign key check on the item's binder, which waited for a write holding
    that binder `FOR UPDATE`, which waited for the item (`POST /inventory/items/{id}/confirm`
    answered 500). Hence part 3 for binder rows.
  - **Trade transfer against a new offer** (the reviewer's finding; a regression of round 1): the
    transfer takes its items in ascending id, a new offer references the seller's card and then
    the buyer's trade card. "deadlock detected" on the branch, fine on `main`. Hence part 3 for
    item rows.
  - **Admin hide against the reconciliation of a privacy change** (a regression of round 1, found
    by a mutation run): the hide updated its item twice without the owner lock and so asked for a
    key-share lock on a binder the reconciliation held. "deadlock detected" on the branch, fine on
    `main`. The admin hide now takes the owner lock and the binder like every item write.
  The redundant `binder-create` advisory lock is removed (the owner lock covers it).
- **Final review (2026-10-13) and its one fix** (branch `fix/inventory-lock-order`: this branch
  merged with `main` of 2026-10-13). The third, independent review found no regression introduced
  by the branch: in its stress, twelve kinds of write side by side, eleven runs of the branch
  ended without a deadlock, where `main` ended its two runs with 77 and 72. It found one corner
  still open, older than the branch and narrower on it than on `main`:
  `DELETE /api/v1/binders/{id}?deleteItems=true` could answer 500 ("deadlock detected") next to
  the job when the binder held an item deleted earlier. Such an item keeps its `binder_id`, the
  delete locks only the live items, and its `DELETE` reaches the deleted one through
  `ON DELETE SET NULL` with the full row lock of the binder in hand; a job that had written that
  row twice in its run (its expired temporary publication, then a listed flag left on it) asked
  for a key-share lock on the binder at the second write.
  - **Fix, one line:** the locking query of `InventoryItemRepository.normaliseExpired` takes live
    items only (`AND deleted_at IS NULL`). The job then writes a deleted item at most once per run
    and never re-checks that row's foreign keys. Nothing reads the visibility or `public_until` of
    a deleted item (public reads, counts, admin lists, the export, the wishlist alert rules, the
    purge and the seed were checked); such a row now keeps its expired `TEMPORARILY_PUBLIC` until
    its binder is deleted without its items or the account is purged.
  - **Test:**
    `InventoryLockOrderIT.aBinderDeleteNeverDeadlocksWithTheFreshnessJobOverAnItemDeletedEarlier`,
    both delete modes; with its items it failed with that deadlock before the fix. The class has
    79 tests now. `BinderRepository.delete`, `FreshnessService` and schema.md said more than was
    true about this path and are corrected.
  - **Checked (2026-10-13):** the new case alone, before the fix 1 of 2 failed (with its items:
    500, "deadlock detected ... UPDATE ONLY inventory_item SET binder_id = NULL"), after it 2 of
    2 pass; `InventoryLockOrderIT` five times in a row, 79 of 79 each (19 to 20 s); the
    inventory, binders and delisting tests, 143 in 16 classes; `npm run test:api` twice in a row,
    895 + 12 tests and no failure each time (167 s each); `spotlessCheck --rerun-tasks`;
    `exportOpenApi` without a diff. The review's stress probe on a scratch copy of the fixed
    head, two runs of 150 rounds: no deadlock, no failure.
  - **Follow-ups the review left, none of them introduced by this branch:**
    1. The stored `publicly_listed` flag can be one job run behind on an item deleted while the
       job runs (the first point of "Still open"; the review reproduced it through the real code,
       on the branch and on `main`). The next run clears it; public reads never use the flag.
    2. The synchronous after-commit analytics listeners need a second pooled connection (the
       event registry marks the publication completed in a transaction of its own while the
       committing thread still holds its connection). Ten at once stall requests for the 10 s
       connection timeout. Seen with the test listeners only.
    3. No lock timeout on inventory writes: a "busy, retry" answer after a few seconds would
       bound a queue behind the owner lock.
    4. The rule a new bulk write must follow (the import of stage S5 is the first), now in
       docs/database/schema.md, "Locks of binders and inventory items": one transaction per
       bounded chunk of at most 500 items; `BinderService.lockOwners` first; then the binders,
       every target included, and the existing items in ascending id through
       `InventoryService.lockForWrite`; never a plain multi-row `UPDATE` or `DELETE` on these two
       tables, never `FOR UPDATE`; reconcile in the same transaction; nothing slow and no second
       connection while the lock is held; one collector's chunks one after the other, never in
       parallel.
- **Tests:** `InventoryLockOrderIT` (79 since the final review: a binder deleted with and without
  its items next to the job, over an item deleted earlier (2); 77 before): each item write against the reconciliation of a privacy
  change stopped at one of its items (10 cases, real entry points) and against a transaction that
  takes no owner lock (10 cases, the row order alone); a bulk write and a trade transfer of items
  filed meanwhile; a card and a binder created during a privacy change; an item hidden by an admin
  during a privacy change; a write waiting for a move of its item; a binder write waiting for an
  item a photo upload holds; the owner locks of two collectors in one order; the owner lock as the
  first lock of every write, with no row in hand (20 entry points); each item write and a photo
  upload next to an uncommitted reference to their item (11) and the trade transfer against
  references inserted in offer order; an item delete waiting for the job; the job between two
  statements while a reorder holds the binder it wants next (the cycle of round 1); the job
  between its two updates of an item while an item confirmation, a binder confirmation, a binder
  delete or a privacy reconciliation holds the item's binder (4); each of the job's eight
  statements with a row it has to write held elsewhere (the run ends meanwhile, the next run
  writes the row); the job next to an uncommitted confirmation and photo upload; and a bounded run
  of seven writers of one collector next to two job workers. Mutation runs (scratch copy, one
  piece of the design removed each time): `SKIP LOCKED` out of each job statement and the item
  freshness statement of `main` (9), `SKIP LOCKED` in a write's reconciliation (2), the owner lock
  out of each kind of write, the key order, the transfer's up-front locks and the admin hide (10),
  `FOR UPDATE` back in each item lock (4) and each binder lock (4), items locked before their
  binders (1): all 30 fail at least one case. Three parts of the row order fail none while the
  owner lock is in front of them (the owner reconciliation locking every binder first, the id
  order of the item locks, the binder lock of a create before its insert): they are the second
  line only. A scratch stress run in which the job keeps hiding and unlisting cards of a collector
  whose writes run next to it (270 calls a run) ended with "deadlock detected" in 3 of 3 runs
  with `SKIP LOCKED` alone and with no failure in 3 of 3 runs on the branch.
- **Owner decision to confirm:** the job no longer waits for anybody, so a binder or item that is
  being written at the moment the hourly job passes (or whose owner's privacy change is being
  reconciled) is aged, warned, hidden or unlisted one hour later. An expired temporary publication
  is private for readers all the same; a card due to be hidden as stale stays public for that
  hour. The alternative (the job waits) is what deadlocked or stalled every write.
- **Still open:**
  - The stored `publicly_listed` flag can be one decision behind when a job run overlaps a write of
    the same collector (the job decides from the snapshot of its statement). One publication event
    can be wrong until the next run stores the right value; public reads apply the live rules,
    never the flag. Same on `main`; reproduced by the final review (follow-up 1 above).
  - The account purge takes the full lock of the collector's items; a transaction inserting
    references to two of them in another order could still close a cycle with it. The account is
    pending deletion and unlisted by then. Not tested.
  - Not this branch (second reviewer, same on `main`): a job run that hides the listings of about
    1,000 owners keeps the after-commit listeners busy for 90 to 120 s, during which other requests
    can run out of pool connections (500 after 10 s). Separate task: cap the listener concurrency
    below the pool size or batch the hidden-listing notifications per run.
  - `CLAUDE.md` does not mention the rule. Proposed line for "Backend conventions" (the owner adds
    it): "Every write to `binder` or `inventory_item` starts with `BinderService.lockOwners`, then
    locks binder rows before item rows, each in ascending id and `FOR NO KEY UPDATE`; only the
    freshness job skips locked rows. See docs/database/schema.md, 'Locks of binders and inventory
    items'."

---

## Inventory import: YDK and Collectr CSV (stage S5, 2026-10-13)

Owner spec of 2026-10-08, section 6, with the tests of section 9 that concern it. Branch
`feature/s5-inventory-import`. **The API and the phone screens are built** (owner order of
2026-10-12: mobile only; the web import screen is a recorded follow-up). Contract:
`docs/api/contracts/s5-inventory-import.md` (every endpoint, field, error code and limit, a worked
example per source). Tables and locks: `docs/database/schema.md`, "V113". The phone:
`apps/mobile/README.md`, "Inventory import".

### What a collector can now do on the phone

- **Start an import from the Inventory tab** ("Import", next to "Select"; also from an empty
  inventory). Two sources, each with one sentence on what the file is and how to get it out of the
  other app: a **Yu-Gi-Oh! deck file (.ydk)** and a **Collectr CSV export**. The CSV screen says
  that OrenjiTrade never connects to Collectr and never reads its prices.
- **Give the file**: "Choose a file" opens the system file picker (Files on iOS), or "Paste the
  text of the file" (both formats are plain text, and a phone rarely has such a file at hand).
  Either way the same upload is sent. A progress line stands while the file is read and matched.
  A file the API refuses is explained in words: too large (with the limit), too many lines or
  rows, not a text file, the column that could not be found (named), an empty file, too many
  imports in a short time (with when to try again). A file that is too large is refused before
  anything is uploaded.
- **Check the preview before anything is added.** On top, four counts: new cards, cards that go
  into cards already owned, lines that still need a printing, lines not recognised; under them the
  copies, the lines that go in, and until when the preview is kept. A deck shows its **three
  sections as switches** with the cards the file holds in each. The lines are one long list,
  loaded page by page: the card with its picture, **the copy chosen or "Choose printing"**, the
  condition (marked "not in your file" when the file names none), the copies, a tick box to leave
  the line out, "You have 2: this adds 2." when it goes into a card already owned. A filter shows
  only the lines that need a printing, or only the ones not recognised; those are listed with
  what the file said (a passcode, or the name, set, number and rarity) and why nothing fits.
- **Choose printings**: "Which copy" lists the printings of the card as the card page does (the
  ones that fit a CSV row first, under "Fits your file"); a pick is saved at once. Or **"Use the
  most recent printing for all unchosen rows"** (by set release date).
- **Set conditions and copies**: per line in a dialog, or one condition for every card whose file
  names none (a deck file names none, and such a card starts at the lowest grade).
- **Commit**: the button says what it adds ("Add 3 cards to my inventory") and what happens to
  them ("They start private: nobody sees them until you publish them", or how many go into cards
  already owned). While lines need a printing it is disabled and says why; ticking "Leave out the
  N cards that still need a printing" makes it "Add 1 card, leave 2 out". The result says the new
  cards added, the cards that got more copies and the lines left out (and why), and leads to the
  inventory, where the new cards are **Private**. A plan limit shows the app's limit notice (with
  "See Premium" only while premium plans are sold) and nothing is written.
- **Nothing is lost or doubled**: an import left open is offered again ("Continue your import")
  until it expires; an expired one says so and starts over; leaving with an open preview asks
  first; discarding it or replacing it by a new file asks first; a commit pressed twice is sent
  once, one repeated after a lost connection adds nothing twice, and one that went through
  although its answer was lost shows its result by itself; a commit cut between two parts shows
  "Finish the import".

### What the API does

- **One preview-then-commit flow for both sources** (`/api/v1/inventory/imports`, tag
  `inventory-import`): `POST` (multipart `file`, query `source` = `YDK` | `COLLECTR_CSV`, optional
  `game`) parses and matches the file and stores a **preview** (V113 `inventory_import`,
  `inventory_import_row`); `GET /`, `GET /{id}`, `GET /{id}/rows` (pages, `status` filter);
  `PATCH /{id}` (which sections of a deck count); `PATCH /{id}/rows/{rowId}` (printing, condition,
  copies, in or out); `POST /{id}/bulk` (`USE_MOST_RECENT_PRINTING`, `SET_CONDITION`);
  `POST /{id}/commit`; `DELETE /{id}`; `GET /limits`. Admin: `GET` / `PUT
  /api/v1/admin/inventory/import-settings`. Job: `inventory-import-purge`.
- **YDK** (`YdkParser`, pure): `#main`, `#extra`, `!side`, one passcode per line, `#` comments,
  blank lines, CRLF, a byte-order mark, leading zeros; a passcode repeated is as many copies, per
  section and in total; a line that is none of that is counted and never stops the rest. A
  passcode is matched through `card.external_ref` (provider `ygoprodeck`), then through the
  provider's artwork ids (`card_image.provider_image_id`: an alternate artwork is the card of that
  artwork). A row is preselected only when its card has exactly one printing.
- **Collectr CSV** (`CsvReader`, `CollectrCsvParser`, `CollectrCsvFormat`, pure): comma, semicolon
  or tab; quoted fields with commas, line breaks and doubled quotes; a byte-order mark. The columns
  are found through **one table of aliases** (`CollectrCsvFormat`), because Collectr's real header
  is not confirmed; a file without a card name column is refused with a message that names it.
  **A price column is never read** (it matches no alias and the parser only reads the columns it
  found), so no Collectr price can reach the preview, the database or a log. OrenjiTrade never
  calls Collectr.
- **Matching without a query per row** (`ImportMatcher`, pure; `CatalogService` grouped lookups in
  batches of 1 000): a row that fits exactly one printing is preselected, one card and several
  printings is "choose a printing" (with the printings that fit what the row says as suggestions),
  nothing is reported with a reason and never blocks the rest.
- **Commit** (`InventoryImportService`, `InventoryService.importLines`): idempotent, also under
  concurrent commits; rows that are equal (printing, condition, edition, language) are one item; an
  equal item the collector already has takes the copies (a private one before a public one, then
  the oldest); new items are PRIVATE and unfiled. Up to 500 items one transaction; above that
  chunks of 500 in file order, each its own transaction, and a repeated commit continues after the
  last chunk recorded. It follows the rule "A new bulk write" (owner lock first, the binders and
  the existing items in ascending id through `lockForWrite`, single-row statements, reconciliation
  in the transaction, the plan computed before it).
- **Counts for the phone's summary** (added with the phone screens, in the one query of the
  summary): `summary.mergedItems` (of the items a commit writes, those equal to an item the
  collector already has: `items - mergedItems` are new; read without a lock, the commit decides
  under the locks), `summary.defaultConditions` (matched rows whose condition nobody chose, the
  rows `SET_CONDITION` changes) and `sections.mainCopies` / `extraCopies` / `sideCopies` (what the
  deck file holds in each section, recognised or not, whether the section counts or not).
- **Guards**: the preview belongs to its collector (404 for everyone else), expires
  (`preview_ttl_minutes`, 410 `IMPORT_EXPIRED`) and is purged; the file limits are admin settings
  read at every upload; a file that is not UTF-8 text is refused (415); the Redis rate limiter has
  a policy for uploads and one for commits (30 an hour each per collector); the freemium limit
  `inventory.items.max` is checked for the whole import before the first item (429
  `LIMIT_REACHED`, nothing written).

### Decisions, and why

1. **No freemium inventory limit existed.** The spec and the stage brief ask the import to respect
   "the freemium inventory limit"; `usage_limit` had none (binders, wishlist items, binder views,
   offers, saved searches only) and `POST /inventory/items` checked nothing. V113 adds
   `inventory.items.max` (TOTAL: the collector's non-deleted items) for every plan **without a
   number**: nothing changes for a collector until an admin sets one in `/admin/usage-limits`.
   `POST /inventory/items` and the import both respect it, so a number set later means the same
   thing on every path. **Owner: decide whether FREE gets a number.**
2. **The default condition is the lowest of the game** (`DAMAGED` for the four games), not the
   item form's `NEAR_MINT`. A deck file says nothing about the state of a card, and a CSV row may
   not either: the "safest" default is the one that claims least, so a collector who later
   publishes an imported item never promised more than the card is (a "Near Mint only" wish is
   never alerted for a card nobody graded). The row says where its condition comes from
   (`conditionSource` `DEFAULT` | `FILE` | `EDITED`) and `SET_CONDITION` gives every `DEFAULT` row
   another condition in one call. **Owner: confirm, or say `NEAR_MINT`** (one line:
   `ImportMatcher.defaultCondition`).
3. **Limits** (admin settings `inventory.import.*`): YDK 100 kB and 500 lines (the spec); CSV
   **2 MB and 5 000 rows**: a row of an export is about 200 bytes, so 5 000 rows is about 1 MB and
   the rest is room for long names and notes; 5 000 rows is ten chunks of 500 at the commit, which
   one request finishes in seconds. An admin can raise it to 20 000 rows and 8 MB (the server
   accepts 10 MB for any upload). Preview kept 60 minutes.
4. **A new upload replaces the collector's open preview**: at most one `PENDING` preview each, so
   the table is bounded by the number of collectors, whatever a script uploads.
5. **Of a file, a row keeps a passcode, or the name, set, number and rarity as written, and the
   copies. Nothing else**: not the file, not its name, no price, note, date or portfolio.
6. **The purge runs with the hourly `freshness` job** (`FreshnessJob`), not as a tenth Cloud
   Scheduler job: an expired preview is refused when it is read, so the purge is housekeeping, and
   ADR 0016's nine jobs and their cost stay as they are. `POST
   /internal/jobs/inventory-import-purge` runs it on request. **Owner: say so if a job of its own
   is preferred** (one entry in `modules/scheduler/variables.tf`).
7. **Rows that fit nothing are reported, not edited** (409 on a change): the collector adds those
   cards by hand. A commit with rows still to choose is refused (409 `IMPORT_ROWS_UNRESOLVED`)
   unless `skipUnresolved` leaves them out: nothing is left out silently.
8. **Fictional `ygoprodeck` cards never enter the shared seed.** A YDK passcode is matched through
   the provider `ygoprodeck`, and a developer's database can import the real catalog, where an
   invented passcode could meet a real card. The API's tests create their own cards
   (`ImportTestSupport`, random nine-digit passcodes, in the throwaway test database). For the
   end-to-end suites, `SEED_IMPORT_FIXTURES=true` adds three fictional fixtures
   (`ImportFixtureSeedContributor`: 910000001 one printing, 910000002 two printings, 910000003 an
   alternate artwork); it is off by default and refuses to run while `YGOPRODECK_ENABLED` is true.
9. **`source` and `game` travel in the query string** in the generated clients (springdoc renders
   request parameters so); the server reads them as form fields of the multipart body too.
10. Previews are not part of the data export: they live an hour, and what they become is the
    inventory, which is exported. They are deleted with the account.

### Tests

- Unit (pure, 37): `YdkParserTest` 11 (sections, repeated passcodes, comments, CRLF, a byte-order
  mark, leading zeros, lines that are no passcode, not text, too large, too many lines, no card, a
  refusal never repeats the file), `CollectrCsvParserTest` 12 (the alias table, quoted fields with
  commas and line breaks, a byte-order mark, semicolon and tab, a missing needed column, extra
  columns, a price column that is dropped, row limit, malformed quoting, the value tables),
  `ImportMatcherTest` 14 (one printing, several, contradiction, number formats, language / edition
  / finish, games, ambiguity, reasons, quantity, default condition, most recent printing).
- Integration: `InventoryImportIT` 17 (preview of each source: matched, to choose, unmatched; the
  edits; both bulk actions; the commit: PRIVATE items, quantities, the merge with existing items
  and inside the import; the same commit twice and four commits at once; rows to choose; a card
  that left the catalog; ownership: another collector reads, edits or commits, 404; expiry and the
  purge, also through the freshness trigger; the freemium limit: the answer and nothing written,
  and the form's `POST /inventory/items` at the limit; every file limit and the admin settings read
  at run time; 520 items in two chunks with a failure in the second and a repeat that continues;
  nothing of a file in the log, captured with our loggers at TRACE; no Collectr price anywhere in
  the database), `InventoryImportRateLimitIT` 1 (uploads and commits, per collector),
  `ImportFixtureSeedIT` 3 (the fixtures, and the two worked examples of the contract), `InventoryLockOrderIT`
  +2 = 81 (`everyWriteStartsWithTheOwnerLock` case `IMPORT_COMMIT`;
  `anImportCommitNextToTheOtherWritesNeverDeadlocks`: commits next to item creations, edits,
  deletes, moves, privacy reconciliations and two freshness job workers), `OpenApiExportTest` (the
  S5 paths, schemas, problem extensions and error codes), `LimitsIT` (seven limits per plan).

### Checks (2026-10-13, Mac mini, JDK 21, OrbStack; all on the final tree of the API work)

| Check | Result |
| --- | --- |
| `(cd apps/api && ./gradlew spotlessCheck)` | green |
| `npm run test:api`, twice in a row | green both times: **955 tests** in 169 classes, 0 failures, 0 skipped (3 min 3 s each). The first full run of the stage had one failure, `LimitsIT` counting six limits per plan where V113 makes seven: the assertion was updated |
| `InventoryLockOrderIT`, three times in a row (`./gradlew test --rerun --tests ...`) | green three times: **81 tests** (79 before this stage), about 19 s each |
| `(cd apps/api && ./gradlew exportOpenApi)` then `npm run generate:api` | committed; a second run changes nothing (`git status` clean). The document only gained 9 paths (13 operations), 19 schemas, 4 error codes and 4 `ProblemDetail` extensions; two existing operations changed their description (`POST /inventory/items`: the 429 of the new limit; `POST /internal/jobs/freshness`: the purge it now runs) |
| `npm run build -w apps/web-angular` | compiles; initial total **899.93 kB** (warning at 900 kB). The figure is the same with the generated client of before this stage: nothing of the import is in the web bundle, and the 0.07 kB of margin was there before |
| `npm run typecheck -w apps/mobile` | green |

Not run, by the stage's order (the phone builder and the reviewers run them): the web E2E, the
mobile E2E and the native suite. Not verifiable here: an Android run (no Android SDK on this Mac);
Collectr's real CSV header (never fetched; the alias table covers the header it is believed to
have and the usual variants).

### Decisions of the phone screens, and why

1. **The commit never leaves a card out silently.** While lines need a printing the button is
   disabled and says how many; the collector either chooses, takes the most recent printing for
   all, or ticks "Leave out the N cards that still need a printing" (the commit then sends
   `skipUnresolved`). A deck of cards with several printings each would otherwise import three
   cards out of forty without a word.
2. **Leaving does not throw a preview away; it asks, and says so.** The API keeps a preview for an
   hour, so the phone offers it again ("Continue your import") instead of deleting it on the way
   out: an accidental back, a call or a closed app costs nothing. The question on leaving is
   there because a collector may believe the cards were added ("Nothing has been added to your
   inventory yet ... kept until 9:53 AM"). What does throw choices away asks first: "Discard this
   import", and a new file that replaces the open import.
3. **One upload for a file and for a pasted text.** A pasted text is written to a file of the
   cache directory and sent as the part `file`, exactly like a picked file (a text part would
   reach the API as a form field, not as a file). The native flows therefore prove the upload
   itself, not a second path.
4. **The file picker offers every file** (`*/*`). A `.ydk` has no registered type and a CSV is
   reported under several: a type filter greys out the very file the collector looks for. The API
   decides from the content and refuses what is not text.
5. **"Which copy" is the list of the card page** (`PrintingList`, also the printing step of "Add
   a card"), in a bottom sheet, with the picture of each printing: the collector holds the card
   and compares. The printings that fit a CSV row come first. A pick is saved at once: choosing
   printings is the work of this screen, two taps a line.
6. **One condition for all the cards whose file names none.** The API's default is the lowest
   grade (`DAMAGED`), so a deck would arrive as forty damaged cards. The preview says how many
   cards have no condition in the file and offers one for all of them; a line whose condition the
   collector set is left alone.
7. **Progress is a line, not a percentage.** The typed client has no byte progress, a file is at
   most 2 MB, and the wait is the matching on the server.
8. **The three counts the summary needed were added to the API**, not worked out on the phone from
   pages of rows (see "Counts for the phone's summary").
9. **Pinned controls follow the system text size only a little** (the commit bar; "Import" and
   "Select" on the Inventory tab), like the app's other pinned controls since stage M9: at the
   largest size two full-size buttons took what was left of the screen. From a text scale of 1.4
   a line puts its name and controls under the picture and the counts stand one per line.
10. **Fictional deck cards for the end-to-end stacks only**: `SEED_IMPORT_FIXTURES=true` is set in
    the environment of the isolated mobile API (`scripts/lib/mobile-e2e-guard.mjs`), next to the
    disabled provider; the web E2E stack does not need it (no web import screen) and no developer
    database ever gets it.

### Tests of the phone screens

- **jest** (88 suites, **879 tests**; 84 suites and 798 tests before the stage): `features/inventoryImport.test.ts` 32 (the wording: sources, limits, every
  refusal, the counts, a line, the commit button in each state, the result, the open import),
  `api/importUpload.test.ts` 5 (a picked file and a pasted text as the same `file` part, the cache
  file removed, the picker's options), `screens/inventory-import.test.tsx` 35 (source and file:
  skeleton, error with retry, paste, picker, a file too large refused before any upload, each
  refusal in words, the missing column named, the game of a CSV, progress and no second upload;
  the preview: the counts and every accessible name, a section, "Which copy", suggested printings
  first, the dialog, a line left out at once and put back when refused, both bulk actions, the
  filters, an empty filter, paging and a page that failed; the commit: left out only when said,
  `skipUnresolved`, merged cards, pressed twice, repeated after a lost connection, a lost answer,
  the plan limit with and without Premium; expiry by the API and by the clock, the open import, a
  cut commit, leaving, discarding, replacing, committed elsewhere), `components/importRow.test.tsx`
  8 (the row and the header: names, states, large text), `screens/inventory.test.tsx` +1 (the
  "Import" entry).
- **Mobile web E2E** (Playwright, real stack): `e2e/inventory-import.spec.ts` 3 (a deck file
  through the file chooser after a picture that is refused, to three Private cards on the API and
  in the Inventory tab, the same commit sent again adding nothing; a Collectr CSV pasted after one
  whose card name column is missing, the merge with two copies already owned, a row that fits
  nothing, no price on screen; an import left open: the question on leaving, "Continue your
  import", the discard after a question).
- **Native flows** (Maestro, one set for both platforms): `inventory-import-deck.yaml` (a deck
  pasted, a printing chosen, the bulk action, one condition for all, the commit, three Private
  cards checked on the API by `scripts/check-import.js`), `inventory-import-csv.yaml` (a CSV pasted
  by a collector who owns two copies, given on the host by `scripts/own-printing.js`: the merge
  said in the preview and done by the commit, four copies on the API); two subflows for a list
  with a bar under it (`scroll-down-above.yaml`, `scroll-to-top-below.yaml`).

### Measurements (2026-10-13, the owner's Mac mini, isolated stack)

- On the simulator, a 640-row CSV (53 kB) chosen in the Files picker: the preview was on screen
  when the next step looked for it (633 lines to choose, 7 not recognised); "Use the most recent
  printing for all unchosen rows" on 633 lines, then the commit: 200 cards, 1,265 copies, no
  visible wait.
- The API alone, called as the phone calls it (`localhost`, one collector, fictional rows over the
  80 cards of the sample catalog):

  | Step | 640 rows (52 kB) | 5 000 rows (406 kB, the default limit) |
  | --- | --- | --- |
  | upload, match, store the preview | 64 ms | 319 ms |
  | first page of 50 lines | 14 ms | 16 ms |
  | one line left out and put back (two edits, each with the new counts) | 18 ms | 22 ms |
  | "most recent printing" for all | 22 ms (633 lines) | 125 ms (4 948 lines) |
  | commit | 59 ms (200 new cards, 1 265 copies) | 167 ms (200 cards raised, 9 895 copies) |
  | the same commit again | 7 ms, same result | 54 ms, same result |

  The second file went into the cards the first one had created: `summary.mergedItems` said 200
  before the commit and the result said `itemsMerged` 200, `itemsCreated` 0.
- The preview loads 50 lines a page; forty flings down the list kept scrolling and loading.
- The native flows, in the full run: `inventory-import-deck.yaml` 2 min 9 s,
  `inventory-import-csv.yaml` 1 min 36 s.
- Web bundle: unchanged (initial total 899.93 kB, as before the stage; nothing of the import is
  in the web app).

### Checks of the phone builder (2026-10-13, Mac mini, JDK 21, OrbStack; retries off)

| Check | Result |
| --- | --- |
| `(cd apps/api && ./gradlew spotlessCheck)` | green |
| `npm run test:api`, twice in a row | green both times: **955 tests** in 169 classes, 0 failures, 0 skipped (3 min 1 s and 3 min 4 s). The count is the API builder's: the three new counts are asserted inside existing tests of `InventoryImportIT` and `ImportFixtureSeedIT` |
| `InventoryLockOrderIT`, three times in a row (`./gradlew test --rerun --tests ...`) | green three times: **81 tests**, 19.6 s, 19.4 s and 19.7 s |
| `(cd apps/api && ./gradlew exportOpenApi)` then `npm run generate:api` | committed with the three counts (`InventoryImportSummary`, `InventoryImportSections`); a second run changes no generated file |
| `npm run build -w apps/web-angular` | compiles; initial total **899.93 kB** (warning at 900 kB), the figure of before the stage: the web app is not changed |
| `npm run test:web` | green: 142 files, **678 tests** |
| `npm run lint -w apps/web-angular` | all files pass |
| `npm run test:e2e -- --retries=0` (the web suite, as a regression check of the API) | **74 passed** on the first attempt (1.3 min of specs, 1 min 26 s with the stack) |
| `npm run typecheck -w apps/mobile`, `npm run lint -w apps/mobile`, `npm run format:check -w apps/mobile` | green |
| `npm run test:mobile` (typecheck, lint, jest, the harness guard tests) | green: jest 88 suites, **879 tests**; guard tests 28 |
| `npx expo export --platform ios`, `--platform android`, `--platform web` (throw-away directories) | all three export: 5.5 MB (ios, Hermes bytecode), 5.8 MB (android), 2.9 MB entry (web) |
| `npm run test:mobile:e2e -- --retries=0` | **59 passed** on the first attempt (53.6 s of specs; 56 specs before the stage) |
| `npm run test:mobile:maestro -- --platform ios` on the owner's simulator | **29/29 flows passed** in 45 min 50 s (46 min 12 s with the stack): the 27 flows of before the stage and the two import flows (`inventory-import-deck.yaml` 2 min 9 s, `inventory-import-csv.yaml` 1 min 36 s) |
| `npm run test:scripts` | green: **133 tests** in 25 suites (the guard test knows `SEED_IMPORT_FIXTURES`) |
| `npm run audit:gate` | OK, no unreviewed high or critical advisory (the two allow-listed ones expire on 2026-11-30) |

Before the full run the import flows were run on their own while they were written: the deck flow
three times (the first run failed where `scrollUntilVisible` took a button under the commit bar
for a visible one; the two new subflows are the fix, and the two runs after it passed), the CSV
flow twice (passed both times).

Git status clean, nothing left running (API, Metro, web servers and the Gradle daemon of this
session stopped; the emulator accounts of the walk deleted), the simulator still booted, light, at
its default text size. Not run: the Android half of the native suite (no Android SDK on this Mac).

### Walked by hand on the owner's simulator (iPhone 18 Pro, iOS 27.0, Expo Go)

- **A deck by file**: "Choose a file" opens the Files picker; `fictional-deck.ydk` (CRLF line
  ends, a comment line), copied into "On My iPhone", is selectable although its type is unknown,
  and becomes the preview of the worked example (1 new card, 2 to choose, 1 not recognised;
  sections 3 / 1 / 2). The picker is another process: Maestro sees none of it, it was driven by
  taps on positions.
- **A CSV by file**: the 640-row export above, replacing the open import after "Replace your open
  import?".
- **A deck and a CSV by paste**: the two native flows.
- **Leaving**: the header's back button and the back gesture of iOS both ask "Leave this
  import?"; "Stay" keeps the preview, "Leave" goes back to the Inventory tab, and "Import" offers
  "Continue your import" with the choices made.
- **Dark**: the preview, the lines, "Which copy", the condition dialog. **Largest text size** (the
  launch argument of `relaunch-large-text.yaml`, no setting of the device changed): every screen
  scrolls and nothing is cut; the commit bar stays two lines high. The simulator was left booted,
  light, at its default text size.
- **What a screen reader would say** (`maestro hierarchy`): the back button "Inventory"; "Import
  Fixture Lantern Wisp, checkbox, checked"; "Which copy of Fixture Clockwork Heron: Choose
  printing"; "Condition and copies of Fixture Lantern Wisp: Damaged (not in your file), 2 copies";
  a line nothing fits as one sentence ("Not recognised: Passcode 919999999, 1 copy, No card of the
  catalog has this passcode."); the filter as radio buttons with their state; the condition dialog
  with its radios and "Copies".

### Found, not fixed (not caused by this stage)

- **A dialog that follows a sheet could be on screen with an empty accessibility tree on iOS.**
  Found while reading the names above, on a screen from before this stage (the card editor: open
  the binder sheet, close it, press "Delete card"). **Cause found and fixed on 2026-10-13**: it
  needs the dark scrim, not a stack screen and not "another kind" of modal. See "A scrim iOS takes
  for a modal" below.
- The web build does not hold the browser's own Back button (a limit of React Navigation on the
  web); the header's back button asks. Nothing is lost either way: the preview is kept.
- The header's back button of the web build is named "(tabs), back" (the group's name; iOS shows
  "Inventory" through `backTitles.ts`, which is iOS only by design).

### Could not be verified

- **The Android run** (no Android SDK on this Mac): the screens, the two flows and the two new
  subflows on Android, and the upload of a file from Android. The upload uses the file part of
  `localFilePart.ts`, which on Android is still React Native's own part and is expected to fail
  the way photo uploads are expected to (the open item of "Mobile app on the iOS simulator").
- **Collectr's real CSV header** (never fetched): the alias table covers the header it is believed
  to have and the usual variants.
- **VoiceOver itself**: the names were read from the accessibility tree, not heard.
- **The Files picker with iCloud Drive** or another provider: only "On My iPhone" of the simulator.

### Not built, recorded

- **The web import screen** and a web admin page for the `inventory.import.*` settings (web
  paused; the admin API exists, and `inventory.items.max` is editable in `/admin/usage-limits`).
- A label for the job `inventory-import-purge` on the web admin health page (it shows under its
  name); a data export section for import previews (API decision 10).
- A way back to the top of a very long preview on Android (iOS has the tap on the status bar):
  the bulk actions and the filter stand in the head of the list.
- No feature flag and no analytics event for the import: the spec asks for neither.

### Review fix 1 (2026-10-13)

Two independent reviews of the stage (a product and usability walk on the simulator, U1 to U14;
a functional and security verification with attacks and mutations, F1 to F10) asked for changes.
Each finding, and what was done. Migration **V114** (`V114__inventory_import_review_fixes.sql`).

**What changes for a collector**

- **A plan limit on the inventory can no longer be passed by an import (F1, blocker).** An import
  of more than 500 cards is written in parts, and between two parts a card added by hand, or a
  second import, took room that was already promised: 1 514 cards at a limit of 1 500. From the
  moment a commit starts, the cards it has still to write count as used
  (`inventory_import.chunk_new_items`), for `POST /inventory/items`, for a second import and in
  `GET /me/plan`. No plan has a number for this limit today, so nothing was exceeded in practice.
- **A card shown as "Left out" is never imported (U1, F2).** On a slow connection the commit
  could overtake an edit that was still being saved. The phone now sends the commit only after
  every edit made before it was answered (one queue for the edits and the commit), and the button
  waits and says "Saving your changes…" meanwhile. A change that still comes too late (the import
  was committed on another device) is said on the result, with the card to check.
- **An import never changes a card the collector shows (U2).** Copies equal to a public card were
  added to it and became public at once, without a word. They now become, or join, a private card
  of their own, and the line says so ("You show 1 publicly: that card stays as it is, and these 2
  copies are added as a private card."). **Owner decision asked**: this is the cautious choice;
  the alternative is to raise the public card and say so before the commit.
- **"Use the most recent printing" no longer picks a 1st Edition or a foil by the alphabet (U3,
  F9).** Where the most recent set holds a card in several editions or finishes, the plain copy
  is taken (Unlimited, no foil: the one that claims least, like the lowest condition), the line
  says so until the collector changes it, and the message counts those lines. Where the date
  decides nothing otherwise (two rarities, two languages), the line stays "Choose printing" and
  the message says how many. **Owner decision asked**: the alternative is to leave every such
  line to the collector (with the sample catalog, where every Yu-Gi-Oh! card has a 1st Edition
  and an Unlimited copy in one set, the action would then decide nothing).
- **"Not recognised" is no dead end (U4).** "Passcode" is explained where the deck file is chosen
  and on the line ("the number printed in the lower left corner of a card"); every reason says
  what can be done next (find the card with "Add card", check the spelling, add the set or the
  number); a deck line says in which section it stands; and after the commit the lines that were
  not added stay readable on the result ("Not recognised (3)", "Without a printing (1)").
- **At the largest text size the pages that end the flow scroll (U5)**: "This preview expired"
  and "The import could not load" kept "Start over" and "Try again" out of reach.
- **Smaller things**: the card "Check the conditions" says what the cards were set to after "Set
  one condition" (U7); one word per thing, "different cards" of a deck, "lines" of a CSV, "copies",
  and the copies next to the cards on the button, "Add 12 cards (40 copies)" (U8); the paste field
  has a "Done" bar over the keyboard on iOS and a drag of the page puts the keyboard away (U9); a
  CSV in another encoding is told to be saved as UTF-8 (U10); the plan limit is said on top of the
  preview before any commit, and a refusal says how many cards to leave out (U11); the filter
  stays on screen above the list, the two counts that ask something are buttons, and a filter
  brings its first line up (U12); a recognised line shows what the file said, a passcode or the
  set, number and rarity as written (U13); a line of a game OrenjiTrade does not have shows the
  copies its file wrote (U14, F10).
- **A file chosen with the picker is not kept on the phone (F6)**: the copy the system picker
  makes in the app's cache is deleted after the upload, after a refusal, and when the collector
  keeps the open import instead.

**Each finding**

| Finding | Done |
| --- | --- |
| F1 limit passed by an import of several chunks (blocker) | V114 `chunk_new_items`; the usage of `inventory.items.max` = live items + what the collector's `COMMITTING` imports have still to write (`InventoryExtensions`, `InventoryImportRepository.reservedItems`). A later chunk that needs more than it reserved (its merge target was deleted and the room given away) is refused with 429 and waits. Tests: `InventoryImportIT` `theCardsACommitHasStillToWriteKeepTheirRoomUnderTheLimit`, `cardsAddedByHandWhileAnImportIsWrittenNeverPassTheLimit` (8 writers), `aChunkThatNeedsMoreRoomThanItsCommitReservedWaitsForIt` |
| F4 the limit of an import of more than 500 lines untested | `anImportOfSeveralChunksIsRefusedAsAWholeBeyondTheLimit` (limit 600, 1 000 lines: 429 `requested` 1000, nothing written, still `PENDING`) |
| F3 no test fails when the commit stops taking the owner lock first | `InventoryLockOrderIT.everyWriteStartsWithTheOwnerLock`: the preview is uploaded before the lock is held, the check also locks the collector's `inventory_import` rows `NOWAIT` and reads the preview `PENDING` with no row frozen |
| F5 the guard that re-plans a commit after an edit untested | `InventoryLockOrderIT.aCommitThatWaitedPlansAgainAfterAnEditOfItsPreview` (the reviewer's recipe: owner lock held, commit waits, a row is left out with 200, lock released: 2 of 3 rows imported) |
| F7 the account purge deleted the previews before the owner lock | order swapped (`InventoryExtensions`: items, which take the lock, then previews); new case `ACCOUNT_PURGE` in `everyWriteStartsWithTheOwnerLock` |
| F8 a finish no printing has was dropped and the row preselected | `ImportMatcher`: such a row is never preselected (`aFinishNoneOfThePrintingsHasIsNeverDroppedSilently`) |
| F9 / U3 the tie of "most recent printing" | `ImportMatcher.mostRecent` (plain copy of several versions, marked `MOST_RECENT_ASSUMED`; anything else undecided); `assumed` and `undecided` in the answer; tests in `ImportMatcherTest` (2) and `InventoryImportIT` |
| F10 four small inaccuracies | (1) uploads of one collector take an upload lock and wait for an edit: one open preview however they arrive (two tests); (2) the unknown-game row keeps its copies; (3) a quantity above 9 999 is `INVALID_QUANTITY`, not cut to 9 999; (4) `result.copiesNotAdded`, said on the result |
| U1 / F2 commit while edits are being saved | `useCommitImport` in the edits' mutation scope, `useImportEditsPending`, the button; jest: `api/importCommitQueue.test.tsx` and a screen test with a slow API |
| U2 merged copies became public | API: only a private item is raised (`mergeTargets`, `OWNED_KEYS`), `shownQuantity` on a row; phone: the line says it |
| U4, U7, U8, U10, U11, U13 wording | `importLabels.ts`, `ImportRowCard`, `ImportResult` (the lists), `ImportPreviewHeader`; `summary.defaultCondition` added for U7 |
| U5 the expired page does not scroll | `app/items/import.tsx`: the three end states are scroll screens; seen on the simulator at the largest size, and a jest test |
| U9 "Use this text" under the keyboard | `Screen.keyboardDismissMode`, an iOS `InputAccessoryView` "Done", `Keyboard.dismiss()` on submit |
| U12 three screens of header, the filter at its end | the filter pinned above the list (text size capped like the commit bar), counts as buttons, a filter scrolls to the first line |
| F6 the picked copy stays in the cache | `discardUpload` (`importFile.ts`): after the upload, on a refusal before sending, on "Keep it", on leaving; only ever a file of the picker's own folder |
| U6 a dialog once on screen with an empty accessibility tree | **Not changed: not reproduced, and not in this stage's code.** Three more controlled attempts here (the card editor: binder sheet closed by an option, then by its backdrop, then "Delete card"; the import: bulk action, "Which copy" closed by its backdrop, then the row dialog) all exposed the dialog, after the reviewer's eight. A lead for the task the builders flagged: the test driver takes its snapshot honouring `accessibilityViewIsModal` (our `aria-modal`), so a modal whose native view outlives its React unmount for a moment would hide everything else, from the snapshot and from VoiceOver. To try there: keep a modal's turn (`modalTurns.tsx`) until React Native's `onDismiss`, and check with VoiceOver on a device |

**Proof that the new tests catch what the reviewers' mutants escaped** (each mutation applied to
the worktree, the two suites run, the worktree restored): the usage without the reservation, the
purge order reversed and `SKIP LOCKED` back: 5 tests fail; the owner lock out of both chunk
transactions: the `IMPORT_COMMIT` case fails; the revision ignored and the limit of the first
chunk only: the re-plan test and the chunks test fail; no upload lock, the later-chunk guard off
and public merge targets: 4 tests fail; the import row locked before the owner lock: the
`IMPORT_COMMIT` case fails. On the phone: the commit out of the queue fails the queue test, the
button not waiting fails the screen test.

**Tests added**: API `InventoryImportIT` 17 → 26, `InventoryLockOrderIT` 81 → 83,
`ImportMatcherTest` 14 → 17, `ImportResultTest` 2 (a result stored before V114 still reads). Phone
jest 879 → 909 tests (`importCommitQueue.test.tsx` new; the wording, row, upload and screen
tests extended). The web E2E spec and the two native flows assert the new wording, the pinned
filter, the source line, the condition card after "Set one condition" and the left-out list.

**Checks of review fix 1** (2026-10-13, Mac mini, JDK 21, OrbStack; retries off)

| Check | Result |
| --- | --- |
| `(cd apps/api && ./gradlew spotlessCheck)` | green |
| `npm run test:api`, twice in a row | green both times: **984 tests** in 173 classes, 0 failures, 0 skipped (3 min 2 s and 3 min 10 s); 968 before the fix (the count includes the 12 catalog tests and the OpenAPI export test) |
| `InventoryLockOrderIT`, three times in a row (`./gradlew test --rerun --tests ...`) | green three times: **83 tests**, 19.6 s, 19.7 s and 19.8 s |
| `(cd apps/api && ./gradlew exportOpenApi)` then `npm run generate:api` | committed; a second run changes nothing (`git status` clean). No path added or removed: four fields and one enum value (`shownQuantity`, `assumed`, `undecided`, `copiesNotAdded`, `defaultCondition`; `MOST_RECENT_ASSUMED`) |
| `npm run build -w apps/web-angular` | compiles; initial total **899.93 kB** (unchanged: the web app is not touched) |
| `npm run test:web`, `npm run lint -w apps/web-angular` | green: 142 files, **678 tests**; all files pass |
| `npm run test:e2e -- --retries=0` (the web suite, as a regression check of the API) | **74 passed** on the first attempt (1.3 min of specs) |
| `npm run typecheck -w apps/mobile`, `npm run lint -w apps/mobile`, `npm run format:check -w apps/mobile` | green |
| `npm run test:mobile` (typecheck, lint, jest, the harness guard tests) | green: jest 89 suites, **909 tests**; guard tests 28 |
| `npx expo export --platform ios`, `--platform android`, `--platform web` (throw-away directories) | all three export: entry 5.6 MB (ios, Hermes bytecode), 5.9 MB (android), and the web build |
| `npm run test:mobile:e2e -- --retries=0` | **59 passed** on the first attempt (53.6 s of specs) |
| `npm run test:mobile:maestro -- --platform ios` on the owner's simulator | **29/29 flows passed** in 46 min 7 s (46 min 30 s with the stack); `inventory-import-deck.yaml` 2 min 21 s, `inventory-import-csv.yaml` 1 min 37 s |
| `npm run test:scripts` | green: **133 tests** in 25 suites |
| `npm run audit:gate` | OK, no unreviewed high or critical advisory |

Git status clean, nothing left running (the API, Metro and web servers of the runs stopped, the
emulator accounts of the walk deleted, the Gradle daemon of this session stopped), the simulator
still booted, light, at its default text size. Not run: the Android half of the native suite (no
Android SDK on this Mac).

Walked on the owner's simulator after the fixes (screenshots kept outside the repository): the
preview with the pinned filter and the units; the bulk action on a CSV of the sample catalog ("2
lines got their most recent printing. Their most recent set has several versions: the plain copy
(Unlimited, no foil) was taken. Check them. 1 line has several printings in its most recent set:
choose it."); the three kinds of line not recognised with their next step (the unknown game with
its 4 copies, 12 000 copies refused); the result with both lists opened; at the largest text size
the filter bar stays one line high, "All" brings the first line up in one press, and "This
preview expired" scrolls to "Start over". The paste step showed its "Done" bar; this simulator
shows no software keyboard, so the drag that puts it away was not seen with a keyboard on screen.
**The picked copy (F6), on the device**: a deck chosen in the Files picker while the test API was
held still: the copy stood in the app's `Library/Caches/DocumentPicker` for as long as the upload
waited, and was gone the moment the upload answered (the folder stays, empty). After the whole
native suite no `orenjitrade-import-*` file of a pasted text was left either.

**Still open after review fix 1**: the two owner decisions above (U2, U3); U6 as described; the
Android run (no SDK on this Mac); the "Done" bar and the drag with a software keyboard on a
device. The earlier line "A way back to the top of a very long preview on Android" under "Not
built, recorded" no longer applies: the filter is pinned on both platforms.

### Review fix 2 (2026-10-13)

The second, independent look at the branch (head `7e40bfc`) found the 23 findings of review fix 1
fixed and approved it, with one new finding, a minor one. It is answered here. No migration; the
commit of an import, its locks and its idempotency are not touched (a count and a read filter in
the API, one card and one chip on the phone).

**R1-1 (minor): the lines whose copy was assumed could not be listed once the snackbar was gone.**
"Use the most recent printing" answered "115 lines got their most recent printing. Their most
recent set has several versions: the plain copy (Unlimited, no foil) was taken. Check them." in a
snackbar that leaves after four seconds. After that nothing on screen counted those lines and no
filter listed them: in the reviewer's file of 435 lines the collector scrolled past every line
looking for the note under each copy. Nothing wrong was imported (each line is marked and the
plain copy claims least); it was the checking that was laborious.

What a collector has now:

- **A card that stays**, above the lines, for as long as one such line is unchecked: "Plain copy
  assumed for 115 lines", why the copy was taken, how to check one ("open its copy and pick yours,
  or pick the plain copy again to confirm it"), and a button "Show these 115 lines". A deck is
  counted in cards, as everywhere on its preview.
- **A chip of the filter that stays on screen**: "Plain copy assumed (115)", shown while there
  are such lines. The chips stand in the order of what they ask of the collector: All, Needs a
  printing, Plain copy assumed, Not recognised.
- **The list of exactly those lines**, in file order and paged like every list of the preview. A
  line leaves it, and the count goes down, when its copy is picked again (which confirms it) or
  changed; when the last one is checked the list says "No plain copy left to check".

What was done:

| Where | Change |
| --- | --- |
| API | `summary.assumedPrintings`: the rows that have a printing and whose `printing_choice` is still `MOST_RECENT_ASSUMED`, left out or not (`InventoryImportRepository.summary`). `GET /inventory/imports/{id}/rows` takes `printingChoice` (alone or with `status`): `MOST_RECENT_ASSUMED` lists exactly the rows the summary counts. A row whose assumed printing left the catalog has no printing any more: it is to choose again and is neither counted nor listed |
| Phone | `ImportPreviewHeader` (the card `import-assumed`, its button sets the filter), `importLabels` (`assumedCopiesText`, `filterOptions` with the chip and the order, the empty list), the filter `MOST_RECENT_ASSUMED` of `useImportRows` (sent as `printingChoice`); a row whose assumed copy was confirmed or changed reads the filtered lists again; a line whose assumed copy left the catalog no longer says that a copy was taken |
| Phone, found while proving the fix on the simulator | As the fourth chip of the pinned row, "Plain copy assumed" stood off screen to the right, and after the card's button had set the filter the row showed no chosen chip. Hence the order above (on a phone the third chip is cut at the edge, which says that the row scrolls) and `ChoiceChips revealSelected`: the row of the import filter brings the chosen chip whole on screen whenever the choice changes, also when the card's button or a count set it. The option is off by default: the other scrolling rows of chips (search, offers, trades, community) behave as before |
| Contract, documents | `docs/api/contracts/s5-inventory-import.md` (the count, the parameter, "Keep what was assumed in reach"), `apps/mobile/README.md`, the OpenAPI document and both generated clients (one field, one query parameter, no path added or removed) |

**Tests that would have caught it**

- API: `InventoryImportIT.theRowsWhoseCopyWasAssumedAreCountedAndCanBeListedUntilEachIsChecked`
  (the count on the preview after the answer of the bulk action; the filter alone, with a status
  and paged; a row left out stays; a row confirmed with the same printing, or put back to
  "choose", leaves both; a printing that leaves the catalog; an unknown value is a 400).
- Phone jest: a screen test that opens a preview whose bulk action ran earlier (no snackbar at
  all) and follows the card, the chip, the request for `printingChoice`, a confirmation, a change
  and the empty list; the wording and the chip order (`inventoryImport.test.ts`); the card and the
  line whose copy left the catalog (`importRow.test.tsx`); the row that brings its chosen chip on
  screen (`choice.test.tsx`).
- Mobile web E2E: a new test in `inventory-import.spec.ts` (a CSV whose two cards have a 1st
  Edition and an Unlimited copy in one set: the snackbar goes away, the card and the chip stay,
  the list, one line confirmed, one changed, the editions of the imported cards read on the API).
- Native: a new flow `inventory-import-assumed.yaml`, the same walk on the owner's simulator.

**Proof by mutation** (each applied to the worktree, the test run, the worktree restored): the
count without "has a printing" and the filter without it each fail the new API test; a filter
that sends nothing to the API, and no re-read of the filtered lists after a confirmation, each
fail the new screen test.

**Seen on the owner's simulator** (the reviewer's file of 435 lines; screenshots kept outside the
repository): after the snackbar is gone the card "Plain copy assumed for 115 lines" and its
button; deep in the list the pinned row with "Plain copy assumed (115)"; the chip pressed: the
assumed lines from the first one, each with its note; one copy picked again: the line leaves the
list, the chip says 114, and the API counts 114 and lists 114; at the largest text size the card
and the button, and the button brings the chosen chip whole on screen; the card in the dark
theme. The simulator was put back to light.

**Not part of this fix**: the two nits the second look also noted (on a line that is left out
the note "Taken as the plain copy…" is cut at the card's edge; a line of a game OrenjiTrade does
not have with an unreadable quantity shows no copies) are not blockers of the reviewers and are
recorded here. (Stage S6: the copies of that line are shown; the cut note was not seen again;
"Small fixes before the final documents (stage S6, 2026-10-13)".) The dialog that was once seen with an empty accessibility tree (U6 of review fix
1) is answered outside this branch: its cause was found and fixed on branch
`fix/ios-second-modal-accessibility`, which ships after this one (not verified here). The owner
decisions of review fix 1 (U2, U3) stand as they were.

**Checks of review fix 2 and its independent verification (2026-10-13, head `3fbcaa1`): approved,
only small points left.** The fixer was stopped by the owner's pause before its native run ended;
the verifier ran the whole list itself, retries off: `spotlessCheck --rerun-tasks`; `npm run
test:api` twice (984 tests each, 194 s and 228 s); `InventoryLockOrderIT` three times (83 tests);
`exportOpenApi` + `npm run generate:api` with git clean; the web build (initial total 899.93 kB),
`npm run test:web` (678) and the web lint as a regression check; `npm run test:e2e -- --retries=0`
(74 passed); mobile typecheck, lint, format check; `npm run test:mobile` (jest 89 suites / 916
tests, 28 guard tests); the three exports; `npm run test:mobile:e2e -- --retries=0` (60 passed);
**the native suite, 30 of 30 flows in 47 min 54 s on the owner's iPhone 18 Pro simulator**;
`npm run test:scripts` (133); the audit gate. R1-1 was reproduced through the real API and on the
phone with a file of 435 lines (356 assumed: the card, the chip, the count going down with each
confirmation). Around it: eight commits at once gave one result, for one chunk (171 items) and
for two (800 items); a repeated commit added nothing; the same file again merged (0 created, 800
merged); everything imported was Private; nothing of the file in the log or the tables. Twelve
mutants around the fix were all caught. Left open, small:
- the chip "Plain copy assumed (N)" is cut at the edge of its pinned row until it is dragged or
  chosen (the card above the lines carries the count; a shorter label would keep it in view);
  **closed in stage S6** ("N assumed", the count first);
- the commit label wraps onto two lines after the reason above it changed (**closed in stage
  S6**: a label that fits one line); on a line that is left out the note "Taken as the plain
  copy…" is cut at the card's edge (**not reproduced in stage S6**, nothing changed);
- a line of a game OrenjiTrade does not have with an unreadable quantity shows no copies
  (**closed in stage S6**); when the file names a finish no printing has, the line never shows
  the file's variant (**left in stage S6**: the preview does not store it; a migration and a
  contract change);
- in a file that names cards without a set, most lines are assumed (356 of 435 in the test file)
  and each is confirmed one at a time: there is no "confirm all" (an owner question under U3).
Not verified: the Android run (no Android SDK on this Mac; the Android export builds) and
VoiceOver speech itself (the accessibility tree was read).

## A scrim iOS takes for a modal: the dialog with an empty accessibility tree (2026-10-13)

> Branch `fix/ios-second-modal-accessibility`, cut from `feature/s5-inventory-import` at `05427c2`
> and merged with `main` once stage S5 was on it (#69). Found, fixed and tested by a side session
> on 2026-10-13; shipped the same evening by the lead, because that session ended with a restart
> of the Mac ("Ship step" below). Mobile only; `apps/web-angular` and the design tokens are
> not touched. It closes the finding recorded by stage S5 ("Found, not fixed").

### What was recorded, and what it really is

The record said: on a **stack screen**, the second modal **of another kind** is on screen with an
empty accessibility snapshot; the Inventory tab is fine; removing `aria-modal` changes nothing.
Three of those four points were coincidences:

- **It needs the dark scrim, nothing else.** Every failing run of the builder was made during its
  dark walk, and the one failure of the UX reviewer during its dark shots. Light: 30 nodes in
  Maestro's snapshot; Dark, the same steps: 22 (the status bar and empty containers).
- **Not a stack screen.** On the Inventory tab the list re-renders between the bulk sheet and the
  confirmation and takes the recycled views first (see below); the editor and the import screen
  change nothing between the two modals.
- **Not "another kind".** A sheet then a dialog, a dialog then a dialog: the order of the views
  decides, not the component.
- **`aria-modal` does nothing on a phone.** React Native 0.86 maps `aria-label`, `aria-hidden`,
  `aria-checked` and others to native props; `aria-modal` is in its types and in no mapping, in
  JavaScript or in C++. On our dialogs it is an attribute of the web build only.

### The cause: three facts that meet

1. **iOS decides by itself that some views are modal.** `accessibilityViewIsModal` is not only
   what an app sets: UIKit's accessibility answers YES for a view that is in a window, has
   **exactly the size of the window** and a **black background the page shows through**. Measured
   on the simulator (iOS 27.0), one fresh view per case:

   | What varies | Modal | Not modal |
   | --- | --- | --- |
   | opacity of a pure black | 0.15 to 0.85 | 0.10 and under, 0.90 and over |
   | grey level out of 255, at 0.6 | 0, 2, 4 | 6 and over |
   | red alone out of 255, at 0.6 | 0 to 16 | 20 and over |
   | size | the window's, wherever it is placed | 1/3 pt smaller, 1 pt larger, 95 % |
   | our tokens | dark `overlay`, `rgba(0, 0, 0, 0.6)` | light `overlay`, `rgba(28, 25, 23, 0.48)` |

   So: a white level under about 2 % (an opaque black on a view that is itself 60 % opaque
   counts too). A modal view makes VoiceOver, and the snapshot Maestro reads, **ignore every view
   behind it in the same parent**; what is in front stays.
2. **The native view keeps the answer** for as long as it has the size of the window: black, then
   no colour at all, still YES. Only a change of size asks the question again. Setting the
   property by hand (YES or NO) wins over the guess, but React Native only does that when the
   prop changes, and the prop never changed.
3. **React Native reuses native views**, last recycled first. Followed by its address in one
   launch (dark, the old scrim):

   | The sheet (binder choices) | becomes, in the dialog that follows |
   | --- | --- |
   | its backdrop, black 0.6, **modal by iOS** | the full-window view of React Native's debugging overlay, in front of everything, **still modal** |
   | its panel | the dialog's panel |
   | the debugging overlay's view | the dialog's backdrop |

   The dialog and its backdrop are then behind a modal view: on screen, working by touch, and
   absent from accessibility.

The debugging overlay is the dev-only part: in a development bundle React Native wraps the
children of every `Modal` in its `AppContainer`, which adds a full-window, untouchable view in
front of them.

### A development artifact, or a defect for VoiceOver users?

Both parts were measured, not guessed. A small library loaded into Expo Go on the simulator (it
reads, it changes nothing) asked UIKit for the elements a screen reader can reach, with UIKit's own
VoiceOver options:

| State (dark, card editor) | Elements a screen reader can reach |
| --- | --- |
| "Delete card" as the first modal of the launch | 5: the backdrop, the title, the text, Cancel, Delete card |
| the binder sheet as the first modal | 3: Close, the title, the choice |
| "Delete card" after the sheet, development bundle | **0** |
| the same, `Modal` rendered as a release build does (no `AppContainer`) | 5 |
| the same, development bundle, with the fix | 5 |

- **The symptom as it was seen needs a development bundle.** Rendered as a release build does,
  the dialog exposed its 5 elements and no view of ours was modal: nothing stands in front of a
  dialog at the size of the window there, and by the same order of reuse the recycled backdrop
  is the dialog's panel, which is smaller, so iOS asks the question again and answers NO.
- **The mark itself is not a development artifact.** Rendered as a release build does, in the
  dark theme, the backdrop of the sheet was modal as well, and the same native view was followed
  into the dialog, where it was the panel. The mark does harm wherever the next use of such a
  view is window-sized with something behind it. Nothing in the app is in that place today; that
  is luck, not a rule, and one full-window overlay in front of content would be enough. So the
  cause is removed, not worked around.
- Real VoiceOver on a device was not heard (see "Could not be verified").

### The fix

- **`src/theme/scrim.ts`** (new): `scrimColor()` keeps the opacity of a colour and never lets a
  channel go under the darkest warm tone of the design system (`rgb(12, 10, 9)`, a white level of
  about 4 %, twice what iOS takes for black). **`palette.scrim`** is the `overlay` token through
  it: unchanged in light, `rgba(12, 10, 9, 0.6)` in dark. The token itself is not changed (the web
  app reads it).
- **`BottomSheet`, `ConfirmDialog`, `FormDialog`** and `features/offers/ReasonDialog` take
  `palette.scrim` for their backdrop. The backdrop of the two dialogs gets an id
  (`<testID>-backdrop`), as the sheet's had. The photo opened from a message
  (`MessageBubble`, black at 0.92, just outside the range today) goes through the same helper.
- Rule for later: **a view that covers the window is never a translucent pure black.** It takes
  `palette.scrim` or `scrimColor()`.
- Not changed: `modalTurns.tsx`, `SelectSheet`, `aria-modal` on the dialogs (harmless on a phone,
  meaningful on the web build), the order in which React Native reuses views.

### Tests

- **Jest** `__tests__/components/scrim.test.tsx`, 14: the helper (opacity kept, floor per channel,
  `#` and `rgb()` forms, a colour it cannot read is refused), both palettes (white level above
  3.5 %, the light scrim is the token unchanged, the dark one is not the black token), and the
  backdrop of a sheet, a confirmation and a form dialog in both themes.
- **Native flow** `.maestro/dialog-after-sheet.yaml`: a fresh collector with one card chooses
  **Dark in Settings > Appearance** (the device stays as it is; the next flow starts from a
  cleared app), opens the card editor, the binder sheet, then "Delete card": title and both
  buttons by id; then the sheet after the dialog; then the dialog again, answered: the card is
  gone on the API. **On the old black scrim it fails** at the first button of the dialog; with the
  fix it passes. It is the only flow in the dark theme: a scrim that turns black again, or an iOS
  that widens what it takes for black, fails here.

### Checks (2026-10-13, Mac mini, the owner's iPhone 17 simulator, iOS 27.0, Expo Go 57.0.9)

| Check | Result |
| --- | --- |
| `npm run typecheck -w apps/mobile`, `npm run lint -w apps/mobile`, `npm run format:check -w apps/mobile` | green |
| `npm run test:mobile` (typecheck, lint, jest, the harness guard tests) | green: jest 89 suites, **893 tests** (879 before, 14 new); guard tests 28 |
| `npx expo export --platform ios`, `--platform android`, `--platform web` (throw-away directories) | all three export |
| `.maestro/dialog-after-sheet.yaml` on the old black scrim | **fails**, at "edit-item-delete-dialog-cancel is visible" (the dialog is on screen) |
| `.maestro/dialog-after-sheet.yaml` with the fix | **passes** (1 min 54 s): sheet, dialog, sheet, dialog, the card deleted on the API |
| `inventory-add-edit-delete.yaml`, `blocked-users.yaml`, `inventory-import-deck.yaml`, `inventory-import-csv.yaml` (the flows with the most sheets and dialogs) | pass |
| the whole native suite, `npm run test:mobile:maestro`, and the mobile web E2E, `npm run test:mobile:e2e` | not run by the side session; **run in the ship step, both green**: see below |

The five native flows above ran with Maestro called directly, against an API and a Metro of this
branch on their own ports (8690 and 8087, database `orenjitrade_mobile_a11y`), on the iPhone 17
the owner booted for this work: stage S5's reviewers held the iPhone 18 Pro and the harness's
ports (8090, 8082, 19006) that day. The iPhone 17 is not prepared as the harness prepares a
simulator (US English, a plain keyboard), which needs a restart of the simulator. **Before the
pull request, once S5 is on `main` and merged into this branch: the whole native suite and the
mobile web E2E with the usual commands on the prepared simulator**, with the other checks of a
stage (docs/development/claude-handoff.md, section 3).

**Ship step (2026-10-13, 21:40 to 22:35, by the lead, on this branch merged with `main` at
`4a64244`, head `9b06581`):** `npm run typecheck -w apps/mobile`, `npm run lint -w apps/mobile`
and `npm run format:check -w apps/mobile` clean; `npm run test:mobile`: jest 90 suites / 930
tests; `npm run test:mobile:e2e -- --retries=0`: 60 passed; **the whole native suite on the
prepared iPhone 18 Pro simulator: 31 of 31 flows in 50 min 23 s**, the new flow "A dialog after a
sheet on a stack screen" among them (1 min 49 s, the only one in the app's Dark theme), the
simulator light again afterwards. The two documents were the only conflicts of the merge.

Left as found: git holds only the files of this change, the React Native file edited for the
"release build" measurement is back as installed, the API and Metro of this work are stopped,
their database dropped, their emulator accounts deleted; both simulators booted and light.

### Could not be verified

- **VoiceOver on a real iPhone, and a release build.** The verdict above rests on UIKit's own
  traversal with its VoiceOver options and on a development bundle whose `Modal` was made to
  render as a release build does. Both run the same UIKit code; neither is a person with
  VoiceOver on a device.
- **Other versions of iOS.** The numbers are those of the iOS 27.0 simulator. The floor is twice
  the measured limit; the native flow is the guard if another version draws the line elsewhere.
- **The Android run** of the new flow (no Android SDK on this Mac). Its only step no other flow
  has is the selected state of the theme chip (`selected: true`).

### Notes

- Upstream: React Native's recycled views keep what UIKit's accessibility remembers about them.
  Not reported; a minimal case would be a full-window `rgba(0,0,0,0.5)` view inside a `Modal`,
  closed, then a second `Modal` in a development bundle.
- The owner's iPhone 17 simulator, lent for this: "AutoFill Passwords and Passkeys" was switched
  off in its Settings (iOS otherwise puts "Save Password?" over the app after each sign-in; the
  harness does the same on the simulators it prepares). No other setting of it was changed; it is
  light, at its default text size, with Maestro's driver app installed.

## Small fixes before the final documents (stage S6, 2026-10-13)

Stages M9 and S5 recorded a short list of small defects and left them open. Each is closed here at
its cause, with a test, or left with the reason. Branch `feature/s6-final-docs`, one commit per
point. Nothing of the skipped stages (S3, S4) is built, the web app is not changed (paused), no
migration, and the API contract is unchanged (the OpenAPI document and both generated clients
regenerate to the same files).

**1. The card holders count included collectors in a block relation with the viewer (API, both
clients).** After a block the row left the list but "1 listing in your region" stayed, and a page
could come back short: `SearchService.cardHolders` dropped blocked owners after
`CardHolderRepository.page` had counted and paged them.

- Changed: both directions of a block are excluded in the SQL of the page and of the count
  (`DiscoverySql.notBlocked`, the clause the binders of a state already had); the per-row lookups
  it replaces are gone (`MarkerAssembler.isBlocked`). `apps/api/README.md` says so per route.
- The other lists of the search module, checked for the same shape:

  | List | Before | Now |
  | --- | --- | --- |
  | Binders of a state and the counts of the map (`RegionBinderRepository`) | excluded in SQL already | unchanged |
  | Binder section of `GET /search` (`BinderSearchRepository.search`) | limited in SQL, blocked owners dropped afterwards: a short or empty section while a match existed (no count) | same clause, before the limit |
  | Collectors and binders of `GET /search/suggest` | limited in SQL, one lookup per row afterwards: fewer suggestions (no count) | same clause, before each limit |
  | Collectors section of `GET /search` (`CollectorDiscoveryService.find`) | read from a cache shared by every viewer (60 s), blocked collectors removed afterwards; no count reaches a client | **not changed, recorded**: with two or more blocked collectors among the first `limit + 1` rows the section holds fewer than `limit` while more match. Not a one-clause change: the cached page is the same for every viewer |

- Tests: `CardHoldersIT.collectorsInABlockRelationWithTheViewerAreNeitherListedNorCounted`
  (listed and counted before; neither after; the viewer blocks, then is blocked; pages of one are
  exact in both sorts; by card; with a filter; others unaffected; unblock) and
  `SearchIT.aBlockLeavesTheBinderSectionAndTheSuggestionsBeforeTheirLimit` (with `limit=1` the next
  binder and the next suggestion take the place, both directions). Both fail on the code before
  ("expected 2 but was 3"; an empty binder section); six mutants of the clause (each direction
  alone, the clause taken out of each of the four queries) are killed.

**2. At the largest text size the state or province of a collector found by search was not on
screen (phone).** The handle and the place shared one line held to one line, cut after a few
letters of the handle ("@collecto…"); a long handle did the same at any size. The owner line of a
binder found by search had the same limit.

- Changed (`SearchResultRows.tsx`): both lines wrap, as the web's do; a screen reader hears the
  owner's place with a binder too. The name, the ratings line and the games line keep their one
  line, like every list row of the app (the pass of every screen at the largest sizes stays
  open, "Open (owner)" of stage M9).
- Tests: `search-segments.test.tsx` (the line that carries the place has no line limit in both
  rows, and both labels; fails with the limit put back); `large-text.yaml` takes the picture of the
  row at the largest size and checks that its label ends with the place.

**3. The small points of the import (stage S5, phone).**

- *The chip "Plain copy assumed (N)" was cut at the edge of its pinned row.* Measured in the
  system font, about 80 of the row's 370 points are left for the third chip after "All (435)" and
  "Needs a printing (0)": a count at the end of any wording ("Assumed (2)" included) is the part
  that is cut. The chip now shows **"356 assumed"** (the count leads, so it is what is in view)
  and a screen reader hears "Plain copy assumed (356)" (`ChoiceOption.accessibilityLabel`, new and
  optional; W5 of the next section changed that name to "356 assumed: the lines whose plain copy
  was assumed", "cards" for a deck file, so that it starts with the visible words). At the
  largest text size the row (held to its pinned size) shows only the first digit of that chip in
  "All"; the card above the lines carries the whole count there, and its button brings the chip
  whole on screen.
- *The commit label wrapped onto two lines.* "Add 434 cards (1,266 copies) to my inventory" is
  345 points for a 302-point button: with a real file's numbers it always wrapped. The button now
  shows a label that fits one line (`commitState().shortLabel`: "Add 434 cards (1,266 copies)",
  "Add 40 cards to my inventory", "Add 434 cards, leave 12 out"); the whole sentence stays its
  accessible name, which the E2E specs and the native flows read (for the leave-out form W5, in
  the next section, changed the name to "Add 434 cards, leave 12 out (1,266 copies added)", so it
  starts with the visible words).
- *A line of a game OrenjiTrade does not have, with an unreadable quantity, showed no copies.* The
  API reports that line for its game with `fileQuantity` 0. It now says "copies: not a number from
  1 to 9,999" where its copies would stand (not on a line whose reason is the quantity itself: the
  sentence under it says so).
- *On a line that is left out the note "Taken as the plain copy…" was cut at the card's edge.*
  **Not reproduced, nothing changed.** It was seen once, during the first verification of S5
  (a file of 435 lines, the API frozen, two lines left out, the commit pressed twice). On this tree
  it was walked on the owner's simulator in that order and others: a file of 4 lines and one of 400
  (320 assumed copies), lines left out with the API answering and with the API frozen
  (`SIGSTOP`), the commit pressed twice while saving, then the API resumed; at the default and the
  largest text size. The note stayed whole inside its card every time. If it is seen again, a
  picture with the text size and the steps before it would let it be found.
- *When the file names a finish no printing has, the line never shows the file's variant.*
  **Left, recorded.** The preview keeps of a file only what it shows (`ImportDraftRow`: the name,
  set, number and rarity as written); the variant is read to narrow the printings and not stored.
  Showing it needs a migration after V114, the row's record and repository, the response and the
  contract, the OpenAPI document, both generated clients and the phone: not a small change, and a
  decision about what of a collector's file is kept. Nothing is wrong meanwhile: nothing is
  preselected, the line asks for a printing and "In your file: …" shows the rest.
- Tests: `inventoryImport.test.ts` (the chip and its accessible name, the three label forms and
  none longer than the longest measured to fit, the copies of the unknown-game line),
  `choice.test.tsx`, `importRow.test.tsx`, the preview screen test.

**4. The small points of the region map (stage M9, phone).**

- *The dot of a place too small to be seen had the solid colour the legend uses for "10+",
  whatever its count.* It is now the land's colour under the tint of the step its count belongs
  to, as the place itself is drawn (`PlaceMark.level`). On the simulator the dot of Buenos Aires
  (one binder) has the colour of the legend's "1" and of São Paulo (one binder), pixel for pixel.
  Tests: `regionOutlines.test.ts` (the step of each count), `map.test.tsx` (one binder over the
  land's colour; 3, 7 and 12 binders; four tests fail with the tint taken out).
- *jest printed "A worker process has failed to exit gracefully" once per run.* Found by tracing
  the real timers still armed when a test file ends: one, of 20 000 ms, the read timeout of the API
  client (`withReadTimeout`), armed for the request of `auth.test.tsx` "shows a skeleton while the
  legal documents load", whose mocked answer never came. That file runs first and a run lasts 14 to
  24 seconds: its worker still held the timer at the end. The test now holds the answer back and
  then gives it (it also sees the documents replace the skeleton). `jest.setup.ts` fails a test
  file that ends with a real timer of 5 s or more still armed and says where it was armed (the
  unfixed test fails under it, naming `src/api/client.ts`). Five runs of the suite: no warning
  (before: every run). Left as they are: three test files end with an 800 ms timer of the
  notification receipts, under the guard's threshold.

**Walked on the owner's simulator** (iPhone 18 Pro, iOS 27.0, Expo Go; the default text size and
the largest one through the launch argument; screenshots kept outside the repository): Search >
Collectors and Binders in Europe ("@collector8 · Île-de-France, France", "Noah Kim · Île-de-France,
France" whole at both sizes); an import with two assumed copies, a line of an unknown game and a
line left out, and one of 400 lines (the chip "320 assum…" with its count in view, the button on
one line in every state, "Plain copy assumed (320)" as the chip's accessible name, a name W5 of
the next section changed); the maps of Americas (South) and Europe with their dots. The simulator
was put back to light and its default text size.

**Checks** (the final tree, the owner's Mac mini, JDK 21, OrbStack; retries off)

- `(cd apps/api && ./gradlew spotlessCheck --rerun-tasks)`: clean. `npm run test:api`: 974 tests
  in 170 classes and 12 catalog tests, no failure, none skipped (986; 984 before the two new
  ones), 3 min 5 s. `exportOpenApi` then `npm run generate:api`: nothing changed in git.
- `npm run build -w apps/web-angular`: initial total 899.93 kB (unchanged); `npm run test:web`:
  lint clean, 142 files / 678 tests; web lint and format check clean; `npm run test:e2e --
  --retries=0`: 74 passed. The web app was not changed (paused); these are regression checks.
- `npm run typecheck`, `lint`, `format:check -w apps/mobile`: clean. `npm run test:mobile`: jest 89
  suites / 922 tests with no "worker process" warning, 28 harness guard tests.
- `npx expo export` into throw-away directories: iOS 5,562,009 B (1,789 modules), Android
  5,854,444 B (1,913 modules), web entry 2,916,958 B (75 static pages).
- `npm run test:mobile:e2e -- --retries=0`: 60 passed. `npm run test:mobile:maestro -- --platform
  ios` on the owner's iPhone 18 Pro simulator: **30 of 30 flows in 47 min 56 s**, its 33 emulator
  accounts deleted, ports 8090 / 8082 / 19006 free afterwards.
- `npm run test:scripts`: 133. `npm run audit:gate`: OK (the 2 allowlisted advisories).
- Not verified: the Android run (no Android SDK on this Mac; the Android export builds);
  VoiceOver itself (the accessibility tree was read).

## Final documents and the definition-of-done walkthrough (stage S6, 2026-10-14)

The last stage of the owner's change of 2026-10-08: the specification's sections 8 ("Docs"), 9
("Tests") and "Definition of done", applied to what exists. Branch `feature/s6-final-docs`, after
the small fixes above. The result for the owner, in plain words, is the
[delivery report](docs/product/2026-10-08-change-delivery-report.md); this section is the
engineering record. Nothing of S3, S4 or the redesign of 2026-10-14 is built; `apps/web-angular`
is not changed (paused); no migration; the API contract is unchanged.

**The walkthrough in numbers** (an independent verifier, 2026-10-14, head `734d4e6`: the web on its
own stack at 1280 x 800, the phone on the owner's iPhone 18 Pro simulator under the lock, the
database, every suite with retries off). Of the 22 clauses of the definition of done: **12 done**
(C1, C5, C10–C15, C17, C18, C20; C22 with this stage's documents), **5 partly** (C2 "ash
blossom": the search works but the sample catalog has no such card; C4 holders by rarity; C8
recent searches on the phone's device only; C19 the S3 and S4 tests do not exist; C21 two lines
of the paused web README and two database comments of V112 stay stale, see "Fact check, round 1"
below), **5 not built** (C3, C6, C7, C9: S3; C16: S4). Of the 34 tests of section 9: 21 exist, 3
partly (the wishlist region rule has an integration test, `WishlistAlertsIT`, and no unit test),
8 missing (all S3), 2 not applicable (S4). Two clauses are done on one client only: the imports
(phone and API, no web screen). The table of each clause with its evidence is in the delivery
report, sections (b) and (i).

**Its findings, and what was done**

| Finding | Done |
| --- | --- |
| W1 (major) `IMPLEMENTATION_STATUS.md`: "NEXT TASK" said S6 was next and S5 waited for its PR; the header began with S2 | "NEXT TASK" rewritten (the redesign of 2026-10-14 is the decided next task; the merged list holds #67 to #70); a new "Last updated" line; the acceptance tracker rows 6, 12, 14, 15, 16 and 40 carry the phone halves of M9 and S5 |
| W2 (major) `claude-handoff.md`: M9, the lock fix and S5 listed as waiting; section 3 said the harness boots its own simulator | rewritten to today: what is on `main`, S6 waiting for its ship step, S3 and S4 not built, the redesign next; the owner's simulator is the rule everywhere (also `macos-setup.md` 9.5, `local-setup.md`, `apps/mobile/README.md`); the working agreements learned on the Mac (the agents' shell variables, Docker after a restart, the simulator lock, the notes files, mobile only, S3 and S4 skipped, CLAUDE.md proposals) |
| W3 (major) `product-overview.md`: the phone's Map tab a "placeholder"; no import | the Map tab as M9 built it; the phone import; the clients today; what is not built; the redesign as a decided future change |
| W4 (major) `schema.md`: `near_mint_only` "feeds Who wants it" | "Who wants it only if stage S3 is built: skipped by the owner on 2026-10-13, not built" (twice); the lock rule no longer names the wishlist matches among the rows that reference an item |
| W5 (minor, phone) the visible text of the import chip ("356 assumed") and of the leave-out button was not part of their accessible name (WCAG 2.5.3) | **fixed**: "356 assumed: the lines whose plain copy was assumed" (cards for a deck) and "Add 434 cards, leave 12 out (1,266 copies added)"; unit tests pin "the name starts with the visible label" for every count and form (6 tests fail on the old labels); the screen test, the mobile web E2E spec and the native flow `inventory-import-assumed.yaml` read the new names |
| W6 (nit, web) the initial bundle is 0.07 kB under its 900 kB budget | recorded (web paused): the delivery report, section (h) |
| W7 (nit, web) the wish dialog's hint names a rarity filter that is hidden when all printings share one rarity | recorded (web paused) |

**The documents, audited against the code** (each changed where it said something false today):

- New: [`docs/product/2026-10-08-change-delivery-report.md`](docs/product/2026-10-08-change-delivery-report.md);
  [`docs/product/specs/2026-10-14-phone-redesign.md`](docs/product/specs/2026-10-14-phone-redesign.md)
  (the owner's build prompt of the redesign under a short header, byte for byte: SHA-256
  `35d5009f…` of the prompt, checked with `cmp`).
- Changed: the root `README.md` (no ADR 0004 or map-provider claim, the mobile section, the mobile
  suites, the documentation map), `apps/api/README.md` (a section for the S5 import routes, which
  it lacked; the migrations up to V114), `apps/mobile/README.md` (the tabs as they are today and the
  redesign, ADR 0017 instead of 0004, the map preview gone, S3 and S4 not built, the owner's
  simulator), `docs/development/local-setup.md` (the Map tab, the browsed region, the import, the
  owner's simulator, the latest timings), `macos-setup.md` 9.5, `seed-data.md` (the sample
  catalog has no real card names, the import fixtures), `claude-handoff.md`, ADR 0017
  (consequences: M9 closed the mobile follow-ups; the redesign keeps the decision),
  `docs/api/contracts/README.md` (the S2 row; S3 and S4 have no contract), `docs/security/README.md`
  (the rules of import files next to the image upload rules), `docs/product/product-overview.md`,
  `docs/database/schema.md`.
- Checked and left as they are: the ADR index and ADRs 0004 (marked superseded, points to 0017),
  0010 (amended, its last section says M9 draws the map), 0015; every phase contract that ADR 0017
  or S2 replaced carries a banner that says so and points to the replacement, and none describes a
  removed endpoint as live (the S2 contract, which this audit did not read, still described S3:
  corrected by the fact check, round 1, below); `schema.md` lists V106 to V114; `docs/deployment`
  (no map key; one paragraph still said ten scheduler jobs, corrected by the same fact check);
  test accounts and the boundaries provenance; the three `.env.example` files (no
  map key, no distance or radius setting); the legal drafts in English and French (the web files
  and the phone's synced copy, `npm run sync:legal -w apps/mobile -- --check` up to date): what
  they say about location already matches ADR 0017 (a declared country, state or province and
  optional city; no GPS, no device location, no IP location, no coordinates), with the draft
  banners and the "[to confirm]" placeholders kept, so nothing was changed for the lawyer to
  re-read.
- The words a lead's search found ("near me / nearby", "km away / distance", "trading area",
  "Google Maps", "wishlist_match / matches nearby", "approximate area / location / position"),
  file by file. Changed: the comment of `InventoryItemRepository` (the sent wishlist alerts, not
  the matches, reference items), a comment of `CardImageUrlContractIT` and of
  `accountStatus.test.ts` (a declared location, not a trading area), and the documents above.
  Stay, and why: the applied migrations (V004, V005, V011, V022, V041, V050, V060, V108 to V112;
  frozen); the tests and fixtures that assert the words are absent or that the old paths are gone
  (`GeoPrivacyContractTest`, `FlywayMigrationIT`, `OpenApiExportTest`, `LocationIT`, `ExportIT`,
  `PublicBinderIT`, `SettingsIT`, `AnalyticsIT`, `SimplifiedWishlistMigrationIT`, the phone's
  `regionWording`, `placePrivacy`, `coordinateLiterals`, `legalLanguage` tests, the E2E privacy
  fixtures and `check-location.js`); the analytics list of refused keys (`AnalyticsEvent`); the
  reserved handle "nearby" (`ReservedHandles`: old links never land on a collector); the phone's
  mapping of the old `/settings/trading-area` link to Settings → Location (`notificationKinds.ts`);
  every "never a distance" assurance in code, OpenAPI descriptions and legal texts; the history
  sections marked as such (ADR 0004, ADR 0010, the Phase 1, 3, 4 and 6 contracts, `schema.md`
  V005 and Phase 4, the API README's "Deviations from the Phase 4 contract"); "distance" meaning
  something else (the Hamming distance of `apps/ml`, scroll and relative-time distances). The web
  hits (2 "near", 24 "distance", 4 "trading area", 1 "Google Maps", 1 "wishlist_match") are all of
  these kinds too (the legal guard spec, the `/settings/trading-area` redirect, "no Google Maps"
  in its README, the privacy assurances, the relative-time pipe and the message list's scroll): recorded, not changed (web paused).

**Checks** (2026-10-14, the owner's Mac mini, JDK 21, OrbStack; retries off; on the final tree
unless said)

- The walkthrough's own run on `734d4e6` (before this stage's documents and the W5 fix): every
  suite listed below green, with the web ones (`npm run build -w apps/web-angular` initial total
  899.93 kB; `npm run test:web` 142 files / 678 tests; web lint and format check; `npm run test:e2e
  -- --retries=0` 74 passed) and the whole native suite (**30 of 30 flows**, 48 min 7 s, on the
  owner's iPhone 18 Pro simulator).
- After this stage's changes (the W5 fix in `apps/mobile`, comments in `apps/api`, documents):
  `npm run test:mobile` (typecheck, lint, jest 89 suites / **922 tests**, no "worker process"
  warning, 28 harness guard tests); `npm run format:check -w apps/mobile` clean; the two test files
  of the import labels fail on the old labels (6 tests) and pass on the new ones;
  `npm run test:mobile:e2e -- --retries=0`: **60 passed**; the three native import flows
  (`inventory-import-assumed.yaml`, `inventory-import-deck.yaml`, `inventory-import-csv.yaml`) on
  the owner's iPhone 18 Pro simulator under the lock: **3 of 3** in 6 min 2 s (the other 27 flows
  read nothing this stage changed, and passed in the walkthrough's full run on `734d4e6`).
- `(cd apps/api && ./gradlew spotlessCheck --rerun-tasks)` clean; `npm run test:api`: **974 tests
  in 170 classes and 12 catalog tests**, no failure, none skipped, 3 min 14 s;
  `./gradlew exportOpenApi` then `npm run generate:api`: nothing changed in git.
- `npx expo export` into throw-away directories: iOS 5,562,204 B (1,789 modules), Android
  5,854,833 B (1,913 modules), web entry 2,917,118 B (75 static pages).
- `npm run test:scripts`: 133 tests in 25 suites. `npm run audit:gate`: OK (the 2 allowlisted
  advisories, `braces` and `node-forge`, until 2026-11-30).
- The web app and the lockfile are not changed by this stage (`git diff 734d4e6 -- apps/web-angular
  package-lock.json` is empty), so the web suites were not re-run after the walkthrough's run.
- The documents: a script in the session's scratch folder read every Markdown file this stage
  changed or added (15, this one included): 86 relative links, none broken (files and heading
  anchors); 575 quoted `npm run` commands, each a script of the root or of the workspace the text
  names (`npm run card-images:*` stands for the three `card-images:` scripts). The redesign spec's prompt part is
  byte for byte the owner's file (`cmp`, SHA-256 `35d5009f…`).
- Not verified: the Android run (no Android SDK on this Mac; the Android export builds); VoiceOver
  and Voice Control themselves (W5 is proven by the accessibility names, not by speech).

**Fact check, round 1** (2026-10-14). An independent fact checker read this stage's documents
against the code, the database and the suites on head `dd6761b` and found nine findings, D1 to D9
(two major), and seven nits, D10 to D16. Each finding was answered where it was said, by changing
the sentence, never by building what it claimed; of the nits, this round corrected only D12 (in the
D5 row), the other six are in round 2 below:

| Finding | Done |
| --- | --- |
| D1 (major) `docs/api/contracts/s2-wishlist.md` still described "Who wants it", "Wanted by N" and the card page's printing picker of S3 as what wishes drive and what comes next (the audit above had checked only the phase contracts) | each line says what is true: today a wish drives only a wishlist alert; S3 was skipped by the owner on 2026-10-13 and is not built; the redesign drops both lists and the phone's "Selected printing" block; the market price's source label is on the card page's selected printing and in the wish editors; the printing lists of both card pages and of the web's "Add a card" dialog lack it (completed in round 2, below). Two code comments of the same kind as well: the phone's card screen (`app/cards/[id].tsx`, "stage S3 brings the printing picker") and `CollectorDiscoveryService.markersFor`, which named S3's "Who wants it" as its caller (it has no caller today) |
| D2 (major) C21 was marked done while documents were still stale; its row counted "three more" CLAUDE.md proposals where six are listed | C21 is **partly** done: two lines of the paused web README and two database comments of V112 (D3) stay stale, recorded. 12 done, 5 partly, 5 not built in the report, the "Last updated" line, this section, NEXT TASK and the handoff; "six more" |
| D3 (minor) the database comments of `wishlist_item.public_note` and `wishlist_item.near_mint_only` (V112, frozen) name "Who wants it" | recorded, not changed: the report's section (h) and "Open after this stage" below. No V115 here: the redesign's prompt (the owner's words, verbatim) numbers its migrations from V115, and its first migration can restate the two comments the way V111 did |
| D4 (minor) `docs/deployment/README.md` said "the ten Cloud Scheduler jobs" | nine; the scheduler module's README said "10 jobs here, about US$0.70/month": now 9 and US$0.60, as ADR 0016 and the cost table say |
| D5 (minor) "API unit: wishlist region matching" was marked as existing | partly: the region rule is SQL (`WishlistAlertRepository`), covered only by `WishlistAlertsIT`; the tests of section 9 are 21 exist, 3 partly, 8 missing, 2 not applicable. The row "no matches table or endpoint left" named `FlywayMigrationIT`, which holds no such check: now `SimplifiedWishlistMigrationIT` and `OpenApiExportTest` |
| D6 (minor) known gaps of the status sections that the report dropped | in the report's (h): the search text in `search_performed` / `search_no_results` (also in the hardening lists of (j) and NEXT TASK), market prices without their source (the phone's printing list, the web's printings table), the `publicly_listed` lag, the phone web build's Back button and its "(tabs), back"; in (f): import previews are not exported |
| D7 (minor) the small-fixes section above still quoted the import names that W5 replaced; the comment of `ChoiceOption.accessibilityLabel` and `choice.test.tsx` modelled a name that does not start with the visible label | the three places point to W5's names; the comment and the test use "115 assumed: the lines whose plain copy was assumed" |
| D8 (minor) the report's (g) said "The Android build compiles" | "Only the Android JavaScript bundle was exported; nothing ran on Android" |
| D9 (minor) CLAUDE.md proposal 4 stated a rule that the collectors section of `GET /search` breaks | the proposal names that one exception |

Checks of the round (the owner's Mac mini, JDK 21, OrbStack; retries off): the six Markdown files
it touched hold 26 relative links, none broken (the checker flags only the shorthand
`npm run card-images:*`, which it cannot read, as before); no formatter covers the root Markdown documents;
`npm run format:check -w apps/mobile` and
`(cd apps/api && ./gradlew spotlessCheck compileJava --rerun-tasks)` clean;
`npm run test:mobile`: typecheck, lint, jest 89 suites / 922 tests (no "worker process" warning),
28 harness guard tests; `npm run test:api`: 974 tests in 170 classes and 12 catalog tests, no
failure, none skipped, 3 min 9 s. Not re-run: the mobile web E2E and the native suite (the code
changes are three comments and one jest fixture: nothing the browser or the simulator runs changed)
and the web suites (nothing under `apps/web-angular` changed).

**Fact check, round 2** (2026-10-14). An independent check of round 1 (head `c62bfca`) approved
its corrections and found two minor points. Each was corrected where it was said:

| Finding | Done |
| --- | --- |
| R1-1 (minor) round 1 narrowed where the market price names its source: the S2 contract said "where the card page shows the price of the selected printing" and the D1 row above "on the selected printing only", but the wish editors name it too (the web wish dialog's printing picker gives each row's price a tooltip and an accessible name with the source; the price-terms hint of the web and of the phone names it) | the contract's "Price terms and the market price" and the D1 row: the card page's selected printing and the wish editors. Found while checking it: the printing list of the web inventory's "Add a card" dialog shows "Market …" without the source too: added to the contract's gap sentence and to the report's web list in (h) (recorded, the web is paused) |
| R1-2 (minor) the report's C21 row said "the rest of what it found is fixed" and this section "nine points", while the fact checker's notes also list seven nits, D10 to D16, some still untrue | C21 now reads: nine findings and seven nits; the stale lines it found are recorded, everything else was corrected in two rounds; round 1 above counts both. The nits, which its notes name in a few words each, were re-derived from those words and the code and corrected: **D10** the PR lists (the handoff's "since 2026-10-04" list began on 2026-10-05 and lacked #58: now "from 2026-10-05 on" with #58; the report's "two other pieces" are four, with #58 and #59; NEXT TASK names #58; the "Last updated" line's "merged since the line below" adds #60, #59 and #61); **D11** the import fixtures are two cards and an alternate artwork of the second, not three cards (`seed-data.md`, and `apps/api/README.md` with "the phone's end-to-end suites"); **D13** the legal check above is `npm run sync:legal -w apps/mobile -- --check` (a script of the mobile workspace only; run in this round: both files up to date); **D14** the report's last full run names its head, `734d4e6`, and what ran again after it; **D15** C8: recent searches per account since M2 (2026-10-05), per segment since M7 (2026-10-06); **D16** NEXT TASK's notes on S3 say what the redesign overrides on the phone ("Who wants it", "Wanted by N" and holder counts dropped; recent searches on the phone, no server history; S4 still skipped). D12 was corrected in round 1 (the D5 row) |

Checks of the round (the owner's Mac mini; documents only, no code changed): the six Markdown
files it touched (this file, the S2 contract, the delivery report, `apps/api/README.md`, the
handoff, `seed-data.md`) hold 19 relative links, none broken, and the 18 Markdown files this
branch changes hold 100, none broken (files and heading anchors); `git diff --check` clean; no
formatter covers these files (Spotless formats the API's Java, Prettier only the `apps/mobile` and
`apps/web-angular` workspaces); `npm run sync:legal -w apps/mobile -- --check` up to date. No suite
was re-run: nothing a suite reads changed (no test reads these documents), so the results of round
1 and of the checks above stand.

**Open after this stage** (the delivery report, sections (f) to (j), has the whole list): the
ship step of S6 (merge `main`, which holds #70; expect conflicts in this file, where #70's section
and S6's sections both follow S5, and in "NEXT TASK" and the handoff's section 6: keep this
branch's text and #70's own section); the owner decisions of S5 and of the earlier stages; the
Android run; the hardening follow-ups (the search text in the search analytics events among
them); two database comments of V112 that still name "Who wants it" (a new migration can restate
them; this stage adds none, the redesign numbers its migrations from V115); two stale lines of
the paused web README; the proposed CLAUDE.md sentences (the end of the delivery report).

## Phone redesign R1: offers out, shipping wording, look (2026-10-14)

Stage R1 of the phone redesign approved by the owner on 2026-10-14
([`docs/product/specs/2026-10-14-phone-redesign.md`](docs/product/specs/2026-10-14-phone-redesign.md),
section 15): everything of its section 11 ("Offers leave the phone, and the wording becomes
shipping-first"), with [ADR 0018](docs/architecture/adr/0018-deals-happen-in-the-chat.md) "Deals
happen in the chat", plus the look of its section 3 as a foundation (the deckCore tokens, the dark
theme of a new install, the three typefaces). Branch `feature/r1-offers-out-shipping-look`, cut
from the head of stage S6. The tab bar keeps today's six tabs until R5; no screen of R2 to R8 is
reshaped. Migrations V115 and V116; every API change is additive and the offers, trades, payments
and disputes modules are untouched.

**What a collector notices**

- There is no "Make an offer" any more: not on the holders of a card, not on a public binder, not
  on a profile. The Profile tab has no Offers or Trades rows, Settings has no Offers or Payouts
  page, the composer's attach sheet has no "Share an offer", and the notification settings no
  longer list offers and trades. Premium, credits and donations stay where they were, behind their
  flags (off at launch).
- A chat opens with a small tip with a shield: "Agree on the price and shipping here. Check ratings
  before you send an e-Transfer." (chats have no pinned card before stage R4, so every chat reads
  this one; the buying and selling wordings exist and are tested). Tapping it opens "Trading
  safely". The old "Trade safely" notice and its "Meet in a busy public place" advice are gone, and
  so is "Meetup details always stay private between the two of you".
- An old offer in a conversation reads as one grey line, "Offer (no longer available)" (a text sent
  with an offer link stays); an old offer, trade, payment or dispute notification opens nothing and
  says "Offers and trades are no longer in the app. Deals happen in the chat, in Messages."; an old
  link to an offer, a trade, a dispute, the payment checkout or the offer and payout settings lands
  on Messages or Settings with that note, never on a blank or not-found screen.
- The rating form asks Overall, Communication, Card condition and Shipping, never "Meetup
  reliability", and says one can rate "after a deal with them or a conversation".
- "Trading safely" (English and French) explains deals by mail: payment outside the app (for
  example Interac e-Transfer), OrenjiTrade never handles the money, check ratings and references
  and ask for photos of the real card before paying, sellers ship once paid with tracking and add
  the number when they mark the card sold, share an address only in the chat with the person you
  deal with, the warning signs, and how to report and block. Still a draft (0.2-draft), no legal
  compliance claimed.
- A new install opens in the dark theme (System / Light / Dark stay in Settings → Appearance and
  a stored choice wins); text is drawn in Inter, headings and screen titles in Sora, codes in
  JetBrains Mono.
- The region chat channels describe "trades and sales by mail"; the "Local Meetups" tag is no
  longer offered or shown; reporting "Inappropriate behaviour" no longer mentions meetups; the
  seed data (local and dev) holds shipping and e-Transfer lines.

**What changed** (commits on the branch, in order)

| Part | What |
| --- | --- |
| Refactor | `StatusChip` to `components/ui`; the fake provider checkout (`FakeProviderCheckout`, `useProviderCheckout`, `checkoutTargets`) to `features/billing`, so Premium and donations keep it |
| Offers, trades, payments, disputes off the phone | deleted with their tests: `app/offers/*`, `app/trades/*`, `app/disputes/*`, `app/checkout/fake/[ref]`, `app/settings/{offers,payouts}`, `features/{offers,trades,payments,disputes,checkout}`, `api/hooks/{offers,trades,payments}`, the composer's offer picker and attachment, "Make an offer" on holder rows, public binders and profiles, the Profile tab's rows, the settings links, the navigator's screens, the gate's roots, the query keys and the realtime invalidations; e2e `offers.spec.ts`, `payments.spec.ts`; Maestro `offer-trade-rating.yaml`, `payment-protection.yaml` with `scripts/offers.js`, `scripts/payments.js` (their Premium and report actions moved, unchanged, to `scripts/billing.js` and `scripts/reports.js`) |
| Old offers | `OfferUnavailableLine` for OFFER_LINK and SYSTEM messages carrying an offer; notification targets `{ kind: 'note' }` for offers, trades, disputes, offer settings and payouts; `removedRouteTarget` and the not-found screen; the OFFER and TRADE notification categories hidden (their stored values sent back); e2e `old-offers.spec.ts` (an offer made and declined through the API: two grey lines, the notification's note, an old link to Messages, no call to the offer routes) |
| Chat tip | `features/safety/chatSafetyTips.ts` (the three wordings, `dealSideOf`) and `ChatSafetyTip`, at the start of the thread and in an empty chat; `TradingSafetyNotice` and its dismissal store deleted |
| Ratings | `RATING_CRITERIA` without meetup reliability; an edit sends an old meetup score back; the eligibility wording; new e2e `ratings.spec.ts` and Maestro `conversation-rating.yaml` (the rating coverage that left with offers) |
| API texts | V115 hides `local-meetups`; V116 rewrites the region channel descriptions of V041 and V110 where untouched; `ReportReason`; the `TagResponse` example; the own profile lists active tags only (an edit form no longer sends the hidden tag back, which would be a 400) |
| Seeds | the conversation, binder descriptions, community posts and replies, the offer message, the ratings (shipping scores, no meetup score), the donation message, a sponsored headline and a private note; profiles 01 and 07 tagged Shipping |
| Legal | the trading-safely section of `legal-content.ts` and `legal-content.fr.ts` (the owner's exception to the web pause) and the phone's copies (`npm run sync:legal`) |
| ADR | ADR 0018; ADR 0011 amended both ways; the ADR index; the Phase 8 contract |
| Tokens | `color.{light,dark}.deckCore` in `packages/design-tokens` (mobile only: `"$platforms": ["mobile"]` keeps it out of `tokens.css`); `font.mono.mobile` is JetBrains Mono; `npm run sync:tokens` |
| Fonts | `@expo-google-fonts/sora` 0.4.2, `inter` 0.4.2, `jetbrains-mono` 0.4.1 (pinned, `npx expo install`); `theme/fonts.ts`, `theme/useAppFonts.ts`, `components/ui/Text.tsx`; 135 files import `Text` / `TextInput` from there |
| Dark default | `DEFAULT_THEME = 'dark'` in `useAppStore` |
| Fixes after the checks | the kept text of an old offer link shows its time; the 18+ step and its refusal no longer mention offers; `sign-out.yaml` scrolls the row clear of the tab bar; the deep-link step of `old-offers.spec.ts` |
| Docs | this section, NEXT TASK, the handoff, the product overview, `CLAUDE.md` (product summary, payments row), the mobile README, `seed-data.md`, `design-system.md`, the tokens README |

**Decisions, and why**

1. **Old offer and trade notifications open nothing, with a note.** The spec allows "the chat with
   that collector, or nothing": their payloads carry the offer, trade, payment or dispute id and
   never the other collector, and the phone no longer calls the offer routes to find out, so it
   cannot open the right chat. A tap marks the notification read and says where deals happen.
2. **A removed link lands on Messages (Settings for the offer and payout settings)** through the
   not-found screen, with the same note; no stub route files.
3. **An OFFER_LINK keeps the text it was sent with.** The grey line replaces the offer card; the
   sender's words stay in their bubble. A SYSTEM message about an offer or a trade shows only the
   grey line (its sentence named the trade page).
4. **The chat tip is not dismissed and opens "Trading safely".** It sits at the start of the
   history (it scrolls away in a long chat, as in the mockup) and the page stays one tap away
   (said to screen readers as a hint) now that the notice's link is gone.
5. **The offer and trade notification categories leave the phone's settings**; their stored values
   are sent back unchanged.
6. **The holder row of a card without a price reads "Open to offers"** (was "Make an offer") while
   the item form still has "Accepts offers" (stage R2 removes it).
7. **Hidden tags leave the owner's own profile view** (`GET /me/profile`), as they already were
   for others: otherwise every collector who carried "Local Meetups" would get a 400 when saving
   tags. Selecting a hidden tag stays a 400.
8. **Seeds:** besides the four places section 11 names, the rating, donation and sponsored seeds
   lost their café, Mont-Royal and "trade nights" lines; the seeded completed trade keeps its
   `meetup` flag (structural data of the trades module, which stays as it is).
9. **deckCore light values** `#EDE9FE`, `#5B21B6`, `#7C3AED` (7.6 : 1 for the tag text; dark
   7.7 : 1). The family is kept out of the web's CSS: the web's initial bundle had 0.07 kB left.
10. **Fonts through a themed `Text`**, not a global patch: React Native has no weights for a custom
    family, so the face follows the family and weight a style asks for; nested text inherits as
    native text does. Headings (`textStyle(…, 'heading')`) and header titles are Sora; Sora is
    bundled in 600 and 700, Inter in 400, 400 italic, 500, 600 and 700, JetBrains Mono in 500. On a
    phone the first screen waits for them under the splash screen; a font that fails leaves the
    system font.
11. **The web's legal exception reached two more spec files.** `legal-page.component.spec.ts` (one
    assertion) and `apps/web-angular/e2e/launch-safety.spec.ts` (three `getByText` strings)
    pinned sentences of the old page; they now read sentences of the new one, so every web check
    stays green. No web app code changed. **The owner should confirm this.** (Since review fix 2
    the guard of the new text lives in the phone's `__tests__/screens/legal.test.tsx`, which reads
    the synced copy; the web's `legal-content.spec.ts` is as S6 left it.)
12. **Sample chat lines in the phone's own tests** ("Saturday at the café") were reworded to
    shipping; the API's integration tests keep their fictional lines (not app wording).

**The defaults of section 16 this stage touches:** 1, new installs start in dark (built; Settings
→ Appearance keeps System / Light / Dark). The others belong to stages R2 to R7.

**Checks** (retries off, the real numbers)

All on this Mac (2026-10-14), retries off, the owner's iPhone 18 Pro simulator under the lock:

| Check | Result |
| --- | --- |
| `cd apps/api && ./gradlew spotlessCheck --rerun-tasks` | passed |
| `npm run test:api` | passed: 978 tests in 171 classes + 12 catalog tests in 2 classes, 0 failures, 0 skipped (3 min 30 s) |
| `./gradlew exportOpenApi` + `npm run generate:api` | committed (the `TagResponse` example), git clean afterwards |
| `npm run build -w apps/web-angular` | passed, initial total **899.31 kB** (was 899.93 kB; `main` 338,946 bytes, the styles unchanged at 33,368 bytes: `tokens.css` holds no deckCore) |
| `npm run test:web` | passed: lint clean, 142 files / 681 tests |
| `npm run lint -w apps/web-angular`, `npm run format:check -w apps/web-angular` | clean |
| `npm run test:e2e -- --retries=0` | **74 / 74** on the first attempt (1 min 36 s), `launch-safety.spec.ts` included |
| `npm run typecheck -w apps/mobile`, `lint`, `format:check` | clean (lint: 0 warnings) |
| `npm run test:mobile` | passed: jest 89 suites / 895 tests (offer, trade and payment tests deleted; new: chat tip, old offers, removed routes, tokens, fonts, dark default, ratings) + 28 guard tests |
| `npx expo export --platform ios / android / web` | all three passed (into the scratch folder); the 8 bundled faces are the only app fonts; the web's static HTML declares them (9 `@font-face` with the icon font) |
| `npm run test:mobile:e2e -- --retries=0` | **57 / 57** (first run 56 + 1: the deep-link step of the new `old-offers.spec.ts` waited for the URL it opened, which the not-found screen moves on at once; the spec fixed, then 57 / 57 twice, the last on the final code) |
| `npm run test:mobile:maestro -- --platform ios` | **29 / 30** in 47 min 44 s on the code of `2a0e13d`; the failure, `sign-out.yaml`, tapped the tab bar once the Profile tab lost its two rows (a plain `scrollUntilVisible`): the flow now uses the scroll subflow and passed alone; `age-step-existing-account`, `sign-up-onboarding`, `messages-inbox-thread` and `safety-notice` re-run on the final code after the last two app fixes: 4 / 4. New flow `conversation-rating.yaml` passed |
| `npm run test:scripts` | 133 / 133 |
| `npm run audit:gate` | passed (the two allowlisted advisories, expiring 2026-11-30) |

**The walk on the simulator** (screenshots kept outside the repository): a new install signed in as
collector1 opens in dark (the device in light); the seed chat with collector2 reads the shipping
lines, starts with the tip and holds "Offer (no longer available)" for an offer made through the
API; the offer's notification opens nothing and shows the note; the rating form has no meetup
criterion; the Profile tab and Settings have no Offers, Trades or Payouts rows; "Trading safely" in
English and French; Settings → Appearance shows Dark selected on a new install, Light switches
every screen seen (chat, inventory); at the largest text size the tip and the chat stay readable.
The type matches the mockup (Sora titles and names, Inter text, JetBrains Mono codes; colours of
the existing dark palette). Found during the walk and fixed: the 18+ onboarding step and its
refusal still said "or make offers". Seen and left (not R1): at the largest text size a long word
of a list row ("discoverability") breaks inside the word, as before.

**Could not be verified:** the Android run (no Android SDK on this Mac; the flows keep their
Android steps); VoiceOver on a real iPhone; a real collector's old offer notification (nothing was
ever deployed: the e2e spec makes one through the API).

**Meetup wording left for the lawyer** (not changed; the French texts carry the same clauses at
the same places):

- Terms, "What OrenjiTrade is and is not", clauses 2 ("not a party to any trade, sale or meeting")
  and 3 ("where and how they meet … before you meet or pay"); "Disclaimers and limitation of
  liability", clause 2 ("including trades, sales and in-person meetings").
- Community Guidelines, "Meet and trade safely" (heading) and clause 1 ("Meet in busy public places
  in daylight for in-person trades … Never feel pressured to share your home address"), which also
  contradicts sharing an address in the chat for a shipment.
- Payment Protection Policy, "What is covered", clause 2 ("Not covered: in-person trades …").
- The Terms and the Payment Protection Policy still describe offers and payment protection, which
  the phone no longer has (ADR 0018); the web keeps them while it is paused.
- Offer and protection wording in the other texts the phone's legal index shows (found by the R1
  review, not changed): Terms, "What OrenjiTrade is and is not", clause 1 ("accepts offers for a
  card"); Privacy Policy, "Communications: … offers"; Community Guidelines, "Meet and trade
  safely", clause 2 ("Use the in-app offer and messaging tools"); Marketplace Policy, the "Offer"
  definition, "Offers and commitments" and, under "Fees and plans", the fees "where protected
  payments are enabled"; Refund and Dispute Policy, the "Dispute" definition and "Opening a
  dispute" ("opened from the trade screen"); Acceptable Use Policy ("Automated messaging or
  offers to other Collectors is not"). The phone's legal index still lists the Payment Protection
  Policy ("How protected transactions work when payments are enabled") and the Refund and Dispute
  Policy, which sits uneasily with ADR 0018 point 4 (no claim of protection on the phone): **an
  owner question** (hide them on the phone, mark them as web-only, or leave them for the lawyer).

**Known gaps, by design or for a later stage**

- (Fixed in review fix 1: the inbox line of a conversation whose last message is an old offer or
  trade update now reads "Offer (no longer available)"; stage R4 narrows the SYSTEM case when the
  sale messages of Mark as sold arrive.)
- The item form's "Accepts offers" switch and the "Offers" tag on rows stay until stage R2.
- The paused web keeps offers, trades, payment protection, disputes and its meetup notice.

**Review fix 1** (2026-10-14; two independent reviewers, a functional verifier (F1 to F9) and a
second lens on the product (U1 to U8); every fix with a test that fails on the old code):

- **U1 / F2, the bio placeholder asked "Where do you like to meet?"** (onboarding step 1 and
  Settings → Edit profile): it reads "What do you collect? Do you trade, sell or ship?". A source
  guard (`__tests__/privacy/shippingWording.test.ts`) now fails on "meet", "meetup", "in person",
  "game store", "café" or "the locals" anywhere in `app/` and `src/` (comments, identifiers such as
  `meetupReliability` and Firebase's "does not meet the requirements" excepted), and the
  onboarding test pins the placeholder. The paused web's `profile-fields.component.ts` carries the
  same placeholder (recorded, not changed).
- **F1, a seeded meetup line was left** in `OfferSeedContributor` ("I can meet at Berri-UQAM
  after work.", the open offer from collector5 and its history), although the Seeds row above
  listed the offer message as done (only its "game store" line was): it now pays "by
  e-Transfer, shipped with tracking". **F4 (c):** `SeedWordingTest` reads the seed's JSON files
  and the text of every seed contributor (SQL column names and parameter names are not text), and
  `SeedIT.seedsShippingWordingOnly` reads the rows seeded for the seed accounts (bios, binders,
  card notes, messages and inbox previews, posts and replies, offers and their history, ratings,
  donations).
- **F4 (a), the hidden notification categories had no working test** (the screen test looked for
  a label the phone no longer has): the settings test now lists OFFER and TRADE from the API and
  finds no row or text about offers or trades, and a `categoriesOf` unit test feeds both.
  **F4 (b):** `ReportFlowIT` pins "Behaviour that breaks the Community Guidelines." and no meetup
  word in any report reason.
- **U4 / F5, the inbox line of an old offer or trade:** an OFFER_LINK or SYSTEM last message
  (only the offers and trades modules post SYSTEM messages today) reads "Offer (no longer
  available)" in the row and its accessible name, and a realtime update words it the same.
- **U7 / F9, the dark default stopped at the app:** the themed `TextInput` opens the keyboard in
  the app's scheme (a field may choose its own); on iOS the theme provider tells the system the
  chosen scheme (`Appearance.setColorScheme`, "unspecified" for System), so alerts, the photo and
  document pickers and the share sheet follow; the splash is dark on every phone. Android is left
  to the system (its keyboard ignores the app, and its night mode recreates the activity) and
  could not be verified; the splash only shows in a device build, not in Expo Go.
- **U8, a switch that is off was nearly invisible in dark:** its thumb is white in both schemes
  as in the mockup (10 : 1 against the off track in dark). The light switch is unchanged (a white
  thumb on #D6D3D1, the iOS look).
- **F7, nothing kept the fonts on a new screen:** lint (`no-restricted-imports`) refuses React
  Native's `Text` and `TextInput` in `app/` and `src/` outside `components/ui/Text.tsx`.
- **U5, two French sentences of "Trading safely":** "La conversation en garde une trace." and
  "Ne communiquez votre adresse que dans la conversation privée avec l’autre collectionneur,
  jamais dans une publication, un cartable ou votre profil." (the trading-safely section only,
  synced to the phone; the phone's test reads both).
- **U2 / F3, the documents:** the mobile README (conventions, notifications, deep links, "Not yet
  wired") and `local-setup.md` no longer describe offers, trades, payment protection, disputes or
  payouts on the phone; removed links are listed with where they land.
- **F6, a database seeded before R1** keeps its earlier seed texts (the seed inserts those rows
  once and never rewrites them): `seed-data.md` says so and how to get the new ones (a reset).
  Rewriting old seed rows in place would have touched eight seed contributors in eight modules
  for local data; not done. **The owner's database `orenjitrade` is in this case.**
- **U3 / F8, the two web spec files outside the legal exception:** no change; both reviewers
  recommend accepting it. **The owner should confirm** (decision 11).
- **U6:** the offer and protection wording of the other legal texts is added to the lawyer's list
  above, with the owner question about the phone's legal index; no text changed.

**Checks of review fix 1** (2026-10-14, this Mac, retries off, the owner's iPhone 18 Pro
simulator under the lock; on the code of `f086eba` unless said):

| Check | Result |
| --- | --- |
| `cd apps/api && ./gradlew spotlessCheck --rerun-tasks` | passed |
| `npm run test:api` | passed: 982 tests in 172 classes (+ `SeedWordingTest`, `SeedIT.seedsShippingWordingOnly`) + 12 catalog tests in 2 classes, 0 failures, 0 skipped (3 min 34 s) |
| `./gradlew exportOpenApi` + `npm run generate:api` | no change (no API surface changed), git clean afterwards |
| `npm run build -w apps/web-angular` | passed, initial total **899.31 kB** (unchanged: only the lazy French legal text changed) |
| `npm run test:web`, web `lint`, `format:check` | passed: 142 files / 681 tests; lint and format clean |
| `npm run test:e2e -- --retries=0` | **74 / 74** (1 min 39 s) |
| `npm run typecheck -w apps/mobile`, `lint`, `format:check` | clean (lint now also refuses React Native's `Text` / `TextInput` in `app/` and `src/`) |
| `npm run test:mobile` | passed: jest 91 suites / 905 tests + 28 guard tests |
| `npx expo export --platform ios / android / web` | all three passed (into the scratch folder) |
| `npm run test:mobile:e2e -- --retries=0` | **57 / 57** (`old-offers.spec.ts` now also reads the inbox line) |
| `npm run test:mobile:maestro -- --platform ios` | **30 / 30** in 47 min 19 s (on the code of `90c3e88`; the only later change is the inbox assertion `f086eba` added to the phone's Playwright spec) |
| `npm run test:scripts` | 133 / 133 |
| `npm run audit:gate` | passed (the two allowlisted advisories, expiring 2026-11-30) |
| Mutations (one at a time, the old code back) | the old placeholder fails the source guard and the onboarding test; an empty `HIDDEN_CATEGORIES` fails 2 tests; the old offer seed line fails `SeedWordingTest` and `SeedIT`; the old report reason fails `ReportFlowIT`; React Native's `Text` in `app/messages/[id].tsx` is a lint error; no `keyboardAppearance` or no `Appearance` sync fails the theme test |

**Walk** (the owner's simulator in light, a new install in dark): Edit profile opens a dark
keyboard and the bio reads "What do you collect? Do you trade, sell or ship?"; the off switches of
Settings → Privacy and Notifications show a white thumb on the dark track. The simulator was left
as found (light, text size large), Expo Go stopped, nothing in its Files storage. **Could not be
verified:** the Android run (no Android SDK on this Mac); the dark splash (Expo Go shows its own;
only a device build shows the app's); native alerts and pickers in the app's theme beyond the
keyboard (none opened in the walk).

**Review fix 2** (2026-10-14; the second round, one finding, R1-1, minor): the web's legal
exception reached two spec files outside the files the owner named, and `legal-content.spec.ts`
gained a new `describe` block rather than only updated expectations.

- **The new block is gone from the web.** It was not needed by any web check: its three tests
  (deals by mail, the same in French, still a draft; no meetup advice, no claim of compliance)
  now live, unchanged, in the phone's `__tests__/screens/legal.test.tsx`, which reads the phone's
  copy of the same text, kept identical to the web files by the test beside it (`npm run
  sync:legal`). The web's `legal-content.spec.ts` is again exactly as S6 left it. A meetup
  sentence put into the phone's copy in both languages fails two of the three tests.
- **The two other spec files stay changed, for the owner to confirm** (decision 11): they pinned
  sentences the R1 text removes ("safe exchange zones", "zones d’échange sécuritaires", "Bring
  someone along when the cards are valuable"); keeping them would keep meetup advice or fail the
  web checks the same order requires. Since S6 the web differs only in the trading-safely section
  of `legal-content.ts` and `legal-content.fr.ts`, one assertion of `legal-page.component.spec.ts`
  and three strings of `e2e/launch-safety.spec.ts`. No test can hold an order about a diff; the
  evidence is `git diff --stat ad97d0d -- apps/web-angular`.

**Checks of review fix 2** (2026-10-14, this Mac, retries off; on the code of `05f2c50`, later
commits are documents):

| Check | Result |
| --- | --- |
| `cd apps/api && ./gradlew spotlessCheck --rerun-tasks` | passed |
| `npm run test:api` | passed: 982 tests in 172 classes + 12 catalog tests in 2 classes, 0 failures, 0 skipped (4 min 13 s) |
| `./gradlew exportOpenApi` + `npm run generate:api` | no change, git clean afterwards |
| `npm run build -w apps/web-angular` | passed, initial total **899.31 kB** (unchanged) |
| `npm run test:web`, web `lint`, `format:check` | passed: 142 files / 678 tests (the three moved tests left); lint and format clean |
| `npm run test:e2e -- --retries=0` | **74 / 74** (1 min 30 s) |
| `npm run typecheck -w apps/mobile`, `lint`, `format:check` | clean (lint: 0 warnings) |
| `npm run test:mobile` | passed: jest 91 suites / 908 tests (the three moved tests added) + 28 guard tests |
| `npx expo export --platform ios / android / web` | all three passed (into the scratch folder) |
| `npm run test:mobile:e2e -- --retries=0` | **57 / 57** (53 s) |
| `npm run test:mobile:maestro -- --platform ios` | **30 / 30** in 46 min 55 s on the owner's iPhone 18 Pro simulator, under the lock; the simulator left as found (light, text size large), nothing in its Files storage |
| `npm run test:scripts` | 133 / 133 |
| `npm run audit:gate` | passed (the two allowlisted advisories, expiring 2026-11-30) |

**What R4 completes:** the chats' pinned card (subject), which feeds `dealSideOf` and so the buying
and selling tips; quick replies; the "+" sheet with Settings → Shipping details; Mark as sold
(the `deals` module, the `SALE` interaction, the buyer's notification, the 10-minute undo); the
inbox thumbnails and previews.

## Free for all: Premium, ads, credits and donations removed (stage F1, 2026-10-14)

The owner, on 2026-10-14 (after the redesign spec of the same day): *"can you remove the
implementation of premium subscription and ads? Just save pay service feature in a new branch for
later. I am trying to make this app free for all first."* Asked to be precise, the owner chose to
remove all four paid features (Premium subscriptions, sponsored placements, credits, donations)
from the API, the phone and the paused web app, to keep the usage limits Premium used to raise as
the same caps for everyone, and to keep protected payments. Branch `feature/f1-free-for-all`
(worktree `OrenjiTrade-s2-ux`), cut from `main` at `bf1135a`; not pushed. Decision record:
[ADR 0019](docs/architecture/adr/0019-free-for-all-no-paid-features.md) (amends ADR 0011, 0014,
0016 and 0017).

**Saved for later:** the whole implementation is on the pushed branch `archive/paid-features`
(`main` at `bf87f0b`; stage S6, merged after it, touched none of these files). Bringing a feature
back = its module, screens and tests from that branch **plus a new migration** recreating its
tables, rows and flags (V011 and V090–V093 are the original definitions; `usage_limit` would get
its `plan_id` back). V120–V123 are never edited.

### What changed

- [x] **API** — the `billing`, `credits`, `donations` and `ads` modules, their routes (404 now),
  the `subscriptions-period` and `credits-reconcile` jobs, their seeds, settings, account-export
  sections, error codes (`ALREADY_SUBSCRIBED`, `INSUFFICIENT_CREDITS`, `REFERRAL_NOT_ALLOWED`),
  problem extensions (`planCode`, `upgradeUrl`, `subscriptionId`, `balance`, `cost`), the
  `PREMIUM_USER` role, `PlanCode`, the common `SignedWebhooks` helper and the four flags are gone.
  The usage limits moved into a new `limits` module (`Limits`, `UsageLimitService`,
  `LimitDecision` = schema `LimitStatus`, `LimitReachedException`, `LimitUsageSource`,
  `UsageCounterRepository`): one rule per key for everyone, `GET /api/v1/me/limits` (replaces
  `GET /me/plan`), `GET`/`PUT /api/v1/admin/usage-limits` (one row per key, SUPER_ADMIN writes,
  audited `usage_limit.update`, cache `orenji:cache:usage-limits:v1` 60 s), `429 LIMIT_REACHED`
  with `limitKey`, `limit`, `used`, `resetsAt` (and `requested` for inventory). The daily limit
  notice reads "You reached today's limit of N wishlist alerts. New listings still show on the
  card pages. The limit resets tomorrow." Protected payments keep their own webhook signature
  helper. OpenAPI: 264 → 215 paths, 303 → 248 operations, 395 → 316 schemas; clients regenerated
  (94 stale generated files of `packages/api-client` deleted).
- [x] **Migrations** — V120 (ads: 9 tables, the flag), V121 (donations: 2 tables, settings, flag,
  outbox rows of `DonationWebhookReceived` completed), V122 (credits: the view, the ledger and its
  append-only trigger function, products, referrals, settings, flag, the entitlements bought with
  credits, the `credits-reconcile` run history), V123 (Premium: subscriptions and their events and
  webhooks, entitlements, plan features, `user_account.plan_code`, plans; `usage_limit` keeps the
  FREE row of each key with any admin edit, `plan_id` dropped, `UNIQUE (limit_key)`;
  `saved_searches.max`, a Premium perk of a feature never built, deleted with its counters; the
  `PREMIUM_USER` rows and CHECK value; the flag; the `subscriptions-period` run history). Each
  drops dependants first, without `CASCADE`. **Old data:** the daily limit notices are rewritten
  (no plan, no upgrade link, no "upgrade to Premium" sentence, no link to `/premium`); admin
  broadcasts that linked to `/premium`, `/credits`, `/support` or their fake checkouts promoted
  those features and are deleted; any other notification linking there keeps its text and loses
  the link; incomplete outbox rows of the removed events are completed; audit rows
  of the old actions stay as history (the admin audit page renders them as text). R1 owns V115–V119.
- [x] **Phone** (`apps/mobile`) — `premium`, `credits`, `support` and the two fake checkouts of
  Premium and donations, `src/features/billing`, `src/features/ads` (every `SponsoredSlot`: search,
  holders, inventory, collector profiles), `SeePremiumButton`, the billing hooks and the Profile
  tab's money rows are gone; `GET /me/limits` (`useMyLimits`) feeds the limit messages; every
  limit message says which limit, how much is used and when it resets, never a plan
  (`LimitReachedNotice`, `src/lib/limits.ts`, the binder form, the public binder, the import, the
  wishlist, the offer editor); Settings → Account shows no plan (staff roles only to staff); an old
  link or notification to `/premium`, `/credits` or `/support` shows "OrenjiTrade is free for every
  collector now: there is no Premium, credits or donations." instead of a screen.
- [x] **Web** (`apps/web-angular`, paused: touched only to remove these and stay green) —
  `features/premium`, `credits`, `support`, the Premium and donation fake checkouts,
  `shared/ads`, `shared/billing`, `shared/plans`, the admin pages of plans, subscriptions, credits,
  ads, donations and entitlements are gone (the routes answer "Page not found"); the limit dialog
  says "Every collector has the same limits." with no link; `/admin/usage-limits` is one list.
  Initial bundle 899.93 kB → **896.71 kB**.
- [x] **Infra** — the `credits-reconcile` and `subscriptions-period` Cloud Scheduler jobs (7 jobs
  remain, about US$0.40/month instead of 0.60), the `ads-token-secret` (generated) and
  `stripe-billing-webhook-secret` secrets, `BILLING_PROVIDER`, `STRIPE_PRICE_PREMIUM`,
  `DONATION_PROVIDER`, `ADS_*` env and the `billing_provider` / `stripe_price_premium` variables
  are gone from the three Terraform roots; Stripe Connect's secrets stay (protected payments). The
  `billing-budget` module (the GCP cost budget) is unrelated and stays. `.env.example`, docker
  compose, the E2E workflow and the E2E guards lost the removed settings.
- [x] **Legal drafts** (English and French, web source and the phone's synced copy) — see "For the
  lawyer" below. Draft banners and every `[to confirm]` stay; nothing claims compliance.
- [x] **Docs** — ADR 0019 (new) and amendments to ADR 0011, 0014, 0016, 0017; CLAUDE.md (a
  separate commit, `e4ee954`, the owner's to keep or drop); the product overview; the development
  guides (test accounts, seed data, local setup, macOS setup, the handoff); the API README and
  contracts (the Phase 10 contract carries a removal banner); `docs/database/schema.md` (V120–V123
  and the old data); the deployment guide, environments, runbooks (the launch configuration of a
  free app), security notes; the web and phone READMEs.

### Decisions (the builder's, with reasons)

1. **One `limits` module** instead of keeping `billing` for the limits: the name said "billing"
   while nothing is billed; the module boundary keeps Spring Modulith's checks meaningful.
2. **Entitlements removed with Premium**: per-account overrides contradict "the same caps for
   everyone"; an admin who needs a different cap for one collector has no tool now (ADR 0019).
3. **`usage_limit` keeps the FREE row of each key, with any admin edit**, and a key that only
   another plan defined stays unlimited (defensive; none exists in the migrations).
4. **`premium_user` stays as an ordinary seed collector** (handle, uid, e-mail and sign-in kept)
   so the documents, scripts and tests that name it keep working; its PREMIUM_USER role and
   subscription are gone.
5. **One migration per feature, each in the commit that removes the feature's code**, so a revert
   of one feature's removal (or a bisect) stays coherent.
6. **Old limit notices are rewritten, promotional broadcasts deleted** (changed in review fix 1):
   a limit notice is the collector's own history, so only its plan, upgrade sentence and link go;
   an admin broadcast that linked to `/premium`, `/credits`, `/support` or their checkouts was a
   promotion ("Go Premium", "earn credits", "keep OrenjiTrade running with a donation") and is
   deleted, as the owner asked for no upgrade offer anywhere. A broadcast that talked about them
   without a link cannot be told apart and stays as written (none is seeded).
7. **`saved_searches.max` is deleted** (changed in review fix 1; first kept for the owner): it
   limited a feature that was never built (0 for FREE, 50 for PREMIUM), so it only existed as a
   Premium perk and showed "Saved searches 0" to the admin and `allowed: false` to every
   collector. V109 set the precedent (`map.radius.max_km` went with the map radius). A
   saved-searches feature would bring its own limit in its own migration.
8. **The phone and the web also ignore old payloads** (an `upgradeUrl`, a deep link to a removed
   page) so an older API or an old cached notification never leads to a missing screen.
9. **The web E2E flag test** moved from the removed `credits` flag to `publicChat`, in the serial
   `launch-config` project (`e2e/admin-flags.spec.ts`), so no parallel spec sees the flag change.

### For the lawyer (legal drafts, version 0.2-draft, last updated 2026-10-14, EN and FR)

1. **Privacy Policy**, transfers outside Quebec: Stripe is named "only when protected payments are
   enabled" with "payment and payout data" (was "payment or premium features" with "payment, payout
   and subscription data"); FR: « seulement lorsque les paiements protégés sont activés, Stripe
   (données de paiement et de versement; États-Unis [à confirmer]) ».
2. **Community Guidelines**: the sentence "Sponsored content is labelled by OrenjiTrade and is
   never posted by ordinary accounts." is deleted (no sponsored content exists); FR likewise.
3. **Marketplace Policy**: the section "Fees and plans" becomes "Fees" ("Frais") and now says:
   "Listing and browsing are free. The same usage limits apply to every Collector (for example the
   number of Binders, or of public Binders opened per day); they are shown where they apply and
   may change with notice." (was: free "within the limits of your plan", with "premium
   entitlements" shown in Settings).
4. **Acceptable Use Policy**: "plan limits" becomes "usage limits" ("limites d'utilisation").
5. Unchanged and to review with the rest: the Terms, the Payment Protection Policy and the Refund
   and Dispute Policy (protected payments stay), every `[to confirm]` placeholder.

### Phone redesign spec: the owner's later decision wins

`docs/product/specs/2026-10-14-phone-redesign.md` is the owner's verbatim text and is not edited.
Where it says Premium, credits, donations or ads "keep their flags" or "move into Settings", this
later decision of the same day (free for all) wins: those features are gone and R2 to R8 build no
screen, row or setting for them. (Recorded in the handoff too.)

### Merging with stage R1 (built at the same time on `feature/r1-offers-out-shipping-look`)

R1 should ship first (its migrations V115–V119 come before V120). When F1 then merges `main`:

- **Modify/delete conflicts** on the phone's billing and ads files (`app/premium.tsx`,
  `credits.tsx`, `support.tsx`, `app/checkout/fake-billing/[ref].tsx`,
  `app/checkout/fake-donation/[ref].tsx`, `src/features/billing/*`, `src/features/ads/*`,
  `__tests__/screens/billing.test.tsx`, `.maestro/premium.yaml`) and on the API seed contributors
  of ads and donations: resolve as **deleted**.
- Files **R1 added or moved** for the paid features must be deleted too: `.maestro/scripts/billing.js`,
  `__tests__/features/billing.test.ts`, `src/features/billing/checkoutTargets.ts`,
  `src/features/billing/FakeProviderCheckout.tsx` and `src/features/billing/useProviderCheckout.ts`
  (R1 moved the last two from `src/features/checkout`; with offers, trades and payments off the
  phone (ADR 0018) and the paid features gone, the phone has no checkout at all). F1's edits to
  `src/features/checkout/*`, `src/features/payments/checkoutTargets.ts`, `.maestro/scripts/payments.js`
  and the offer files R1 deleted resolve as deleted; `__tests__/navigation/freeForAll.test.tsx`
  then loses its last test (the checkout targets) or checks R1's removed-route handling instead.
- `app/(tabs)/profile.tsx`: R1 keeps the `MONEY_ROWS` card (Premium, credits, support behind their
  flags); F1 removed it: keep no money row. `src/navigation/RootNavigator.tsx`: R1 keeps the
  `premium`, `credits`, `support` and fake checkout screens; F1 removed them. Consider adding
  `/premium`, `/credits`, `/support`, `/checkout/fake-billing` and `/checkout/fake-donation` to
  R1's `src/navigation/removedRoutes.ts` (`removedRouteTarget`), with the free-for-all note.
- R1 replaced React Native's `Text` with the app's `@/src/components/ui/Text` (its lint refuses
  the former in `app/` and `src/`) in many files F1 also edited (the Profile tab, search, holders,
  the import screens, Settings → Account, the binder form and public binder, the collector
  profile, `LimitReachedNotice`, the wishlist editor and notices, `UnifiedResults`): keep R1's
  imports and F1's wording when resolving; `npm run lint -w apps/mobile` finds any left.
- Legal: merge both sources, then `npm run sync:legal -w apps/mobile` (R1 changed "Trading
  safely", F1 the privacy, community, marketplace and acceptable-use drafts).
- **Migration numbers with stage R2** (`feature/r2-inventory-adding-cards`, built on R1 at the
  same time): it adds `V117__inventory_price_text_restore.sql`. Flyway runs without `outOfOrder`
  (`application.yml`), so a database already at V123 (the owner's dev database once F1 is on
  `main`, any deployed environment) refuses to start with a V117 it has not applied ("detected
  resolved migration not applied"); fresh CI databases would not notice. **If F1 ships before
  R2, R2 renumbers V117 to the first free number after F1 (V124 or later) before it merges**;
  if R2 ships first, nothing changes (V117 comes before V120). The lead tells the R2 builder.
- ADR numbers: 0018 is R1's, 0019 is F1's. Expect text conflicts in CLAUDE.md, the READMEs,
  `schema.md`, the handoff, this file and the generated OpenAPI and clients (regenerate after the
  merge: `./gradlew exportOpenApi`, `npm run generate:api`).

### Verification (retries off; real numbers)

On 2026-10-14, this branch, every suite with retries off:

| Check | Result |
| --- | --- |
| `./gradlew spotlessCheck --rerun-tasks` | passed |
| `npm run test:api` | passed in 4 min 26 s: **949 tests** (937 in 157 classes + 12 catalog tests in 2), 0 failures, 0 skipped; new: `LimitsIT` (5), `LimitRulesTest`, `PaidFeaturesRemovalMigrationIT` (7: a scratch database migrated to V119, filled with plans, an admin-edited FREE limit, PREMIUM limits, subscriptions, entitlements, credits, ads, donations, old limit notices, a broadcast linking to `/credits`, outbox rows and job runs, then migrated to the latest version), `FlywayMigrationIT.thePaidFeaturesLeftTheSchema` |
| `./gradlew exportOpenApi` + `npm run generate:api` | git clean afterwards |
| `npm run build -w apps/web-angular` | passed; initial total **896.71 kB** (899.93 kB on `main`) |
| `npm run test:web` | 135 files, **630 tests** passed |
| `npm run lint` / `format:check -w apps/web-angular` | passed / passed |
| `npm run test:e2e -- --retries=0` | **70 passed** (1.3 min) after one fix: the first run had 66 passed, 2 failed, 2 did not run (the usage-limits spec left the "New binder" form open behind the limit dialog: fixed `72ef04e`; the smoke spec's Inventory link: passed on the next run, unchanged, a navigation race under load), and the `launch-config` project did not run because of them |
| `npm run typecheck` / `lint` / `format:check -w apps/mobile` | passed / passed / passed |
| `npm run test:mobile` | 90 suites, **916 tests** passed |
| `npx expo export --platform ios`, `android`, `web` (into scratch folders) | all three passed |
| `npm run test:mobile:e2e -- --retries=0` | **56 passed** (53 s) after one fix: the first run had 55 passed and 1 failed (`binders.spec.ts` still expected "the number of binders your plan allows" and "on the Free plan": fixed `bd86243`) |
| `npm run test:mobile:maestro -- --platform ios` (the owner's iPhone 18 Pro simulator, under the lock) | **30 of 31 flows passed** (50 min); `limit-reached.yaml` failed on its title assertion (on iOS the notice is one accessible element: fixed `6af22d0`), then its Profile step (a link to the app's root does not close a pushed screen: fixed `46d1463`); re-run alone afterwards: **passed**. The other 30 flows, including `payment-protection.yaml`, passed in the full run |
| `npm run test:scripts` | **133 tests** passed |
| `npm run infra:validate` | passed (fmt, init without backend, validate; nothing planned or applied) |
| `npm run audit:gate` | OK (no unreviewed high or critical advisory) |
| Android | **the Android run could not be verified** (no Android SDK on this Mac) |

**Migration on a seeded database:** a scratch database `orenjitrade_f1_check` was seeded by the
`main` API jar (`bf1135a`: the Premium subscription of `premium_user`, credits, the referral, the
three ads campaigns, two donations, every flag on), given two notices as the old API wrote them (a
limit notice with `planCode`, `upgradeUrl` and a `/premium` link; a broadcast linking to
`/credits`), then started with this branch's jar: V120–V123 applied in 0.1 s; 7 limits, one per key
(`binders.max` 5, `binder.views.per_day` 30, `inventory.items.max` unlimited, `offers.per_day` 20,
`saved_searches.max` 0, `wishlist.alerts.per_day` 5, `wishlist.items.max` 20); flags
`mlScanning`, `publicChat`, `protectedPayments` only; roles USER, MODERATOR, ADMIN, SUPER_ADMIN;
no table of the paid features left; the limit notice reads "You reached today's limit of 5
wishlist alerts. New listings still show on the card pages. The limit resets tomorrow." with no
plan or link; the broadcast kept its text and lost its link. A fresh database is covered by
`FlywayMigrationIT` and every Testcontainers suite. The database was dropped afterwards.

**Hand walk of the web** (this branch's build on :4580, API :8580 on that database, Redis db 6;
Playwright, screenshots in the session's scratch folder): 29 of 29 checks. Signed out: the map has
no sponsored placement, the footer no Support link, `/premium`, `/credits`, `/support` and the two
fake checkouts are "Page not found". `collector1`: the account menu is Profile, Offers, Trades,
Settings, Sign out; the old limit notice reads as above and opens the wishlist; the old broadcast
opens no removed page; the inventory, search and another collector's profile show no
"Sponsored"; Settings → Account shows no plan; the sixth binder gets "You reached a limit —
Binders — you used 5 of 5 on your account … Every collector has the same limits." with OK only.
`collector2`: the wishlist meter reads "3 of 20 wishes". `superadmin`: the admin menu has no plans,
subscriptions, credits, ads or donations; `/admin/usage-limits` is one list for everyone;
`/admin/feature-flags` lists `protectedPayments`, `publicChat` and `mlScanning`; the former
Premium account has no plan, role or entitlement; `/admin/plans`, `/admin/subscriptions`,
`/admin/credits`, `/admin/ads`, `/admin/donations` lead back to the dashboard. No request went
to a removed route; no console error (except the 429 of the sixth binder, on purpose). **Found
and fixed:** the role editor still described the super admin as editing "plans" (`75fef29`).

**Hand walk of the phone** (the owner's iPhone 18 Pro simulator under the lock, Expo Go on the
isolated stack, a scratch Maestro flow with screenshots in the session's scratch folder, and
`limit-reached.yaml`): passed. `collector1` (seed): the Profile tab has no Premium, credits or
support row; Settings → Account shows no plan; the Search tab's card results, the Inventory tab and
another collector's profile show no "Sponsored" row; old links to `/credits`, `/support` and
`/premium` open "This page does not exist". A collector with the five binders everyone may have
gets, on the sixth, "You reached the number of binders you can have — You have used 5 of 5
binders. Delete a binder you no longer need." with nothing to buy. The owner's simulator was left
as found (light appearance, large text) and the lock released.

### Review fix 1 (2026-10-14)

Two independent reviews (product and functional) asked for changes; every finding was fixed at its
cause, with a test:

- **The "Premium member." bio on a database seeded before F1** (major): profiles are seeded once
  and local edits kept, so the owner's dev database and the GCP dev environment kept the old seed
  bio on `premium_user`'s public profile. `ProfileSeedContributor` (local/dev only, the
  `WishlistSeedContributor` precedent) now replaces a bio that is still exactly the old seed text
  with today's; a bio written by hand is never changed. `SeedDataRunnerIT` plants the old bio and
  checks one seed run removes it (`c4aa683`).
- **Old broadcasts that promoted a removed feature, and `saved_searches.max`** (minor, the
  builder's decisions 6 and 7, now changed, see above): V123 deletes the admin broadcasts that
  linked to `/premium`, `/credits`, `/support` or their checkouts, and deletes
  `saved_searches.max` with its counters (V109's precedent); the web and phone labels go and the
  admin-rules E2E raises `binder.views.per_day` instead (`c22f834`). **V123 was edited** rather
  than followed by a V124: it is this stage's own migration, not merged and never applied to a
  persistent database (the walk and review databases were dropped; `orenjitrade_e2e` is
  recreated by every run). Once F1 is on `main`, V120–V123 are frozen like the others.
- **Tests that let a regression through** (minor): `SeedAccountLimitsIT` (the 12 seed accounts,
  staff and the former Premium account included, see the same numbers and are refused at the same
  count by `Limits.consume`) and `GeoPrivacyContractTest` comparing the numbers, not the sizes
  (`a8f7299`); the phone checks the views-limit message for Premium, plan, upgrade or credits and
  the Search tab (three segments), the holders and the inventory for a "Sponsored" row
  (`9a8512f`); a web spec for the search page (results, holders, invitation) checks for no
  sponsored placement (`e3157dd`; the inventory's is covered by the usage-limits E2E). Each new
  check was seen failing against the regression the reviewers planted (a Limits that lets the
  former Premium account through; an upgrade sentence in the views message; a sponsored row in
  the phone's search results; a sponsored aside on the web search page).
- **Documents** (minor): the owner account checklist's Stripe row lists no subscriptions; the
  Phase 6 contract and the schema say the limit notice offers no upgrade since F1 (`f0ead8d`).
- **Stage R2's V117** (minor): the merge notes, NEXT TASK and the handoff say R2 renumbers it
  after F1's migrations if it merges after F1 (Flyway refuses out-of-order migrations) (`9524f97`).

The builder's walk and migration check above predate this round (they show
`saved_searches.max` 0 and a broadcast that kept its text). **Re-checked on a database seeded by
`main`'s jar** (`bf1135a`, with six old broadcasts for collector2: "Go Premium", "Earn credits",
"Support OrenjiTrade", a Premium checkout, a `/wishlist` one and a `/premiumcards` look-alike),
then started with this branch's jar (V120–V123 in 0.09 s, then "Seed account 09: the bio of an
earlier seed was replaced"): the API answers 14 of 14 checks (the bio, the four promotions gone,
the two others kept, no link to a removed page, the same six limits for the former Premium account
and collector1, six rows in `/admin/usage-limits`); the web build on that stack, at 1280 and 390
px, passes 19 of 19 (the profile of `premium_user` reads "Collector and trader across all four
games.", collector2's notifications hold no promotion). The database was dropped and Redis db 6
emptied afterwards.

Checks of this round (retries off):

| Check | Result |
| --- | --- |
| `./gradlew spotlessCheck --rerun-tasks` | passed |
| `npm run test:api` | passed in 3 min 18 s: **952 tests** (940 in 158 classes + 12 catalog tests), 0 failures, 0 skipped (new: `SeedAccountLimitsIT` 2, `SeedDataRunnerIT` 1) |
| `./gradlew exportOpenApi` + `npm run generate:api` | git clean afterwards (no API change) |
| `npm run build -w apps/web-angular` | passed; initial total **896.71 kB** (899.93 kB on `main`) |
| `npm run test:web` | 136 files, **633 tests** passed |
| `npm run lint` / `format:check -w apps/web-angular` | passed / passed |
| `npm run test:e2e -- --retries=0` | **70 passed** (1.3 min), `admin-rules` on `binder.views.per_day` included |
| `npm run typecheck` / `lint` / `format:check -w apps/mobile` | passed / passed / passed |
| `npm run test:mobile` | 90 suites, **916 tests** passed |
| `npx expo export --platform ios`, `android`, `web` (scratch folders) | all three passed |
| `npm run test:mobile:e2e -- --retries=0` | **56 passed** (53 s) |
| `npm run test:mobile:maestro -- --platform ios` (the owner's iPhone 18 Pro simulator, under the lock) | **31 of 31 flows passed** (49 min 44 s), `limit-reached.yaml` and `payment-protection.yaml` included; the simulator left as found (light appearance, large text), the lock released |
| `npm run test:scripts` | **133 tests** passed |
| `npm run infra:validate` | passed (nothing planned or applied) |
| `npm run audit:gate` | OK |
| Android | **the Android run could not be verified** (no Android SDK on this Mac) |

### Review fix 2 (2026-10-15)

The second review round found two minor gaps; both were fixed:

- **A per-account exception on a limit another module counts went unnoticed** (minor):
  `binders.max`, `wishlist.items.max` and `inventory.items.max` are counted by their modules (a
  `LimitUsageSource` each), and `Limits.consume` decides them in a branch of its own. A
  regression in that branch that let the former Premium account through still passed every test:
  `SeedAccountLimitsIT` checked only a counter limit. Two new tests, run against the 12 seed
  accounts (`premium_user` and the staff included), close the gap. For each of the three limits,
  the number is set to the account's own usage: the probe answers `429 LIMIT_REACHED` (with the
  `limitKey`, no plan and no upgrade link), and `GET /me/limits` shows it as not allowed with 0
  left. One more allows it again. With `binders.max` at the account's binder count, the binder
  creation itself answers 429 and creates nothing. The numbers are restored after each test.
  Both tests failed against the reviewers' regression (an exception for seed account 09 in the
  source branch of `Limits.consume`) and pass without it (`ec9d508`).
- **The runbook's Redis restart table still listed the credit balance cache** (minor):
  `docs/deployment/runbooks.md` section 9 no longer names it. A line under the table says the
  cache went with credits in F1 (ADR 0019, V122), and that no Premium, credit or advertising key
  is left in Redis (`b4ecba7`; checked against the key prefixes in `apps/api/src/main`).

Checks of this round (retries off):

| Check | Result |
| --- | --- |
| `./gradlew spotlessCheck --rerun-tasks` | passed |
| `npm run test:api` | passed in 3 min 41 s: **954 tests** (942 in 158 classes + 12 catalog tests), 0 failures, 0 skipped (new: `SeedAccountLimitsIT` 2) |
| `./gradlew exportOpenApi` + `npm run generate:api` | git clean afterwards (no API change) |
| `npm run build -w apps/web-angular` | passed; initial total **896.71 kB** (899.93 kB on `main`) |
| `npm run test:web` | 136 files, **633 tests** passed |
| `npm run lint` / `format:check -w apps/web-angular` | passed / passed |
| `npm run test:e2e -- --retries=0` | **70 passed** (1.5 min) |
| `npm run typecheck` / `lint` / `format:check -w apps/mobile` | passed / passed / passed |
| `npm run test:mobile` | 90 suites, **916 tests** passed (and the 28 harness guard tests) |
| `npx expo export --platform ios`, `android`, `web` (scratch folders) | all three passed |
| `npm run test:mobile:e2e -- --retries=0` | **not run in this round**: the simulator lock was held by stage R2's fixer for the whole round (this round changed no phone code; review fix 1: 56 passed) |
| `npm run test:mobile:maestro -- --platform ios` (the owner's iPhone 18 Pro simulator, under the lock) | **not run in this round**, same reason (review fix 1: 31 of 31 flows) |
| `npm run test:scripts` | **133 tests** passed |
| `npm run infra:validate` | passed (nothing planned or applied) |
| `npm run audit:gate` | OK |
| Android | **the Android run could not be verified** (no Android SDK on this Mac) |

### Merged with R1 (2026-10-15)

`origin/main` with stage R1 (#72) was merged into this branch (merge commit "Merge origin/main
(redesign R1, #72) into feature/f1-free-for-all"); 46 conflicts, resolved so that both stages'
intents hold. **Modify/delete (22):** every file one stage deleted stays deleted (F1's Premium,
credits, support and checkout screens, billing and ads parts, `billing.test.tsx`, `premium.yaml`,
the ads and donation seed contributors; R1's offer, trade, payment and dispute files, tests and
`scripts/payments.js`), after checking that nothing kept imports them. R1's provider checkout,
which it had moved to `src/features/billing` for Premium and donations (`FakeProviderCheckout`,
`checkoutTargets`, `useProviderCheckout`, with `billing.test.ts`, `providerCheckout.test.tsx` and
`.maestro/scripts/billing.js`), had no user left and was deleted: **the phone has no checkout at
all**. **Both edited (24):** the phone files keep R1's removals, `Text` imports and wording and
F1's removals and plain limit messages (the Profile tab without offer, trade or money rows; no
sponsored slot; no checkout query key; no offer or paid-feature types, stack screens or app
roots); `paymentFixtures.ts` keeps only the seed flags. **Removed routes, one mechanism:** R1's
`removedRouteTarget` (through the not-found screen) now also sends `/premium`, `/credits`,
`/support` and the `fake-billing` / `fake-donation` checkouts to the Profile tab with F1's
free-for-all note, as it sends offers, trades, disputes and the payment checkout to Messages or
Settings with the deals note; old notifications of both use R1's `{ kind: 'note' }` target (F1's
`'later'` renamed). Tests: `removedRoutes.test.tsx` (the F1 paths and the not-found screen on
`/premium`), `freeForAll.test.tsx` (no `checkout/` route and no `billing`, `checkout`, `payments`
or `ads` folder left; the old links through `removedRouteTarget`), `gate.test.ts`,
`notifications.test.ts`, a new Playwright spec `removed-links.spec.ts`, and `limit-reached.yaml`
now expects the Profile tab and the note instead of the not-found screen. **API:** R1's
`SeedWordingTest` and `SeedIT` no longer read the deleted donation contributor and table.
**Documents:** both sections kept (R1's first), NEXT TASK rewritten (R1 and F1 merged; next R2,
whose V117 must become V124 or later), the ADR index lists 0018 and 0019, ADR 0011 carries both
amendments (the app-store question has nothing left to apply to on the phone), ADR 0018 and 0019
point at each other, and CLAUDE.md, the READMEs, `schema.md` (V115, V116, V120–V123), the
handoff, local setup, seed data and the product overview say both. The paused web holds exactly
F1's deletions and R1's "Trading safely" exception. Migrations unchanged: V115, V116, V120–V123.

Checks after the merge, retries off: `spotlessCheck --rerun-tasks` passed; `npm run test:api`
**962 tests** (950 in 160 classes + 12 catalog tests), 0 failures, 0 skipped; `exportOpenApi` and
`npm run generate:api` left git clean; web build passed, initial total **896.09 kB**; `npm run
test:web` 136 files / 633 tests, web lint and `format:check` clean; `npm run test:e2e --
--retries=0` **70 / 70** (1 min 45 s); mobile typecheck, lint (0 warnings) and `format:check` clean; `npm run
test:mobile` jest **89 suites / 886 tests** + 28 guard tests; `npx expo export` ios, android and
web passed; `npm run test:mobile:e2e -- --retries=0` **54 / 54** (1 min 14 s, the new `removed-links.spec.ts` included); `npm run
test:mobile:maestro -- --platform ios` on the owner's iPhone 18 Pro simulator, under the lock:
**29 / 30** in 48 min 39 s, then `limit-reached.yaml` fixed (it looked for the 6-second note only
after the developer-menu checks, which take about 7 s; it now reads the note right after the
link) and **passed alone twice** (1 min 26 s, 1 min 25 s); the simulator left light at its
default text size; `npm run test:scripts` 133 / 133; `npm run
infra:validate` passed; `npm run audit:gate` OK. A grep of `apps/mobile` finds no import of a
deleted file, no route to a removed screen (only the web paths `notificationLink` builds, which
`mobileTarget` turns into the deals note) and no upgrade, Premium, credits, donation, sponsored,
offer or trade entry point; "Accepts offers" remains only as a card attribute, which R2 removes
from the phone's forms.

Seen on the simulator, not changed (R1's mechanism, now shared): the Maestro screenshot taken
during the move shows the Profile tab sliding in over the earlier Profile tab, so `router.replace`
from the not-found screen to a tab seems to add a second tab navigator rather than return to the
first one (not checked further: the back swipe was not tried). The tests pin `replace`;
`router.navigate` or `dismissTo` would return to the existing tabs: a choice for R2 or later.

### Owner follow-ups

- Keep or drop the CLAUDE.md commit `e4ee954` (the handoff says CLAUDE.md is the owner's; the task
  asked for these lines).
- `saved_searches.max` was deleted in review fix 1 (a Premium perk of a feature never built):
  say so if it should come back as a cap of 0.
- `premium_user`: keep the handle, or rename the seed account in a later change.
- A different cap for some collectors would need a new decision (no per-account override exists).
- The lawyer's review of the four changed drafts (list above).
- Admin broadcasts that linked to a removed page are deleted by V123 (review fix 1); a broadcast
  that talked about Premium, credits or donations without a link stays as written.

## Phone redesign R2: inventory and adding cards (2026-10-14)

Stage R2 of the phone redesign approved by the owner on 2026-10-14
([`docs/product/specs/2026-10-14-phone-redesign.md`](docs/product/specs/2026-10-14-phone-redesign.md),
sections 6, 12 "Inventory", 14, 15 and 16): mockup screens 1 to 9 (the Inventory, Filter and
sort, Add cards, typing, Choose the printing, Add to inventory, Edit card, "Saved", "Card
deleted"). Branch `feature/r2-inventory-adding-cards`, cut from the head of stage R1 (#72). One
migration, V125 (written as V117; renumbered after F1's V120–V123 when R2 merged `main`, see
"Merged with free for all (2026-10-15)"); every API change is additive (the paused web builds and passes every check
against the regenerated client, unchanged). The Binders side of the Inventory keeps today's binder
list until R3; the tab bar keeps today's six tabs until R5. Free for all (stage F1, another
worktree): no sponsored row in the list, no upgrade offer, a reached limit reads as a plain cap.

**What a collector can now do on the phone**

- **See the inventory at a glance** (screen 1): the title "Inventory" with the bell and an orange
  "Add cards"; "Cards {n} | Binders {n}"; "Search your cards" and a filter button that shows how
  many filters are on; "{n} cards · {n} copies · {n} public" with "Select"; rows of only the card
  picture, its name, the card code in mono, the asking price exactly as typed ("85% TCG", "$11.50";
  nothing without one) and "×{copies}". A row opens Edit card. The card saved last has an orange
  ring while the tab is on screen. The listings-paused banner and the "needs a confirmation"
  notice ("Confirm all") stay above the list.
- **Filter and sort** in a sheet (screen 2): Sort by Recently added (the default), Name, Price
  (plain amounts first, then text prices, then no price); Game (All games, then the games they
  own); Binder (All cards, No binder, then each binder by name); Who can see it (All, Public,
  Private); "Clear all"; "Show {n} cards" counts the cards before they are shown.
- **Select several cards**: Move to binder, Make public, Make private, Still available, Delete
  (asked in a sheet, then "{n} cards deleted" with "Undo").
- **Add cards** (screens 3 to 6): the search first ("Card name or code, like LOB-EN001"); while
  typing, "Cards" ("Yu-Gi-Oh! · 14 printings") open Choose the printing and "Exact printings" of a
  code (code, set, rarity) go straight to the details; "Import a deck" and "Import from Collectr"
  open the stage S5 import on that source; "Scan with camera" is marked "Coming later". Choose the
  printing filters by set code or name and by rarity; printings that share a code say their
  edition, language or finish; a card with one printing skips the step. Add to inventory: Copies
  (− / +), Asking price (free text, 40 characters), Who can see it (Private by default, with its
  hint naming the collector's region), Binder, Public note (500, with a counter), Photos (up to 4,
  library or camera). "Add to inventory" creates the card, then uploads the photos; back on the
  Inventory, "Saved · {card}" with "View" (Edit card). A photo that fails keeps the card and opens
  Edit card with "1 photo wasn't saved. Try again."
- **Edit a card** (screen 7): the same fields, filled in; "Save changes" reads "No changes yet"
  and stays disabled until something changes; photos are saved with the button; a save counts as
  "still available". "Delete this card" asks in a sheet ("It leaves your inventory and any binder.
  Its photos are deleted too.", a red "Delete", "Keep it"); back on the Inventory "Card deleted ·
  {card}" with "Undo" (screen 9), which brings the card back exactly as it was, photos included,
  within 10 minutes.
- Gone from the phone's card forms: condition, language, edition, finish, "Available for",
  "Accepts offers", currency, "Temporarily public", private notes (the API keeps the columns for the
  paused web; condition, language and edition go in the public note). The "Offers" tag and "Open to
  offers" left the phone's other card rows too (binder pages, collector pages, card holders); a
  condition that is not stated shows nothing there.

**What the API does** (V125, written as V117; commits `4e1b541`, `f7cb8ef`, `4b234c3`; contract
[`docs/api/contracts/r2-inventory-phone.md`](docs/api/contracts/r2-inventory-phone.md))

| Part | What |
| --- | --- |
| Price text | `inventory_item.asking_price_text` (≤ 40, trimmed, one line). `askingPriceText` on create and `PATCH`; a plain amount (`12`, `12.50`, `12,50`, `$12.50`, `$ 12`, `12,50 $`) also fills `asking_price` in the item's currency (CAD by default), any other text leaves it null; both fields sent together is a 400; the web's `askingPrice` alone clears the text. Responses (owner and public) carry `askingPriceText`. Parser `common/AskingPriceText` (R3 reuses it for deck cores) |
| Condition not stated | `condition` nullable; `conditionStated: false` on create; responses send `condition: ""` with `conditionStated: false`; a `PATCH` with a condition states it. `WishlistAlertRules`: a Near Mint only wish treats it as a possible match (SQL and Java) |
| Phone defaults | the phone sends `TRADE_OR_SALE`, `acceptsOffers: false`, `conditionStated: false`, leaves language / edition / finish (the printing's) and currency (CAD) to the server, and never changes them |
| Undo a delete | an owner's delete (one or bulk) sets `restorable_until` = +10 min and keeps the photos; `POST /inventory/items/{id}/restore` (200, idempotent; 404; 409 `RESTORE_WINDOW_CLOSED`; 429 at the limit); the `inventory-photo-purge` job after each freshness run deletes the photos once the window has passed; a binder deleted ends the undo of its deleted cards |
| Freshness | `PATCH … confirm: true` confirms like `POST …/confirm` (the phone's "Save changes") |
| Sorts | `sort=created`; the price sort puts text prices after amounts, then no price |
| Catalog | suggestions gain `setName`, `rarity` (printings) and `printingCount` (cards); `PrintingSummary.setReleaseDate` |

**Decisions, and why**

1. **Condition: nullable column, empty string in the responses, `conditionStated`.** The spec asks
   for a nullable condition "if the paused web still compiles". It does not: with `condition:
   string | null` in the generated client the web build fails twice (TS2322 at
   `features/inventory/data/item-form.ts:145` and `shared/offers/offer-target.ts:55`; tried and
   reverted). The least misleading option kept: the column is `NULL` (the truth), the API sends
   `""` (the web shows "—" and its edit form asks for a condition) plus `conditionStated: false`
   for clients that know. Writing `NEAR_MINT` would have shown a false "Near Mint" on the web.
2. **`conditionStated` is optional in the schema** (always sent): the web's spec fixtures build
   `InventoryItemResponse` literals, a new required field would break `npm run test:web`.
3. **A text and an amount never disagree:** text wins and is parsed; the web's amount alone drops
   the text; both together is refused. The currency is never read from the text.
4. **Undo window: a constant of 10 minutes** (`InventoryService.RESTORE_WINDOW`, spec default 4),
   not an admin setting: an admin knob needs an admin screen on the paused web. Only the owner's
   own deletes are restorable; a trade or a binder deleted with its cards is final at once.
5. **Photos are purged by the hourly housekeeping**, after the freshness job like the import purge
   (no new Cloud Scheduler job, no new internal endpoint: the web's client and bundle stay as they
   are). The restore checks the time itself.
6. **Restore consumes `inventory.items.max` again** (the card comes back as a live item); no IT
   sets a number for it (none has one today, and stage F1 reworks limits).
7. **Save confirms freshness through `PATCH … confirm`**, so the web's saves stay as they were.
8. **The Inventory draws its own header** (the tab's navigation header is off for it,
   `TabDefinition.ownHeader`): the mockup's large title, round bell and orange pill.
9. **Toasts restyled for the whole app** (title, icon, one action, about 5 seconds, announced to
   VoiceOver); with an action they stay 15 seconds while a screen reader runs (WCAG 2.2.1), never
   on the web, where react-native-web says yes for every visitor.
10. **Edit card keeps the order of Add to inventory, Binder included** ("the same fields as (6)";
    the mockup's screen 7 shows no binder and puts the price first).
11. **Photos of Edit card are saved with "Save changes"** (the mockup's "Add" makes the card dirty),
    so taking a photo away by mistake can still be left unsaved; photos alone still confirm the
    card.
12. **A photo that fails while adding**: the card is kept and Edit card opens with the photos that
    were not saved ("Try again"); they are held in memory only (never persisted).
13. **Choose the printing**: the filter field shows from four printings, the rarity chips from two
    rarities; a card with one printing goes straight to the details; printings that share a code
    (a first edition and an unlimited one) say their edition, language or finish.
14. **Exact printings come from `/cards/suggest`** (now with set name and rarity), the "Cards" from
    the same answer (with the printing count): one request per typed text.
15. **The row's picture is the card's** (the printing image), not the owner's photo, as in the
    mockup.
16. **"public" in the summary line is the owner's choice** (Public or a running temporary
    publication), the same as the "Who can see it: Public" filter; a temporary publication reads
    "Public" in the form (the phone offers no end date any more).
17. **The imports open on the source chosen on Add cards** (back returns to Add cards), unless an
    import is left open: then the S5 start shows it first (continue or replace).
18. **A bulk delete can be undone too** (the restore of each card), and a bottom sheet replaces the
    delete dialogs (bottom sheets for confirmations, section 3).
19. **The Binders side gets "New binder" and "Reorder" in its list header** (the header button is
    "Add cards" on both sides, as in the mockup).
20. **Rows elsewhere** (binder pages, collector pages, card holders): the price as typed, no
    condition when none is stated, no "Offers" tag and no "Open to offers" / "No price" (R1 had
    kept them until R2).

21. **The bottom bar of a card form stays under the keyboard** (only the fields scroll above it):
    above the keyboard it left a sliver of the form at large text sizes, and Maestro could not
    hide the keyboard behind it. A toast on these screens sits above the bar
    (`snackbar.keepClear`).
22. **The largest text sizes** (walked at the last accessibility size): the screen titles stop at
    twice their size and the controls that must stay in reach (the "Add cards" pill, the form
    buttons, "Show {n} cards") at 1.35 times; card and printing rows put the price, the copies and
    the rarity under the name (side by side, names broke inside a word); toasts put their action
    under the text; a confirmation sheet scrolls its question and keeps its two buttons on screen.
23. **"Go to my inventory" after an import goes to the Inventory tab**, past Add cards (the import
    now opens from Add cards; going back from its file step returns to Add cards).

**The defaults of section 16 this stage applies:** 4 (a deleted card can be restored for 10
minutes) and 5 (cards added on the phone have no stated condition; Near Mint only alerts still
fire for them). Default 1 (dark on a new install) is R1's and every R2 screen follows it.

**What changed on the phone** (commits `edd0e47` to `50a6e35`)

| Part | What |
| --- | --- |
| Inventory (1, 2) | `app/(tabs)/inventory.tsx` draws its own header (`TabDefinition.ownHeader`); `InventoryCardRow`, `InventoryFilterSheet`, `NeedsConfirmationNotice`; `UnderlineTabs`, `PillButton`, the round `NotificationBell`; `lib/inventoryFilters.ts` (sorts created / name / price, Public / Private, `clearedFilters`); a pull alone shows the refresh spinner; the totals line is hidden over an empty inventory |
| Add cards (3 to 6) | `app/items/new.tsx` in four steps (start, typing, printing, details) with `AddCardsStart`, `AddCardSearch`, `PrintingPicker`, `CardHeader`, `CardFormFields`, `CardPhotos`, `pickCardPhotos` (library, several at once, or camera), `InventoryFormScreen`, `cardForm.ts`, `itemPrice.ts`, `inventoryUiStore.ts` (the card saved last, photos that failed) |
| Edit card (7) | `app/items/[id].tsx` rebuilt on the same fields; `ConfirmSheet`, `BackBar`; photos picked, removed and saved with "Save changes"; "Try again" for photos that failed |
| Toasts (8, 9) | `Snackbar` with a title, an icon and one action ("View", "Undo"), about 5 seconds, announced; `deleteToasts.ts` (one card, several cards) with the restore |
| Bulk actions | `BulkBar` and `bulkActions.ts`: Move to binder, Make public, Make private, Still available, Delete (in a sheet, with "Undo") |
| Other rows | `ItemRow`, `HolderRow`: the price as typed, a stated condition only, no "Offers" tag, no "Open to offers" / "No price" |
| Imports | opened from Add cards on the chosen source (`app/items/import.tsx`, `ImportStart`); "Add cards" in their texts |
| Removed | `ItemDetailsFields`, `InventoryFiltersBar`, `ItemPhotos`, `itemForm.ts` and its test |
| Tests | jest: `inventory`, `items`, `cardForm`, `addCards` rewritten or new, the snackbar, filters, holders and import tests updated; Playwright: `inventory.spec.ts`, `bulk-actions.spec.ts`, `item-photos.spec.ts` rewritten, `holders`, `inventory-import` updated; Maestro: native flow 1 `inventory-add-edit-undo.yaml` (was `inventory-add-edit-delete.yaml`), `subflows/pick-newest-photo.yaml`, `media/fictional-card-photo.jpg` (generated, 32 KB, put on the simulator with `addMedia`), `dialog-after-sheet.yaml` and the three import flows updated, `scripts/check-inventory.js` checks the price text, the amount, the stated condition, the photos and the visibility |
| Docs | this section, NEXT TASK, the R2 contract, `phase3-inventory.md`, `docs/database/schema.md` (V117, now V125), the mobile README, the handoff |

**Checks** (retries off, the real numbers; this Mac, 2026-10-14, the owner's iPhone 18 Pro
simulator under the lock)

| Check | Result |
| --- | --- |
| `cd apps/api && ./gradlew spotlessCheck --rerun-tasks` | passed (again at the end) |
| `npm run test:api` | passed: 1020 tests in 174 classes (+ `InventoryPhoneFormIT` 10, `AskingPriceTextTest` 28, `CatalogSearchIT`, `WishlistAlertsIT` and `WishlistRulesTest` extended) + 12 catalog tests in 2 classes, 0 failures, 0 skipped (3 min 36 s; the API has not changed since `4b234c3`) |
| `./gradlew exportOpenApi` + `npm run generate:api` | committed (`f7cb8ef`, `4b234c3`), git clean afterwards |
| `npm run build -w apps/web-angular` | passed, initial total **899.31 kB** (unchanged, again at the end; no web file changed: `git diff b0e91e1 -- apps/web-angular` is empty) |
| `npm run test:web`, web `lint`, `format:check` | passed: 142 files / 678 tests against the regenerated client; lint and format clean |
| `npm run test:e2e -- --retries=0` | **74 / 74** (1 min 24 s) |
| `npm run typecheck -w apps/mobile`, `lint`, `format:check` | clean (lint: 0 warnings) |
| `npm run test:mobile` | passed: jest 92 suites / 928 tests (new: `cardForm`, `addCards`; rewritten: `inventory`, `items`) + 28 guard tests |
| `npx expo export --platform ios / android / web` | all three passed (into the scratch folder) |
| `npm run test:mobile:e2e -- --retries=0` | **57 / 57** (1 min 0 s) on `50a6e35`. The first full run, on `7ef827e`, was 52 / 57: the rewritten inventory specs had never run against the stack (the bottom bar of a form outside its screen id, "Go to my inventory" landing on Add cards, the totals and rows of before R2, a hint that needs a declared place, a "Saved" of the add taken for the save's); all fixed in `50a6e35`, then the four inventory specs 8 / 8 |
| `npm run test:mobile:maestro -- --platform ios` | **30 / 30** in 46 min 5 s on `50a6e35` (native flow 1 `inventory-add-edit-undo.yaml` in 2 min; the three import flows read the rows and totals of R2) |
| `npm run test:scripts` | 133 / 133 |
| `npm run audit:gate` | passed (the two allowlisted advisories, expiring 2026-11-30) |

**The walk on the simulator** (screenshots kept outside the repository, compared with the mockup's
screens 1 to 9): a fresh collector with six cards, in dark and in light at the default text size,
then in dark at the largest accessibility size: the Inventory, Filter and sort, Add cards, typing
("azure": "Cards" and "Exact printings"), Choose the printing (Azure-Eyes Sky Dragon, two
printings), Add to inventory (empty, then "85% TCG" and Public), "Saved · Azure-Eyes Sky Dragon"
with the orange ring, Edit card ("No changes yet"), the delete sheet, "Card deleted"
with "Undo", "Card restored". The screens match the mockup in order, wording and type; the
differences are the decisions above (Edit card keeps the binder and the order of Add to inventory;
the public hint names "your region" for a collector without a declared place). Found during the
walk and fixed: a toast over the main button of a form, the refresh spinner on every refetch, the
totals line over an empty inventory, the form's bottom bar riding on the keyboard (decision 21),
and at the largest
size the header, the sheet, the rows, the toasts and the delete sheet (decision 22). Native flow 1
(add with a text price and a photo, Saved, edit, delete, undo) passed on its own before the suite.

**Could not be verified:** the Android run (no Android SDK on this Mac; the flows keep their
Android steps, and the photo picker subflow's Android branch was never run); the camera ("Take
photo": the simulator has none; the path is covered by the jest tests only); VoiceOver on a real
iPhone (the announcements and the 15 seconds of a toast with an action are covered by jest only);
the photo purge an hour after a real delete (`InventoryPhoneFormIT` moves a delete eleven
minutes back and runs the job itself).

**Known gaps, by design or for a later stage**

- The Binders side of the Inventory keeps today's binder list ("New binder" and "Reorder" in its
  header) until R3 (screens 17 and 18); "Mark as sold" is R4's; the tab bar keeps six tabs until R5.
- The paused web shows a not-stated condition as "—" and asks for a condition when it edits such a
  card; it still offers "Accepts offers", "Available for" and the other fields the phone dropped.
- Each run of native flow 1 adds one copy of the fictional photo to the simulator's photo library
  (`xcrun simctl addmedia` has no undo): the owner's iPhone 18 Pro now holds six copies
  (`IMG_0007` to `IMG_0012`, 32 KB each), to delete in Photos if they are in the way; the system
  photo picker keeps its own cached copies of the ones it handed to the app (its Photos file
  provider, not the Files app, which holds nothing).
- In light, the app's orange (`#F4761A`, a token since M1) under white button labels or as text
  ("Clear all", "Cancel", "View", "Undo") reads at about 2.8 : 1, under the 4.5 : 1 of WCAG AA for
  text of that size (the mockup is dark only, where the orange reads at 8.2 : 1). Not changed: an
  owner question for the look.

**Review fix 1 (2026-10-14)** (commits `8ca102c` to `86f0081`, then this text; two reviewers, a functional
verifier and product and UX as a collector; findings and what was done):

| Finding | What was done |
| --- | --- |
| F1 (blocker) emptying a plain-amount price on Edit card kept `asking_price` ("$12.50" came back) | `InventoryService`: a typed price text, even an empty one, decides the amount (`PriceInput.Source.TYPED`); `askingPriceText: null` or blanks clear both, also for a card priced on the paused web. IT `emptyingThePriceOnEditCardClearsTheAmountItGave` |
| F2 (blocker) native flow 1 picked the newest photo by date, not its own copy | the harness dates the flows' fictional picture now before each run (`freshenFlowMedia`, `simctl addmedia` keeps a file's date); the flow checks that the photo was saved ("Saved", not "Saved · 1 photo wasn't saved") before View. Node test of the harness. **Not enough (R1-1 of review fix 2):** only the modification date changed, and the photo library dates a photo by its file's creation date |
| U1 / F3 (major) a card code shared by several printings added the first one silently | `GET /cards/suggest` PRINTING entries gain `edition`, `language`, `finish` (additive); Add cards keeps one Exact printings row per printing with what tells it apart ("1st Edition", "Unlimited"); Add to inventory and Edit card name it under the code. CatalogSearchIT, jest |
| U2 / F4 (major) "Collectors in {region} can find it." for public cards nobody can find | the hint is the spec's only when it is true; otherwise the reason: no location, hidden from the map, a private profile, paused public cards, a private binder or one not public right now (`publicCardHint`, `useCardFindability`); private binders carry a "Private" tag in the binder picker. "{n} public" counts the cards set to public, as the Public filter lists them (F7) |
| U3 (minor) a photo that failed while adding: "Saved" and the message below the fold | the toast says "Saved · 1 photo wasn't saved"; Edit card opens at the end of the form, on the failure line (announced to VoiceOver); leaving while a photo can still be saved asks first ("Leave without this photo?", Stay / Leave); a delete leaves without asking |
| U4 (minor) a photo the API refuses showed a "Try again" that can never work | each failed upload keeps its error; for 400, 409, 413 and 415 the photo says why ("This photo is too large: at most 8192 pixels on each side. Choose another one.") with "Remove it", and "Try again" is only for network and server errors |
| U5 (minor) at the largest text the search field, the Private / Public labels and the add tile broke | "Cancel" and the two labels keep at most 1.35 times their size; the add tile grows with its label |
| U6 (minor) a text size changed while the app is open left the Inventory header broken | the Inventory's content mounts again for each text size (keyed on `fontScale`) |
| U7 (minor) in Select mode the saved card's orange ring looked selected | no saved ring in Select mode (jest `screens/inventory`) |
| F5 (major) restore and the photo purge had no lock-order test, and the lock rules did not name them | `RESTORE` / `ITEM_RESTORE` in `InventoryLockOrderIT`'s item and owner writes; a binder delete holding its deleted cards next to the photo purge (`thePhotoPurgeNeverWaitsForTheDeletedCardsABinderDeleteHolds`); `docs/database/schema.md` names restore, `endRestoreWindowsInBinder` and the purge's `SKIP LOCKED` |
| F6 (minor) nothing tested that the hourly freshness run starts the photo purge | IT `theHourlyFreshnessJobRunsThePhotoPurge` through `POST /internal/jobs/freshness` |
| F7 (minor) "{n} public" counted temporary publications the Public filter left out | `GET /inventory/items?markedPublic=true` (optional, additive): the phone's Public filter lists PUBLIC and TEMPORARILY_PUBLIC, the cards the summary counts. IT `thePublicFilterListsTheCardsTheSummaryCountsAsPublic` |
| F8 (minor) Add and Edit still wired "Premium raises the limit" and See Premium | a reached `inventory.items.max` reads as a plain cap for everyone ("Your inventory is full: it holds at most {n} cards. …"); `LimitReachedNotice` itself is left to stage F1 |
| F9 (minor) Undo only while the 5-second toast shows, the server allows 10 minutes | not changed: the spec asks for the toast's Undo (about 5 seconds; 15 with a screen reader); an owner question (a longer toast for a delete, or a "Recently deleted · Undo" line) |

Checks of review fix 1 (retries off): spotlessCheck passed; `npm run test:api` 174 classes / **1028 tests**
(+8: `InventoryPhoneFormIT` 13, `InventoryLockOrderIT` +5 for restore and the purge) + 12 catalog
tests, 0 failures (4 min 3 s); `exportOpenApi` + `generate:api` committed, git clean afterwards;
web build **899.31 kB** initial (no web file changed), `test:web` 142 files / 678 tests, web lint
and format clean; `npm run test:e2e` **74 / 74**; mobile typecheck, lint, format clean; `npm run
test:mobile` jest 92 suites / **941 tests** + 28 guard tests; `expo export` iOS, Android and web
passed; `npm run test:mobile:e2e` **57 / 57** (again on the final tree); `npm run
test:mobile:maestro -- --platform ios` **30 / 30** in 46 min 44 s on the owner's iPhone 18 Pro
(native flow 1 also alone, 2 min 3 s); `npm run test:scripts` 135 / 135; `npm run audit:gate`
passed. Two mutations were run by hand and caught: the old price rule (an empty text keeps the
amount) fails `emptyingThePriceOnEditCardClearsTheAmountItGave`, and the freshness job without
the photo purge fails `theHourlyFreshnessJobRunsThePhotoPurge`.

Walked on the simulator (scratch Maestro flows, screenshots outside the repository): "GLM-EN002"
lists "1st Edition" and "Unlimited" apart and the Unlimited one opens with "Unlimited" in the
header; a collector without a location sees why nobody can find a public card; at the largest
text size "tidal" stays readable next to "Cancel", "Private" / "Public" stay whole and the add tile
grows; the text size changed live to the largest and back keeps the Inventory's title, "Add
cards", the counts and the totals in place; with the photo storage made read-only during an add,
the toast reads "Saved · 1 photo wasn't saved", Edit card opens on the failure line, Back asks
"Leave without this photo?", Stay, then "Try again" saves it (the API holds one photo) and Back
leaves without asking. Found during the walk and fixed: Add to inventory opened scrolled past its
header after a long list of printings had been scrolled (each step of the add now opens at its
top, `86f0081`). The owner's text size (Large) and light appearance were put back; the photo
library holds four more fictional copies of the flow picture (two runs of flow 1, two walks).
Not verifiable here: the Android run (no Android SDK on this Mac).

**Review fix 2 (2026-10-15)** (commits `ae547ac` to `4d3ec72`, then this text; the same two
reviewers again: R1-1 to R1-4 found, F9 still open; the last fix round section 15 allows):

| Finding | What was done |
| --- | --- |
| R1-1 (major) native flow 1 still did not take the photo it adds: `freshenFlowMedia` set only the modification date, and the simulator's photo library dates a photo by its file's creation date (`ZDATECREATED` = birthtime), so the run's copy kept the checkout's date and the flow passed only because the newest-dated photos were fictional copies | the harness writes each flow picture again as a new file before a run (the same bytes and mode, a sibling renamed over it), so it is created now; the node test asserts a new file created after the run started (the old `utimes` fails it); flow 1 checks the saved photo is the 600 × 800 picture (`EXPECT_IMAGE_SIZE` of `check-inventory.js`; the API keeps that size), so another photo of the device can no longer pass. On the owner's simulator the harness renewed the picture (created 04:12:16) and this run's copy (`IMG_0024`, added 04:27:33) is dated 04:12:16 in the photo library, its newest photo (the copies of earlier runs keep 2026-10-14 dates); flow 1 passed with the size check |
| R1-2 (minor) the add's toast "Saved · 1 photo wasn't saved" covered the failure line and its "Try again" where Edit card opens (a tap 4 s after the toast landed on the toast) | `InventoryFormScreen` keeps room at the end of its content for a toast (`useSnackbarCover`: how far up the toast reaches), kept once given so nothing moves under a finger when the toast goes, and a screen opened on its end stays there while its content grows, until it is touched or dragged. jest `screens/items`. Walked: with the photo storage read-only during an add, Edit card opens with the failure line and "Try again" above the toast, and "Try again" tapped while the toast still shows saves the photo (the API holds it, 600 × 800) |
| R1-3 (minor) after "Save changes", a photo not saved or refused showed its message, "Try again" or "Remove it" below the fold, with no toast | Edit card then shows the end of the form (`showEnd`) and the toast "Saved · 1 photo wasn't saved" (announced, as after an add); the room of R1-2 keeps the message above the toast. jest `screens/items`. Walked: Save changes from the top of the form with the card's photo folder read-only, then with the fictional 9000 × 1200 picture: each time the form shows the end, the failure line with "Try again" (or "Photo 4 wasn't saved. This photo is too large: …" with "Remove it") above the toast "Saved · 1 photo wasn't saved"; "Try again" at once saved it, "Remove it" removed it |
| R1-4 (minor) the Public hint ignored the card itself: a card hidden until confirmed read "Collectors in {region} can find it.", and a temporary publication of the paused web that had ended read as Public (and nothing on the phone could publish it again: the toggle already said Public) | `cardVisibilityHint`: on Edit card, while nothing changed, a public card hidden until confirmed says "Nobody can find it until you confirm it is still available." (another reason the phone does not know of: "Nobody can find it right now."); with a change pending, a card nobody can find yet says "Collectors in {region} can find it once you save." (a save confirms it and saves the visibility shown); a temporary publication that ended reads as Private, "Its temporary publication has ended: only you see it until you make it public again.", and Public publishes it (`visibility: PUBLIC`). Add to inventory keeps the spec's hints. jest `features/cardForm` (unit) and `screens/items`. Walked (a collector in Quebec on the map, its two public cards changed in the isolated database): the hidden card says nobody can find it until confirmed, "… once you save" after a change, "… can find it." after "Still available"; the ended publication reads Private with its line, Public then Save stored `PUBLIC` |
| F9 (minor) Undo only while the 5-second toast shows | not changed, an owner question: the spec asks for toasts that "stay about 5 seconds" (section 3) with the delete's "Undo" (section 6, screen 9); the 10 minutes are the server's window (section 12, a slow network or a screen reader's 15-second toast included). Options for the owner: a longer toast for a delete, or a "Recently deleted · Undo" line in Inventory while the window is open |

Checks of review fix 2 (retries off): `spotlessCheck --rerun-tasks` passed; `npm run test:api` 174
classes / **1028 tests** + 12 catalog tests, 0 failures (3 min 46 s; no API change this round);
`exportOpenApi` + `generate:api` left git clean; web build **899.31 kB** initial (no web file
changed), `test:web` 142 files / 678 tests, web lint and format clean; `npm run test:e2e`
**74 / 74**; mobile typecheck, lint, format clean; `npm run test:mobile` jest 92 suites / **949
tests** (+8) + 28 guard tests; `expo export` iOS, Android and web passed; `npm run test:mobile:e2e`
**57 / 57**; `npm run test:mobile:maestro -- --platform ios` **30 / 30** in 46 min 24 s on the
owner's iPhone 18 Pro (native flow 1 in 2 min 3 s); `npm run test:scripts` 135 / 135; `npm run
audit:gate` passed. Mutations run by hand, each caught: the old `utimes` dating (the harness test),
no room for the toast, no scroll back to the end, no `showEnd` after a save, Edit card without the
card's state, and the old mapping of an ended temporary publication to Public.

Walked on the simulator with scratch Maestro flows (screenshots outside the repository; run
accounts deleted afterwards): the walks in the table. The owner's appearance (light) and text size
(Large) were not changed; the photo library holds one more fictional copy of the flow picture
(`IMG_0024`, from native flow 1): 17 copies (`IMG_0007` to `IMG_0024`, but `IMG_0014`, a reviewer's
fictional 9000 × 1200 picture). Not verifiable here: the Android run (no Android SDK on this Mac).

**Merged with free for all (2026-10-15).** `origin/main` with stage F1 ("free for all", #73:
Premium, sponsored placements, credits and donations removed; the same usage limits for everyone in
a `limits` module; V120–V123; ADR 0019) was merged into this branch (merge commit "Merge origin/main
(free for all, #73) into feature/r2-inventory-adding-cards", `ab700d7`); 11 conflicts, resolved so
that both stages' intents hold. **Code (4):** the inventory controller's description of `POST
/inventory/items` keeps R2's `conditionStated` and `askingPriceText` with F1's limit wording (the
same for every collector, unlimited until an admin gives it a number); the Inventory tab keeps R2's
header, switch and summary row (both sides had dropped the sponsored slot, and R2 had replaced
`InventorySummaryStrip` with its summary row); `screens/inventory` keeps R2's checks and F1's "no
Sponsored row" check; `screens/items` keeps R2's tests (its "plain cap" limit test already has no
plan, no Premium and no "See Premium"). Merged without a conflict: R2's `InventoryService` and
`InventoryExtensions` now take `Limits` and `LimitUsageSource` from the `limits` module (the restore
of a deleted card consumes `inventory.items.max` there), F1's `ErrorCode`, the import screens and
their tests. **Generated (4):** `docs/api/openapi.json`, the inventory service of
`packages/api-client` and `packages/shared-types` were taken from one side, then regenerated on the
merged code (`exportOpenApi`, `npm run generate:api`): 216 paths, 249 operations, 316 schemas (F1's
215 / 248 / 316 plus `POST /inventory/items/{id}/restore`). **Documents (3):** this file keeps F1's
section, then R2's, and NEXT TASK says R1, F1 and R2 are merged and R3 is next; `schema.md` lists
V120–V123, then R2's migration; the handoff says both (R2's row leaves "Not on `main`"). **Limits on
R2's screens:** a reached `inventory.items.max` on Add to inventory and Edit card reads as R2's
plain cap ("Your inventory is full: it holds at most {n} cards. Delete a card you no longer have to
add another.", the numbers from F1's `limitReachedInfo`, no plan, nothing to buy); "New binder" on
Inventory › Binders opens F1's binder form and its `LimitReachedNotice`; the Undo of a delete
refused by a full inventory fell back to the generic error and now says F1's `limitReachedMessage`
("You have used 100 of 100 inventory cards.", `b17898b`, a jest test seen failing without it). A
grep of `apps/mobile` finds no sponsored row, upgrade offer, Premium, credits or donation entry
point: only comments, the removed-route notes, the card data credit line and tests asserting their
absence.

**The migration renumbered (`461f03b`).** `main` holds V120–V123 and Flyway runs without
`outOfOrder`, so R2's `V117__inventory_price_text_restore.sql` would be refused by any database
already at V123 (the owner's dev database after pulling `main`, any deployed environment). It is now
**`V125__inventory_price_text_restore.sql`** (V124 is kept for another branch; V117–V119 stay
unused; the next migration is V126). Its content is unchanged (only its header comment says so): it
touches `inventory_item` alone, which F1 left as it was, and every Testcontainers suite migrates
through V123 then V125. The API README, `schema.md`, the R2 contract, the handoff and this file name
V125. A scratch database where an earlier R2 run applied V117 is refused by Flyway ("applied
migration not resolved locally") and must be recreated; the E2E databases are recreated by every
run.

Checks after the merge (retries off; head `b17898b`): `./gradlew spotlessCheck --rerun-tasks`
passed; `npm run test:api` passed in 3 min 28 s: **162 classes / 996 tests** + 12 catalog tests, 0
failures, 0 skipped (`FlywayMigrationIT`, `PaidFeaturesRemovalMigrationIT`, `LimitsIT`,
`SeedAccountLimitsIT` and `InventoryPhoneFormIT` included); `exportOpenApi` + `npm run generate:api`
left git clean; `npm run build -w apps/web-angular` passed, initial total **896.09 kB** (no web file
differs from `main`); `npm run test:web` 136 files / **633 tests**; web lint and `format:check`
clean; `npm run test:e2e -- --retries=0` **70 / 70** (1.2 min); mobile typecheck, lint and
`format:check` clean; `npm run test:mobile` jest **90 suites / 928 tests** + 28 guard tests (F1
deleted three billing suites, R2 replaced `itemForm`); `npx expo export` ios, android and web passed
(scratch folders); `npm run test:mobile:e2e -- --retries=0` **54 / 54** (56 s; 57 on R2 before the
merge: F1 deleted `billing.spec.ts` and added `removed-links.spec.ts`); `npm run test:mobile:maestro
-- --platform ios` on the owner's iPhone 18 Pro simulator, under the lock: **30 / 30 flows** in 45
min 32 s (native flow 1, `inventory-add-edit-undo.yaml`, and F1's `limit-reached.yaml` included);
Expo Go stopped afterwards, the simulator left light at its default text size, no file left in its
Files storage, its photo library one fictional copy of the flow picture richer (`IMG_0029`); `npm
run test:scripts` **135 / 135**; `npm run infra:validate` passed (nothing planned or applied); `npm
run audit:gate` OK. Not verifiable here: the Android run (no Android SDK on this Mac).

## Phone redesign R3: binders and deck cores (2026-10-15)

Stage R3 of the phone redesign approved by the owner on 2026-10-14
([`docs/product/specs/2026-10-14-phone-redesign.md`](docs/product/specs/2026-10-14-phone-redesign.md),
sections 3, 7, 12 "Binders and deck cores", 13 to 17): mockup screens 16 (the deck core page), 17
(Inventory › Binders) and 18 (Edit binder, also New binder), and the API that the deck core rows of
Search › Binders (screen 14) and the map's state card need, so that stage R5 only builds screens.
Branch `feature/r3-binders-deck-cores`, cut from the head of stage R2 (#74). One migration,
**V126**; every API change is additive (the paused web builds and passes every check against the
regenerated client, unchanged: no file of `apps/web-angular` changed). Free for all (stage F1): no
sponsored row, upgrade offer or price for a feature; a reached `binders.max` keeps F1's plain
message. The tab bar keeps today's six tabs until R5.

**A deck core is a binder sold as one bundle.** It needs no cards: photos, one price and a note are
enough; the cards its owner puts in it are its key cards.

**What a collector can now do on the phone**

- **See their binders** (Inventory › Binders, screen 17): "{n} binders · {n} deck cores" (the deck
  cores part dropped at 0, and "1 deck core" alone when there are only deck cores) with "+ New
  binder"; the deck cores first (their first photo, the name, "{n} photos · Public", the purple tag
  "Deck core · {price}" in a purple frame), then the binders (a fan of three card pictures, the
  name, "{n} cards · Public" or "· Private"); the tip "Selling a whole deck? Turn on “Sell as a deck
  core” in a binder. Photos, a price and a note are enough."; "Reorder" (the binder order of M7)
  under the tip. The listings-paused banner stays above. A row opens Edit binder.
- **Make or edit a binder** (Edit binder and New binder, screen 18): Name; Who can see it (Private
  | Public, with the card form's hints: "Only you see it until you make it public." or "Collectors
  in {region} can find it.", or why nobody can); the card "Sell as a deck core" ("Photos, one price
  and a note") with its purple switch: when it is on, Photos "{n} / 4" with "Add" (library or
  camera, the item photo rules, location data removed), Asking price (40 characters, "$180 or Trade
  only", exactly as typed), Public note (500, "What's in it, condition, language", with a counter);
  a private deck core says "Buyers can only find a deck core when it is public." (amber in dark);
  turning the switch on makes the binder public (as the mockup does; it can be set back to Private).
  The dashed section "Key cards · optional" ("Helps buyers find it when they search a card.") or
  "Cards inside" ("No cards in this binder yet."), with "+ Add cards" (pick from your inventory, a
  sheet with checkboxes) and the cards listed with a × to take one out. Everything is saved with
  "Save changes" (disabled, "No changes yet", until a change; "Create binder" on New binder until it
  has a name): the fields, the cards moved in or out, then the photos; a save also confirms the
  binder is still available. Back on Inventory › Binders: "Saved · {name}". A photo that failed
  keeps its "Try again" (New binder then opens Edit binder on it). "Delete binder" asks in a sheet
  ("Delete {name}?", "Its photos, price and note go away. Your cards stay in your inventory.", a red
  "Delete binder", "Keep it"; a plain binder says only "Your cards stay in your inventory."); "Binder
  deleted · {name}". A stale or hidden binder shows "Still available". An eye button opens the
  binder's public page while it is public.
- **See a deck core as buyers do** (the deck core page, screen 16): the photos full width (360 pt,
  swipe or the page dots, "1 / 3"; the card pictures, or "No photos yet", without photos), the back
  button over them; the purple tag "Deck core", the game in capitals, the name and the price in Sora
  24; the seller row (avatar, handle, "{province} · {n} public binders", opens the profile); the
  note; "Key cards" as chips "{card} ×{n}" (a chip opens today's card page; "Who has this card" is
  R5's); "Report"; the fixed button "Message {handle}", which opens or reuses the chat with the
  seller **without a pinned card** (the chat subject is R4's). The owner sees "Edit binder" instead.
- **Open a plain public binder** in the new look: the back bar, the name in Sora, "{n} cards ·
  {games} · Updated …", the same seller row, the note, "Search this binder", its public cards,
  "Report" and a fixed "Message {handle}". The availability filter left with "Available for" (R2).

**What the API does** (V126; contract [`docs/api/contracts/r3-binders-deck-cores.md`](docs/api/contracts/r3-binders-deck-cores.md))

| Part | What |
| --- | --- |
| Binder columns | `sells_as_core` (default false), `asking_price_text` (≤ 40, trimmed, one line) with `asking_price` + `currency` (CAD) parsed by `common/AskingPriceText` as for cards, `sold_at` (a sold binder is never public, nor its cards: `PublicVisibilityRules.binderListed`); `description` is the deck core's note (the API keeps its 1 000) |
| Owner writes | `POST` / `PATCH /binders` take `sellsAsCore` and `askingPriceText`; `PATCH … confirm: true` confirms like `POST …/confirm` |
| Photos | `binder_image`; `POST /binders/{id}/images` (multipart, the item photo processor: JPEG / PNG / WebP by content, 8 MB, EXIF and GPS stripped, at most 4: 409) and `DELETE /binders/{id}/images/{imageId}`, owner only (404 otherwise); the files go with the photo, the binder and the account; rate-limited 60 an hour. The route lives in the inventory module (`BinderPhotoController`, the dependency points from inventory to binders); the write takes the owner lock, then the binder row |
| Showcase | owner and public responses gain `sellsAsCore`, `askingPriceText`, `photos`, `previewImages` (a deck core's first photo, else up to 3 card pictures) and `keyCards [{cardId, name, quantity}]` (a deck core's cards, every printing together, most copies first, at most 30; in public views every live card of the public deck core, whatever its own visibility: review fix 1); `PublicBinderResponse.ownerPublicBinderCount`; owner responses also `askingPrice`, `currency`, `soldAt` |
| Public lists | a public deck core shows without cards: a collector's binders, search, the map, the profile's binder count |
| Search (for R5) | `excludeDeckCoreItems` on `/search/card-holders`; `GET /search/deck-cores?cardId=&region=&limit=3`; `deckCore` on `/search` (binders) and on the state binders, `q` there too; binder text matches the owner's handle and a deck core's card names; **new** `GET /regions/{region}/binders` (the whole region); `deckCoreCount` / `deckCoreTotal` on `/regions/{region}/binder-counts` (`binderCount` counts deck cores too) |
| Seed | collector2's public deck core "Moth Queen core" ($95, three key cards, no photo) |
| Privacy | `GeoPrivacyContractTest.deckCoresCarryThePlaceOnly`: the deck core page, its key cards, the deck cores of a card, binder search and the lists filtered to deck cores, the map's counts — a state and a country, never a city or a private note |

**Decisions, and why**

1. **Photos, price and note are kept when the switch goes off** (turning it on again brings them
   back); public views show them for a deck core only. Deleting the binder removes them ("Its
   photos, price and note go away").
2. **Turning "Sell as a deck core" on makes the binder Public**, as the mockup's switch does; the
   collector can choose Private again and the hint then says buyers cannot find it.
3. **Everything of Edit binder is saved with "Save changes"**, cards and photos included (screen 18:
   "Save changes (disabled until a change)"), as Edit card saves its photos (R2 decision 11):
   nothing moves until the button, and a mistake can be left unsaved.
4. ~~The cards added to a deck core become public~~ — **replaced by review fix 1**: no card is
   ever made public to put it in a deck core; a public deck core shows every live card in it as a
   key card whatever the card's own visibility, and the card's own visibility alone decides whether
   it is listed on its own (see "Review fix 1" below). Said in the picker: "Buyers see them when the
   deck core is public."
5. **A public deck core counts as a public binder** everywhere (lists, map, profile count); the map
   keeps `binderCount` as every public binder and adds `deckCoreCount`, so the web's map stays as it
   was and R5's state card says "{binderCount − deckCoreCount} binders · {deckCoreCount} deck cores".
6. **A region-wide binder list** (`GET /regions/{region}/binders`, not in the spec's list): Search ›
   Binders without a state (the chip's ×, "back to the whole region") needs it, and `/search`
   requires a text.
7. **Binder text search also matches handles** (spec section 8: "It matches binder names, handles
   and, for deck cores, their key cards") on `/search` and the lists: the paused web's binder search
   finds a collector's binders by their handle too (additive).
8. **Key cards are capped at 30** in responses, most copies first (the chips of a page; a core of
   60 cards rarely holds more than 20 different ones).
9. **`excludeDeckCoreItems` is not passed by the phone yet**: today's card holders screen has no
   "Also in a deck core" banner, and leaving the core's cards out without it would hide the core
   from a buyer who searches its card. R5 passes it with the banner.
10. **The owner opens a binder on Edit binder** (`binders/[id]` and the rows), and its public page
    from the eye button; the publications "1 hour / 24 hours" of the paused web are not offered on
    the phone any more (Private | Public, as R2 did for cards); a running temporary publication
    reads Public, an ended one Private.
11. **The plain public binder gets the fixed "Message {handle}"** of the deck core page (restyled
    "to this look"), and loses the availability filter (R2 removed "Available for" from the phone).
12. **The deck core page's back button and the public binder's carry the header back button's id**
    (`BackButton`), so the native flows go back the same way on every screen.
13. **New tokens** `deckCore.surface` (#1A1720 dark, #FAF7FF light) and `deckCore.border` (#4C3D74
    dark, #C4B5FD light): the mockup's card and row colours, mobile-only like the deckCore family.
14. **"Delete binder" of a plain binder** says only "Your cards stay in your inventory." (the spec's
    sentence names photos, a price and a note, which a plain binder does not show).
15. **The light theme's amber hint** ("Buyers can only find a deck core when it is public.") is
    drawn in ink with an amber icon: the amber reads under 4.5 : 1 on the light background.
16. **Avatar initials no longer grow with the text size** (they overflowed their circle at the
    largest size; a fix of the shared `Avatar`).

**The defaults of section 16 this stage applies:** 6 (a sold deck core is hidden: `sold_at` makes
a binder and its cards not public; selling it is R4's). Default 1 (dark on a new install) is R1's
and every R3 screen follows it.

**The API that R5 will use:** `GET /search/deck-cores` ("Also in a deck core", at most 3),
`excludeDeckCoreItems=true` on the card holders, `GET /search?types=binders&deckCore=` with `q`,
`GET /regions/{region}/subdivisions/{code}/binders` and `GET /regions/{region}/binders` with
`deckCore` and `q`, `deckCoreCount` on the binder counts; every binder row carries `sellsAsCore`,
`askingPriceText`, `previewImages` (the 56 pt photo or the fan) and the owner's handle and province.

**What changed on the phone**

| Part | What |
| --- | --- |
| Inventory › Binders (17) | `src/features/binders/InventoryBinders.tsx`, `BinderRows.tsx` (`OwnBinderRow`, `CardFan`, `CoreThumb`, `DeckCoreTag`); the Binders side of `app/(tabs)/inventory.tsx` |
| Edit binder / New binder (18) | `BinderEditor.tsx`, `BinderCardsSection.tsx`, `CardPickerSheet.tsx` (replaces `AddItemsSheet`), `binderForm.ts`, `binderUiStore.ts`; `app/binders/edit.tsx`, `new.tsx`, `[id].tsx`; `VisibilityToggle` exported from `CardFormFields`, `CardPhotos` with an optional hint and test id |
| Deck core page (16) | `DeckCorePage.tsx`, `PhotoPager.tsx`, `SellerRow.tsx` |
| Public binder | `PublicBinderView.tsx` restyled |
| Copy | `binderCopy.ts` (one object per screen) |
| Hooks | `useApplyBinderPhotoChanges` in `src/api/hooks/binders.ts` |
| Tokens | `deckCore.surface`, `deckCore.border` (`packages/design-tokens`, synced) |
| Removed | `OwnBinderView`, `BinderForm`, `BinderRow`, `AddItemsSheet` |
| Tests | jest `screens/binders` (rewritten, 26), `features/binderForm` (13), `screens/inventory` (Binders), `theme/tokens`; Playwright `binders.spec.ts` (rewritten: a deck core with a photo, a price and a key card; a buyer's page and Message; a plain binder; the limit; a public binder), `search-segments.spec.ts` (the seller row); Maestro native flow 2 `deck-core.yaml` (new), `binder-create-add-item.yaml` and `limit-reached.yaml` on the new screens, `scripts/check-binder.js` (new), `scripts/create-collector.js` (`PLACE`, `DISCOVERABLE`) |

**Checks** (retries off, the real numbers; this Mac, 2026-10-15, the owner's iPhone 18 Pro simulator
under the lock)

| Check | Result |
| --- | --- |
| `cd apps/api && ./gradlew spotlessCheck --rerun-tasks` | passed |
| `npm run test:api` | passed in 3 min 26 s: **166 classes / 1013 tests** (+4 classes, +17 tests: `DeckCoreIT` 6, `DeckCoreSearchIT` 3, `DeckCoreRulesTest` 3, `PublicPriceTest` 1, `InventoryLockOrderIT` +3 cases, `GeoPrivacyContractTest` +1, `SeedDataRunnerIT` counts) + 12 catalog tests in 2 classes, 0 failures, 0 skipped |
| `./gradlew exportOpenApi` + `npm run generate:api` | committed (`2af38a33`), git clean afterwards (again at the end) |
| `npm run build -w apps/web-angular` | passed, initial total **896.09 kB** (no web file changed: `git diff 3cb9c930 -- apps/web-angular` is empty) |
| `npm run test:web`, web `lint`, `format:check` | passed: 136 files / **633 tests** against the regenerated client; lint and format clean |
| `npm run test:e2e -- --retries=0` | **70 / 70** (1.2 min) |
| `npm run typecheck -w apps/mobile`, `lint`, `format:check` | clean (lint: 0 warnings) |
| `npm run test:mobile` | passed: jest **91 suites / 950 tests** (+22: `features/binderForm` 13, `screens/binders` rewritten to 27, `screens/inventory`, `theme/tokens`) + 28 guard tests |
| `npx expo export --platform ios / android / web` | all three passed (into the scratch folder) |
| `npm run test:mobile:e2e -- --retries=0` | **56 / 56** (56.8 s) on the final tree. The first full run was 54 / 56: two mistakes of the new `binders.spec.ts` ("New binder" is also the empty state's button; "azure" matches two cards of the seed binder), fixed in the spec. One later run was 55 / 56: `map.spec.ts` checks that collector2's profile says no "away", and the seeded reference "Friendly and shipped right away." (stage R1) fails it whenever the ratings load before the check (a race of S1's test with R1's seed, not of R3); the check now looks for distance wording only ("km", "miles away", "away from you"), then the spec alone 3 / 3 and the suite 56 / 56 |
| `npm run test:mobile:maestro -- --platform ios` | **31 / 31** in 47 min 34 s on the owner's iPhone 18 Pro (native flow 2 `deck-core.yaml` in 2 min 2 s; `binder-create-add-item.yaml` and `limit-reached.yaml` on Edit binder; every other flow unchanged). Run on the tree of `ebd44a6d`; after it came only New binder's failure path (`f0cee700`, covered by jest), the documents and the map spec of the mobile web suite |
| `npm run test:scripts` | **135 / 135** |
| `npm run audit:gate` | passed (the two allowlisted advisories, expiring 2026-11-30) |

Mutations run by hand, each caught: the card holders without the deck core exclusion
(`DeckCoreSearchIT`), a photo upload that skips the owner lock (`InventoryLockOrderIT`,
`BINDER_PHOTO_ADD`), no `sold_at` rule (`DeckCoreIT`, `DeckCoreSearchIT`).

**The walk on the simulator** (scratch Maestro flows and a scratch setup on the isolated stack:
a fictional seller in Quebec with a deck core "Snake-Eye core" — two photos, "$180", a note, four key
cards — and three plain binders, and a buyer in Ontario; screenshots kept outside the repository,
compared with the mockup's screens 16, 17 and 18): in dark and in light at the default text size,
then in dark at the largest accessibility size (the launch argument of
`subflows/relaunch-large-text.yaml`): Inventory › Binders, Edit binder of the deck core (top and
bottom), the delete sheet, the deck core private (the amber hint), the switch off ("Cards inside"),
Edit binder of a plain binder, New binder, the deck core page (photo 1 and 2) and the plain public
binder as the buyer. The screens match the mockup in order, wording, colours and sizes; the
differences are the decisions above (Reorder under the tip, the eye button of Edit binder, Report on
the deck core page, the cards listed in the dashed section). Found during the walk and fixed:
"0 binders · 1 deck core", the avatar initials overflowing their circle and the seller's handle cut
to one line at the largest size, the amber hint in light. Native flow 2 passed on its own before
the suite (1 min 59 s), and so did the three changed flows (binder, limit, map). The walk's two
accounts were deleted from the Auth emulator afterwards; the owner's text size (Large) and
appearance (light) were put back and are as they were.

**Could not be verified:** the Android run (no Android SDK on this Mac; the flows keep their
Android steps, `subflows/pick-newest-photo.yaml`'s Android branch was never run); the camera ("Take a
photo" of a deck core: the simulator has none, jest only); VoiceOver on a real iPhone (the page
dots' names and the adjustable photo pager are covered by jest and the accessibility tree only);
the deck core sold (`sold_at` is set by stage R4; R3 covers it with SQL updates in the tests).

**Known gaps, by design or for a later stage**

- Finding a deck core in Search › Binders › Deck cores and on the map's state card is stage R5's
  (native flow 2 says so); so is "Also in a deck core" on the one card page with
  `excludeDeckCoreItems`. Marking a deck core sold, and the chat pinned to it, are R4's.
- The collectors section of search counts in a marker's `publicBinderCount` only the binders that
  hold a public card (a deck core without cards is not counted there until R6 reworks profiles).
- The anonymous map counts (cached 60 s, cleared by a binder's publication events) follow the
  switch of a binder that is already public within those 60 s: turning "Sell as a deck core" on or
  off publishes no event (signed-in counts are live).
- Each run of native flow 2 adds one more copy of the fictional photo to the simulator's photo
  library (`xcrun simctl addmedia` has no undo), as native flow 1 does.
- In light, the app's orange under white text or as text reads under 4.5 : 1 (R2's known gap,
  unchanged).

**Owner follow-ups:** confirm decisions 2 (the switch makes the binder Public), 4 as replaced by
review fix 1 (a public deck core shows all its cards as key cards, the cards keep their own
visibility), 6 (the region-wide binder list) and 9 (`excludeDeckCoreItems` waits for R5's banner);
whether a deck core with no cards should still say "{n} photos" on Inventory › Binders when it has
no photo either ("0 photos · Public"); whether the seller should pick a deck core's game (review
fix 1, U7: a core without cards names no game).

**Review fix 1 (2026-10-15).** Two independent reviewers (a functional verifier; a product and UX
reviewer as a collector, on the owner's iPhone 18 Pro) found 3 blockers, 4 major and 7 minor
findings; all fixed at their cause, with a test that catches each, or recorded:

| Finding | Fix |
| --- | --- |
| U2 / F1 (blocker): the cards picked into a deck core were made PUBLIC and stayed listed one by one after a take-out or "Delete binder" | **The core decides what buyers see**, the card's own flag decides its own listings: new SQL rule `InventoryItemRepository.IN_PUBLIC_CORE` (a live card — not deleted, game active, not HIDDEN — filed in an effectively public, unsold deck core of a listed owner) and `SHOWN_PUBLICLY` (= `LISTED` or `IN_PUBLIC_CORE`), used for a public core's key cards, its games, its card pictures (catalog images only), the card names of binder search (`q`), the binder search's `game` filter and `GET /search/deck-cores`. `LISTED` alone still decides the card holders, public item lists, `itemCount`, covers and item photos. The phone no longer sends `SET_VISIBILITY PUBLIC`: a card taken out, or left by a deleted core, or in a core whose switch is off, is as private or public as its collector made it. No new write (no new lock case) and no migration. Tests: `DeckCoreIT.theCardsOfADeckCoreKeepTheVisibilityTheCollectorGaveThem`, jest (a move only, take-out a move only, delete sends no bulk), Playwright `binders.spec.ts` (two private cards: key cards, take-out, delete — still private), Maestro `deck-core.yaml` (`scripts/check-card.js`: private in the core and after the delete) |
| U1 / F4 (major): a binder's private cards were invisible to buyers once it became a deck core, while Edit binder called them key cards | the same rule: `DeckCoreIT` (a private binder of private cards turned into a public deck core shows them as key cards, its game, `GET /search/deck-cores`, never in the card holders or the core's public item list) |
| F2 (blocker): a stale Edit binder (opened again from the deck core page) kept old values with "Save changes" on and wrote the old price back | Edit binder follows a binder saved elsewhere: each field not touched here takes the new value (`rebaseBinderForm`, render-time), so it reads "No changes yet" and a save sends only what changed here; the deck core page opened from Edit binder (`from=edit`) goes back to it instead of opening a second one. Jest (two editors of one core; the page's "Edit binder" goes back) |
| F3 (major): the deck core page kept the old price after a save, and "Delete binder" landed on the deleted core's page | binder writes refresh `['public','binders',id]`, bulk moves refresh every public binder page, a delete removes the deleted binder's public queries and dismisses to Inventory › Binders (`router.dismissTo`). Jest, Playwright (the page shows $150 after a save; after the delete Inventory › Binders and no deck core page), Maestro |
| F5 (major): no test kept `q` from matching cards buyers do not see | the rule changed with U2 (a public core's private card is now a key card, so its name finds the core — the page shows it anyway); `DeckCoreSearchIT` now asserts in `/search`, the Quebec list and the region list that `q` never matches a plain binder's private card, a deleted core card, a core card hidden as stale, or a core whose switch is off (the mutation "any live item" is caught) |
| F6 (minor): no test kept deleted cards out of the owner's key cards | `DeckCoreIT.theOwnersKeyCardsLeaveOutADeletedCardUntilItIsRestored` (mutation M4 caught) |
| F7 (minor): photos picked, then the switch turned off, were still uploaded | photo additions and removals apply only while the switch is on (kept for when it is turned on again). Jest |
| U3 (minor): deck cores read "Collection · 0 cards" in the map's state list and on a profile | those rows show the deck core's first photo and the tag "Deck core · {price}" (no card count) until R5 and R6 rebuild them. Jest (place, collector) |
| U4 (minor): Reorder listed the binders in another order than Inventory › Binders | the sheet lists "Deck cores" first, then "Binders", and moves a binder inside its group. Jest |
| U5 (minor): today's holders screen lists a deck core's cards one by one | **recorded as an R5 acceptance item** (NEXT TASK): R5 passes `excludeDeckCoreItems=true` on Who has this card together with "Also in a deck core". After U2 only cards their collector made public themselves can show there |
| U6 (minor): "Public note" broke mid-word beside its counter at the largest text size | the label row wraps (the counter goes under the label), the label shrinks by words. Jest (styles) and the walk at the largest size |
| U7 (minor): a deck core without public cards never named its game | with U2 the game comes from every card of a public core; a core without cards names none (recorded; the owner may want a game picker, follow-up above) |

Also found and recorded: a private card filed in a public deck core still reads "Only you see it
until you make it public." on Edit card, while buyers see its name and copies as one of the core's
key cards (the item response does not say its binder is a deck core; for R5, which reworks the card
side of deck cores). Fixed in review fix 2 (R1-1) from the binder list the card form already has. Mutations run by hand on the fixed tree, each caught: key cards from listed
cards only, `q` matching any live card of a core, `q` matching listed cards only, the deck cores of
a card from listed cards only, the public games from listed cards only, the owner's key cards
counting deleted cards (API); the phone's flip back to PUBLIC (jest and Playwright), no form
rebase, no public page refresh, no removal of a deleted binder's page, back instead of dismiss,
photos uploaded with the switch off, the label's `flex: 1`, `from=edit` ignored (jest).

**Checks after review fix 1** (retries off; this Mac, 2026-10-15, the owner's iPhone 18 Pro
simulator under the lock)

| Check | Result |
| --- | --- |
| `cd apps/api && ./gradlew spotlessCheck --rerun-tasks` | passed |
| `npm run test:api` | passed in 3 min 25 s: **166 classes / 1015 tests** (+2: `DeckCoreIT` 8) + 12 catalog tests, 0 failures, 0 skipped |
| `./gradlew exportOpenApi` + `npm run generate:api` | descriptions only (key cards, preview pictures, the deck cores of a card), committed; git clean afterwards |
| `npm run build -w apps/web-angular` | passed, initial total **896.09 kB**; no file of `apps/web-angular` changed |
| `npm run test:web`, web `lint`, `format:check` | 136 files / **633 tests**; lint and format clean |
| `npm run test:e2e -- --retries=0` | **70 / 70** (1.2 min) |
| `npm run typecheck -w apps/mobile`, `lint`, `format:check` | clean |
| `npm run test:mobile` | jest **91 suites / 960 tests** (+10) + 28 guard tests |
| `npx expo export --platform ios / android / web` | all three passed (into the scratch folder) |
| `npm run test:mobile:e2e -- --retries=0` | **56 / 56** (57.2 s) |
| `npm run test:mobile:maestro -- --platform ios` | **31 / 31** in 47 min 52 s on the owner's iPhone 18 Pro (native flow 2 `deck-core.yaml`, now with the edit and the delete, in 2 min 25 s) |
| `npm run test:scripts` | **135 / 135** |
| `npm run audit:gate` | passed (the two allowlisted advisories, expiring 2026-11-30) |

The walk after the fix (Maestro on the owner's iPhone 18 Pro): native flow 2 alone (2 min 26 s:
the page's "Edit binder" back to Edit binder, $150 on Inventory › Binders and on the page, "Delete
binder" landing on Inventory › Binders, the card private in the core and after the delete), and
Edit binder of collector2's "Moth Queen core" at the largest text size ("Public note" on one line,
"124 / 500" under it), with a temporary flow file deleted afterwards. The owner's appearance
(light) and text size (Large) were not changed.

**Review fix 2 (2026-10-15).** The second review round (a functional verifier on the owner's iPhone
18 Pro, with mutations of the new SQL rule over the whole suite) found 3 major and 3 minor findings;
each is fixed at its cause with a test that catches it (every fix below was reverted once and the
named test failed):

| Finding | Fix |
| --- | --- |
| R1-2 (major): no test kept a plain public binder's private cards out of its games, its card pictures and the binder search's game filter (dropping `b.sells_as_core` from `IN_PUBLIC_CORE` survived all 1015 tests) | the behaviour was right; the rule now has its test: `DeckCoreSearchIT.aPlainBinderShowsBuyersNoGamePictureOrGameHitOfItsPrivateCards` files a private Pokémon card in a plain public binder: buyers get no `pokemon` game, one picture (the public card's) and no `game=pokemon` hit; "Sell as a deck core" on brings all three, off takes them away |
| R1-3 (major): at the largest text size the "Add cards" picker showed no card and no "Add {n} cards", and Reorder no binder, with Cancel off the screen (the text above their lists filled the sheets) | at large text sizes the picker's search field and hint scroll with the cards (above them at the default sizes, as before); Reorder's description scrolls with the binders and its two buttons wrap; the buttons under these lists follow the text size as far as the app's other pinned controls (`PINNED_MAX_FONT_SCALE`) and a sheet's title as far as a screen's title (`TITLE_MAX_FONT_SCALE`). Jest at a font scale of 3.1; native flow 2 now opens both sheets at the largest size (the card and "Add 1 card"; both binders, Cancel and "Save order"). The delete sheet's message was already in a scrolling area (`ConfirmSheet`): the rest of the sentence is a scroll away and its buttons stay on screen, so it is unchanged |
| R1-4 (major): "Delete binder" in an Edit binder opened through the binder's own link (`/binders/[id]`: a profile row, a chat card, a deep link) landed on "This binder is not available" | the delete took the binder out of the owner's list first, and `/binders/[id]` swapped Edit binder for the public view before Edit binder could close the binder's screens. The delete mutation has a key, and `/binders/[id]` keeps Edit binder while this app deletes that binder (`useDeletingBinder`): it lands on Inventory › Binders from every entry. Jest, Playwright (the plain binder is deleted from `/binders/{id}`), native flow 2 (deleted from the deck core's row on Profile › Public preview) |
| R1-1 (minor): a private card in a public deck core read "Only you see it until you make it public." while buyers see it as one of the core's key cards | the hint under "Who can see it" (and the item's visibility note) says "Buyers see it as a key card of “{core}”. It is not listed on its own." while the card's binder is a deck core buyers see (`shownAsDeckCore`: "Sell as a deck core" on and `effectivePublic`, the phone's mirror of `IN_PUBLIC_CORE`), and keeps "Only you" for a private or sold core, a plain binder or a card hidden until confirmed. Unit tests |
| R1-5 (minor): two terms of the rule had no test: an inactive game in a core, and the game filter counting a core's private cards | `DeckCoreIT.aCardOfAHiddenGameLeavesAPublicCoresKeyCards` (a game of its own, hidden by SQL as an admin would, takes its card out of the core's key cards and games) and the R1-2 test (the game filter finds a core of a private card, and no longer once the switch is off) |
| R1-6 (minor): after "Save changes" the owner's profile row (and a state list) kept the old price | creating, saving, publishing, confirming, deleting, reordering a binder and changing a deck core's photos also mark out of date this viewer's collector reads, the region map (counts and state lists) and search (`refreshBinderListings`, not awaited by the save). Jest (every write and the delete), native flow 2 (the profile row shows a price saved from the Edit binder it opens) |

Mutations, each caught: in the API `IN_PUBLIC_CORE` without `b.sells_as_core`, without the active
game, and the binder search's game filter on listed cards only (the three that survived round 1);
on the phone `/binders/[id]` without the delete flag (jest and Playwright), the picker never in its
large layout, Reorder's buttons not wrapping, a sheet title not capped, no collector refresh, no
region map refresh, the key card hint never shown or shown for a card hidden as stale (jest). No API
code, migration or contract changed in this round (no OpenAPI diff); no file of `apps/web-angular`
changed.

**Checks after review fix 2** (retries off; this Mac, 2026-10-15, the owner's iPhone 18 Pro
simulator under the lock)

| Check | Result |
| --- | --- |
| `cd apps/api && ./gradlew spotlessCheck --rerun-tasks` | passed |
| `npm run test:api` | passed in 3 min 29 s: **166 classes / 1017 tests** (+2) + 12 catalog tests, 0 failures, 0 skipped |
| `./gradlew exportOpenApi` + `npm run generate:api` | no change; git clean afterwards |
| `npm run build -w apps/web-angular` | passed, initial total **896.09 kB**; no file of `apps/web-angular` changed |
| `npm run test:web`, web `lint`, `format:check` | 136 files / **633 tests**; lint and format clean |
| `npm run test:e2e -- --retries=0` | **70 / 70** (1.3 min) |
| `npm run typecheck -w apps/mobile`, `lint`, `format:check` | clean |
| `npm run test:mobile` | jest **91 suites / 966 tests** (+6) + 28 guard tests |
| `npx expo export --platform ios / android / web` | all three passed (into the scratch folder) |
| `npm run test:mobile:e2e -- --retries=0` | **56 / 56** (57.9 s) |
| `npm run test:mobile:maestro -- --platform ios` | **31 / 31** in 49 min 58 s on the owner's iPhone 18 Pro (native flow 2 `deck-core.yaml`, now with the largest text size, the profile row and the delete from the binder's own link, in 4 min 24 s) |
| `npm run test:scripts` | **135 / 135** |
| `npm run audit:gate` | passed (the two allowlisted advisories, expiring 2026-11-30) |

On the iPhone (native flow 2's screenshots): at the largest text size the picker shows "Add cards",
the field, the hint, then "Lantern Fox Spirit · ×1, AZR-EN011 · in Maestro core" ticked and "Add 1
card" under the list; Reorder shows "Deck cores" and "Binders" with one binder each, Cancel and
"Save order" side by side (the names are cut to one line there, as before this round: a screen
reader reads them whole); the profile row reads "Deck core · $120" right after the save; the delete
from that row's Edit binder lands on Inventory › Binders ("1 binder", "Binder deleted"). The
owner's appearance (light) and text size (Large) were not changed.

## Phone redesign R4: messages and Mark as sold (2026-10-15)

Stage R4 of the phone redesign approved by the owner on 2026-10-14
([`docs/product/specs/2026-10-14-phone-redesign.md`](docs/product/specs/2026-10-14-phone-redesign.md),
sections 10, 12 "Messaging and sales", 13 to 17): mockup screens 22 (the inbox), 23 (a chat while
buying), 24 (a chat while selling) and 25 (Mark as sold), with Settings › Shipping details.
Branch `feature/r4-messages-mark-as-sold`, cut from `main` after R3's merge (#75, `2f9c5506`). One migration,
**V127**; every API change is additive (the paused web builds and passes every check against the
regenerated client, unchanged: no file of `apps/web-angular` changed). Free for all (stage F1): no
sponsored row, upgrade offer or price for a feature. The tab bar keeps today's six tabs until R5.

**Deals happen in the chat and ship by mail** (ADR 0018): collectors agree in the chat, the buyer
sends an address and pays the seller outside the app (Interac e-Transfer), the seller ships with
tracking and marks the card sold, then both rate each other. OrenjiTrade never handles the money and
claims no protection; a sale records that two collectors agreed, nothing more.

**First, R3's leftovers** (one commit each): native flow 2 waits for the "Saved" toast to leave
before it taps the deck core's row (R2-1); bulk card changes refresh the profile rows, the map and
search (`refreshBinderListings` in `src/api/hooks/listingRefresh.ts`, R2-2); a sold deck core leaves
the Binders count, Reorder and the binder pickers (`liveBinders`, U10); the binders tip reads its
words to VoiceOver, not the icon's glyph (U8, on the screen R4 touches through the deck core).

**What a collector can now do on the phone**

- **See their chats** (Messages, screen 22): the title "Messages", "Live" and the round bell; rows
  with the avatar and its online dot, the handle, the time ("now", "2 min", "1 h", "Yesterday",
  "Mon", "Sep 28"), the last message ("You: " before theirs, a sale worded for the reader, an old
  offer as "Offer (no longer available)") and, on the right, the picture of the card or the deck
  core photo the chat is about. Unread chats are bold with an orange time and an orange dot; muted
  ones keep the muted icon. Empty: "No messages yet" and "Find a card in Search and message its
  owner." with "Open search". The Inbox | Community switch shows only while the `publicChat` flag is
  on (it is on in the local seed, off in the mockup). The tab's badge counts the unread chats.
- **Open a chat** (screens 23 and 24): back; the avatar, the handle and "Online · {province}" or
  "{province}" (never a city), which opens the profile; "⋯" with Rate {handle} (when a rating is
  due), Mute, Archive, Report {handle} and Block {handle} in red. Under it the **pinned bar**: the
  card's picture, name and "{code} · {rarity}" with its price on the right (buying: the bar opens the
  card's page, or the deck core page), or "{code} · {price} · your card" with a teal **Mark as
  sold** (selling), "Deck core" for a deck core, **Sold** after a sale and **No longer listed**
  (no price) once it is private, deleted or sold elsewhere. A **safety tip** with a shield at the
  top of the chat: buying "Check their rating before you send an e-Transfer, and ask for
  tracking.", selling "Ship after the e-Transfer arrives, and add the tracking number when you mark
  it sold.", a chat without a card "Agree on the price and shipping here. Check ratings before you
  send an e-Transfer." Bubbles: orange on the right, dark (light: warm grey) on the left, line
  breaks kept, day separators, the time under each group with "· Sent" or "· Seen"; shared cards
  (picture, name, code, price), binders and photos.
- **Send with one tap** (quick replies, in one sideways row above the message box): buying "Is it
  still available?", "How much with shipping?" until the seller has written, then "e-Transfer
  sent!", "Tracking number?", "Thanks!"; selling "Yes, still available", "Send me your address" until
  the seller has written, then "Got your e-Transfer", "Shipped!", "Thanks for buying!". A reply sent
  once in the chat (that exact text) is hidden.
- **Share from "+"**: buying "Send my address", selling "Send my e-Transfer email" (both in a chat
  without a card), each "Saved on this phone only"; then "Send a photo", "Share a card from your
  inventory" (one of the collector's own cards, with its price: the chat is about it from then on),
  "Share a binder", "Cancel". The first time, the address (several lines) or the email or phone
  number is asked in a sheet and **kept only on the phone** (`expo-secure-store`, per account, this
  device only); a tap puts "Ship to:\n{address}" or "e-Transfer to {email}" into the message box,
  checked before sending; only the message sent carries it. **Settings › Shipping details** edits
  or clears both.
- **Mark a card or a deck core sold** (screen 25, the seller only): the sheet "Mark as sold?" with
  the card row ("{code} · {n} copy/copies"), "Copies sold" when there are more than one, "Tracking
  number · optional" (mono, "So {buyer} can follow the package"), "Sold to {buyer}. It was your last
  copy, so the card leaves your inventory. You can rate each other next." (or "You'll have {n}
  left."), the orange "Mark as sold" and "Not yet". Then the toast "Marked as sold" with **Undo**,
  the bar reads Sold, and a sale message both see: "You marked {card} as sold to {buyer}." /
  "{seller} marked {card} as sold to you.", "Tracking {number}" and "Rate {other}" (the rating of the
  sale, kind Sale). The copies leave the inventory (at 0 the card leaves it and its binder; a deck
  core leaves Search and its cards the inventory). Undo (the toast; the server accepts it for 10
  minutes and before anyone rated) puts back exactly what left, removes the message, the rating
  right and the buyer's notification: "Sale undone. It is back in your inventory."
- **Be told as the buyer**: the in-app notification "{seller} marked {card} as sold to you" ("Sold to
  you"), which opens the chat.
- **Message a deck core's seller with the core pinned** (the deck core page's "Message {handle}":
  R3 opened the chat without a pinned card). "Message {handle}" on a profile keeps the chat's pinned
  card.

**What the API does** (V127; contract [`docs/api/contracts/r4-messages-sales.md`](docs/api/contracts/r4-messages-sales.md))

| Part | What |
| --- | --- |
| Chat subject | `conversation.subject_item_id` / `subject_binder_id` (at most one, `SET NULL`), `subject_set_at`, `subject_set_by`; `POST /conversations {recipientId, subjectItemId?, subjectBinderId?}` pins the recipient's public card or deck core, or the caller's own (404 private, deleted or sold, 400 both or a third collector's); without one the pin stays; `GET /conversations/{id}` (new); `ConversationSummary.subject` (`kind`, `id`, `ownerId`, `name`, `printingCode`, `rarity`, `cardId`, `printingId`, `imageUrl`, `askingPriceText` — null for the buyer while not listed —, `sold`, `listed`, `copies` for the owner) |
| Sharing one's own card | `CARD_LINK` with `inventoryItemId` (the caller's live card; payload `item {itemId, ownerId, askingPriceText, rarity}`); it becomes the subject, visible with its price to the other collector even while private |
| Participants | `ConversationParticipant.place` (state or province and country) while that collector is discoverable; `LastMessage.systemTopic` (`OFFER`, `SALE`) and `sale` |
| Sales (`deals` module) | `sale` table; `POST /conversations/{id}/sales {quantity?, trackingNumber?}` → 201 `SaleResponse` (the seller only: 403 for the buyer, 409 `CONFLICT` without a subject, 409 `NOTHING_LEFT_TO_SELL`, 400 quantity or tracking); `POST /sales/{id}/undo` (the seller, 10 minutes: 409 `SALE_UNDO_CLOSED`; before a rating: 409 `SALE_ALREADY_RATED`; repeated: the undone sale) |
| Effects of a sale | the copies leave (`InventorySales`; at 0 a soft delete restorable for 10 minutes with its photos, R2's `restorable_until`); a deck core gets `sold_at` and its cards soft-deleted the same way; a `SALE` interaction; a SYSTEM message `sale:<id>:SOLD` with a neutral body (no tracking number), read for the seller; the buyer's `SALE_RECORDED` notification; the undo reverses each |
| Ratings | `InteractionKind.SALE` (subject type `SALE`; V127 replaces the two check constraints); `POST /ratings` holds its interaction `FOR KEY SHARE`, the undo takes it `FOR UPDATE` then checks for a rating |
| Export and purge | export section `deals`; an account purge deletes its sales (the other collector keeps the chat's message) |
| Locks | a sale and its undo: `BinderService.lockOwners`, binders, items, ascending, `FOR NO KEY UPDATE` (`InventoryLockOrderIT`: `SALE`, `SALE_UNDO`, `DECK_CORE_SALE`, `DECK_CORE_SALE_UNDO`); a pin holds the item or binder `FOR KEY SHARE` before it writes the conversation row |
| Privacy | `GeoPrivacyContractTest.chatSubjectsAndSalesCarryThePlaceOnly`: the participants, the subjects, the sale message and the sale — a state and a country, never a city; tracking numbers only for the two collectors; the saved address and e-Transfer email never stored by the API |

**Decisions, and why**

1. **The pin is the latest card or deck core opened from a listing or shared by its owner** (default
   8); "Message {handle}" from a profile keeps it, so a chat about a card is not unpinned by a visit
   to the profile.
2. **A card its owner shares in the chat stays visible to the other collector, with its price,
   while it is live**, even private (spec: "Sharing a private card shows it to that person only");
   anything else is shown to the buyer without a price once it is not listed ("No longer listed").
3. **"Sold" means a sale in this chat made at or after the card was pinned** (`subject_set_at`):
   a card sold, undone, or pinned again later is not shown as sold by an older sale.
4. **A sale reuses R2's 10-minute restore** (`restorable_until`, photos kept until the purge job):
   the undo puts back the same card with its copies, binder, visibility, price, note and photos,
   not a new one. The window is the same constant as R2's (not an admin setting).
5. **The undo is never refused by `inventory.items.max`** (the copies were there minutes ago), and
   it is refused (409 `SALE_UNDO_CLOSED`, nothing undone) when the card's binder was deleted since; a
   card restored by hand in the meantime is not put back twice.
6. **A deck core sells as one** (quantity 1); its cards leave with it and come back with an undo.
7. **The sale message is read for the seller and unread for the buyer**; its body is neutral and
   carries no tracking number (other clients, the paused web, show it); the phone words it per side.
8. **The buyer's notification is not configurable** (in-app only, like system notices).
9. **The "Sold" flag comes from the `deals` module through an interface of `messaging`
   (`ChatSaleStatus`)**, so messaging never depends on deals (deals depends on messaging, inventory,
   binders, ratings and notifications).
10. **A tracking number is letters, digits, spaces, dots and dashes, at most 64**, trimmed and with
    inner spaces collapsed; it is seen by the two collectors only.
11. **The province in the status line comes from the participant's place, shown only while they
    are discoverable** (ADR 0017: never a city).
12. **The saved address and e-Transfer email are kept per account** in the phone's secure storage
    (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`; the Expo web build used by the end-to-end suite keeps them in
    the browser's storage); "Clear" in Settings › Shipping details removes them.
13. **A chat without a card shows no quick replies** (the spec lists replies for buying and selling
    only) and both saved details in "+".
14. **The tab badge counts unread chats**, as the inbox's dots do (it counted messages).
15. **The toast is R2's** (dark, "Undo" in orange), and the undo is offered from it only; the
    server accepts it for 10 minutes.
16. **New tokens**: the mobile-only `chat` family (the pinned bar, the other collector's bubble, the
    sale message's teal surface, border, text, tracking box, label and button, the Sold tag), dark and
    light.
17. **At the largest text sizes** the + sheet's rows, the chat menu's actions and the saved
    detail's field scroll with their last buttons in reach; the message box grows up to twice its
    size; the inbox row puts the time under the handle; "Live" and the bell's count stay within the
    header (found in the walk, fixed in `881cf0ba`, `4c1ccb0c` and `94ad9ab5`).
18. **The chat names the other collector by handle** (the top bar, the "⋯" rows, the block
    confirmation "Block {handle}?" and its toasts), as the mockup does; the display name stays on
    the profile.

**The defaults of section 16 this stage applies** (the owner may change them): 3 (the saved
address and e-Transfer email stay on the phone and go into the message box to be checked before
sending), 4 (a sale can be undone for 10 minutes, and only before anyone has rated it; R2's 10
minutes for a deleted card stay), 6 (a sold deck core is hidden and its cards leave the inventory),
8 (one chat per pair of collectors; the latest card or deck core opened becomes its pinned card), 10
(the quick reply wording of section 10).

**What changed on the phone**

| Part | What |
| --- | --- |
| Inbox (22) | `InboxView.tsx` (rows, thumbnails, times, unread), `app/(tabs)/messages.tsx` (its own header), `SubjectThumb.tsx`, `messageText.ts` (sale and offer previews, unread chats) |
| Chat (23, 24) | `ThreadHeader.tsx` (top bar and "⋯"), `PinnedBar.tsx`, `MessageBubble.tsx`, `ThreadMessageList.tsx`, `LinkCards.tsx`, `MessageComposer.tsx` (quick replies, "+"), `OwnCardPicker.tsx`, `messageDraft.ts`, `app/messages/[id].tsx` |
| Mark as sold (25) | `MarkSoldSheet.tsx`, `SaleMessage.tsx`, `useMarkSold` / `useUndoSale` in `src/api/hooks/messaging.ts` |
| Rules and copy | `dealRules.ts` (side, quick replies, + rows, pinned line, status line, sale sentences, tracking, inbox times), `chatCopy.ts` |
| Shipping details | `src/features/shipping/savedDetails.ts`, `SavedDetailSheet.tsx`, `app/settings/shipping.tsx`, the Settings link |
| Elsewhere | the deck core page pins the core; ratings of kind Sale; the `SALE_RECORDED` notification opens the chat; `BottomSheet` rises above the keyboard (`avoidKeyboard`); the `chat` tokens |
| Tests | jest `screens/conversation` (+ "Deals in the chat", 11), `screens/messages-tab`, `screens/shipping-details` (new), `features/dealRules` (new), `features/chatSafetyTip`, `api/messaging`, `notifications`, `settings`, `tabs-layout`, `binders`; Playwright `deals.spec.ts` (new: as the seller and as the buyer), `messages`, `blocked`, `map`, `ratings`, `safety-notice` specs on the new chat; Maestro native flow 4 `deal-mark-sold.yaml` (new) and flow 3 `deal-deck-core-chat.yaml` (new, as far as R4 reaches), `scripts/deals.js` (new) |

**Checks** (retries off, the real numbers; this Mac, 2026-10-15, the owner's iPhone 18 Pro simulator
under the lock)

| Check | Result |
| --- | --- |
| `cd apps/api && ./gradlew spotlessCheck --rerun-tasks` | passed |
| `npm run test:api` | passed in 3 min 40 s: **169 classes / 1041 tests** (+3 classes, +24 tests: `ChatSubjectIT` 7, `SaleIT` 8, `SaleRulesTest` 4, `InventoryLockOrderIT` +4 cases, `GeoPrivacyContractTest` +1) + 12 catalog tests in 2 classes, 0 failures, 0 skipped |
| `./gradlew exportOpenApi` + `npm run generate:api` | committed (`d97d81ce`), git clean afterwards (again at the end) |
| `npm run build -w apps/web-angular` | passed, initial total **896.09 kB** (no web file changed: `git diff 2f9c5506 -- apps/web-angular` is empty) |
| `npm run test:web`, web `lint`, `format:check` | passed: 136 files / **633 tests** against the regenerated client; lint and format clean |
| `npm run test:e2e -- --retries=0` | **70 / 70** (1.3 min) |
| `npm run typecheck -w apps/mobile`, `lint`, `format:check` | clean |
| `npm run test:mobile` | passed: jest **93 suites / 1001 tests** (+2 suites, +35 tests: `features/dealRules` and `screens/shipping-details` new, `screens/conversation` +11 with "Deals in the chat", `screens/messages-tab`, `api/messaging`, `features/chatSafetyTip`, `notifications`, `settings`, `tabs-layout`, `api/catalogInventoryHooks`, `features/binderForm`, `screens/inventory`, `screens/binders`) + 28 guard tests |
| `npx expo export --platform ios / android / web` | all three passed (into the scratch folder) |
| `npm run test:mobile:e2e -- --retries=0` | **58 / 58** (1.0 min; +2: `deals.spec.ts`) |
| `npm run test:mobile:maestro -- --platform ios` | **32 / 33** in 53 min 3 s on the owner's iPhone 18 Pro, on the final app code (`94ad9ab5`): native flow 4 `deal-mark-sold.yaml` (1 min 31 s) and flow 3 `deal-deck-core-chat.yaml` (1 min 8 s) passed, and so did every chat flow (inbox and thread, rating, safety tip, community). The one failure was `blocked-users.yaml`, which still expected the block confirmation to name the display name ("Block Ben Maestro?"); R4's chat names collectors by handle ("Block {handle}?", the spec's menu row), so the flow now expects the handle (`03526c60`) and passed alone (1 / 1, 1 min 4 s). No app code changed after the run |
| `npm run test:scripts` | **135 / 135** |
| `npm run audit:gate` | passed (the two allowlisted advisories, expiring 2026-11-30) |

**The walk on the simulator** (scratch Maestro flows on the isolated stack, on the owner's iPhone 18 Pro
under the lock; per run a fictional seller in Quebec with "Lantern Fox Spirit" at "$32" and a buyer
in Ontario; screenshots kept outside the repository, compared with the mockup's screens 22 to 25):
in dark and in light at the default text size, then in dark and in light at the largest
accessibility size (the app's own theme setting and the launch argument of
`subflows/relaunch-large-text.yaml`): the inbox as the seller and as the buyer, the chat selling
(24) and buying (23), the "+" sheet of each side, the address asked the first time, Mark as sold
(25) with a tracking number, the toast with Undo, the sale message for the seller and for the
buyer, the buyer's notification and the chat it opens. The screens match the mockup in order,
wording, colours and sizes; the differences are the decisions above (R2's toast, the Inbox |
Community switch while the local flag is on) and the tip's place (known gaps). Found at the largest
size and fixed, each with a jest test: the "+" sheet's Cancel off the screen, the inbox handle held
small beside a huge last message, "Live" and the bell's count outgrowing the header (`881cf0ba`);
the Mark as sold card row hiding the tracking number behind the buttons (`4c1ccb0c`); the saved
address sheet's hint pushing its field out of view (`94ad9ab5`). Found, not R4's: the notification
centre's "Mark all as read" and "Preferences" grow without bound at the largest size (M4's screen,
recorded for R6, which moves Settings behind the gear). Native flows 3 and 4 passed alone after each
fix (2 / 2 in 2 min 43 s). The walk's accounts (36, twelve runs) were deleted from the Auth
emulator; the owner's appearance (light) and text size (Large) were not changed.

**Could not be verified:** the Android run (no Android SDK on this Mac; the new flows keep no
Android-only step); VoiceOver on a real iPhone (the accessibility names are covered by jest and the
native flows' labels); the secure storage on a real device (the simulator's keychain only); push
notifications (the buyer's notice is in-app only, by the spec); a real Interac e-Transfer
(OrenjiTrade never handles the money).

**Known gaps, by design or for a later stage**

- "I have it" (Home and profiles, spec section 10) is R6's and R7's; the API it needs is here
  (`CARD_LINK` with `inventoryItemId` pins the sharer's card).
- "Message" on the rows of Who has this card is R5's (the holder rows have no Message button today);
  native flow 3 therefore starts on a deck core page (a link) and stops at the pinned card, the
  buying tip and the address.
- The safety tip sits under "This is the beginning of your conversation…" and above the first day
  separator (the mockup shows it at the top of the chat, the same place in a new chat).
- A seller who never wrote in the chat still gets "Yes, still available" and "Send me your
  address" after a sale (the spec's rule: until you have replied).
- In light, the app's orange under white text or as text reads under 4.5 : 1 (R2's known gap,
  unchanged); the sale message's teal reads above 4.5 : 1 in both schemes.

**Owner follow-ups:** confirm decisions 2 (a private card shared in the chat shows its price to that
collector), 3 (Sold only for a sale after the pin), 13 (no quick replies in a chat without a card),
14 (the tab badge counts chats) and the tracking number format (10); whether the 10-minute undo
should become an admin setting with R2's; whether the seller's quick replies should change after a
sale.

### Review fix 1 (2026-10-16)

Two independent reviewers (a privacy and safety lens, and a functional verifier who ran the API
attack scripts, the stress soak and the walk on the owner's iPhone 18 Pro) found two blockers, two
major and ten minor findings. Each is fixed at its cause with a test that would have caught it (the
ones checked by putting the defect back are listed under the checks), one commit each; nothing was
widened. No migration: V127 stays as it was.

- **F1 (blocker) Mark as sold sold the chat's current subject, not the card the seller saw.** The
  buyer could pin another listing (a deck core page's Message) without writing; the seller's bar did
  not follow (no push, and every message copied the inbox's older subject into the chat), and the
  sale took the deck core. Now `POST /conversations/{id}/sales` takes the optional `subjectItemId` /
  `subjectBinderId` the sheet shows and answers **409 `SUBJECT_CHANGED`** (new error code) when it is
  no longer the chat's subject, before the copies are checked and with nothing sold; the web, which
  names nothing, is unchanged. Every pin is pushed to both collectors on the new realtime queue
  `/user/queue/conversations` `{conversationId}`; the phone reads the conversation again on it (and
  after a reconnection), a message patches only the last message, archived and unread count of the
  conversation's own entry, and the chat is read again whenever it opens. The sheet keeps the card it
  opened with and sends it; on 409 it closes, says "{handle} opened another of your listings. Check
  the card above, then mark it sold." and the bar shows the new subject. (`6e75703d`, `e40f6b95`;
  `SaleIT` re-pins between the look and the sale, `RealtimeIT` receives the push, jest
  `conversation` and `messaging` cover the refusal, the push and the cache.)
- **F2 (blocker) The "Marked as sold" toast and its Undo were drawn under the keyboard** when the
  seller had used the message box (spec flow 4's order): iOS gave the keyboard back to the box when
  the sheet closed. Mark as sold now dismisses the keyboard first; the toast rises above the iOS
  keyboard (Android resizes the window for it, as the sheets assume); dragging the thread puts the
  keyboard away. Native flow 4 keeps the keyboard up through send and Mark as sold instead of hiding
  it. (`d375f76b`; jest `ui` and `conversation`.)
- **F3 (major) A sold deck core kept its `binders.max` slot** although the phone hides it and cannot
  delete it: the count now leaves sold cores out (an undo may pass the cap, like every undo).
  (`e395ed7a`; `SaleIT` sells a core, then creates binders up to the cap.)
- **P1 (major) "Tracking numbers never in the logs" had no test.** `SaleIT` runs every path that
  receives one (card and deck core sales, a refused number, a refused quantity, an undo, a refused
  undo) under output capture and checks the logs, the outbox (`event_publication`) and the
  notifications; `GeoPrivacyContractTest` checks its sale's number in the logs. Both fail when
  `SaleService` logs it. (`3739a3f8`)
- **F4** The undo of an older sale after a later sale (another chat) took the last copies put the
  copy into the deleted card: the card now comes back with the older sale's copies and the later sale
  is marked as not having taken the last copies, so its own undo adds its copies back
  (`ebfc0e0c`; `SaleIT`, `InventoryLockOrderIT` case `SALE_UNDO_BEFORE_LATER_SALE`).
- **F5, F6** Pinning the chat's card again (the seller sharing it, the buyer opening it again) now
  counts from that pin: Mark as sold comes back for the copies left after a partial sale, and a card
  its owner shares is listed for the buyer even when it is private (`e22f516d`; `ChatSubjectIT` +2).
- **F7** A deck core without photos keeps its picture once sold: the first card its sale took
  (`e2290a4f`; `SaleIT`, bar and inbox for both).
- **F8** Mark as sold with several copies shows "Copies sold" once (the Stepper drew a second), and
  that label, the stepper's value and the tracking label follow the text size as far as the card
  row, which keeps the tracking field in view at the largest size (`8196baaa`; jest at font scale 3.1).
- **F9** The chat's words for a refused undo (`SALE_UNDO_CLOSED`, `SALE_ALREADY_RATED`) and a refused
  sale are tested (`2281537e`).
- **F10** Every sale can be rated, but a seller's summary (average and count) counts only the newest
  sale rating each buyer gave: a pair cannot stack ratings through many one-copy sales; every rating
  stays listed (`b94b7ad8`; `SaleIT`). A default for the owner to confirm.
- **F11** The quick reply chips, "+", send and "Rate {other}" reach 44 pt touch targets through hit
  slop, without changing how they look (`64f5f97c`; jest measures each).
- **P2** The ten fixed quick replies, sent exactly, skip the repeated-content threshold (one seller
  answering six buyers "Yes, still available" was flagged); rate limits and banned terms still apply
  (spec section 13). The API's list (`messaging.domain.QuickReplies`) is kept equal to the phone's by
  a jest test (`cde86721`; `ModerationIT`).
- **P3** The saved address and e-Transfer email are deleted from the phone with the account's
  deletion request; a sign-out leaves nothing of them in memory (the secure storage keeps them,
  keyed by account, for the next sign-in) (`a91fe44e`; jest `settings`, `session`).

Not changed (nits of the reviews, outside the findings of this round): the saved-detail hint's
wording once sent, "Delete from this phone" without a confirmation, the withdrawn sale message pushed
to a buyer blocked after the sale, Mark as sold offered on a deck core switched off after the pin
(the error then names a card), a public deck core's key card pinnable alone, "Is it still
available?" offered after a sale, `isUndoneSale` unused, Inter's contextual "3×5" in handles, and the
two `wip(...)` commit subjects of the builder.

**Checks of review fix 1** (retries off, the real numbers; this Mac, 2026-10-16)

| Check | Result |
| --- | --- |
| `cd apps/api && ./gradlew spotlessCheck --rerun-tasks` | passed |
| `npm run test:api` | passed in 3 min 57 s: **169 classes / 1052 tests** (+11: `SaleIT` +6, `ChatSubjectIT` +2, `RealtimeIT` +1, `ModerationIT` +1, `InventoryLockOrderIT` +1 case) + 12 catalog tests in 2 classes, 0 failures, 0 skipped |
| `./gradlew exportOpenApi` + `npm run generate:api` | committed with F1 (`6e75703d`); git clean afterwards |
| `npm run build -w apps/web-angular` | passed, initial total **896.09 kB** (no web file changed) |
| `npm run test:web`, web `lint`, `format:check` | passed: 136 files / **633 tests** against the regenerated client; lint and format clean |
| `npm run test:e2e -- --retries=0` | **70 / 70** (1.4 min) |
| `npm run typecheck -w apps/mobile`, `lint`, `format:check` | clean |
| `npm run test:mobile` | passed: jest **94 suites / 1010 tests** (+1 suite `features/quickRepliesServer`, +9 tests) + 28 guard tests |
| `npx expo export --platform ios / android / web` | all three passed (into the scratch folder) |
| `npm run test:mobile:e2e -- --retries=0` | **58 / 58** (1.1 min) |
| `npm run test:mobile:maestro -- --platform ios` | **33 / 33** in 52 min 27 s on the owner's iPhone 18 Pro (under the lock), native flow 4 `deal-mark-sold.yaml` in its new order (the keyboard up through send and Mark as sold; 1 min 30 s) |
| `npm run test:scripts` | **135 / 135** |
| `npm run audit:gate` | passed (the two allowlisted advisories, expiring 2026-11-30) |

**Walked on the simulator** (scratch Maestro flows on the suite's kept stack, a fictional seller in
Quebec with "Lantern Fox Spirit" at "85% TCG", 3 copies, and a deck core at "$150", and a buyer in
Ontario driven through the API): the buyer pins the deck core without writing and the seller's bar
follows at once; the seller writes in the box, sends with the keyboard up and taps Mark as sold: the
sheet shows the deck core, the keyboard is put away, the toast shows with its Undo above the message
box and Undo works; with the sheet open on the deck core the buyer pins the card: Mark as sold
answers "{buyer} opened another of your listings. Check the card above, then mark it sold.", the bar
shows the card and nothing was sold (the API: 3 copies, the core unsold); the card's sheet with 3
copies shows "Copies sold" once. Dark, default size; the owner's appearance (light) and text size
(Large) were not changed; the walk's two accounts were deleted.

**Could not be verified:** the Android run (no Android SDK on this Mac; the toast relies on Android
resizing the window for the keyboard, as the sheets do).

Every fix was also checked by putting its defect back: the tracking number logged (P1: both tests
fail), the old `setSubject` and no subject check (F1, F5, F6: four tests fail), the binder count, the
undo and the sold core's picture (F3, F4, F7: three `SaleIT` tests fail), the repeated-content
exemption ignored (P2), the inbox's copy written over the conversation and the pin push ignored on
the phone (F1: two jest tests fail), the Rate button's hit slop removed (F11).

**Owner follow-ups of this round:** F10 (one counted sale rating per pair, the newest) and P2 (the
fixed quick replies exempt from the repeated-content threshold) are defaults to confirm; F5 means a
buyer opening the same card again re-arms Mark as sold.

### Review fix 2 (2026-10-16)

A second review round (a functional verifier who ran the API attack scripts and the stress soak
again, put the defect of every fix back, and walked the fixes on the owner's iPhone 18 Pro) found
every finding of round 1 fixed except F11 in part, no blocker and no major finding, and two minor
findings. Each is fixed at its cause with a test that would have caught it, one commit each; nothing
was widened, and there is no migration and no API change.

- **R1-1 Nothing tested that the Mark as sold sheet keeps the card it opened with.** With the
  freeze removed (`setSaleSubject` when the sheet opens), the sheet follows the live subject and
  sells it, and every jest test still passed: the F1 test changed the subject without reading the
  chat again while the sheet was open. A new jest test pushes a pin on `/user/queue/conversations`
  while the sheet is open: the bar under it follows the deck core, the sheet still shows the card
  ("SVX-001 · 3 copies" and its stepper) and the sale names `subjectItemId` (the server answers
  `SUBJECT_CHANGED`). With the freeze removed, the test fails (the sheet shows "Deck core").
  (`df4de8ce`)
- **R1-2 The quick reply chips were still 38 pt to the finger.** Their 5 pt hit slop reached
  outside the sideways row, which padded the 34 pt chips by 2 pt only, and iOS (Fabric) drops a
  touch outside a scroll view's frame before it reaches a chip: taps 4 pt above or under a chip sent
  nothing. The row now pads 5 pt above and under the chips (44 pt tall) and takes the room back
  with a negative margin, so it looks and sits as before. The jest test checks that the row holds
  the chips' slop, is 44 pt tall and keeps its 2 pt around the chips; it fails with the old padding.
  (`c0abb279`)

Not changed (outside the findings of this round): the verifier's nit R1-3 (the `SUBJECT_CHANGED`
toast says "Check the card above" when the new subject is a deck core) and the nits listed under
review fix 1.

**Checks of review fix 2** (retries off, the real numbers; this Mac, 2026-10-16)

| Check | Result |
| --- | --- |
| `cd apps/api && ./gradlew spotlessCheck --rerun-tasks` | passed |
| `npm run test:api` | passed in 3 min 58 s: **169 classes / 1052 tests**, 0 failures, 0 skipped, + 12 catalog tests in 2 classes |
| `./gradlew exportOpenApi` + `npm run generate:api` | nothing changed (no API change); git clean afterwards |
| `npm run build -w apps/web-angular` | passed, initial total **896.09 kB** (no web file changed) |
| `npm run test:web`, web `lint`, `format:check` | passed: 136 files / **633 tests**; lint and format clean |
| `npm run test:e2e -- --retries=0` | **70 / 70** (1.2 min) |
| `npm run typecheck -w apps/mobile`, `lint`, `format:check` | clean |
| `npm run test:mobile` | passed: jest **94 suites / 1011 tests** (+1, R1-1) + 28 guard tests |
| `npx expo export --platform ios / android / web` | all three passed (into the scratch folder) |
| `npm run test:mobile:e2e -- --retries=0` | **58 / 58** (60 s) |
| `npm run test:mobile:maestro -- --platform ios` | **33 / 33** in 52 min 30 s on the owner's iPhone 18 Pro (under the lock), native flow 4 `deal-mark-sold.yaml` in 1 min 34 s |
| `npm run test:scripts` | **135 / 135** |
| `npm run audit:gate` | passed (the two allowlisted advisories, expiring 2026-11-30) |

**Walked on the simulator** (scratch Maestro flows on the suite's kept stack, a fictional seller in
Quebec and a buyer in Ontario who asked about her card, default text size): the quick reply row is
now 44 pt tall ([0,740]–[402,784], 38 pt before) while the chips and "+" sit where they did (chips
745–779, "+" from 790, as the verifier measured). Taps 4 pt above "Yes, still available", 4 pt
under "Shipped!" (the verifier's dead spot) and 4 pt above "Thanks for buying!" each sent their
reply; a tap 7 pt above a chip, outside its slop, sent nothing. The owner's appearance (light) and
text size (Large) were not changed; the walk's two accounts were deleted.

**Could not be verified:** the Android run (no Android SDK on this Mac; the chips' touch targets
there were not measured on a device).

## Phone redesign R5: search (2026-10-16)

Stage R5 of the phone redesign approved by the owner on 2026-10-14
([`docs/product/specs/2026-10-14-phone-redesign.md`](docs/product/specs/2026-10-14-phone-redesign.md),
sections 3, 4, 8, 12 "Search, wishlist and recent searches", 13 to 16): mockup screens 11 (the
map), 12 (typing a card), 13 (Who has this card), 14 (Binders) and 15 (Wishlist), version 43 for
the looks and the copy. Branch `feature/r5-search`, cut from `main` at b92710cf (R1, F1, R2, R3, R4
and the owner's inventory change of 2026-10-16). **No migration** (V128 stays free); every API
change is additive: the paused web builds and passes its checks against the regenerated client,
unchanged (no file of `apps/web-angular` changed). Free for all (stage F1): no sponsored row, no
upgrade offer, no price for a feature; the wishlist's usage line shows only near the cap.

**What a collector can now do on the phone**

- **Four tabs**: Search | Inventory | Messages | Profile (Home comes with R7 as the first of five).
  The bell is top right on Search, Inventory and Messages (and in Profile's header); Messages keeps
  its unread badge. The Map tab is Search's default view, the Wishlist tab its Wishlist segment.
- **Search's map** (screen 11): the title "Search" with the bell, the segments Cards | Binders |
  Wishlist ({n} wishes), the field "Card name or code, like LOB-EN001", then the M9 region map
  shaded by public binders with the region pill top left, "My province" (the declared state or
  province, never a device location) and zoom + / − on the right, and the legend "Public binders"
  (None, 1, 2–4, 5–9, 10+). The map opens centred on the collector's province with its card:
  the state and its country ("Canada · your province"), "{n} binders · {n} deck cores" (only the
  parts above 0; "No public binders here yet"), "See binders" (Search › Binders on that state) and
  a close button. A tap (or a hold) on any state opens its card. Browsing another region says "Not
  your region. Back to {home}" under the field. No Filters button. With a screen reader the map is
  replaced by the list of states and provinces (a row opens its binders).
- **Typing a card** (screen 12): the focused field with Clear and "Cancel"; with no text the
  recent searches of this phone (up to 8, "Clear", "Only you see your searches. You can turn this
  off in Settings › Privacy."); while typing the game chips (All games, then the catalogue's games:
  the only filter, the card filters sheet is gone) and the cards with their picture, the name with
  the typed part highlighted and the game; under them "Collectors" (at most 3: avatar, handle,
  state or province) when the text matches a collector's handle or name. "No card matches “{text}”"
  with the hint. A card opens Who has this card, a collector their profile.
- **Who has this card** (screen 13), the one card page (the card detail and the holders list are
  gone; `/cards/<id>` links, `/holders` links and notification links land on it): back and "Add to
  wishlist" / "On your wishlist" (teal; adding makes an "Any printing" wish without terms, taking it
  off asks first); the picture, the game in capitals, the name and "Check TCGplayer price" (the
  browser, TCGplayer's own search); "Any printing ▾" (a sheet of "{code} · {rarity}" that filters
  the rows); "Also in a deck core" ("{core} · {handle} · {province} · {price}", at most 3, each opens
  the deck core page); then the holders grouped by province — "{province} · your province" first,
  then the other provinces of the country, then the rest of the region, the newest listing first
  in each — with the handle (opens the profile), "{code} · {rarity}", the price as typed, "×{copies}"
  and a round Message button that opens or reuses the chat with that card pinned. No card text,
  type line, market price, filters or counts. Empty: "Nobody in {region} lists this card yet." with
  the wishlist button. The picture's provider credit stays at the bottom (ADR 0015).
- **Search › Binders** (screen 14): "Deck, binder or collector, like Yubel" (binder names, handles,
  a deck core's key cards), the state chip from the map ("Quebec" with ×, back to the whole region)
  or "Pick on the map", "Binders | Deck cores"; deck core rows (the 56 pt photo, the name, the
  handle, the price) and binder rows (a fan of 3 cards, the name, "{handle} · {n} cards"), the
  state or province added to the line when the whole region is listed; the three empty texts.
- **Search › Wishlist** (screen 15): "Tell me when someone in my region lists one" (the account-wide
  wishlist alert, the same setting as Settings › Notifications), "Add a wish" (the card search,
  then the S2 wish form), the wishes with their picture, name and terms ("Any printing · NM only ·
  100% TCG", "TN19-EN013 · NM only") and on the right "Available" (opens Who has this card on the
  wished printing) or "None yet"; a row edits the wish, and the edit screen now has "Remove from
  wishlist" (asked first). "{used} of {limit} wishes" only from 80 % of the cap.
- **Settings › Privacy**: "Remember my searches" (on by default; off clears this account's recent
  searches on this phone and stops them), and "Let others see what you want" (now only there).

**What the API does** (contract [`docs/api/contracts/r5-search.md`](docs/api/contracts/r5-search.md))

| Part | What |
| --- | --- |
| Collectors while typing | **new** `GET /search/collectors?q=&region=&limit=3` → `[CollectorByName]`: discoverable collectors of the region who allow name search, handle or display name containing the text (no fuzzy match), never the caller nor a blocked collector (in SQL, before the limit); no analytics event |
| Who has this card | `sort=province` on `/search/card-holders`: own province, own country by province name, rest of the region by country and province name, freshest first inside (`ProvinceOrder`) |
| Wishlist "Available" | `available` on `GET /wishlist` items (home region) and **new** `GET /wishlist/availability?region=` → `{region, available: [id]}`; the alert's fit (NM only, not stated condition), a card listed or in a public deck core, fresh, a discoverable collector of the region, not the wisher, no block; **one grouped query** |
| Hardening | the collectors section of `GET /search` leaves blocked collectors out in SQL before the limit (viewer-keyed discovery cache); search analytics events carry no search text (only its length) |
| Privacy | `GeoPrivacyContractTest.searchOfStageR5CarriesPlacesOnly` |

**Decisions, and why**

1. **"Available" is teal** (the accent), as both mockups draw it (v32 and v43; v43 wins on looks);
   the prompt's text says orange. Orange stays the colour of actions on these screens.
2. **"Available" uses the wishlist alert's fit**: a Near Mint only wish is not available for a
   played copy, a condition not stated fits (default 5), so the alert and "Available" never
   disagree. A card of a public deck core counts (Who has this card shows the core in its banner);
   the copy must be fresh (ACTIVE or AGING).
3. **The region of "Available" has its own endpoint** (`GET /wishlist/availability?region=`):
   adding a parameter to `GET /wishlist` changed the generated Angular `listWishlist()` signature,
   which the paused web calls positionally (`listWishlist('body', …)`): the web build would break.
   `available` on `GET /wishlist` is the home region's; the phone asks the browsed region.
4. **Collectors while typing are a new endpoint** (`GET /search/collectors`), not `/search?types=
   collectors`: that section lists the holders of a card instead of collectors when the text is an
   exact card name or code. Substring matches only (trigram similarity brought unrelated collectors
   for card names), never the caller, no analytics event.
5. **Between province groups, the order is by name** (the country's, then the province's) inside
   each tier: predictable to scan, and nothing else (no distance, no count) may order them.
6. **While typing, the first page of cards (24) and then "Collectors"**, no endless list: typing
   narrows the cards, and the collectors stay a short scroll away.
7. **The map opens on the collector's province with its card** (v43's first state), centred a
   little above the middle so the card covers no part of the province; tap and hold both open a
   state's card (the hold's name callout of M9 is gone); "Show the whole region" is gone, zoom −
   reaches it. A collector without a declared province (or browsing another region) gets the
   region's first view, no card and no "My province".
8. **Screen readers get the list of states and provinces instead of the drawn map** (as M9 did by
   default); a row opens Search › Binders on that state. The "Map | List" switch and its saved
   preference are gone (the app store's version 7 drops it).
9. **"Not your region. Back to {home}" stays** (M9) under the field: the pill over the map has no
   room for it.
10. **No location prompt on the map** (the mockup has none); Search › Wishlist keeps its prompt
    (alerts need a location) and Settings › Location is where it is chosen.
11. **The card page has no "Add to inventory"** (the mockup has none; Inventory › Add cards does it)
    and no region switcher (Search's applies); the provider credit of the picture stays at the
    bottom (ADR 0015). Its empty text names the region browsed ("Nobody in Americas (North) …").
12. **"On your wishlist" asks before it removes** the card's wishes (they may carry terms set in
    Wishlist); the wish's edit screen gained "Remove from wishlist" (the Wishlist tab's remove left
    with its cards).
13. **Search › Binders rows name the owner's province only when the whole region is listed** (v43:
    in a state the chip already says where).
14. **Old routes**: `/` and `/wishlist` stay as hidden routes of the tabs that redirect into Search
    (only while they are the screen on display; Search is the tabs' first route); `/holders` and
    `/regions/<region>/<code>` replace themselves one turn later (a Redirect in the same turn broke
    the web history). `/` alone opens Search without parameters, so the sign-in gate never
    remembers it as a link to reopen (it took a new collector out of the onboarding).
15. **Recent searches are one list per account** (the per-segment lists of M7 are dropped with the
    segments), and "Remember my searches" is per account on the device.
16. **The Wishlist tab shows its count, 0 included** ("Wishlist 0").
17. **The wishlist alert switch now really saves**: the phone's `PUT /me/settings/notifications`
    never sent `wishlistAlerts` (the API keeps the stored value when it is absent), so the switch
    of Settings › Notifications did nothing; found here because Search › Wishlist shows the same
    setting.

18. **At large text sizes the rows stack** (from a system text size of 1.3, `useStackedRows`): a
    holder's price and copies under the handle, a deck core's price under its name, a wish's
    "Available" or "None yet" under the card, and Search › Wishlist's alert sentence under the bell
    and the switch. Beside a second column, the walk at the largest size found handles and names
    broken in the middle of a word ("leo_ / uzm / b", "someon / e").
19. **At large text sizes the map keeps its smallest height (380 pt)** and the state card stands
    under it (F4 of the build): the card's top shows without scrolling and a finger on the card
    scrolls the page, since a map zoomed in on the province keeps a finger for itself (M9's rule).
20. **The map opens on the province even when the location answers after the map was drawn**
    (the view starts over once the province is known): the walk at the largest size found it on
    the whole region when the location came second.

**The defaults of section 16 this stage applies:** 2 (recent searches stay on the phone, no server
history; "Remember my searches" on by default), 7 (the card search also lists matching collectors),
8 (one chat per pair; "Message" on a holder row pins that card, the latest one winning: R4's `POST
/conversations` with `subjectItemId`) and 9 (TCGplayer's search of the game, `/search/all` for a game
it has no category for). Default 1 (dark on a new install) is R1's and every R5 screen follows it;
default 5 (a not-stated condition fits a Near Mint only wish) also decides "Available".

**What changed on the phone**

| Part | What |
| --- | --- |
| Tabs | `src/navigation/tabs.ts` (four tabs, `HIDDEN_TAB_ROUTES`), `app/(tabs)/_layout.tsx` (Search first, the hidden `index` and `wishlist`), `app/(tabs)/index.tsx` and `wishlist.tsx` (redirects into Search while on display), `src/navigation/DeferredRedirect.tsx` (`/holders`, `/regions/…`), `backTitles.ts`, `src/account/pendingLink.ts` |
| Search (11, 12) | `app/(tabs)/search.tsx` (header, segments, the map or the card search, a link's state), `src/features/search/SearchField.tsx`, `SearchMap.tsx` (the map, its state card, the legend, the screen reader list), `CardTyping.tsx` (game chips, highlighted results, Collectors, recent searches), `highlight.ts`, `searchCopy.ts`, `searchLinks.ts`, `searchSegments.ts`; `features/map/RegionMap.tsx` (tap and hold pick a state, zoom buttons on the right), `mapWindow.ts` (the window on a province), `places.ts`, `MapLegend.tsx`; `features/regions/RegionBar.tsx` (the pill, `RegionAwayNote`) |
| Who has this card (13) | `app/cards/[id].tsx`, `src/features/cards/WhoHasThisCard.tsx`, `HolderRow.tsx`, `holderGroups.ts`, `printingOptions.ts`, `tcgplayer.ts` |
| Binders (14) | `src/features/search/BindersSegment.tsx`, `features/binders/binderCopy.ts` |
| Wishlist (15) | `src/features/search/WishlistSegment.tsx`, `features/wishlist/WishEditor.tsx` (Remove), `wishlistLabels.ts`, `WishlistNotices.tsx`, `app/wishlist/edit.tsx` |
| Data | `src/api/hooks/search.ts` (`useCollectorsByName`, `sort=province`), `wishlist.ts` (`useWishlistAvailability`), `notifications.ts` (sends `wishlistAlerts`), `regionMap.ts`, `queryKeys.ts`, `types.ts`, `realtime/RealtimeCacheSync.tsx` |
| Settings and stores | `app/settings/privacy.tsx` + `privacyOptions.ts` ("Remember my searches"), `features/catalog/recentSearchesStore.ts` (one list per account, the switch), `RecentSearches.tsx`, `store/useAppStore.ts` (version 7: the Map / List preference dropped) |
| Large text | `src/theme/stackedRows.ts` (`useStackedRows`, from a text size of 1.3) in `HolderRow`, `BindersSegment` and `WishlistSegment`; `SearchMap` (the card under a 380 pt map above the overlay's size); `RegionMap` (the view starts over once the province is known) |
| Removed | `features/search/UnifiedResults.tsx`, `SearchResultRows.tsx`, `catalog/CardFiltersSheet.tsx`, `catalog/cardSearch.ts`, `holders/HolderFiltersSheet.tsx`, `holders/HolderRow.tsx`, `holders/holderFilters.ts`, `map/PlaceBinderRow.tsx`, `wishlist/WishCard.tsx` |
| Tests | API: `CollectorsByNameIT`, `WhoHasThisCardIT`, `WishlistAvailabilityIT`, `ProvinceOrderTest` (new), `GeoPrivacyContractTest` (+1), `AnalyticsIT`; jest `screens/search` (rewritten: map, typing, segments), `screens/card-detail` (Who has this card), `screens/wishlist`, `features/searchRules` (new), `navigation/searchRedirects` (new), `features/searchSegments`, `features/notifications`, `privacy/placePrivacy`, `app/tabs-layout`, `app/auth-gate`, `screens/settings`, `store/useAppStore` (the replaced `screens/map`, `place`, `holders`, `search-segments` and `features/cardSearch` suites are gone with their screens); Playwright `catalog`, `holders`, `map`, `regions`, `search-segments`, `wishlist`, `session`, `age-confirmation`, `safety-notice` on the four tabs; Maestro native flow 2 `deck-core.yaml` (finds the deck core in Search › Binders) and flow 3 `search-who-has-this-card.yaml` (new, in full: Search, a card, its holders, Message pins the card), `large-text.yaml` (the province's card under the map, the typed card opened from its game chip), every other flow on the four tabs (`holders-filters.yaml` removed with the filters); `legal-french.yaml` matches the French draft banner by its accessible name (not R5's: since Xcode 27.1, installed on this Mac on 2026-10-16 at 05:13, iOS's accessibility tree no longer lists the banner's first line apart, and the flow failed on the unchanged legal screen) |

**Checks** (retries off, the real numbers; this Mac, 2026-10-16, the owner's iPhone 18 Pro simulator
under the lock)

| Check | Result |
| --- | --- |
| `cd apps/api && ./gradlew spotlessCheck --rerun-tasks` | passed |
| `npm run test:api` | passed in 3 min 16 s: **174 classes / 1074 tests** (+16 over `main`'s 1058: `WhoHasThisCardIT`, `CollectorsByNameIT`, `WishlistAvailabilityIT` and `ProvinceOrderTest` new, `GeoPrivacyContractTest` +1, `AnalyticsIT` extended) + 12 catalog tests in 2 classes, 0 failures, 0 skipped |
| `./gradlew exportOpenApi` + `npm run generate:api` | committed with the API (`1b65c6f4`, `9d42eb16`); nothing changed when run again at the end, git clean |
| `npm run build -w apps/web-angular` | passed, initial total **896.09 kB** (no web file changed: `git diff b92710cf -- apps/web-angular` is empty) |
| `npm run test:web`, web `lint`, `format:check` | passed: 136 files / **633 tests** against the regenerated client; lint and format clean |
| `npm run test:e2e -- --retries=0` | **70 / 70** (1.2 min) |
| `npm run typecheck -w apps/mobile`, `lint`, `format:check` | clean |
| `npm run test:mobile` | passed: jest **92 suites / 1031 tests** (main: 95 / 1070; the suites of the replaced screens left with them: `screens/map`, `place`, `holders`, `search-segments`, `features/cardSearch`; new: `features/searchRules`, `navigation/searchRedirects`; rewritten: `screens/search`, `card-detail`, `wishlist`) + 28 guard tests |
| `npx expo export --platform ios / android / web` | all three passed (into the scratch folder) |
| `npm run test:mobile:e2e -- --retries=0` | **58 / 58** (1.0 min) |
| `npm run test:mobile:maestro -- --platform ios` | **32 / 33** in 50 min 5 s on the owner's iPhone 18 Pro, on the final app code (`fdca0f15`): native flow 2 `deck-core.yaml` failed once in R3's part (New binder at the largest size: iOS gave the keyboard back to the name field when the card picker sheet closed, and the tap on "Create binder" typed a space instead; not R5 code, see "Found, not R5's") and **passed alone (1 / 1, 4 min 40 s)**; native flow 3 `search-who-has-this-card.yaml` passed (1 min 5 s), and so did every Search flow. The suite before the walk's fixes ran 31 / 33 (`large-text.yaml`, `legal-french.yaml`, both fixed as told above and passed alone) |
| `npm run test:scripts` | **135 / 135** |
| `npm run audit:gate` | passed (the two allowlisted advisories, expiring 2026-11-30) |

**The walk on the simulator** (scratch Maestro flows on the isolated stack, on the owner's iPhone 18
Pro under the lock; collector1 of the seed (Quebec) and, per run, eight fictional collectors made
through the API: seven listing "Verdant Moth Queen" in Quebec (two), Ontario, British Columbia,
New York, California and Jalisco, priced "85% TCG", "Trade only", "$18", "$29", "$45", "100% TCG"
and "$20", and one in Quebec at "$1" whom collector1 blocked; collector1 wishes the card (Near Mint
only, "85% TCG") and "Starlit Unicorn"; the seed's deck core "Moth Queen core" in Ontario; the
screenshots are kept outside the repository and compared with the mockup's screens 11 to 15): in
dark and in light at the default text size, then in dark and in light at the largest accessibility
size (the app's own theme setting and the launch argument of `subflows/relaunch-large-text.yaml`):
Search's map on Quebec with its card ("2 binders", See binders), typing "moth" (the typed part in
orange), "maya" (no card, one collector), the recent searches, Who has this card (On your wishlist,
Check TCGplayer price, Any printing ▾ and its sheet, "Also in a deck core" with the Ontario core,
Quebec · your province first with the newest listing first, then British Columbia and Ontario,
then Jalisco, then the United States; the blocked collector in none of them), Search › Binders on
Quebec and on the whole region, Deck cores, Search › Wishlist (the switch, "Add a wish", "None yet"
for Starlit Unicorn, "Available" for the moth queen). The screens match the mockup in order,
wording, colours and sizes; the differences are the decisions above. Found at the largest size and
fixed, each with a jest test that fails with the defect put back: the alert sentence broken in the
middle of "someone" (`ec06601b`), the holder, deck core and wish rows breaking handles and names
(`16dbab30`), the map as tall as the page with the card under it (`b93a0e7e`), the map on the whole
region when the location answered second (`643603de`). Found, not R5's: Settings › Appearance's
theme chips do not wrap at the largest size ("Dark" is off the screen; M1's screen, recorded for
R6, which moves Settings behind the gear); on New binder at the largest size, iOS gives the
keyboard back to the name field when the card picker sheet closes, so the keyboard covers "Create
binder" (R3's screen; it made native flow 2 fail once, see the checks). The walk's 40 Auth emulator accounts (five runs) were
deleted; the owner's appearance (light) and text size (Large) were put back as they were.

**Could not be verified:** the Android run (no Android SDK on this Mac; the flows keep no
Android-only step for Search); VoiceOver on a real iPhone (the screen reader list of states replaces
the map; the names are covered by jest and the native flows' labels). (The Expo web build's crash on
an old `/regions/<region>/<code>` page, recorded here first as a browser Back issue, crashed the
phone too: fixed at its cause by review fix 1 below.)

**Known gaps, by design or for a later stage**

- Home (R7) does not exist yet: the hidden `index` route of the tabs redirects to Search; R7 makes
  it Home and points its field at `/search?typing=1`.
- Profiles and Settings behind the gear are R6's: Search's bell is the notification centre of M4
  (its "Mark all as read" and "Preferences" grow without bound at the largest size, recorded by R4).
- A single long word wider than the row (a card name such as "Emberfang" at the largest size)
  still wraps inside the word: nothing is left beside it to move.
- "Available" and the alerts count a copy whose condition was not stated as Near Mint (default 5);
  a wish's "Available" is the browsed region's, the alert the home region's.
- The deck core banner lists at most three cores and has no "more" link (the mockup has none).

**Owner follow-ups:** confirm decisions 1 ("Available" in teal, as the mockups draw it, not the
orange of the spec's text), 2 ("Available" uses the alert's fit: Near Mint only respected, a
condition not stated fits), 5 (the province groups by name after the collector's own province and
country), 6 (the first 24 cards while typing, then "Collectors"), 10 (no location prompt on the
map), 11 (no "Add to inventory" on the card page) and 18 (the rows stack at large text sizes);
decision 17 fixed a defect of Settings › Notifications (the wishlist alert switch never saved).

**Review fix 1** (2026-10-16; three independent reviewers: privacy (P1), product and UX (U1 to U4)
and a functional verifier (F1 to F5); every fix with a test that fails on the old code):

- **P1 / U1 / F1, an old `/regions/<region>/<code>` link crashed the app** (the iPhone and the web
  build alike, "Cannot read property 'find' of undefined" in the tab router), instead of opening
  Search › Binders on that state. The cause was not the redirect: Search's link named the state
  `?state=`, and React Navigation reads a route parameter named `state` as a navigator's own state.
  A link from a screen of the root stack (the old route, the sign-in gate reopening a link) hands
  its parameters to every navigator on the way, so the tabs tried to rehydrate "CA-QC". The
  parameter is now `place` (`/search?segment=binders&region=&place=`, also in the sign-in gate's
  list of links to reopen); `/` and `/wishlist` never had it, which is why they worked. Tests: a
  jest test that renders the real router (a root stack over the tabs) opens the old link and lands
  on Binders on Quebec (it threw the reviewers' error before the fix); a guard that no link target
  of Search uses a name React Navigation keeps (`state`, `screen`, `params`, `initial`, `path`);
  the phone's web-build E2E (`apps/mobile/e2e/regions.spec.ts`) follows
  `/regions/americas-south/UY-MO` inside the app (Binders on Montevideo, the Uruguayan binder
  listed); native `map-gestures-links.yaml` opens
  `/regions/americas-north/CA-QC` and `/wishlist`, and `card-holders-region.yaml` opens
  `/holders?card=<id>`. A full page load of a dynamic route is not tested on the web build: `expo
  serve` answers "Not Found" for it (no spec loads one; the phone is the product).
- **F3, a wish of any printing in one rarity opened the card page on "Any printing"**, so
  "Available" and its alert listed copies of every rarity. `GET /search/card-holders` takes an
  optional **`rarity`** (additive: exact, at most 64 characters, blank is none; rows and
  `totalItems` alike; `WhoHasThisCardIT.aRarityKeepsTheHoldersOfTheCardsPrintingsInThatRarity`,
  `SearchDomainTest`), and `/cards/<id>?rarity=` starts on "Any printing · <rarity>", a choice of
  the sheet beside "Any printing" and the printings, with "Nobody in {region} lists this card in
  {rarity} yet." when empty (an unknown rarity is ignored). The paused web's client gains the
  optional parameter only; no web file changed.
- **F4, a link to the card page already on screen kept the old printing**: the page is keyed on
  the link's card, printing and rarity, so a new link starts it again on what it names (jest:
  `printing=A`, then `any`, then `B` on the same route).
- **U3, holder rows of twin printings read alike** ("GLM-EN022 · Rare" for a 1st Edition and an
  Unlimited copy): the row adds the copy's edition or finish when it is not the usual one
  ("GLM-EN022 · Rare · 1st Edition", "SVX-001 · Rare · Reverse holo"), in its accessible name too.
- **U2 / F5, the Search key right after typing remembered nothing, or a prefix**: it remembers the
  text in the field (not the 350 ms debounced query) and searches it at once (jest: "mer", a
  pause, then "mermaid" and the Search key at once remember "mermaid").
- **U4, the region pill read "Region: Americas (…" at the largest size**: it shows the globe and
  the region's name alone, as on mockup screen 11 (`SelectSheet`'s new `hideLabel`); a screen
  reader still hears "Region: Americas (North)", so the flows and specs that find it by name are
  unchanged.
- **F2, two native flows flaked once each in full runs**: `deal-mark-sold.yaml` checks the typed
  e-Transfer address (typed again if the simulator dropped a key) and taps Save once more only
  while its sheet is still up after 15 s (a sheet that took the tap has gone by then, so the
  detail is never put in twice); in `deck-core.yaml` the binder form now lets go of the keyboard
  when "Add cards" opens the picker (iOS gave it back to the name field when the picker left, over
  "Create binder"; jest checks `Keyboard.dismiss`), and the flow puts away a keyboard still up
  before tapping the form's button (`subflows/keyboard-down.yaml`).
- **Found in this round's full native run, `large-text.yaml` failed once**: after the hide-keyboard
  drag had scrolled the card results, the Pokémon chip narrowed them but the list kept its
  offset, so the first card sat half under the chips and the tap on it pressed "Yu-Gi-Oh!".
  Typing a card now starts the results at the first card for each new text or game (jest checks
  the scroll to the top on a game chip); the flow then passed alone.
- Not changed: the reviewers' failed "subset run of 11 flows" is Maestro's (a media file is not
  found when several flow files are passed; the whole folder and a flow alone both work).

Checks of review fix 1 (retries off, this Mac, 2026-10-16): `spotlessCheck --rerun-tasks` passed;
`npm run test:api` passed in 3 min 43 s, **174 classes / 1075 tests** (+1) and 12 catalog tests,
0 failures; `exportOpenApi` + `generate:api` committed with the API change, nothing changed when
run again, git clean; the web build **896.09 kB** initial, `test:web` 136 files / 633 tests, web
lint and format clean against the regenerated client; `test:e2e` **70 / 70**; mobile typecheck,
lint and format clean; `test:mobile` jest **92 suites / 1039 tests** (+8) and 28 guard tests;
`expo export` for iOS, Android and web passed (again on the final code); `test:mobile:e2e` first
57 / 58, the one failure the full page load of `/regions/...` that `expo serve` does not serve (the
step was dropped, see above), then **58 / 58** on the final code; `test:mobile:maestro --platform
ios` on the owner's iPhone 18 Pro under the lock: **32 / 33** in 52 min 59 s, every changed flow
passing (`map-gestures-links.yaml` with `/regions/americas-north/CA-QC` and `/wishlist`,
`card-holders-region.yaml` with `/holders?card=`, `deal-mark-sold.yaml`, `deck-core.yaml`), the one
failure `large-text.yaml` (the scrolled results above, fixed) which then **passed alone (2 min
13 s)**; `test:scripts` 135 / 135; `audit:gate` passed. The owner's simulator kept its appearance
(light) and text size (Large). The Android run could not be verified (no Android SDK on this Mac).

## Phone redesign R6: profiles (2026-10-19)

Stage R6 of the phone redesign approved by the owner on 2026-10-14
([`docs/product/specs/2026-10-14-phone-redesign.md`](docs/product/specs/2026-10-14-phone-redesign.md),
sections 3, 9, 10 ("I have it"), 13 to 16): mockup screens 19 (another collector's profile), 20
(the same, scrolled) and 21 (your Profile tab), version 50 for the looks and the copy, and Settings
behind the gear. Branch `feature/r6-profiles`, cut from `main` at 108655e8 (R1 to R5, F1 and the
owner's inventory change) plus the commit that saved the owner's two prompts of 2026-10-19 (they
are for stages G, R7 and R9 to R15: nothing of them is built here). **No migration** (V128 stays
free; V124 is kept for the card-scan branch); two optional query parameters, both additive: the
paused web builds and passes its checks against the regenerated client, unchanged (no file of
`apps/web-angular` changed). Free for all (stage F1): nothing paid comes back; Settings has no
Offers, Payouts, Premium, Credits or Support.

**What a collector can now do on the phone**

- **Another collector's profile** (screens 19 and 20; `/collectors/<handle>`, from Search's
  collectors, a holder row, a deck core's seller, a chat's top bar, a rating, a reference, a link):
  - the top bar: back and "⋯", a sheet with **Share profile** (the system's share sheet with
    `https://www.orenjitrade.com/collectors/<handle>`), **Report {handle}** and **Block {handle}**
    (red, confirmed first) or Unblock, and Cancel; once the header has scrolled away the bar also
    shows the avatar, the name and a small orange **Message**;
  - the header: a 64 pt avatar with the online dot (only when the collector shows it), the name,
    "@{handle} · ★ {rating}" (the star scrolls to the ratings), the chips beside the avatar: the
    games first in an orange tint, then the tags (a game tag that repeats a game is left out);
  - one small line: "{city, }{province} · Member since {year} · Active this week" — the city only
    while its owner shows it, the province without the country, "Active this week" or "Active this
    month" only (today counts as this week; nothing older, nothing when the collector hides it);
  - one orange **Message {handle}** (opens or reuses the chat without changing its card; off with
    the reason when the collector takes no messages from you);
  - **Cards**: a sideways rail of their public cards with the price as typed under each (the cards
    of a deck core are left out: they sell only with the core); a card opens Who has this card on
    that printing; **Binders**: deck cores with their photo and the purple "Deck core" tag, the
    price under the name, binders with a fan of three cards and "{n} cards"; a tile opens the deck
    core page or the public binder; **Looking for**: their public wishes (at most 3: picture, name,
    terms "Any printing · NM only · 90% TCG") with **I have it**; **About** (the bio); **Ratings &
    references**: "4.7 ★★★★½ 3 ratings" in a card, the 2 latest references (handle, month, text)
    and **See all references**;
  - each section's **See all**: every public card (pages of 24), every binder and deck core, every
    public wish (with I have it), and the full ratings and references (the breakdown, Rate this
    collector after a deal or a real conversation, Write a reference, more on demand);
  - empty sections say so quietly ("No public cards yet.", "No public wishes." — a hidden wishlist
    reads like an empty one), a section that failed says so with "Try again"; skeletons while
    loading.
- **I have it** (section 10): opens or reuses the chat with that collector. When your inventory
  holds the card (the wished printing first, then its rarity, then any printing; a public copy
  before a private one; the newest), that copy becomes the chat's card (you are the seller: "·
  your card" and Mark as sold in the pinned bar) and waits in the message box beside the text "I
  have {card} for your wishlist. Interested?"; without a copy, the text alone. **Nothing is sent**
  until you tap send, which shares your card and then the text (one `CARD_LINK` with your copy, as
  screen 24 shows it). You can change or remove either first.
- **Your Profile tab** (screen 21): "Profile", the bell and a **gear** that opens Settings; then
  the same page others see of you (your public cards and binders, your wishes, your bio, your
  ratings and references), with **Edit profile** and **Share profile** instead of Message; your
  line has no activity; your wishes have no "I have it" and open the wish to edit it (a line says
  when others cannot see them: "Let others see what you want" off); "See all" leads to your
  Inventory, Inventory › Binders and Search › Wishlist; your card opens Edit card, your binder Edit
  binder; "Not on the map" on the line (no public place yet) opens Location and discoverability.
  Coming back to the tab reads the page again.
- **Settings behind the gear**: today's Settings screens as they are (Profile, Location and
  discoverability, Privacy with "Remember my searches" and "Let others see what you want",
  Shipping details, Notifications, Blocked users, My reports, Account, Appearance, Legal, Sign
  out); their restyle is stage R13. Everything the Profile tab reached before stays reachable (the
  gear, Edit profile, or the page itself). Settings › Appearance's theme chips now wrap at the
  largest text size (found by R5).
- **Blocks** (today's rule kept): a collector you blocked shows the header and "You blocked
  {handle}. Unblock them to see their cards, binders and wishes, and to message each other." with
  Unblock; a collector who blocked you is "This collector is not available" (they are not told,
  and neither are you).

**What the API does** (contract [`docs/api/contracts/r6-profiles.md`](docs/api/contracts/r6-profiles.md))

| Part | What |
| --- | --- |
| I have it | `GET /inventory/items?cardId=` (optional): the caller's live items of the printings of one card, private ones too; combines with the other filters |
| A profile's Cards | `GET /collectors/{handle}/inventory?excludeDeckCoreItems=true` (optional, default false): the cards filed in a deck core left out of the rows and of `totalItems` |
| The page's contract | `CollectorProfilePageIT`: public cards and binders only, wishes only while shown, a block in either direction leaving the header only, the city only on its owner's profile while shown, the last-active buckets and HIDDEN, the cards of a deck core, the caller's own copies of one card |
| Privacy | `GeoPrivacyContractTest.profilePagesOfStageR6CarryThePlaceOnly` (every seed collector's page read by every seed collector, and their own copies of a card) |

**Decisions, and why**

1. **"I have it" pins your copy when the chat opens and shares it on send.** The prompt says the
   card "becomes the chat's card" and that "nothing is sent until you tap send": the pin is R4's
   chat subject (`POST /conversations` with `subjectItemId`, allowed for your own card), the share
   is R4's `CARD_LINK` with `inventoryItemId`, waiting in the message box (one message: the card,
   then the text; R4 draws it as screen 24). One way into the chat, no new endpoint.
2. **Which copy "I have it" picks**: the wished printing, then the wished rarity, then any printing
   of the card ("If your inventory holds that card"); a public copy before a private one (a
   private one shows to that collector only once shared, R4), then the newest. A new `cardId`
   filter on the caller's own list finds them (one request, whatever the inventory's size).
3. **A block keeps today's rule on the API** (the profile's header answers with `isBlocked`, the
   listings do not, either way; the paused web shows Unblock there). The phone tells the two
   directions apart with `GET /me/blocks`: the blocker sees the header and Unblock, the blocked
   collector sees "not available" (the block dialog promises "They are not told").
4. **"Active this week" covers today** (the spec: nothing finer); the API still sends `TODAY` for
   the paused web. Your own line shows no activity.
5. **The cards of a deck core stay out of a profile's Cards** (section 7: they sell only with the
   core, as on Who has this card); the Binders show the core. A new optional parameter, not a
   change of the list the web reads.
6. **Version 50's looks and copy win over the PNGs of version 32** (the owner's rule for this
   stage): the deck core tile's tag reads "Deck core" with the price under the name (the spec's
   text: "Deck core · {price}"), About and Ratings & references have no "See all" of their own
   (the ratings' is "See all references"), the compact top bar on scroll. Version 50's game pill
   and other parts of later stages are left out.
7. **Another collector's "See all" has its own pages** (`/collectors/<handle>/cards`, `/binders`,
   `/wishes`, `/references`); "See all references" holds the full ratings section of before, with
   Rate this collector and Write a reference, which the page itself no longer carries (the mockup
   shows two references). The rows of another collector's wishes are not links (the mockup has
   only "I have it"); your own open the wish.
8. **Empty sections**: another collector's say only that there is nothing ("No public wishes."
   whether the wishlist is empty or hidden: nothing leaks), and "See all" hides on them; yours say
   how to fill them and keep "See all".
9. **Your Profile tab reads your public profile** (`GET /collectors/{your handle}`), so it is
   exactly what others see: without a public place (not discoverable) the line says "Not on the
   map", a link to Location; your wishes come from `GET /wishlist` (they carry the ids the rows
   need), with a line when others cannot see them. The languages of your profile are no longer
   shown on the tab (the public profile has none; Edit profile keeps them; the language tags show
   as chips).
10. **The chips**: games in an orange tint, tags in grey, as the mockup; a new mobile-only token
    family `color.profile` (light and dark) in `packages/design-tokens` (the web's `tokens.css`
    is unchanged).
11. **Share profile** uses the system's share sheet; a browser without one (the web build) shows
    the link in a snackbar.
12. **At the larger text sizes** (from 1.3, as R5's rows) the avatar stands above the name, the
    Cards and Binders rails become rows (four at most, "See all" has the rest), a wish puts "I have
    it" under the card, and the name, the section titles and "See all" follow the text size up to
    twice their size (the walk at the largest size found the handle and "Looking for" broken in the
    middle of a word, and the tiles' names cut).
13. **The Profile tab draws its own header** (`ownHeader`, like Search, Inventory and Messages);
    another collector's profile draws its own top bar (back keeps the id of the navigation
    header's back button, so the flows go back the same way).

**The defaults of section 16 this stage applies:** 1 (new installs start in dark: every R6 screen
follows R1's theme, light included) and 8 (one chat per pair: "Message {handle}" opens it without
changing its card; "I have it" pins your copy, the latest one winning, as R4's Message on a holder
row). Default 3 (saved details stay on the phone) is untouched: "I have it" puts its text in the
message box to be checked, like a saved detail.

**What changed on the phone**

| Part | What |
| --- | --- |
| Another collector's profile (19, 20) | `app/collectors/[id]/index.tsx` (moved from `app/collectors/[id].tsx`: the top bar, the "⋯" sheet, the compact bar, blocks, `?tab=ratings`), `src/features/collectors/ProfilePage.tsx`, `ProfileHeader.tsx`, `ProfileSections.tsx`, `ProfileTopBar.tsx`, `profileCopy.ts`, `profileRules.ts`, `useShareProfile.ts` |
| See all | `app/collectors/[id]/cards.tsx`, `binders.tsx`, `wishes.tsx`, `references.tsx`, `src/features/collectors/CollectorSectionScreen.tsx` |
| I have it | `src/features/collectors/useIHaveIt.ts`, `src/features/messages/pendingDraft.ts`, `MessageComposer.tsx` (`initialDraft`), `app/messages/[id].tsx` |
| Your Profile tab (21) and the gear | `app/(tabs)/profile.tsx`, `src/navigation/tabs.ts` (`ownHeader`), `app/settings/appearance.tsx` (the chips wrap) |
| Data | `src/api/hooks/collectors.ts` (`excludeDeckCoreItems`, `useCollectorPublicItemPages`), `wishlist.ts` and `location.ts` (an `enabled` flag), `queryKeys.ts`, `src/navigation/RootNavigator.tsx` (the new routes), `packages/design-tokens/tokens.json` + `src/theme/tokens.ts` (`color.profile`) |
| Removed | `src/features/collectors/CollectorProfileView.tsx`, `CollectorListings.tsx`, `CollectorWishlistSection.tsx`, `MessageAction.tsx`, `LAST_ACTIVE_LABELS` (only today's profile layout used them) |
| Tests | API: `CollectorProfilePageIT` (new, 6 tests), `GeoPrivacyContractTest` (+1); jest `features/profileRules` (new), `screens/collector` (rewritten: the header and its line in every bucket, the sections and their empty states, See all, Message, I have it with and without a copy, the "⋯" sheet, the compact bar, blocks both ways, your own profile, the largest text size), `screens/profile` (rewritten: the gear, Edit and Share, See all, your wishes, "Not on the map"), `screens/collector-sections` (new), `screens/conversation` (+1: the "I have it" draft sent only on send), `screens/ratings` (the references page), `screens/blocked`, `features/moneyOff`, `privacy/placePrivacy`, `app/tabs-layout`; Playwright `profiles` (new), `auth`, `location`, `profile`, `collector-wishlist`, `blocked`, `map`, `safety-notice`, `reports`; Maestro **native flow 6** `profile-pages-settings-gear.yaml` (new; `scripts/parity.js` ACTION=profiles and check-have), and `sign-out`, `sign-in`, `sign-up-onboarding`, `google-sign-in`, `discoverability`, `profile-edit`, `deck-core`, `map-region-binders`, `report-collector`, `collector-search-looking-for` on the new pages |

**Checks** (retries off, the real numbers; this Mac, 2026-10-20, the owner's iPhone 18 Pro simulator
under the lock)

| Check | Result |
| --- | --- |
| `cd apps/api && ./gradlew spotlessCheck --rerun-tasks` | passed |
| `npm run test:api` | passed in 3 min 41 s: **175 classes / 1082 tests** (+7 over R5's 1075: `CollectorProfilePageIT` new with 6, `GeoPrivacyContractTest` +1) + 12 catalog tests in 2 classes, 0 failures, 0 skipped |
| `./gradlew exportOpenApi` + `npm run generate:api` | committed with the API changes (`98707f5e`, `1ad0b316`); nothing changed when run again at the end, git clean |
| `npm run build -w apps/web-angular` | passed, initial total **896.09 kB** (no web file changed: `git diff 108655e8 -- apps/web-angular` is empty) |
| `npm run test:web`, web `lint`, `format:check` | passed: 136 files / **633 tests** against the regenerated client; lint and format clean |
| `npm run test:e2e -- --retries=0` | **70 / 70** (1.3 min) |
| `npm run typecheck -w apps/mobile`, `lint`, `format:check` | clean |
| `npm run test:mobile` | passed: jest **94 suites / 1064 tests** (R5: 92 / 1039; new `features/profileRules`, `screens/collector-sections`; rewritten `screens/collector`, `screens/profile`) + 28 guard tests (on the final code; the run before it lost one jest worker to a SIGSEGV in `realtime/stompFrames`, a suite R6 does not touch: alone 9 / 9, then the whole run again green) |
| `npx expo export --platform ios / android / web` | all three passed (into the scratch folder) |
| `npm run test:mobile:e2e -- --retries=0` | **60 / 60** (1.0 min; new `profiles.spec.ts` with 2) |
| `npm run test:mobile:maestro -- --platform ios` | **33 / 34** in 54 min 36 s on the owner's iPhone 18 Pro: `sign-up-onboarding.yaml` failed on the old Profile tab's `profile-visibility` (a flow the update had missed), fixed (`b3d65dbf`: the tab's line "Not on the map · Member since …") and **passed alone (1 / 1, 2 min 20 s)**; native flow 6 `profile-pages-settings-gear.yaml` and every flow the stage changed passed. The copy of the profile pages moved into `profileCopy.ts` after that run (`198e1615`, the same words): native flow 6 (1 / 1, 1 min 45 s), the sign-up flow and the mobile web E2E (60 / 60) ran again on the final code |
| `npm run test:scripts` | **135 / 135** |
| `npm run audit:gate` | passed (the two allowlisted advisories, expiring 2026-11-30) |

**The walk on the simulator** (scratch Maestro flows on the isolated stack, on the owner's iPhone 18
Pro under the lock; the screenshots are kept outside the repository and compared with the mockup's
screens 19 to 21): a fresh fictional viewer in Quebec (Laval shown) opened **collector2** of the
seed (Ontario, Toronto shown: three public cards, a binder and the deck core "Moth Queen core" at
$95, three public wishes, a bio, and for the walk two fictional buyers who bought a card each,
rated him 5 and 4 and wrote a reference each: "4.7 · 3 ratings") and a fictional collector with
almost nothing (no bio, no listings, no wishes, no ratings); then his own Profile tab, and
collector2's own Profile tab (signed in as him on the isolated stack), in dark and in light, at the
default size and at the largest accessibility size (the launch argument of
`subflows/relaunch-large-text.yaml`). The screens match the mockup in order, wording, colours and
sizes; the differences are the decisions above. Found at the largest size and fixed, each with a
jest test: the handle broken in the middle beside the avatar and "Looking for" broken as "Looki /
ng for" (`2ae0a6ce`), the tiles' names cut in the middle of a word (`4e12968f`). Found on the way
and fixed: "@handle ·" read with its dot (`7fc244d2`), "See all looking for" read by a screen
reader (`9d9c4ad2`). The walk's fictional accounts were deleted from the Auth emulator; the
owner's appearance (light) and text size (Large) were put back as they were.

**Could not be verified:** the Android run (no Android SDK on this Mac; native flow 6 and the
changed flows keep their Android steps in the shared subflows); VoiceOver on a real iPhone (the
names are covered by jest and the flows' labels); the system share sheet's targets (the flows
check the "⋯" sheet's Share profile; jest checks the link handed to it).

**Known gaps, by design or for a later stage**

- Settings is today's list until stage R13 restyles it (version 50's Settings is a later stage).
- Home's "I have it" comes with R7 (`useIHaveIt` is ready for it).
- A single long word wider than the row (a long handle at the largest size) still wraps inside the
  word (R5's note).
- The "⋯" sheet's rows scroll at the largest size, as the chat's (R4).
- The rating stars use half stars from .25 and full ones from .75; the number beside them is the
  average with one decimal.

**Owner follow-ups:** confirm decisions 1 ("I have it" pins your copy when the chat opens; nothing
is sent before send), 3 (a collector who blocked you reads "not available"; the API keeps today's
rule), 4 ("Active this week" also for today), 5 (a deck core's cards stay out of a profile's
Cards), 6 (version 50's "Deck core" tag with the price under the name), 7 (the full ratings and
"Write a reference" behind "See all references"), 9 (your Profile tab is your public profile: "Not
on the map" until you are discoverable; your languages show only in Edit profile).

## NEXT TASK

> **Stage R6 of the phone redesign is built** ("Profiles", mockup screens 19 to 21, and Settings
> behind the gear; section "Phone redesign R6: profiles (2026-10-19)" above; branch
> `feature/r6-profiles`, builder done, not pushed): another collector's profile (the "⋯" sheet,
> the header and its one line, Message, Cards, Binders, Looking for with "I have it", About,
> Ratings & references, each "See all"), "I have it" (the chat with your copy pinned and the text
> in the box, nothing sent before send), your Profile tab with the gear that opens Settings. API:
> `cardId` on `GET /inventory/items` and `excludeDeckCoreItems` on `GET
> /collectors/{handle}/inventory`, both optional; no migration (the next one is still **V128**;
> V124 is kept for the card-scan branch). Native flow 6 of the spec
> (`profile-pages-settings-gear.yaml`).
>
> **Exact next task: the reviews of stage R6** (a functional verifier and a product / UX lens as a
> collector, the spec's section 15; at most two fix rounds), then its ship step (merge `main`, the
> handoff's full check list, the pull request, the merge on green). **Then stage G** of
> [`docs/product/specs/2026-10-20-finish-the-phone-ui.md`](docs/product/specs/2026-10-20-finish-the-phone-ui.md)
> (one game at a time), **then R7** with
> [`docs/product/specs/2026-10-19-home-full-design.md`](docs/product/specs/2026-10-19-home-full-design.md)
> (Home, the first of five tabs; its "I have it" reuses R6's `useIHaveIt`), then R8, then R9 to R15
> (R15 after R12), one branch and one PR each, none bringing back a paid feature (ADR 0019).
> Read first: `CLAUDE.md`, `docs/development/claude-handoff.md`, this section, the two prompts, R2's
> to R6's sections of this file, `docs/api/contracts/r3-binders-deck-cores.md`,
> `r4-messages-sales.md`, `r5-search.md` and `r6-profiles.md`.

> **Owner prompts of 2026-10-19 (saved word for word):**
> [`docs/product/specs/2026-10-19-home-full-design.md`](docs/product/specs/2026-10-19-home-full-design.md)
> (Home, stage R7) and
> [`docs/product/specs/2026-10-20-finish-the-phone-ui.md`](docs/product/specs/2026-10-20-finish-the-phone-ui.md)
> (stage G, one game at a time, and stages R9 to R15). **Order:** R6 (built, its reviews next),
> then G, then R7 with the Home prompt, then R8, then R9 to R15 (R15 after R12). R5 is merged
> (#78); the paragraphs below predate these prompts where they say otherwise.

> **Stages R1, F1 and R2 are merged into `main`** (R2 by its own pull request, after it merged
> `main` with F1 on 2026-10-15). Stage R1 of the phone redesign ("Offers out, shipping wording,
> look", #72; section "Phone redesign R1: offers out, shipping wording, look (2026-10-14)" above):
> offers, trades, protected payments and disputes off the phone
> ([ADR 0018](docs/architecture/adr/0018-deals-happen-in-the-chat.md), "Deals happen in the chat";
> the API keeps them for the paused web), the chat safety tip, ratings without meetup reliability,
> V115 (the meetup tag hidden) and V116 (the region channels "by mail"), the seeds, "Trading
> safely" in English and French, the deckCore tokens, Sora / Inter / JetBrains Mono and the dark
> theme of a new install. Stage F1, "free for all" (owner, 2026-10-14; #73; section "Free for all:
> Premium, ads, credits and donations removed (stage F1, 2026-10-14)" above, with its review fixes
> and "Merged with R1 (2026-10-15)"): Premium, sponsored placements, credits and donations removed
> from the API, the phone and the web
> ([ADR 0019](docs/architecture/adr/0019-free-for-all-no-paid-features.md)); the usage limits the
> same for everyone, with plain limit messages and nothing to buy; V120–V123; the removed code on
> `archive/paid-features`. Stage R2 of the phone redesign ("Inventory and adding cards", mockup
> screens 1 to 9; section "Phone redesign R2: inventory and adding cards (2026-10-14)" above, with
> its review fixes and "Merged with free for all (2026-10-15)"): V125 (the asking price as
> typed, a condition not stated, the undo of a delete), `POST /inventory/items/{id}/restore`, the
> `inventory-photo-purge` job, `PATCH … confirm`, `sort=created`, the catalog suggestions with set,
> rarity and printing count; on the phone the Inventory with its own header, Filter and sort, Add
> cards, Choose the printing, Add to inventory with photos, Edit card, the toasts with "View" and
> "Undo"; no sponsored row, upgrade offer or paid entry point, and F1's plain limit messages where
> its screens reach a limit. Where the redesign spec says the paid features "keep their flags" or
> "move into Settings", F1's later decision wins. Owner points left by the three stages are in
> their sections (R1: the web exception that reached two web spec files, the lawyer's list of the
> meetup, offer and protection wording left in the other legal texts, the Payment Protection and
> Refund and Dispute policies on the phone's legal index, the owner's database keeping its earlier
> seed texts until a reset; F1: "Owner follow-ups"; R2: the condition sent as `""` with
> `conditionStated: false` (a nullable one breaks the paused web's build), the 10-minute undo is a
> constant, not an admin setting, the fictional photos left in the simulator's photo library, the
> light theme's orange under 4.5 : 1, the undo only while the toast shows).
>
> The owner's change of 2026-10-08 ended with stage S6 (#71): of the 22 clauses of its definition of
> done, 12 done, 5 partly, 5 not built (the delivery report
> `docs/product/2026-10-08-change-delivery-report.md`). **Not built, by the owner's decisions:
> stages S3 and S4 (skipped on 2026-10-13) and the web import screen of S5 (the web app is paused
> since 2026-10-12).**
>
> **Merged into `main`:** stage S1, geography (#57, 2026-10-09); the handoff documents for
> continuing on the Mac (#58, 2026-10-10); stage S2, the simplified wishlist, wishlist alerts and
> no matches (#60, 2026-10-10); the first run on Apple Silicon (#59, 2026-10-10); the iOS path of
> the native Maestro harness and the iOS defects it found (#61, 2026-10-12); mobile stage M9,
> regions on the phone (#67, 2026-10-13); the binder / inventory lock fix (#68, 2026-10-13); stage
> S5, the inventory import on the phone and the API (#69, 2026-10-13); the scrim fix, a dark
> backdrop iOS took for a modal (#70, 2026-10-14); stage S6, the final documents (#71, 2026-10-14);
> stage R1 of the phone redesign (#72, 2026-10-14); stage F1, free for all (#73, 2026-10-15);
> stage R2 of the phone redesign (#74, 2026-10-15); stage R3 of the phone redesign (#75,
> 2026-10-15); stage R4 of the phone redesign (#76, 2026-10-16). Migrations V001 to V114
> are applied and frozen; R1's V115 and V116, F1's V120–V123, R2's V125, R3's V126 and R4's V127
> freeze as each lands on `main` (V117–V119 are unused; V124 is kept for another branch); the next
> one is **V128**. R2
> wrote its migration as V117 and renumbered it to V125 when it merged F1: Flyway runs without
> `outOfOrder`, and a database already at V123 would refuse a V117 it has not applied. The owner's
> local database migrates on the next `npm run dev` and loses its trading areas by design (S1).
>
> **Owner orders in force:** free for all (2026-10-14, ADR 0019: no Premium, ads, credits or
> donations; the same usage limits for everyone; protected payments kept on the API); deals happen
> in the chat on the phone (2026-10-14, ADR 0018: no offers, trades, protected payments or
> disputes on the phone; the API keeps them for the paused web); mobile only, the web app is paused
> until a new order (2026-10-12; do not change `apps/web-angular`; read, build, test and walk it; a
> defect found there is recorded; stage F1 changed it only to remove the paid features, and stage
> R1 only for the "Trading safely" text, as the owner asked);
> stages S3 and S4 are skipped until the owner asks (2026-10-13; never describe them as done); the
> native suite runs on the simulator the owner keeps booted (`ORENJI_IOS_SIMULATOR_UDID=<its
> UDID>`; nothing boots, creates, erases or shuts down a simulator); this Mac has no Android SDK
> ("the Android run could not be verified").
>
> **Stage R3 of the phone redesign is on `main`** (#75; "Binders and deck cores", mockup screens 16
> to 18 and Inventory › Binders; section "Phone redesign R3: binders and deck cores (2026-10-15)"
> above, with its review fixes 1 and 2): V126, binder photos, key cards and preview pictures, deck
> cores in the public lists, the search API of R5; on the phone Inventory › Binders, Edit binder
> and New binder with "Sell as a deck core", the deck core page and the public binder restyled.
>
> **Stage R4 of the phone redesign is on `main`** (#76; "Messages and Mark as sold", mockup screens
> 22 to 25; section "Phone redesign R4: messages and Mark as sold (2026-10-15)" above):
> R3's leftovers first (R2-1, R2-2, U10, U8); V127 (the chat's subject, the `sale` table, the SALE
> interaction), the `deals` module, `GET /conversations/{id}`, `POST /conversations` pinning a card
> or a deck core, sharing one's own card (`inventoryItemId`), `POST /conversations/{id}/sales` and
> `POST /sales/{id}/undo`, the sale message and the buyer's notification; on the phone the inbox,
> the chat with its top bar, pinned bar, safety tip per side, quick replies and "+" sheet, Settings ›
> Shipping details (kept on the phone only), Mark as sold with its toast and Undo, the sale message
> per side and "Rate {other}"; native flows 4 and 3 (as far as R4 reaches). **Its review fix 1 is
> done** (2026-10-16, "Review fix 1" in the R4 section): Mark as sold names the card the seller saw
> (409 `SUBJECT_CHANGED`) and every pin is pushed on `/user/queue/conversations`; the toast's Undo
> stays above the keyboard; sold deck cores leave `binders.max`; the tracking-number log rule has
> its test; nine minor fixes (no migration). **Its review fix 2 is done** (2026-10-16, "Review fix
> 2" in the R4 section): a jest test that the open Mark as sold sheet keeps the card it opened with
> while a pushed pin re-reads the chat, and the quick reply row's padding that gives the chips their
> 44 pt touch targets on iOS (no migration, no API change).
>
> **The owner's inventory change of 2026-10-16 is on `main`** (#77, `b92710cf`; mockup v43,
> screens 1 and 6 to 9; the "Last updated" lines at the top of this file; the dated note at the end
> of `docs/product/specs/2026-10-14-phone-redesign.md`): the Public / Private tag on every Inventory
> row, the asking price typed in "$" or "% TCG", Copies on its own row; phone only, no migration, no
> API change.
>
> **Stage R5 of the phone redesign is built** ("Search", mockup screens 11 to 15; section "Phone
> redesign R5: search (2026-10-16)" above; branch `feature/r5-search`, builder done, review fix 1
> done, not pushed):
> four tabs (Search | Inventory | Messages | Profile), Search's map with the state card, typing a
> card with the collectors, Who has this card (the one card page, holders by province, Message
> pinning the card, "Also in a deck core" with `excludeDeckCoreItems=true`), Search › Binders with
> Deck cores, Search › Wishlist with "Available", recent searches with Settings › Privacy ›
> "Remember my searches"; the old routes and links redirect. API: `GET /search/collectors`,
> `sort=province`, `available` and `GET /wishlist/availability`; two hardening items closed (blocked
> collectors in the collectors section of search, the search text in the search analytics events).
> No migration: the next one is still **V128** (V124 is kept for another branch). R3's and R4's R5
> items are done (the banner with `excludeDeckCoreItems`, the deck cores as rows on the map's state
> card and in Search › Binders, "Message" on a holder row with `subjectItemId`, native flows 2 and
> 3 in full). Found during R5, not R5's (recorded in its section): Settings › Appearance's theme
> chips do not wrap at the largest text size (for R6); since Xcode 27.1 (on this Mac since
> 2026-10-16) `legal-french.yaml` matches the French draft banner by its accessible name. Review
> fix 1 (privacy, product / UX and functional reviews): the old `/regions/<region>/<code>` link no
> longer crashes the tabs (Search's `state` parameter is now `place`), `rarity` on
> `GET /search/card-holders` (additive) for the card page's `?rarity=`, a new link to the card page
> on screen, the 1st Edition on holder rows, the Search key keeping the whole text, the region
> pill's name alone, the two native flakes (the binder form lets go of the keyboard before the
> card picker) and, found in its full native run, the card results starting at the first card for
> each new text or game.
>
> (Done since: R5's re-review and its ship step, merged as #78; stage R6 is built, see the top of
> this section.)
> **Then stage R6** (profiles, mockup screens 19 to 21, and Settings behind the gear), then R7 (Home,
> the first of five tabs, and the feed endpoint) and R8, one branch and one PR each, each with its
> builder, at least two independent reviewers and at most two fix rounds; none of them builds a paid
> feature (ADR 0019); "I have it" (Home and profiles) uses R4's `CARD_LINK` with `inventoryItemId`.
> R6 moves Settings behind the gear (Settings › Privacy keeps "Remember my searches" and "Let others
> see what you want"); R7 makes the hidden `index` route of the tabs Home (today it redirects to
> Search) and points Home's field "Search cards or collectors" at `/search?typing=1`. Read first:
> `CLAUDE.md`; `docs/development/claude-handoff.md`; this section; the spec (sections 0 to 4, 9, 12
> to 17); ADR 0017, ADR 0018 and ADR 0019; R2's to R5's sections of this file;
> `docs/api/contracts/r3-binders-deck-cores.md`, `r4-messages-sales.md` and `r5-search.md`.
>
> **Then, the owner's choice** (the delivery report, section (j)): resume the web (the import
> screen, then S3 and S4 on the web); S3 and S4 on the phone (the redesign drops S3's "Who wants
> it", "Wanted by N" and holder counts and keeps recent searches on the phone; S4 stays skipped);
> the Android SDK on the Mac; the hardening list (a lock timeout on inventory writes, the
> after-commit analytics listeners, the photo orientation on upload, Phase 13; stage R5 closed
> "blocked collectors in the collectors section of search" and "the search text in the search
> analytics events"); the open launch decisions of the handoff's section 6
> (an arm64 PostGIS image, the npm advisories that expire on 2026-11-30, the legal
> placeholders, OrbStack's licence, VoiceOver on a real iPhone). Proposed CLAUDE.md sentences wait
> for the owner (the end of the delivery report).
>
> **Not built (S3, spec sections 2 and 2b; skipped by the owner on 2026-10-13), kept here for
> the day it is asked for.** API: a grouped
> per-printing holder count, `/search/card-holders` extended (rarity, country / subdivision
> filters, per-printing counts, sorts), "Who wants it" (visible wishlists, the S2 public note and
> NM / % TCG chips; `CollectorDiscoveryService.markersFor` gives the rows' collectors), "Wanted by
> N" on inventory items (one grouped query, the same fit rules as `WishlistAlertRules`), search
> result have/want counts, the rarity query parsing, and the server-side search history
> (`/me/search-history`, privacy switch, export, deletion). Mobile: the printing picker of the
> card screen, "Who has it" / "Who wants it", "Wanted by N" (S1 follow-ups 3 and 4). Web: reuse
> `shared/catalog/printing-picker` on the card page, "Find this card". S2's "Known gaps" that S3
> was to close stay open. The redesign of 2026-10-14 (its section 2) overrides part of this list
> for the phone: "Who wants it", "Wanted by N" and the holder counts are dropped and not to be
> built, and the search history becomes the phone's recent searches, with no server history.
> **Not built (S4, section 5; skipped on 2026-10-13):** photos in community posts; the redesign
> keeps S4 skipped.

**Below: the earlier next-task notes, kept as history.** The pushes and merges they name are
done; the Expo SDK 58 upgrade and the full French UI translation they plan are on hold by the
owner; the backend follow-ups of the low-cost profile at their end (a database-backed
`Idempotency-Key` for offers and reports, the `/internal/events/pubsub` receiver, a `storage`
field on the card image cache status) are still open.

> **Web MVP complete locally (2026-09-30).** Workflow `web-mvp-local` / `web-mvp-local-continue`
> (run `wf_7e879796-9e0`) delivered stages 1–12: Phases 1–10 backend + web, local environment
> tooling and the web acceptance suite, each independently verified and committed; the final
> verification above found every web acceptance criterion PASS except 38 (legal texts, PARTIAL)
> and the cloud-only rows 42/44 (DEFERRED-CLOUD). The pre-resume partial work stays on branch
> `wip/stage6-partial`. Root `app.json`, `eas.json` and the `react-native-worklets` bump in
> `apps/mobile/package.json` / `package-lock.json` belong to the owner and are kept out of every
> commit.

> **Card images (2026-10-01, branch `feature/card-images`):** backend and web of ADR 0015 done
> (see "Card images + real Yu-Gi-Oh! catalog"): `npm run catalog:import -- --game yugioh --provider
> ygoprodeck --images referenced` imports the real Yu-Gi-Oh! catalog and caches the referenced
> artworks (cache ≤ 500 MB then, ≤ 5 GB since 2026-10-04; YGOPRODeck never hotlinked); every web card surface renders the API's
> picture URLs through `app-card-image`, with YGOPRODeck / Konami / 4K Media credits; card pictures
> in notification payloads, `OfferLink` and admin listing rows. Independently verified and committed
> on `feature/card-images` (not pushed); next: PR and merge to `main`. The shared local database is
> at V102 (V102 keeps the `main` checkout's API able to start against it).

> **Map location privacy rendering (2026-10-03, branch `feature/map-privacy-zoom`):** web + docs
> done by the builder (see "Map location privacy rendering"): collector maps capped at zoom 14 in
> both adapters, 2 km approximate-area discs under every collector, clustering stops at the cap,
> "about 2 km" wording. Independently verified and committed on the branch (not pushed).
> **Next:** push `feature/map-privacy-zoom`, open the PR and merge to `main` when CI is green; then
> ask the owner about the open rural-cell question in ADR 0004 ("Open questions for the owner").

> **Card image cache 5 GB (2026-10-04, branch `feature/card-image-cache-5gb`):** builder done and
> independently verified (see "Card image cache raised to 5 GB"): `CARD_IMAGE_LOCAL_CACHE_MAX_MB`
> default and ceiling 5120 MiB, 64-bit accounting audited and tested, ADR 0015 amended, docs and
> generated clients updated; committed on `feature/card-image-cache-5gb` (not pushed). **Next:**
> push the branch, open the PR and merge to `main` when CI is green. Afterwards, only if the owner asks: `npm run catalog:import -- --game yugioh
> --provider ygoprodeck --images all` caches the whole Yu-Gi-Oh! catalog (an explicit real provider
> import: ≈ 14,800 image downloads paced at 5/s ≈ 50 minutes, ≈ 650 MB). A local `.env` that still
> sets `CARD_IMAGE_LOCAL_CACHE_MAX_MB=500` must be updated first.

**Owner priorities (2026-09-29, updated 2026-10-04):** cloud deployment deferred (see
docs/deployment/DEFERRED.md), everything runs locally, web application first (**done**), mobile
resumed on 2026-10-04 (local and free only: Expo Go, local Android emulator, Maestro CLI; never
EAS, Expo publish or Maestro Cloud). Phase 11 (ML card recognition) is on hold.

> **Mobile stage M1 (2026-10-04, fixes 2026-10-05, branch `feature/mobile-m1`):** foundation +
> Phase 1 accounts on the Expo app (see "Mobile app (stage M1)"): auth, onboarding, Profile tab,
> Settings, shared building blocks, the trading-area picker on a map like the web's (Leaflet +
> OpenStreetMap in a WebView where Google Maps cannot draw, ADR 0010 amendment), the isolated
> mobile web E2E harness (`npm run test:mobile:e2e`, 12 specs, CI job) and the native Maestro flows
> on the Android emulator (`npm run test:mobile:maestro`, 5 flows); `origin/main` (#39, #40) merged
> in. Merged into `main` as #41.

> **Mobile stage M2 (2026-10-05, branch `feature/mobile-m2` on top of `feature/mobile-m1`):**
> Phases 2 and 3 on the Expo app (see "Mobile app (stage M2)"): the Search tab and card detail,
> the Inventory tab with adding, editing and deleting cards, binders (create, rename, publish,
> make private, confirm, delete, add / remove cards) and the public binder view, freemium limits
> explained in place; 98 new jest tests, 7 new Playwright specs (19 in all), 3 new Maestro flows
> (8 in all); the mobile harness now flushes its Redis db with its database. No API change.
> Merged into `main` as #45.

> **Mobile stage M3 (2026-10-05, branch `feature/mobile-m3` on top of `feature/mobile-m2`):**
> Phase 4 on the Expo app (see "Mobile app (stage M3)"): the Map tab with collectors only as zones
> 3 km wide (radius 1500 m) and every collector map capped at zoom 14 on all three map engines,
> filters, "Who has this near me" from a card, the list view, the preview bottom sheet, the
> collector profile (approximate area, ratings, references, binders, PRIVATE / MEMBERS like the
> web) and a minimal conversation opened by "Message"; 87 new jest tests (416 in all), 9 new
> Playwright specs (28 in all), 2 new Maestro flows (10 in all); ADR 0010 amendment (stage M3).
> No API change. Pushed, PR #46 open; **next:** merge it when CI is green (stage M4 builds on
> it).

> **Mobile stage M4 (2026-10-05, branch `feature/mobile-m4` on top of `feature/mobile-m3`):**
> Phases 5 and 6 on the Expo app (see "Mobile app (stage M4)"): the realtime STOMP channel
> (native handshake header, web `?access_token=`, backoff, background pause, NUL-safe frames on
> React Native), the Messages tab (inbox, the full conversation with links, photos, receipts,
> mute / archive / block; the community channels), the Wishlist tab with matches nearby and "Add
> to wishlist", the notification centre with a live bell and a deep link per kind; an ended
> session leads to sign-in and signed-out links reopen after sign-in; 119 new jest tests
> (535 in all), 6 new Playwright specs (34 in all), 3 new Maestro flows (13
> in all). No API, web, package or dependency change. Committed, not pushed. **Next:** independent
> verification of stage M4 (after PR #46 of M3 is merged), then push, PR and merge.

> **Mobile stage M5 (2026-10-05, branch `feature/mobile-m5` on top of `feature/mobile-m4`):**
> Phases 7 and 8 on the Expo app (see "Mobile app (stage M5)"): "Report collector" from every
> entry point the web has and My reports; rating collectors after an eligible interaction and
> references; "Make an offer" (cash / trade / cash + cards), the offers inbox, one offer with
> accept / counter / decline / withdraw and its history, offer settings, offer links in chat;
> trades with the meetup, confirmations, cancelling and rating; deep links of every offer, trade,
> rating and report notification; 69 new jest tests (604 in all), 4 new Playwright specs (38 in
> all), 2 new Maestro flows (15 in all). No API, web, package or dependency change. Committed, not
> pushed. **Next:** independent verification of stage M5 (after M3 and M4), then push, PR and
> merge.

> **Mobile stage M6 (2026-10-05, branch `feature/mobile-m6` on top of `feature/mobile-m5`):**
> Phases 9 and 10 on the Expo app (see "Mobile app (stage M6)"): payment protection on the trade
> ("Use payment protection", pay on the app's fake checkout, ship, confirm receipt, payout status),
> disputes (statements, photos from the library, thread, timeline; DISPUTE_UPDATE deep links),
> Settings → Payouts, Premium through the fake billing checkout with "See Premium" on reached limits,
> credits (ledger, unlocks, referrals), donations through the fake donation checkout, "Sponsored"
> placements; the mobile half of the acceptance tracker; app-store purchase rules recorded as an open
> owner question (ADR 0011); 57 new jest tests (661 in all), 7 new Playwright specs (45 in all), 2 new
> Maestro flows (17 in all). No API, web, package or dependency change. Committed, not pushed.
> **Next:** independent verification of stage M6 (after M3–M5), then push, PR and merge.

> **Mobile stage M7 (2026-10-06, branch `feature/mobile-m7` on top of `feature/mobile-m6`, `origin/main`
> #49 and #51 merged in):** the web parity gaps closed (see "Mobile app (stage M7)"): Google sign-in
> and sign-up (emulator-proven), the Search tab's Collectors and Binders segments, the card holders
> list with the web's sort and filters, "Looking for" on profiles, Settings → Blocked users, inventory
> owner photos and bulk actions, the visibility filter, binder reordering, the map's freshness / tags
> filters and search box, set pages; every acceptance row's mobile half completed; 9 new Playwright
> specs (54 in all), 4 new Maestro flows (21 in all), `expo-auth-session` added. Merged into `main`
> as #53 (2026-10-06) and into `feature/launch-readiness` for stage M8.

> **Mobile stage M8 (2026-10-06, branch `feature/launch-readiness` with `origin/feature/mobile-m7`
> and then `origin/main` (#53) merged in):** launch readiness on the Expo app (see "Mobile app (stage M8)"): the 18+
> confirmation at sign-up, on the consent screen and as the onboarding "Age" step of existing
> accounts (with the `AGE_CONFIRMATION_REQUIRED` answer routed to it), consents recorded with the
> language shown, the French legal pages with an EN / FR switch, the "Trade safely" notice in
> conversations and on offers / trades, Block / Unblock on the profile, the money-off follow-ups;
> the mobile harness and the Maestro host scripts record the age consent; 6 new Playwright specs
> (60 in all, all green), 3 new Maestro flows (24 in all, 24/24 in one run), `expo-localization`
> added. Committed, not pushed.
> **Next:** push, let PR #52 run CI (the mobile browser suite now passes the gated API) and merge.

> **E2E isolation, test-data purge and 3 km zones (2026-10-04, branch `fix/e2e-isolation-3km-zones`):**
> merged into `main` as #39 (see the section of the same name): `npm run test:e2e` runs on its
> own stack (database `orenjitrade_e2e`, API :8180, web :4300, Redis db 2, files under
> `.local-dev/e2e/`) next to `npm run dev` and deletes its emulator accounts; `npm run e2e:purge`
> removes `@example.test` accounts through the deletion path; web collector maps show 3 km zones
> (radius 1500 m), zoom capped at 14. The mobile half of the 3 km rule (Map
> tab zones, preview bottom sheet, collector profile) is done in mobile stage M3 (above).

> **Low-cost first-year production profile (2026-10-05, branch `feature/prod-low-cost`):**
> infra, API and docs builders done (see the section of the same name): Terraform for a
> ≈ US$131–142/month prod (Cloud SQL `db-g1-small` ZONAL Enterprise, Valkey sidecar, one api
> instance, Direct VPC egress, web at zero, Certificate Manager behind Cloudflare, 10 scheduler
> jobs, budget), the go-live blockers fixed (profile mapping, missing secrets, web config,
> certificate, Cloudflare Free plan, scheduler OIDC), the card image cache on `ObjectStorage`
> (ADR 0015 amendment), ADR 0016 and the deployment docs. Committed, not pushed, nothing
> applied. **Next:** independent verification, then push, PR and merge to `main` when CI is
> green (expect a merge with the launch-readiness branch on `runbooks.md`,
> `IMPLEMENTATION_STATUS.md` and `docs/security`; keep both sets of sections).

History (one vertical slice per phase, backend N+1 overlapping web N; migration ranges P1
V004–V009, P2 V010–V019, …, P10 V090–V099): stage 1 Phase 1 API · stage 2 Phase 2 API + web
Phase 1 · stage 3 Phase 3 API + web Phase 2 · stage 4 Phase 4 API + web Phase 3 · stage 5 Phase 5
API + web Phase 4 · stage 6 Phase 6 API + web Phase 5 · stage 7 Phase 7 API + web Phase 6 · stage 8
Phase 8 API + web Phase 7 · stage 9 Phase 9 API + web Phase 8 · stage 10 Phase 10 API + web Phase 9
· stage 11 web Phase 10 · stage 12 local environment tooling + web acceptance suite + final
verification.

**Exact next task — ship PR #52 with mobile stage M8, then the Expo SDK 58 upgrade, then the full
French UI translation:**
1. Push `feature/launch-readiness` (launch readiness parts 1–5 + mobile stage M8, `origin/main`
   with #53 already merged in) and merge PR #52 when every check is green, the mobile browser
   suite included. The checks to repeat for an
   independent verification: `npm run test:mobile` (748 jest tests in 85 suites), `npx expo-doctor`
   (20/21, the known newer-patch notice), `expo export` for android and web, `npm run
   test:mobile:e2e` (60 specs, 0 flaky, 0 skipped), the native check with `npm run
   test:mobile:maestro` (24 flows) on `Pixel_6_API_34`, plus a look at the sign-up checkbox, the
   "Age" step of an account created without the confirmation (`CONFIRM_AGE=false` in
   `create-collector.js`, or `confirmAge: false` in the Playwright helper), the legal pages in both
   languages (EN / FR switch, the French banner and marking), the "Trade safely" notice in a first
   conversation and Block / Unblock on a profile (seed accounts, `LocalDev!2026`, see the age step
   once).
2. The Expo SDK 58 upgrade (owner-approved 2026-10-05) as its own PR after the merges, then close
   the Dependabot Expo PRs.
3. The full French UI translation, web first then mobile: the plan "Exact next task after launch
   readiness — full French UI translation" below.
4. Owner decision (no code until then): how a store build sells Premium and takes donations (ADR 0011
   open question). Device push (EAS + FCM), iOS runs, the fonts and Google sign-in against a real
   Firebase project (OAuth client ids) stay open for the mobile app; cloud deployment (Phase 14) and
   ML (Phase 11) stay deferred / on hold until the owner lifts them.

> **Launch readiness, part 1 — 18+ rule (2026-10-05, branch `feature/launch-readiness`):** done
> (see "Launch readiness, part 1"). **Next mobile task (do not start before the mobile stages
> above are merged; the API is already additive):** add the 18+ confirmation to the Expo app —
> an unticked checkbox "I confirm I am 18 years of age or older" / "Je confirme avoir 18 ans ou
> plus" on `app/(auth)/sign-up.tsx` (`src/account/registration.ts`: post
> `{ documentType: 'AGE_CONFIRMATION', version }` with the other consents through the existing
> `acceptConsents`; the version comes from `GET /public/legal/documents`, which now lists
> `AGE_CONFIRMATION` with `requiredAtRegistration: false`, so keep it out of the "I have read and
> accept" list), the same checkbox on `app/(account)/consent.tsx` while
> `me.onboarding.ageConfirmed === false`, a first onboarding step on `app/onboarding.tsx`
> (`src/account/accountStatus.ts` `needsOnboarding` must also be true while
> `ageConfirmed === false`), a message for `AGE_CONFIRMATION_REQUIRED` in
> `src/api/errorMessages.ts` (route to onboarding), and `apps/mobile/e2e/support/stack.ts` must
> post the `AGE_CONFIRMATION` consent for the collectors it creates (otherwise its discoverability
> and messaging flows get the 403). **Done in mobile stage M8 (2026-10-06, same branch; see
> "Mobile app (stage M8)").**

> **Launch readiness, parts 2 and 3 — trading safety and French legal pages (2026-10-05, same
> branch):** done (see "Launch readiness, parts 2 and 3"). **Next mobile task (after the mobile
> stages above are merged):** ship the French legal texts (copy `legal-content.fr.ts` next to the
> synced English file, a language switch on `app/legal/index.tsx` and `app/legal/[key].tsx`,
> French by default when `expo-localization` reports `fr`), send `language` with every consent in
> `src/account/AccountProvider.tsx` (`acceptConsents`) so the API records which translation was
> read, list the new `trading-safely` key (already in the synced English file), show the
> dismissible safety notice in the conversation screen of stage M3 (and on the offer / trade
> screens when they exist; dismissal in AsyncStorage per user), and add Block / Unblock on the
> mobile collector profile next to Report. **Done in mobile stage M8 (2026-10-06, same branch).**
> **Follow-up for the owner / lawyer:** the `[to confirm]`
> placeholders listed in that section. **Follow-up product task — full French UI:** see the
> assessment "Full UI translation (French)" in that section (runtime library with shared JSON
> catalogs, ≈ 9–11 weeks web + mobile); not started.

> **Launch readiness, parts 4 and 5 — launch configuration and Law 25 operating docs
> (2026-10-05, same branch):** done (see "Launch readiness, parts 4 and 5"). **Next:** push
> `feature/launch-readiness`, open the PR and merge to `main` when CI is green (the shared local
> database then migrates to V105: the local seed re-enables the fake-provider flags, so nothing
> changes for `npm run dev`). **Owner / lawyer follow-ups:** the `[to confirm]` placeholders listed
> in that section and in parts 2 and 3; align the Spring profile names between Terraform and
> `application.yml` before any cloud deployment. **Next mobile task (after the mobile stages are
> merged):** neutral `LIMIT_REACHED` wording in `src/api/errorMessages.ts` and the plan-limit
> notification deep link (`/premium` only when the payload carries it), in addition to the mobile
> follow-ups of parts 1–3. **Done in mobile stage M8 (2026-10-06, same branch).**

**Exact next task after launch readiness — full French UI translation (web first, then mobile):**
1. **Scaffolding (≈ 1 week).** `packages/i18n` with JSON catalogs per namespace (`common`,
   `errors`, `auth`, `onboarding`, `map`, `inventory`, `binders`, `search`, `wishlist`,
   `messages`, `offers`, `trades`, `collectors`, `settings`, `notifications`, `community`,
   `legal-chrome`, `admin`), `en` and `fr-CA`, a typed key helper, a `missing-keys` script in CI.
   Web: Transloco (`@jsverse/transloco`, pinned) with lazy scopes per feature folder, a
   `LanguageService` that reuses the `LegalLanguageService` preference (browser language → stored
   choice → `?lang=`), `LOCALE_ID` / `Intl` plumbing for `fr-CA` dates, numbers and currency,
   French providers for Angular Material (`MatPaginatorIntl`, datepicker), `lang` on `<html>`.
2. **Consumer-facing web strings (≈ 3–4 weeks, ≈ 3,200 strings).** Feature by feature in the
   order users meet them: auth + onboarding, map + collectors, search + catalog, inventory +
   binders, wishlist + notifications, messages, offers + trades, settings, community; replace
   inline English with keys, keep the English catalog as the source, translate to Quebec French
   (vous form, the glossary of the legal pages: « cartable », « zone d'échange », « collectionneur »),
   `api-error-messages.ts` and `offer-problems.ts` through the `errors` namespace (the API keeps
   English `message` / `errorCode`). Each feature's specs run in both languages; Playwright adds a
   French walkthrough of the happy paths (sign-up → onboarding → map → message → offer).
3. **Admin console (≈ 2 weeks, ≈ 1,650 strings, may lag: staff only).**
4. **Mobile (≈ 2 weeks after the web catalogs exist, ≈ 1,100 strings).** i18next +
   `react-i18next` + `expo-localization`, the same JSON catalogs from `packages/i18n`, the legal
   texts in both languages (already listed as the mobile follow-up of parts 2 and 3).
5. **Review and QA (≈ 2 weeks).** Professional French review of the whole catalog, pseudo-locale
   pass for truncation, screenshots of every screen in both languages, Bill 96 check of every
   consumer-facing text with the lawyer. Record the glossary in `docs/product/`.
   Total ≈ 9–11 weeks web + mobile (6–7 weeks consumer web only); no owner decision needed to
   start, cloud deployment stays deferred.

**Exact next task on `feature/prod-low-cost` (2026-10-05) — PR open, merge, then owner steps:**
1. Done (2026-10-05): independent verification of the branch — `npm run infra:validate` (fmt +
   validate for dev/staging/prod + Cloudflare and every module standalone), `npm run test:scripts`
   (54/54), `npm run test:api` (801 tests, 0 failures, incl. `CardImageObjectStorageIT`,
   `GcsObjectStorageTest`, `LocalFileObjectStorageTest` and the card image suites), the web
   Docker image rendering every `docker-entrypoint.sh` variable into `config.json`, the
   local-dev check on port 8380 against a throw-away database and Redis db 4, and a drift read
   of ADR 0016 / `docs/deployment/README.md` against `environments/prod/{main,variables}.tf`.
   `origin/main` (mobile stages M4 and M5, #47 / #48) is merged in; the PR is open.
2. Merge the PR to `main` when CI is green; merge the launch-readiness branch's `runbooks.md` /
   `IMPLEMENTATION_STATUS.md` / `docs/security` sections alongside this one (its
   `docs/security/README.md` still lists `redis-url` among the api-run secret accessors: the
   sidecar profile creates no `redis-url` secret, drop that row in the merge).
3. Owner steps, in the documented order, when the deployment is un-deferred: GCP project + state
   bucket, bootstrap apply, Firebase web app config in tfvars, full apply, Cloudflare apply with
   the `_acme-challenge` CNAMEs DNS-only, image build + deploy (no Maps key any more, ADR 0017),
   budget apply with the billing account, post-deploy checks. Confirm at that first apply
   the sidecar TCP probe against the loopback bind, the 0.1 vCPU sidecar, and the Certificate
   Manager authorization on the Cloudflare zone.
4. Backend follow-ups surfaced by this work (no owner decision needed): a database-backed
   `Idempotency-Key` for offers and reports (today Redis-only, lost on a sidecar restart); the
   `/internal/events/pubsub` receiver before enabling the domain-events push subscription
   (ADR 0009); a `storage` field on `InternalCardImageCacheStatus` once the generated clients
   can be regenerated without colliding with the mobile branches.
