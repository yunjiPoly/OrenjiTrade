/**
 * Legal document content map.
 *
 * DRAFT PLACEHOLDERS. Every document here must be reviewed by qualified legal counsel and the
 * effective dates set before production launch. Structure (definitions, numbered clauses,
 * contact, effective date) is final; wording is not.
 */

export type LegalKey =
  | 'terms'
  | 'privacy'
  | 'community-guidelines'
  | 'marketplace-policy'
  | 'payment-protection'
  | 'refund-dispute'
  | 'cookies'
  | 'acceptable-use';

export interface LegalDefinition {
  term: string;
  definition: string;
}

export interface LegalSection {
  id: string;
  heading: string;
  clauses: string[];
}

export interface LegalDocument {
  key: LegalKey;
  title: string;
  /** Short label for footers and menus. */
  shortTitle: string;
  summary: string;
  version: string;
  /** ISO date or null while the document is still a draft. */
  effectiveDate: string | null;
  lastUpdated: string;
  definitions: LegalDefinition[];
  sections: LegalSection[];
  contact: string;
}

export const LEGAL_DRAFT_BANNER =
  'Draft — requires review by qualified legal counsel before production launch';

export const LEGAL_EFFECTIVE_DATE_PLACEHOLDER = '[Effective date to be set at launch]';

const CONTACT_LEGAL = 'Questions about this document: legal@orenjitrade.com (OrenjiTrade Legal).';
const CONTACT_PRIVACY =
  'Privacy requests and questions: privacy@orenjitrade.com (OrenjiTrade Privacy Office).';
const CONTACT_SUPPORT = 'Questions: support@orenjitrade.com (OrenjiTrade Support).';

const COMMON_DEFINITIONS: LegalDefinition[] = [
  {
    term: 'OrenjiTrade',
    definition:
      'The OrenjiTrade web application at www.orenjitrade.com, the OrenjiTrade mobile applications and the related APIs, collectively the "Service".',
  },
  {
    term: 'Collector',
    definition:
      'A registered user of the Service, whether they list cards, search for cards, or both.',
  },
  {
    term: 'Binder',
    definition:
      'A collection of inventory items a Collector groups together. A Binder may be private, public, or temporarily public.',
  },
  {
    term: 'Listing',
    definition:
      'A publicly visible inventory item, including its condition, availability (trade, sale, offers) and approximate location.',
  },
  {
    term: 'Trading area',
    definition:
      'The approximate location a Collector chooses to be discoverable from. It is derived server-side and never reveals a precise address.',
  },
];

const LAST_UPDATED = '2026-09-29';

