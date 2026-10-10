# Confidentiality incident register and response procedure (Quebec Law 25)

Operating document for the owner and the person in charge of the protection of personal
information ("Privacy Officer / Responsable de la protection des renseignements personnels",
`privacy@orenjitrade.com`; name, title and postal address `[to confirm]`, as in the Privacy
Policy). It implements the confidentiality-incident duties of Quebec's *Act respecting the
protection of personal information in the private sector* as amended by Law 25 (in force since
2023) and its *Regulation respecting confidentiality incidents*. **This is an operating template
drafted by engineering, pending review by the lawyer** `[to confirm]`; it does not claim
compliance. Technical stabilisation steps live in `docs/deployment/runbooks.md` section 8.

## 1. What counts as a confidentiality incident

Any **access to, use or communication of personal information not authorised by law, the loss of
personal information, or any other breach of its protection**, whether caused by an attacker, a
provider, a bug or a mistake of the owner. Examples for OrenjiTrade: a response, log, export or
screenshot that reveals a collector's city outside their own profile (ADR 0017: no coordinate is
held at all); messages
readable by a third party; an admin export sent to the wrong person; a leaked secret that gave
access to the database; a laptop with a database dump lost; a provider (Google Cloud, Firebase,
Cloudflare, Stripe) notifying a breach that touches our data.

Personal information held (see `docs/security/README.md` section 3): e-mail, display name,
avatar, profile and interests, the declared country and state or province, the optional city
(Confidential – location: shown only on the owner's profile while they choose), messages, offers,
trades,
ratings, reports, consents (with salted IP hash and user agent), audit log, push tokens, and the
Stripe references only when payment features are on.

## 2. Response procedure

Every step is logged in the register (section 3) with its UTC time. "Day 0" is the moment the
owner becomes aware of the incident.

1. **Contain** (at once). Stop the leak: rotate exposed secrets (runbook 3), revoke sessions of
   affected accounts (Firebase Admin SDK), switch a flag off (runbook 6), take a revision down
   (runbook 1), restrict a bucket or an admin account, ask the provider to withdraw the data.
   Preserve evidence (logs, audit rows, revision names) without exporting precise locations or
   more personal data than needed.
2. **Assess** the risk of serious injury for the people concerned, considering at least:
   - the **sensitivity** of the information (location data and private messages are the most
     sensitive things we hold; a city linked to a collector outside their profile is a
     physical-safety matter);
   - the **anticipated consequences** of its use (stalking, robbery at a meetup, harassment,
     identity theft, financial loss);
   - the **likelihood** that it will be used for injurious purposes (who had access, for how
     long, whether it was published, whether it is encrypted or hashed).
   Record the conclusion ("risk of serious injury: yes / no") and the reasoning. When unsure,
   treat the risk as present and consult the lawyer `[to confirm]`.
3. **Notify** when there is a risk of serious injury:
   - the **Commission d'accès à l'information du Québec (CAI)** through its incident
     notification form (`[to confirm: current CAI form / address]`), with the content the
     Regulation requires (organisation and contact, description of the information, circumstances,
     date or period, date of awareness, number of people concerned and of Quebec residents,
     assessment of the risk, measures taken or planned, whether people were notified, and how);
   - the **people concerned**, directly (in-app notification and the e-mail Firebase holds for
     the account; both languages), as soon as possible, with: what happened, which information,
     when, what we did, what they can do (change or remove their location, review their discoverability
     and messaging settings, enable a second factor on their e-mail, be careful at meetups), and
     how to reach `privacy@orenjitrade.com`. Indirect public notice (website banner) only when a
     direct notice is impossible or would cause more harm;
   - anyone who can reduce the risk (for example a payment provider) when useful.
   Notifying the police is a separate decision (see `law-enforcement-requests.md`).
4. **Record** the incident in the register **even when no notification is required**: the
   Regulation requires a register of every confidentiality incident, not only the notified ones.
5. **Follow up**: measures to reduce the injury and to prevent a repeat (code fix, test, new
   control, provider change), a blameless postmortem under `docs/deployment/postmortems/`, a
   review of this procedure, and the closing entry in the register.

Timelines: the Act requires the CAI and the people concerned to be notified "promptly" once a
risk of serious injury exists; there is no fixed number of days. Internal target: contain within
hours, assess within 2 working days, notify within 3 working days of the assessment
`[to confirm with the lawyer]`.

## 3. Register

Keep the register as a private spreadsheet or document outside the repository (it contains
personal information and incident details); this file holds the template only. Keep every entry
for **at least five years after the date the owner became aware of the incident**
`[to confirm: retention period under the Regulation]`. Never put precise locations, message
bodies or full e-mail addresses in the register; reference account ids and counts.

| Field | Content |
| --- | --- |
| Incident id | `CI-<year>-<nnn>` |
| Date / period of the incident | UTC; "unknown, estimated …" when not established |
| Date the owner became aware | UTC (day 0) |
| Description | What happened, how it was detected, systems and providers involved |
| Personal information concerned | Categories (e.g. e-mail, messages, city) and their sensitivity |
| People affected | Number (and number of Quebec residents when known), account ids, how they were identified |
| Risk of serious injury | Yes / no, with the assessment of sensitivity, consequences and likelihood |
| Containment measures | What was done, when, by whom (secret rotation, revocation, flag off, provider action) |
| Notifications sent | CAI (date, reference), people concerned (date, channel, text version), others (date); or "not required because …" |
| Measures to reduce injury and prevent recurrence | Code / configuration / process changes, with links to commits, tests and the postmortem |
| Status and closing date | Open / monitoring / closed |
| Owner of the entry | Privacy Officer `[to confirm]` |

Example entry (fictional, for illustration only):

| Field | Content |
| --- | --- |
| Incident id | CI-2026-001 (example) |
| Date / period of the incident | 2026-11-03 14:10 – 15:25 UTC |
| Date the owner became aware | 2026-11-03 15:20 UTC |
| Description | A debug log statement added in a release printed the request body of `PUT /me/location` (country, state and the optional city) to Cloud Logging for 75 minutes; detected by the log alert on city fields. No evidence of access to the logs by anyone but the owner. |
| Personal information concerned | Declared city (Confidential – location) of the collectors who saved a location in the window |
| People affected | 4 accounts (ids in the private register); 4 Quebec residents |
| Risk of serious injury | Assessed as **no**: logs are private to the project, only the owner has `logging.privateLogViewer`, the entries were deleted within the hour, and a city is not a home address. Reasoning kept in the private register. |
| Containment measures | Revision rolled back (runbook 1) at 15:25; log entries deleted at 15:40; secret rotation not needed |
| Notifications sent | Not required (no risk of serious injury); the 4 collectors informed anyway by in-app notification on 2026-11-04 |
| Measures | `GeoPrivacyContractTest` extended to request logging; pre-merge grep for `city` in log statements; postmortem `docs/deployment/postmortems/2026-11-03-location-log.md` |
| Status and closing date | Closed 2026-11-06 |

## 4. Contacts and references

- Privacy Officer: `privacy@orenjitrade.com` (`[to confirm]` name, title, postal address).
- Security owner: `security@orenjitrade.com` (placeholder, `docs/security/README.md` section 10).
- Lawyer for the assessment and the notices: `[to confirm]`.
- Commission d'accès à l'information du Québec: notification form and address `[to confirm]`.
- Related: `docs/deployment/runbooks.md` section 8 (incident checklist), section 3 (secret
  rotation); `docs/security/law-enforcement-requests.md`; the Privacy Policy's "Confidentiality
  incidents" section (English and French) which promises this behaviour to users.
