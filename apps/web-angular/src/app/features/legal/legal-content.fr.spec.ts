import { LEGAL_DOCUMENTS, LEGAL_KEYS } from './legal-content';
import { LEGAL_DOCUMENTS_FR, LEGAL_DOCUMENT_LIST_FR } from './legal-content.fr';

/**
 * The French texts are a translation of the English drafts, never separate legal content: same
 * keys, same version, same section ids, the same number of clauses and definitions, and the
 * same placeholders for the facts the owner or the lawyer still has to confirm.
 */
describe('French legal content', () => {
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
      expect(
        count(flatten(LEGAL_DOCUMENTS_FR[key]), /\[[^\]]*confirmer[^\]]*\]/g),
        `${key} placeholders`,
      ).toBe(count(flatten(LEGAL_DOCUMENTS[key]), /\[[^\]]*confirm[^\]]*\]/g));
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
