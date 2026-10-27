import type { LegalDocument, RequiredConsent } from '@/src/api/types';
import {
  LEGAL_DOCUMENTS,
  LEGAL_DOCUMENT_LIST,
  isLegalKey,
  type LegalKey,
} from '@/src/legal/legalContent';

import type { LegalLanguage } from './legalLanguage';
import { legalTitleOf } from './legalTexts';

export { LEGAL_DOCUMENTS, LEGAL_DOCUMENT_LIST, isLegalKey, type LegalKey };

/**
 * The documents the phone's Legal page lists, in the order of mockup v50 screen 58. The Payment
 * Protection and the Refund and Dispute policies are left out: the phone has no payments (ADR
 * 0018); the web keeps them, and their pages still open from a link.
 */
export const PHONE_LEGAL_KEYS: readonly LegalKey[] = [
  'terms',
  'privacy',
  'community-guidelines',
  'trading-safely',
  'marketplace-policy',
  'acceptable-use',
  'cookies',
];

/** The phone's one-line summary of each listed document in English (mockup v50 screen 58). */
export const PHONE_LEGAL_SUMMARIES: Readonly<Partial<Record<LegalKey, string>>> = {
  terms: 'The rules for using OrenjiTrade.',
  privacy: 'What we collect, why, and your rights (Law 25).',
  'community-guidelines': 'Be honest, be kind, no counterfeits.',
  'trading-safely': 'Agree in the chat, pay by e-Transfer, ship with tracking.',
  'marketplace-policy': 'What you may list, and how.',
  'acceptable-use': 'What is not allowed on the service.',
  cookies: 'The few cookies the website uses.',
};

/** `/legal/terms` (the API's web path) → `terms`, the key of the in-app text. */
export function legalKeyOf(url: string | null | undefined): LegalKey | null {
  const key = (url ?? '').replace(/^.*\/legal\//, '').replace(/[/?#].*$/, '');
  return isLegalKey(key) ? key : null;
}

/** `TERMS` → `terms`, `COMMUNITY_GUIDELINES` → `community-guidelines`. */
export function legalKeyOfType(documentType: string): LegalKey | null {
  const key = documentType.toLowerCase().replace(/_/g, '-');
  return isLegalKey(key) ? key : null;
}

export interface ConsentItem {
  documentType: string;
  version: string;
  title: string;
  /** In-app text to open, when the app ships it. */
  key: LegalKey | null;
}

/**
 * Title and in-app page of a required consent: the in-app text's title in the active legal
 * language when the app ships it (the linked page opens in that language), else the API's title,
 * else the humanised type.
 */
export function describeConsent(
  consent: RequiredConsent,
  documents: readonly LegalDocument[] | undefined,
  language: LegalLanguage = 'en'
): ConsentItem {
  const document = documents?.find((entry) => entry.documentType === consent.documentType);
  const key = legalKeyOf(document?.url) ?? legalKeyOfType(consent.documentType);
  return {
    documentType: consent.documentType,
    version: consent.version,
    title: legalTitleOf(
      key,
      language,
      document?.title ?? consent.documentType.replace(/_/g, ' ').toLowerCase()
    ),
    key,
  };
}
