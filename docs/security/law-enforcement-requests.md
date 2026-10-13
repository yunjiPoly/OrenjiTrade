# Requests from police, courts and other authorities

How OrenjiTrade handles a request for user data from a police force, a court, a government body
or a private party's lawyer. Operating document for the owner and the Privacy Officer
(`privacy@orenjitrade.com`, `[to confirm]` name), **drafted by engineering and pending review by
the lawyer** `[to confirm]`; it does not claim compliance. Quebec's private-sector privacy Act
(as amended by Law 25) and federal law allow communication of personal information without the
person's consent only in limited cases, the main ones being a request backed by the authority's
legal power to compel and an emergency; this document keeps us inside those cases.

## 1. Rules

1. **Release data only on valid legal process.** A warrant, production order, subpoena, court
   order or an order of a body with the legal power to require the information, addressed to
   OrenjiTrade and served through a verifiable channel. A phone call, an e-mail from a police
   address, a screenshot of a badge, or a "request for voluntary cooperation" is **not** legal
   process: answer that we need the order, and offer to preserve the data meanwhile (section 4).
   Requests from outside Canada go through the Canadian mutual legal assistance process or a
   Canadian court; we do not answer foreign authorities directly `[to confirm with the lawyer]`.
2. **Exception: a documented emergency involving a risk to life.** When an authority states, and
   the circumstances make it credible, that there is an imminent risk to someone's life, health or
   safety (for example a collector threatened at a meetup arranged in a conversation), the owner
   may disclose the minimum information needed to address that risk before the paperwork
   arrives. Write down who asked, why we believed it, what was disclosed and when; ask for the
   legal process afterwards; log it like any other request.
3. **Verify** the request: the issuing body exists, the document is signed and dated, it names
   OrenjiTrade (or the operator) and identifies the account precisely (handle, e-mail, account
   id, conversation id, period). Call the body back through a number found independently, not
   the one in the request. When in doubt, ask the lawyer `[to confirm]` before anything leaves.
4. **Disclose the minimum.** Only the data the order names, for the period it names, about the
   accounts it names. Never a whole table, never "everything about this user", never other users'
   data (the counterpart of a conversation is another person: only the lines the order covers).
   Push back on over-broad orders through the lawyer.
5. **Locations: there is nothing precise to give.** Since ADR 0017 OrenjiTrade holds no
   coordinates, GPS fixes or IP-derived positions: only the country and state or province a
   collector declared and an optional free-text city. The city is not part of any admin list or
   export to others; if an order compels it, the lawyer decides, and the extraction is done
   inside the `location` module by the owner, logged, and delivered through a protected channel.
6. **Tell the user** when the law allows it and the order does not forbid it, after the
   disclosure `[to confirm policy with the lawyer]`; never when doing so would obstruct the
   investigation named in the order or endanger someone.
7. **Log every request** (section 3), including the ones refused or withdrawn, and the
   preservation requests.
8. **No standing access.** No authority gets an account, an API key, a database connection or
   a feed. Every disclosure is a one-off, through the owner.

## 2. What we hold and how it is extracted

| Data | Where | How to extract (audited admin paths only) |
| --- | --- | --- |
| Account (e-mail, handle, display name, roles, status, creation and last-active dates) | `user_account`; identity (password hash, phone for staff MFA) at Firebase | `/admin > Users` detail (`GET /api/v1/admin/users/{id}`, audited); Firebase console for identity data |
| Profile, interests, privacy settings, consents (type, version, language, date, salted IP hash — the raw IP is not stored) | `profile`, `privacy_settings`, `user_consent` | Admin user detail; data export (`AccountExportService`, audited) |
| Declared location: country and state or province | `user_location` | Admin user detail |
| Optional city (free text, never geocoded) | `user_location.city` (Confidential – location) | The collector's own export; **not in admin lists or exports to others**; see rule 5 |
| Messages, conversations, attachments | `conversation`, `message`, media bucket | Moderation tools show reported content; a full conversation extract needs a one-off query by the owner, limited to the ordered period, logged |
| Offers, trades, ratings, reports, blocks | `offer`, `trade`, `rating`, `collector_report`, `user_block` | Admin consoles (`/admin > Reports`, offers / trades detail) |
| Payments (only once `protectedPayments` is on) | provider references in `payment`, `payout`; card data at Stripe only | `/admin > Payments`; card data must be requested from Stripe |
| Audit log of admin actions | `audit_log` (400-day Cloud Logging sink, table kept) | `/admin > Audit log` |
| Application logs (request metadata, hashed user ids, no message bodies, no precise coordinates) | Cloud Logging, 30 days | `gcloud logging read` by the owner |

Deliver through a channel the authority names in the order or a password-protected archive,
never through chat or an open e-mail attachment. Keep a copy of exactly what was sent with the
log entry (private, outside the repository).

## 3. Request log

Private spreadsheet or document outside the repository; this is the template. Retain entries for
the same period as the confidentiality incident register (`[to confirm]`, at least five years).

| Field | Content |
| --- | --- |
| Request id | `LE-<year>-<nnn>` |
| Date received | UTC |
| Requesting authority and officer | Name, body, file number, how the identity was verified |
| Legal basis | Warrant / production order / subpoena / court order / emergency (rule 2) / other; reference number; copy kept |
| Accounts and data requested | Account ids, data categories, period |
| Assessment | Valid? Over-broad? Lawyer consulted (date)? Decision and reasoning |
| Data disclosed | Exact categories, period, number of records, how delivered, date; "none" when refused |
| User notified | Yes (date, channel) / no (reason) |
| Approver | Owner or Privacy Officer |
| Status | Open / fulfilled / refused / withdrawn |

## 4. Preservation requests

An authority may ask us to preserve data while it obtains an order. Preserve it (take a copy in
the project, outside the user's reach, with a reference to the request), do **not** disclose it,
log the request, and discard the copy after the period the law sets `[to confirm]` if no order
arrives. Preservation does not pause the user's own deletion rights beyond what the law allows;
the account-deletion job keeps a legal hold out of scope today (follow-up for the lawyer).

## 5. Contacts

- Owner and Privacy Officer: `privacy@orenjitrade.com` (`[to confirm]`).
- Lawyer: `[to confirm]`.
- Related: `confidentiality-incident-register.md` (an unauthorised disclosure, including one we
  cause by answering an invalid request, is a confidentiality incident), `README.md` section 3
  (data classification) and section 9 (logging rules), ADR 0004 (location privacy).
