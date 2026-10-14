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

/**
 * Deals happen in the chat and cards ship by mail (ADR 0018, stage R1 of the phone redesign): the
 * Trading safely page in both languages says how a deal works by mail, what to check before paying,
 * the warning signs and how to report or block, without any meetup advice. It stays a draft
 * (version, banner) and claims no legal compliance.
 */
describe('the Trading safely page ships by mail (ADR 0018)', () => {
  const page = (doc: LegalDocument | undefined): string =>
    doc
      ? [
          doc.summary,
          ...doc.sections.flatMap((section) => [section.heading, ...section.clauses]),
        ].join('\n')
      : '';
  const english = page(LEGAL_DOCUMENT_LIST.find((doc) => doc.key === 'trading-safely'));
  const french = page(LEGAL_DOCUMENT_LIST_FR.find((doc) => doc.key === 'trading-safely'));

  it('says how a deal works by mail, in English', () => {
    expect(english).toContain('the cards ship by mail');
    expect(english).toContain('OrenjiTrade never handles the money');
    expect(english).toContain('Interac e-Transfer');
    expect(english).toContain('ratings and references');
    expect(english).toContain('photos of the real card');
    expect(english).toContain('with tracking');
    expect(english).toContain('Share your address only in the chat');
    expect(english).toMatch(/gift cards or cryptocurrency/);
    expect(english).toContain('Report and block');
    expect(english).not.toMatch(/\bmeet|in person|public place|daylight|café|police station/i);
    expect(english).not.toMatch(/complies|compliant|in compliance|escrow|guarantee/i);
  });

  it('says the same in French', () => {
    expect(french).toContain('les cartes sont expédiées par la poste');
    expect(french).toContain('OrenjiTrade ne gère jamais l’argent');
    expect(french).toContain('virement Interac');
    expect(french).toContain('évaluations et les références');
    expect(french).toContain('photos de la vraie carte');
    expect(french).toContain('numéro de suivi');
    expect(french).toContain('Ne communiquez votre adresse que dans la conversation');
    expect(french).toMatch(/cartes-cadeaux ou de cryptomonnaies/);
    expect(french).toContain('Signaler et bloquer');
    expect(french).not.toMatch(/rencontr|en personne|lieu public|de jour|café|poste de police/i);
    expect(french).not.toMatch(/conforme|garanti|entiercement/i);
  });

  it('stays a draft in both languages', () => {
    for (const list of [LEGAL_DOCUMENT_LIST, LEGAL_DOCUMENT_LIST_FR]) {
      const doc = list.find((candidate) => candidate.key === 'trading-safely');
      expect(doc?.version).toBe('0.2-draft');
      expect(doc?.effectiveDate).toBeNull();
    }
  });
});
