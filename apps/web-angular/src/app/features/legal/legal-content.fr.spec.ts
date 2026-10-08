import { LEGAL_DOCUMENTS, LEGAL_KEYS } from './legal-content';
import {
  LEGAL_DOCUMENTS_FR,
  LEGAL_DOCUMENT_LIST_FR,
  LEGAL_DRAFT_BANNER_FR,
  LEGAL_EFFECTIVE_DATE_PLACEHOLDER_FR,
  LEGAL_TRANSLATION_NOTICE_FR,
} from './legal-content.fr';
import { LEGAL_PAGE_LABELS } from './legal-language.service';

/**
 * The French texts are a translation of the English drafts, never separate legal content: same
 * keys, same version, same section ids, the same number of clauses and definitions, and the
 * same placeholders for the facts the owner or the lawyer still has to confirm.
 */
describe('French legal content', () => {
  /** Every French string a legal page can render. */
  const frenchTexts = (): string[] => {
    const texts = [
      LEGAL_DRAFT_BANNER_FR,
      LEGAL_TRANSLATION_NOTICE_FR,
      LEGAL_EFFECTIVE_DATE_PLACEHOLDER_FR,
      ...Object.values(LEGAL_PAGE_LABELS.fr),
    ];
    for (const doc of LEGAL_DOCUMENT_LIST_FR) {
      texts.push(doc.title, doc.shortTitle, doc.summary, doc.contact);
      texts.push(...doc.definitions.flatMap((item) => [item.term, item.definition]));
      texts.push(...doc.sections.flatMap((section) => [section.heading, ...section.clauses]));
    }
    return texts;
  };

  it('marks the French text as a translation to validate, without adding legal content', () => {
    // The notice is a marking only: no language-precedence rule or other clause lives in it
    // (such content belongs in both languages of the documents, written by the lawyer).
    expect(LEGAL_TRANSLATION_NOTICE_FR).toContain('Traduction de l’ébauche anglaise');
    expect(LEGAL_TRANSLATION_NOTICE_FR).toContain('conseiller juridique');
    expect(LEGAL_TRANSLATION_NOTICE_FR).not.toMatch(/fait foi|prévau|l’emporte|prevail/i);
  });

  it('follows Quebec typography: non-breaking space before a colon and inside guillemets', () => {
    for (const text of frenchTexts()) {
      expect(text, text).not.toMatch(/ [:»]|« /);
      expect(text, text).not.toMatch(/\s[;!?]/);
      expect(text, text).not.toContain("'");
    }
  });

  it('mirrors every English document, section and clause', () => {
    expect(Object.keys(LEGAL_DOCUMENTS_FR)).toEqual(LEGAL_KEYS);
    expect(LEGAL_DOCUMENT_LIST_FR.map((doc) => doc.key)).toEqual(LEGAL_KEYS);
    for (const key of LEGAL_KEYS) {
      const en = LEGAL_DOCUMENTS[key];
      const fr = LEGAL_DOCUMENTS_FR[key];
      expect(fr.key, key).toBe(en.key);
      expect(fr.version, `${key} version`).toBe(en.version);
      expect(fr.effectiveDate, `${key} effective date`).toBe(en.effectiveDate);
      expect(fr.lastUpdated, `${key} last updated`).toBe(en.lastUpdated);
      expect(fr.definitions.length, `${key} definitions`).toBe(en.definitions.length);
      expect(
        fr.sections.map((section) => section.id),
        `${key} sections`,
      ).toEqual(en.sections.map((section) => section.id));
      fr.sections.forEach((section, index) => {
        expect(section.clauses.length, `${key} ${section.id} clauses`).toBe(
          en.sections[index].clauses.length,
        );
      });
      expect(fr.title, `${key} title`).not.toBe(en.title);
    }
  });

  it('keeps the "[to confirm]" placeholders of the English draft in the French text', () => {
    const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;
    const flatten = (doc: (typeof LEGAL_DOCUMENTS)[keyof typeof LEGAL_DOCUMENTS]) =>
      doc.sections.flatMap((section) => section.clauses).join('\n');
    for (const key of LEGAL_KEYS) {
      // Case-insensitive: some placeholders start the sentence ("[Confirm whether…]").
      const frPlaceholders = count(flatten(LEGAL_DOCUMENTS_FR[key]), /\[[^\]]*confirmer[^\]]*\]/gi);
      expect(frPlaceholders, `${key} placeholders`).toBe(
        count(flatten(LEGAL_DOCUMENTS[key]), /\[[^\]]*confirm[^\]]*\]/gi),
      );
      if (key === 'cookies' || key === 'privacy' || key === 'terms') {
        expect(frPlaceholders, `${key} has placeholders`).toBeGreaterThan(0);
      }
    }
  });

  it('names the Quebec vocabulary of Law 25 in the privacy policy', () => {
    const privacy = LEGAL_DOCUMENTS_FR.privacy.sections
      .flatMap((section) => section.clauses)
      .join('\n');
    expect(privacy).toContain('Responsable de la protection des renseignements personnels');
    expect(privacy).toContain('Commission d’accès à l’information du Québec');
    expect(privacy).toContain('privacy@orenjitrade.com');
    expect(privacy).toContain('incident de confidentialité');
    expect(privacy).toContain('18 ans');
  });
});
