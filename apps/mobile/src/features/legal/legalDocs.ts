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
