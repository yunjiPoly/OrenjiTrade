import { Injectable, computed, inject } from '@angular/core';
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
import { LegalLanguageService } from './legal-language.service';

/** `/legal/terms` → `terms`; `null` for anything else (the age confirmation anchor, external). */
export function legalKeyOfUrl(url: string | null | undefined): LegalKey | null {
  const match = /^\/legal\/([a-z-]+)(?:[/?#].*)?$/.exec(url ?? '');
  const key = match?.[1];
  return isLegalKey(key) ? key : null;
}

/**
 * The legal texts in the active legal language ({@link LegalLanguageService}). Imports both
 * language files, so only the lazy chunks that render or name the documents (legal pages,
 * sign-up and consent pages) depend on it; the initial bundle never carries the French texts.
 */
@Injectable({ providedIn: 'root' })
export class LegalTextsService {
  private readonly language = inject(LegalLanguageService);

  readonly documents = computed(() =>
    this.language.isFrench() ? LEGAL_DOCUMENTS_FR : LEGAL_DOCUMENTS,
  );
  readonly documentList = computed<readonly LegalDocument[]>(() =>
    this.language.isFrench() ? LEGAL_DOCUMENT_LIST_FR : LEGAL_DOCUMENT_LIST,
  );
  readonly draftBanner = computed(() =>
    this.language.isFrench() ? LEGAL_DRAFT_BANNER_FR : LEGAL_DRAFT_BANNER,
  );
  /** The "translation pending validation" line (French only). */
  readonly translationNotice = computed(() =>
    this.language.isFrench() ? LEGAL_TRANSLATION_NOTICE_FR : null,
  );
  readonly effectiveDatePlaceholder = computed(() =>
    this.language.isFrench()
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
}
