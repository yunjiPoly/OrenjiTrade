import { LEGAL_DOCUMENT_LIST, LegalDocument } from './legal-content';
import { LEGAL_DOCUMENT_LIST_FR } from './legal-content.fr';

/**
 * Platform regions instead of geolocation (ADR 0017): the legal drafts describe the region model
 * in both languages. No clause may still promise proximity ("who near them", "près d’eux"),
 * distances or approximate positions, and the map never shows Collectors themselves.
 */
describe('legal drafts follow the region model (ADR 0017)', () => {
  const texts = (doc: LegalDocument): string[] => [
    doc.title,
    doc.summary,
    ...doc.definitions.flatMap((item) => [item.term, item.definition]),
    ...doc.sections.flatMap((section) => [section.heading, ...section.clauses]),
  ];

  const PROXIMITY_EN =
    /\bnear (me|you|them|us|their|your)\b|\bnearby\b|\bnearest\b|\d\s?km\b|\bkm away\b|approximate (area|zone|position)|trading area|\bradius\b/i;
  const PROXIMITY_FR =
    /près d’(eux|elles)|près de (vous|chez|toi)|à proximité|\d\s?km\b|zone approximative|position approximative|rayon\b|zone d’échange/i;
  const PEOPLE_ON_THE_MAP_EN =
    /\b(you|me|them|Collectors?) (appear(ing)? )?on the map\b|appear(ing)? on the map/i;
  const PEOPLE_ON_THE_MAP_FR =
    /vous apparaissez sur la carte|vous retire de la carte|vous voir sur la carte/i;

  it('the English drafts use region wording, never proximity or people on the map', () => {
    for (const doc of LEGAL_DOCUMENT_LIST) {
      for (const text of texts(doc)) {
        expect(text, `${doc.key}: ${text}`).not.toMatch(PROXIMITY_EN);
        // Binders may appear on the map (counted per state or province); people never do.
        expect(text.replace(/binders appear on the map/gi, ''), `${doc.key}: ${text}`).not.toMatch(
          PEOPLE_ON_THE_MAP_EN,
        );
      }
    }
  });

  it('the French drafts use region wording, never proximity or people on the map', () => {
    for (const doc of LEGAL_DOCUMENT_LIST_FR) {
      for (const text of texts(doc)) {
        expect(text, `${doc.key}: ${text}`).not.toMatch(PROXIMITY_FR);
        expect(text, `${doc.key}: ${text}`).not.toMatch(PEOPLE_ON_THE_MAP_FR);
      }
    }
  });

  it('the Terms describe the service as region discovery in both languages', () => {
    const nature = (list: readonly LegalDocument[]) =>
      list
        .find((doc) => doc.key === 'terms')
        ?.sections.find((section) => section.id === 'nature-of-service')
        ?.clauses.join('\n') ?? '';
    expect(nature(LEGAL_DOCUMENT_LIST)).toContain('find who in their region owns');
    expect(nature(LEGAL_DOCUMENT_LIST_FR)).toContain('trouver qui, dans leur région, possède');
  });

  it('the scanners catch the old proximity wording', () => {
    expect('it helps Collectors find who near them owns a card').toMatch(PROXIMITY_EN);
    expect('approximate 3 km zones').toMatch(PROXIMITY_EN);
    expect('Removing it stops you appearing on the map and in searches.').toMatch(
      PEOPLE_ON_THE_MAP_EN,
    );
    expect('trouver qui, près d’eux, possède une carte').toMatch(PROXIMITY_FR);
    expect('La supprimer vous retire de la carte et des recherches.').toMatch(PEOPLE_ON_THE_MAP_FR);
  });
});
