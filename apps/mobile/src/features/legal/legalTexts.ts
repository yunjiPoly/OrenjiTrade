import {
  LEGAL_DOCUMENTS,
  LEGAL_DOCUMENT_LIST,
  LEGAL_DRAFT_BANNER,
  LEGAL_EFFECTIVE_DATE_PLACEHOLDER,
  isLegalKey,
  type LegalDocument,
  type LegalKey,
} from '@/src/legal/legalContent';
import {
  LEGAL_DOCUMENTS_FR,
  LEGAL_DOCUMENT_LIST_FR,
  LEGAL_DRAFT_BANNER_FR,
  LEGAL_EFFECTIVE_DATE_PLACEHOLDER_FR,
  LEGAL_TRANSLATION_NOTICE_FR,
} from '@/src/legal/legalContent.fr';

import { useLegalLanguage, type LegalLanguage } from './legalLanguage';

/** Labels of the legal screens' chrome (the rest of the app stays English for now). */
export interface LegalPageLabels {
  languageName: string;
  effectiveDate: string;
  version: string;
  lastUpdated: string;
  versionToAccept: string;
  currentVersion: (version: string) => string;
  definitions: string;
  contact: string;
  indexTitle: string;
  indexSubtitle: string;
  unknownTitle: string;
  unknownMessage: string;
  openIndex: string;
}

export const LEGAL_PAGE_LABELS: Record<LegalLanguage, LegalPageLabels> = {
  en: {
    languageName: 'English',
    effectiveDate: 'Effective date:',
    version: 'Version',
    lastUpdated: 'Last updated',
    versionToAccept: 'Version to accept:',
    currentVersion: (version) => `Current version ${version}.`,
    definitions: 'Definitions',
    contact: 'Contact',
    indexTitle: 'Legal',
    indexSubtitle: 'The rules of OrenjiTrade and how we handle your data.',
    unknownTitle: 'Unknown legal document',
    unknownMessage: 'This document does not exist. Use the legal index to find what you need.',
    openIndex: 'Open legal index',
  },
  fr: {
    languageName: 'Français',
    effectiveDate: 'Date d’entrée en vigueur :',
    version: 'Version',
    lastUpdated: 'Dernière mise à jour :',
    versionToAccept: 'Version à accepter :',
    currentVersion: (version) => `Version en vigueur : ${version}.`,
    definitions: 'Définitions',
    contact: 'Nous joindre',
    indexTitle: 'Mentions légales',
    indexSubtitle: 'Les règles d’OrenjiTrade et la façon dont nous traitons vos données.',
    unknownTitle: 'Document juridique inconnu',
    unknownMessage:
      'Ce document n’existe pas. Utilisez l’index des documents juridiques pour trouver ce que vous cherchez.',
    openIndex: 'Ouvrir l’index',
  },
};

/** The legal texts and chrome labels of one language (mirror of the web's `LegalTextsService`). */
export interface LegalTexts {
  language: LegalLanguage;
  documents: Record<LegalKey, LegalDocument>;
  documentList: readonly LegalDocument[];
  draftBanner: string;
  /** The "translation pending validation" marking (French only). */
  translationNotice: string | null;
  effectiveDatePlaceholder: string;
  labels: LegalPageLabels;
}

export function legalTextsFor(language: LegalLanguage): LegalTexts {
  const french = language === 'fr';
  return {
    language,
    documents: french ? LEGAL_DOCUMENTS_FR : LEGAL_DOCUMENTS,
    documentList: french ? LEGAL_DOCUMENT_LIST_FR : LEGAL_DOCUMENT_LIST,
    draftBanner: french ? LEGAL_DRAFT_BANNER_FR : LEGAL_DRAFT_BANNER,
    translationNotice: french ? LEGAL_TRANSLATION_NOTICE_FR : null,
    effectiveDatePlaceholder: french
      ? LEGAL_EFFECTIVE_DATE_PLACEHOLDER_FR
      : LEGAL_EFFECTIVE_DATE_PLACEHOLDER,
    labels: LEGAL_PAGE_LABELS[language],
  };
}

/** The texts of the active legal language. */
export function useLegalTexts(): LegalTexts {
  return legalTextsFor(useLegalLanguage().language);
}

/** The title of the in-app text `key` in `language`, else `fallback` (the API's English title). */
export function legalTitleOf(
  key: LegalKey | string | null | undefined,
  language: LegalLanguage,
  fallback: string
): string {
  return isLegalKey(key) ? legalTextsFor(language).documents[key].title : fallback;
}
