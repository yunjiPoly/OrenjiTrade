import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import {
  LEGAL_DOCUMENTS,
  LEGAL_DOCUMENT_LIST,
  LEGAL_DRAFT_BANNER,
  LEGAL_EFFECTIVE_DATE_PLACEHOLDER,
  LegalDocument,
  LegalKey,
  isLegalKey,
} from './legal-content';
import {
  LEGAL_DOCUMENTS_FR,
  LEGAL_DOCUMENT_LIST_FR,
  LEGAL_DRAFT_BANNER_FR,
  LEGAL_EFFECTIVE_DATE_PLACEHOLDER_FR,
  LEGAL_TRANSLATION_NOTICE_FR,
} from './legal-content.fr';

/** The languages the legal texts are published in (the API's `ConsentRequest.language`). */
export type LegalLanguage = 'en' | 'fr';

export const LEGAL_LANGUAGES: readonly LegalLanguage[] = ['en', 'fr'];

export const LEGAL_LANGUAGE_STORAGE_KEY = 'orenji.legal.language';

export function isLegalLanguage(value: unknown): value is LegalLanguage {
  return value === 'en' || value === 'fr';
}

/** Labels of the legal page chrome (the rest of the app stays English for now). */
export interface LegalPageLabels {
  languageName: string;
  effectiveDate: string;
  version: string;
  lastUpdated: string;
  sections: string;
  definitions: string;
  contact: string;
  seeAlso: string;
  otherDocuments: string;
  indexTitle: string;
  indexSubtitle: string;
  unknownTitle: string;
  unknownMessage: string;
  openIndex: string;
  goToIndex: string;
}

export const LEGAL_PAGE_LABELS: Record<LegalLanguage, LegalPageLabels> = {
  en: {
    languageName: 'English',
    effectiveDate: 'Effective date:',
    version: 'Version',
    lastUpdated: 'Last updated',
    sections: 'Sections',
    definitions: 'Definitions',
    contact: 'Contact',
    seeAlso: 'See also:',
    otherDocuments: 'Other legal documents',
    indexTitle: 'Legal',
    indexSubtitle:
      'The policies that govern OrenjiTrade. Each page lists its effective date and version.',
    unknownTitle: 'Unknown legal document',
    unknownMessage: 'This document does not exist. Use the legal index to find what you need.',
    openIndex: 'Open legal index',
    goToIndex: 'Go to the legal index',
  },
  fr: {
    languageName: 'Français',
    effectiveDate: 'Date d’entrée en vigueur :',
    version: 'Version',
    lastUpdated: 'Dernière mise à jour le',
    sections: 'Sections',
    definitions: 'Définitions',
    contact: 'Nous joindre',
    seeAlso: 'Voir aussi :',
    otherDocuments: 'Autres documents juridiques',
    indexTitle: 'Mentions légales',
    indexSubtitle:
      'Les politiques qui régissent OrenjiTrade. Chaque page indique sa date d’entrée en vigueur et sa version.',
    unknownTitle: 'Document juridique inconnu',
    unknownMessage:
      'Ce document n’existe pas. Utilisez l’index des documents juridiques pour trouver ce que vous cherchez.',
    openIndex: 'Ouvrir l’index',
    goToIndex: 'Aller à l’index des documents juridiques',
  },
};

/** `/legal/terms` → `terms`; `null` for anything else (the age confirmation anchor, external). */
export function legalKeyOfUrl(url: string | null | undefined): LegalKey | null {
  const match = /^\/legal\/([a-z-]+)(?:[/?#].*)?$/.exec(url ?? '');
  const key = match?.[1];
  return isLegalKey(key) ? key : null;
}

/**
 * The language the legal texts are shown in: an explicit choice (EN/FR switch or `?lang=`),
 * remembered in local storage per browser, otherwise French when the browser prefers French
 * (Bill 96), English otherwise. Consents record this language next to the document version
 * (`POST /me/consents`), so the API knows which translation the collector read.
 */
@Injectable({ providedIn: 'root' })
export class LegalLanguageService {
  private readonly dom = inject(DOCUMENT);
  private readonly storage = this.resolveStorage();

  private readonly languageState = signal<LegalLanguage>(this.initialLanguage());

  readonly language = this.languageState.asReadonly();
  readonly isFrench = computed(() => this.languageState() === 'fr');
  readonly labels = computed(() => LEGAL_PAGE_LABELS[this.languageState()]);
  readonly documents = computed(() =>
    this.languageState() === 'fr' ? LEGAL_DOCUMENTS_FR : LEGAL_DOCUMENTS,
  );
  readonly documentList = computed<readonly LegalDocument[]>(() =>
    this.languageState() === 'fr' ? LEGAL_DOCUMENT_LIST_FR : LEGAL_DOCUMENT_LIST,
  );
  readonly draftBanner = computed(() =>
    this.languageState() === 'fr' ? LEGAL_DRAFT_BANNER_FR : LEGAL_DRAFT_BANNER,
  );
  /** The "translation pending validation" line (French only). */
  readonly translationNotice = computed(() =>
    this.languageState() === 'fr' ? LEGAL_TRANSLATION_NOTICE_FR : null,
  );
  readonly effectiveDatePlaceholder = computed(() =>
    this.languageState() === 'fr'
      ? LEGAL_EFFECTIVE_DATE_PLACEHOLDER_FR
      : LEGAL_EFFECTIVE_DATE_PLACEHOLDER,
  );

  /** The document `key` in the active language (`null` for an unknown key). */
  documentFor(key: string): LegalDocument | null {
    return isLegalKey(key) ? this.documents()[key] : null;
  }

  /** The title of the legal page behind `url` in the active language, else `fallback`. */
  titleOf(url: string | null | undefined, fallback: string): string {
    const key = legalKeyOfUrl(url);
    return key ? this.documents()[key].title : fallback;
  }

  /** Switches the language and remembers the choice for this browser. */
  set(language: LegalLanguage): void {
    this.languageState.set(language);
    try {
      this.storage?.setItem(LEGAL_LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Storage may be unavailable (private mode, quota); the in-memory state still works.
    }
  }

  private initialLanguage(): LegalLanguage {
    try {
      const stored = this.storage?.getItem(LEGAL_LANGUAGE_STORAGE_KEY);
      if (isLegalLanguage(stored)) {
        return stored;
      }
    } catch {
      // Fall through to the browser preference.
    }
    return browserPrefersFrench(this.dom.defaultView?.navigator) ? 'fr' : 'en';
  }

  private resolveStorage(): Storage | null {
    try {
      return this.dom.defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  }
}

/** True when the first browser language is French (`fr`, `fr-CA`, `fr-FR`…). */
export function browserPrefersFrench(
  navigator: Pick<Navigator, 'language' | 'languages'> | null | undefined,
): boolean {
  const first = navigator?.languages?.[0] ?? navigator?.language ?? '';
  return /^fr(-|$)/i.test(first);
}
