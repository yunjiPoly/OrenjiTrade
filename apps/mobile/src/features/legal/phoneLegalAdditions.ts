import type { LegalDocument, LegalKey } from '@/src/legal/legalContent';

/**
 * What the phone's English legal drafts say beyond the web's (src/legal/legalContent.ts is
 * generated from the paused web's file and must stay identical to it). Still drafts for the
 * lawyer's review: the draft banner stays; French is left as it is (owner order of 2026-10-20).
 *
 * Stage R15, "Browse without an account" (owner prompt of 2026-10-20): the Privacy Policy says
 * what a visitor without an account sees and what is kept about them.
 */
export interface LegalAddition {
  /** The section the clauses follow (its `id`). */
  sectionId: string;
  clauses: readonly string[];
}

export const PHONE_LEGAL_ADDITIONS: Readonly<Partial<Record<LegalKey, LegalAddition[]>>> = {
  privacy: [
    {
      sectionId: 'location-privacy',
      clauses: [
        'Visitors without an account can browse public cards, wishes, Binders and deck cores with the state or province and the country of their owner, but never see who a Collector is: no name, handle, picture, rating or activity. Searching for a Collector by name finds nobody for them.',
        'For a visitor without an account the app keeps only the region and the game they browse, on their own device. Their requests are counted against abuse by network address in a counter that expires within seconds: the address is never stored, never logged with a place and never used to locate anyone, and the analytics events of their visit carry no account or device identifier.',
      ],
    },
  ],
};

/** When the phone's additions last changed a document. */
const PHONE_LAST_UPDATED: Readonly<Partial<Record<LegalKey, string>>> = {
  privacy: '2026-10-25',
};

/** A document with the phone's additions (the same document when there are none). */
export function withPhoneAdditions(document: LegalDocument): LegalDocument {
  const additions = PHONE_LEGAL_ADDITIONS[document.key];
  if (!additions || additions.length === 0) {
    return document;
  }
  return {
    ...document,
    lastUpdated: PHONE_LAST_UPDATED[document.key] ?? document.lastUpdated,
    sections: document.sections.map((section) => {
      const extra = additions
        .filter((addition) => addition.sectionId === section.id)
        .flatMap((addition) => addition.clauses);
      return extra.length > 0 ? { ...section, clauses: [...section.clauses, ...extra] } : section;
    }),
  };
}