export const LEGAL_DOCUMENTS: Record<LegalKey, LegalDocument> = {
  terms: {
    key: 'terms',
    title: 'Terms of Service',
    shortTitle: 'Terms',
    summary:
      'The agreement between you and OrenjiTrade for using the map, inventory, messaging and trading features.',
    version: '0.1-draft',
    effectiveDate: null,
    lastUpdated: LAST_UPDATED,
    definitions: COMMON_DEFINITIONS,
    contact: CONTACT_LEGAL,
    sections: [
      {
        id: 'acceptance',
        heading: 'Acceptance of these terms',
        clauses: [
          'By creating an account or using the Service you agree to these Terms of Service, the Privacy Policy, the Community Guidelines and the Acceptable Use Policy.',
          'You must be at least the age of majority in your jurisdiction, or use the Service under the supervision of a parent or guardian who accepts these terms on your behalf.',
          'We record the version of these terms you accepted and when. Material changes are announced in the app at least 14 days before they take effect.',
        ],
      },
      {
        id: 'accounts',
        heading: 'Accounts and identity',
        clauses: [
          'Accounts are personal. You are responsible for activity under your account and for keeping your sign-in method secure.',
          'You may not create accounts to evade a suspension, impersonate another person, or misrepresent your affiliation with a store or organisation.',
          'We may suspend or terminate accounts that breach these terms, the Community Guidelines or applicable law, subject to the appeal process described in the Community Guidelines.',
        ],
      },
      {
        id: 'nature-of-service',
        heading: 'What OrenjiTrade is and is not',
        clauses: [
          'OrenjiTrade is a discovery network: it helps Collectors find who near them owns, trades, sells, wants or accepts offers for a card. Collectors deal with each other directly.',
          'OrenjiTrade is not a party to any trade or sale between Collectors, does not hold title to cards, and does not provide grading, authentication or valuation services.',
          'Where payment features are enabled, they are provided through a third-party payment provider under the Payment Protection Policy. OrenjiTrade does not operate an escrow service.',
        ],
      },
      {
        id: 'content',
        heading: 'Your content and licence',
        clauses: [
          'You keep ownership of the photos, descriptions and messages you submit. You grant OrenjiTrade a worldwide, non-exclusive, royalty-free licence to host, display and distribute that content for the purpose of operating the Service.',
          'You confirm that you have the right to list the cards you list and that your content does not infringe third-party rights.',
          'Card names, set names, artwork and trademarks belong to their respective publishers. OrenjiTrade is not affiliated with or endorsed by any trading card publisher.',
        ],
      },
      {
        id: 'location',
        heading: 'Location and discoverability',
        clauses: [
          'Discoverability is off by default. When you enable it, other Collectors see your Trading area at an approximate position only; your precise location is never shown.',
          'You can change or remove your Trading area at any time in Settings. Removing it stops you appearing on the map.',
        ],
      },
      {
        id: 'liability',
        heading: 'Disclaimers and limitation of liability',
        clauses: [
          'The Service is provided "as is" and "as available". To the fullest extent permitted by law, OrenjiTrade disclaims all warranties, express or implied.',
          'To the fullest extent permitted by law, OrenjiTrade is not liable for indirect, incidental or consequential damages, or for losses arising from dealings between Collectors.',
          'Nothing in these terms limits liability that cannot be limited under applicable consumer protection law.',
        ],
      },
      {
        id: 'termination',
        heading: 'Termination and account deletion',
        clauses: [
          'You may delete your account at any time from Settings. Deletion removes or anonymises your personal data as described in the Privacy Policy, subject to legal retention obligations.',
          'Sections that by their nature should survive termination (content licence for past activity, liability, governing law) survive.',
        ],
      },
      {
        id: 'governing-law',
        heading: 'Governing law and changes',
        clauses: [
          '[Governing law and venue to be confirmed by counsel.] Mandatory consumer protection rules of your country of residence continue to apply.',
          'We may update these terms. The current version is always available at www.orenjitrade.com/legal/terms together with its effective date.',
        ],
      },
    ],
  },

  privacy: {
    key: 'privacy',
    title: 'Privacy Policy',
    shortTitle: 'Privacy',
    summary: 'What we collect, why, how long we keep it, and the choices you have.',
    version: '0.1-draft',
    effectiveDate: null,
    // Public point definition: maps show an area about 2 km wide (ADR 0004, "Client rendering").
    lastUpdated: '2026-10-03',
    definitions: [
      ...COMMON_DEFINITIONS,
      {
        term: 'Personal data',
        definition: 'Any information relating to an identified or identifiable person.',
      },
      {
        term: 'Public point',
        definition:
          'The approximate map position derived from your Trading area: snapped to a grid of roughly one kilometre and offset by a fixed, per-account jitter. Maps show it as an area about 2 km wide, never as an exact spot.',
      },
    ],
    contact: CONTACT_PRIVACY,
    sections: [
      {
        id: 'data-we-collect',
        heading: 'Data we collect',
        clauses: [
          'Account data: email address, display name, avatar, the games you follow and the tags you choose. Sign-in is handled by our identity provider; we never see your password.',
          'Inventory data: the cards, conditions, prices and availability you record, and the visibility you assign to each Binder.',
          'Location data: only the Trading area you select (or a coarse position you explicitly share). We store the derived Public point for map display. We do not track you in the background.',
          'Usage data: device type, app version, diagnostic logs identified by a request id, and product analytics events that never contain precise location or message content.',
          'Communications: private messages, community channel posts, offers, ratings and reports you submit.',
        ],
      },
      {
        id: 'purposes',
        heading: 'Why we use it',
        clauses: [
          'To operate the Service: show your public Binders on the map, match wishlists, deliver messages and notifications.',
          'To keep the community safe: detect abuse, process reports, enforce the Community Guidelines, and comply with legal obligations.',
          'To improve the product using aggregated analytics. We do not sell personal data and we do not use it for third-party advertising profiles.',
        ],
      },
      {
        id: 'location-privacy',
        heading: 'Location privacy',
        clauses: [
          'Your precise coordinates, if you ever provide them, are stored encrypted at rest and used only to derive your Public point. They are never returned by our APIs, shown in the apps, written to logs or included in analytics.',
          'Distances shown to other Collectors are rounded (for example "about 4 km"). The jitter applied to your Public point is fixed so that repeated queries cannot be combined to locate you.',
          'You can choose your Trading area manually instead of using device location.',
        ],
      },
      {
        id: 'sharing',
        heading: 'Who we share data with',
        clauses: [
          'Service providers that host and operate the Service on our behalf (cloud infrastructure, identity provider, push notification delivery, payment provider where enabled), bound by data processing agreements.',
          'Other Collectors, limited to what you make public: display name, avatar, public Binders, ratings, and your Public point.',
          'Authorities, where required by law or to protect the rights and safety of Collectors.',
        ],
      },
      {
        id: 'retention',
        heading: 'Retention and deletion',
        clauses: [
          'Account and inventory data is kept while your account is active. When you delete your account we remove or anonymise personal data within 30 days, except records we must keep for legal, dispute or safety reasons.',
          'Diagnostic logs are retained for a limited period [to be confirmed] and analytics are retained in aggregated form.',
        ],
      },
      {
        id: 'your-rights',
        heading: 'Your rights',
        clauses: [
          'Depending on where you live you may have the right to access, correct, export, restrict or delete your personal data, and to object to certain processing. You can exercise most rights directly in Settings.',
          'You can withdraw consent for optional processing (such as push notifications or discoverability) at any time without affecting the lawfulness of prior processing.',
          'You may lodge a complaint with your local data protection authority.',
        ],
      },
      {
        id: 'international',
        heading: 'International transfers and children',
        clauses: [
          'Data is hosted in [region to be confirmed]. Where data is transferred internationally we rely on appropriate safeguards such as standard contractual clauses.',
          'The Service is not directed at children under 13 (or the higher age required locally). We delete accounts we learn belong to children below that age.',
        ],
      },
    ],
  },

  'community-guidelines': {
    key: 'community-guidelines',
    title: 'Community Guidelines',
    shortTitle: 'Community',
    summary: 'How Collectors are expected to treat each other on the map, in chat and in trades.',
    version: '0.1-draft',
    effectiveDate: null,
    lastUpdated: LAST_UPDATED,
    definitions: COMMON_DEFINITIONS,
    contact: CONTACT_SUPPORT,
    sections: [
      {
        id: 'respect',
        heading: 'Be respectful',
        clauses: [
          'No harassment, hate speech, threats or discrimination. Disagreements about card value or condition are normal; personal attacks are not.',
          'Do not share another Collector’s personal information, precise location, or private messages without their consent.',
        ],
      },
      {
        id: 'honesty',
        heading: 'Be honest about your cards',
        clauses: [
          'Describe condition accurately using the shared condition scale (Mint to Damaged). Disclose alterations, replicas, proxies and damage.',
          'Keep your inventory current. Listings that are not confirmed within 45 days are hidden automatically until you confirm them.',
          'Do not post listings for cards you do not have in hand or cannot deliver.',
        ],
      },
      {
        id: 'safety',
        heading: 'Meet and trade safely',
        clauses: [
          'Prefer public places for in-person trades. Never feel pressured to share your home address; the map only ever shows approximate positions.',
          'Use the in-app offer and messaging tools so there is a record if something goes wrong.',
          'Report suspicious behaviour with the Report collector button. Reports are reviewed by moderators and never shown to the reported Collector.',
        ],
      },
      {
        id: 'channels',
        heading: 'Community channels',
        clauses: [
          'Stay on topic: game channels are for that game, "looking for" channels for wants, "new listings" for what you just listed.',
          'No spam, repeated cross-posting, or unsolicited advertising. Sponsored content is labelled by OrenjiTrade and is never posted by ordinary accounts.',
        ],
      },
      {
        id: 'enforcement',
        heading: 'Enforcement and appeals',
        clauses: [
          'Moderators may remove content, hide listings, restrict messaging, or suspend accounts. Every action is logged and shows the reason to the affected Collector.',
          'You can appeal a moderation decision from the notification you received. Appeals are reviewed by a different moderator where possible.',
        ],
      },
    ],
  },

  'marketplace-policy': {
    key: 'marketplace-policy',
    title: 'Marketplace Policy',
    shortTitle: 'Marketplace',
    summary: 'Rules for listings, offers, prices and what may be traded or sold on OrenjiTrade.',
    version: '0.1-draft',
    effectiveDate: null,
    lastUpdated: LAST_UPDATED,
    definitions: [
      ...COMMON_DEFINITIONS,
      {
        term: 'Offer',
        definition:
          'A proposal from one Collector to another for a card or set of cards, as cash, trade, or a mix. Offers move through open, countered, accepted, declined, cancelled and expired states.',
      },
    ],
    contact: CONTACT_SUPPORT,
    sections: [
      {
        id: 'permitted-items',
        heading: 'What may be listed',
        clauses: [
          'Physical trading cards and sealed products for the games supported by OrenjiTrade.',
          'Not permitted: counterfeit or unlicensed reproductions presented as genuine, stolen goods, digital codes obtained in breach of the publisher’s terms, and anything illegal to sell in your jurisdiction.',
        ],
      },
      {
        id: 'listing-standards',
        heading: 'Listing standards',
        clauses: [
          'Every listing carries a condition, a language, an edition or printing, and an availability (collection only, trade, sale, trade or sale, accepting offers, not available).',
          'Prices are set by the Collector in their local currency. OrenjiTrade does not set, suggest or guarantee prices.',
          'Photos must show the actual card being listed. Stock images may be used in addition to, not instead of, real photos when a card is for sale.',
        ],
      },
      {
        id: 'offers',
        heading: 'Offers and commitments',
        clauses: [
          'An accepted offer is a commitment between the two Collectors. Repeatedly failing to honour accepted offers may lead to rating penalties or suspension.',
          'Offers expire automatically after the period shown on the offer. Counter-offers replace the previous offer.',
        ],
      },
      {
        id: 'fees',
        heading: 'Fees and plans',
        clauses: [
          'Listing and browsing are free within the limits of your plan. Limits and premium entitlements are shown in Settings and may change with notice.',
          'Where protected payments are enabled, applicable fees are displayed before you confirm a payment.',
        ],
      },
      {
        id: 'delisting',
        heading: 'Automatic delisting',
        clauses: [
          'Listings show a freshness state: Fresh (updated within 14 days), Aging (15 to 30 days), Stale (31 to 45 days). After 45 days without confirmation a listing is hidden until you confirm it is still available.',
          'You receive warnings before a listing is hidden and can restore it at any time.',
        ],
      },
    ],
  },

  'payment-protection': {
    key: 'payment-protection',
    title: 'Payment Protection Policy',
    shortTitle: 'Payments',
    summary:
      'How protected transactions work when payments are enabled, and what is and is not covered.',
    version: '0.1-draft',
    effectiveDate: null,
    lastUpdated: LAST_UPDATED,
    definitions: [
      ...COMMON_DEFINITIONS,
      {
        term: 'Payment provider',
        definition:
          'The licensed third-party payment service that processes card payments and payouts on behalf of Collectors. OrenjiTrade never stores card numbers.',
      },
      {
        term: 'Protected transaction',
        definition:
          'A sale paid through the Service where the payout to the seller is released only after the buyer confirms receipt or the dispute window closes.',
      },
    ],
    contact: CONTACT_SUPPORT,
    sections: [
      {
        id: 'availability',
        heading: 'Availability',
        clauses: [
          'Protected transactions are an optional feature that may be enabled per region. When the feature is off, Collectors settle payments directly between themselves and this policy does not apply.',
          'Payment processing is provided by the Payment provider under its own terms, which you accept when you first use a protected transaction.',
        ],
      },
      {
        id: 'flow',
        heading: 'How a protected transaction works',
        clauses: [
          'The buyer pays through the Service. The seller ships and records tracking. The buyer confirms receipt, after which the payout is released to the seller.',
          'If the buyer does not confirm or dispute within the dispute window shown at checkout, the payout is released automatically.',
        ],
      },
      {
        id: 'coverage',
        heading: 'What is covered',
        clauses: [
          'Item not received, item materially different from the listing (wrong card, wrong printing, condition significantly below the stated condition).',
          'Not covered: in-person trades, payments made outside the Service, buyer’s remorse, or minor condition disagreements within one grade.',
        ],
      },
      {
        id: 'limits',
        heading: 'Limits and exclusions',
        clauses: [
          'Coverage is limited to the amount paid through the Service for the disputed item, including shipping paid through the Service.',
          'OrenjiTrade does not provide escrow, insurance or a regulated payment service; protection is a feature of the transaction flow operated with the Payment provider.',
        ],
      },
    ],
  },

  'refund-dispute': {
    key: 'refund-dispute',
    title: 'Refund and Dispute Policy',
    shortTitle: 'Refunds',
    summary: 'How to open a dispute, what evidence helps, and how decisions are made.',
    version: '0.1-draft',
    effectiveDate: null,
    lastUpdated: LAST_UPDATED,
    definitions: [
      ...COMMON_DEFINITIONS,
      {
        term: 'Dispute',
        definition:
          'A formal request from a buyer or seller to review a protected transaction, opened from the trade screen within the dispute window.',
      },
    ],
    contact: CONTACT_SUPPORT,
    sections: [
      {
        id: 'opening',
        heading: 'Opening a dispute',
        clauses: [
          'Open a dispute from the trade screen within the dispute window shown on the trade. Choose a reason and describe the problem.',
          'Before opening a dispute, message the other Collector; most problems are resolved directly.',
        ],
      },
      {
        id: 'evidence',
        heading: 'Evidence',
        clauses: [
          'Helpful evidence includes photos of the received card and packaging, the tracking record, and the message history. Evidence is submitted in the dispute and is visible to both parties and to the reviewer.',
          'Do not submit evidence you do not have the right to share. Fabricated evidence leads to account suspension.',
        ],
      },
      {
        id: 'review',
        heading: 'Review and decision',
        clauses: [
          'A reviewer examines the listing, the evidence and the message history and decides in favour of the buyer, the seller, or a partial refund. Decisions are usually made within 10 business days.',
          'Refunds are issued through the Payment provider to the original payment method. Partial refunds are possible where the card was received but did not match the listing.',
        ],
      },
      {
        id: 'appeals',
        heading: 'Appeals',
        clauses: [
          'Either party may appeal once within 7 days of the decision with new evidence. Appeals are reviewed by a different reviewer where possible.',
          'This policy does not limit your statutory rights, including chargeback rights with your card issuer.',
        ],
      },
    ],
  },

  cookies: {
    key: 'cookies',
    title: 'Cookie Policy',
    shortTitle: 'Cookies',
    summary: 'The cookies and local storage the web app uses, and how to control them.',
    version: '0.1-draft',
    effectiveDate: null,
    lastUpdated: LAST_UPDATED,
    definitions: [
      {
        term: 'Cookie',
        definition:
          'A small text file stored by your browser. We also use browser local storage, which works similarly but is not sent to servers automatically.',
      },
      {
        term: 'Strictly necessary',
        definition: 'Storage without which the Service cannot work (sign-in session, security).',
      },
    ],
    contact: CONTACT_PRIVACY,
    sections: [
      {
        id: 'what-we-use',
        heading: 'What we use',
        clauses: [
          'Strictly necessary: identity provider session tokens (to keep you signed in) and security tokens that protect against request forgery.',
          'Preferences: your theme (light, dark or system), dismissed banners and similar settings, stored in local storage and never sent to our servers.',
          'Analytics: first-party product analytics that do not include precise location or message content. [Confirm whether consent is required in target regions.]',
        ],
      },
      {
        id: 'third-parties',
        heading: 'Third-party services',
        clauses: [
          'Map tiles (Google Maps or OpenStreetMap) and web fonts are loaded from their providers, who may set their own cookies under their own policies.',
          'Where protected payments are enabled, the Payment provider sets cookies required for fraud prevention.',
        ],
      },
      {
        id: 'controls',
        heading: 'Your controls',
        clauses: [
          'You can clear or block storage in your browser settings. Blocking strictly necessary storage will sign you out and may prevent parts of the Service from working.',
          'Where a consent banner is shown, you can change your choice at any time from the footer link "Cookies".',
        ],
      },
    ],
  },

  'acceptable-use': {
    key: 'acceptable-use',
    title: 'Acceptable Use Policy',
    shortTitle: 'Acceptable use',
    summary: 'Technical and behavioural limits that protect the Service and its Collectors.',
    version: '0.1-draft',
    effectiveDate: null,
    lastUpdated: LAST_UPDATED,
    definitions: COMMON_DEFINITIONS,
    contact: CONTACT_LEGAL,
    sections: [
      {
        id: 'prohibited-conduct',
        heading: 'Prohibited conduct',
        clauses: [
          'Attempting to determine another Collector’s precise location, including by combining map positions, distances or timing across multiple queries or accounts.',
          'Scraping, crawling or bulk-exporting listings, profiles or map data, or using the Service to build a competing dataset.',
          'Circumventing rate limits, plan limits, freshness rules, or moderation actions.',
          'Uploading malicious code, probing or testing the security of the Service without written authorisation, or interfering with other Collectors’ use of the Service.',
        ],
      },
      {
        id: 'automation',
        heading: 'Automation and API use',
        clauses: [
          'Personal automation that acts only on your own account and respects rate limits is permitted. Automated messaging or offers to other Collectors is not.',
          'Access to the API is for the official apps. Third-party clients require written permission.',
        ],
      },
      {
        id: 'reporting',
        heading: 'Reporting vulnerabilities',
        clauses: [
          'If you find a security issue, report it to security@orenjitrade.com. We ask that you avoid accessing other Collectors’ data and give us reasonable time to fix the issue before disclosure.',
        ],
      },
      {
        id: 'consequences',
        heading: 'Consequences',
        clauses: [
          'Breaches may result in content removal, feature restrictions, suspension or termination, and, where appropriate, referral to law enforcement.',
        ],
      },
    ],
  },
};

export const LEGAL_KEYS = Object.keys(LEGAL_DOCUMENTS) as LegalKey[];

/** Documents in display order for indexes and footers. */
export const LEGAL_DOCUMENT_LIST: readonly LegalDocument[] = LEGAL_KEYS.map(
  (key) => LEGAL_DOCUMENTS[key],
);

export function isLegalKey(value: unknown): value is LegalKey {
  return typeof value === 'string' && value in LEGAL_DOCUMENTS;
}
