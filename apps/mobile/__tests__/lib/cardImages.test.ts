import { attributionFor, creditedGames, safeCardImageUrl } from '@/src/lib/cardImages';

const API = 'http://localhost:8080';

describe('card pictures (ADR 0015)', () => {
  it('renders only the API picture routes, resolved against the API origin', () => {
    expect(safeCardImageUrl('/api/v1/public/card-images/123', API)).toBe(
      `${API}/api/v1/public/card-images/123`
    );
    expect(safeCardImageUrl(`${API}/api/v1/public/card-images/abc?v=2`, API)).toBe(
      `${API}/api/v1/public/card-images/abc?v=2`
    );
    expect(safeCardImageUrl('/api/v1/public/placeholder-images/pokemon.png', API)).not.toBeNull();
    expect(safeCardImageUrl('/api/v1/public/media/avatars/x.jpg', API)).not.toBeNull();
  });

  it('never hotlinks a provider or another origin', () => {
    expect(
      safeCardImageUrl('https://images.ygoprodeck.com/images/cards/46986414.jpg', API)
    ).toBeNull();
    expect(
      safeCardImageUrl(
        'https://cards.scryfall.io/normal/front/5/c/5c000000-0000-4000-8000-000000000001.jpg',
        API
      )
    ).toBeNull();
    expect(safeCardImageUrl('https://assets.tcgdex.net/en/sv/sv01/001/high.jpg', API)).toBeNull();
    expect(
      safeCardImageUrl('https://evil.example.test/api/v1/public/card-images/1', API)
    ).toBeNull();
    expect(safeCardImageUrl('/api/v1/me/profile', API)).toBeNull();
    expect(safeCardImageUrl('/api/v1/public/card-images/../../me', API)).toBeNull();
    expect(safeCardImageUrl('', API)).toBeNull();
    expect(safeCardImageUrl(null, API)).toBeNull();
  });

  it('credits the catalog provider where its pictures are shown (web wording)', () => {
    const yugioh = attributionFor('yugioh');
    expect(yugioh?.provider).toBe('YGOPRODeck');
    expect(yugioh?.credit).toBe('Card data and images courtesy of');
    expect(yugioh?.aboutLine).toBe('Yu-Gi-Oh! card data from YGOPRODeck.');
  });

  it('credits Scryfall for Magic and TCGdex for Pokémon (stage R10)', () => {
    const magic = attributionFor('mtg');
    expect(`${magic?.credit} ${magic?.provider}`).toBe('Card data and images courtesy of Scryfall');
    expect(magic?.providerUrl).toBe('https://scryfall.com');
    expect(magic?.notice).toContain(
      'unofficial Fan Content permitted under the Fan Content Policy'
    );
    expect(magic?.notice).toContain('Not approved/endorsed by Wizards');
    expect(magic?.aboutLine).toBe('Magic card data and images from Scryfall.');
    const pokemon = attributionFor('pokemon');
    expect(`${pokemon?.credit} ${pokemon?.provider}${pokemon?.creditSuffix}`).toBe(
      'Card data courtesy of TCGdex (MIT licence)'
    );
    expect(pokemon?.notice).toBe(
      'Pokémon card content is © The Pokémon Company, Nintendo, Creatures and GAME FREAK. ' +
        'OrenjiTrade is not affiliated with them.'
    );
    expect(pokemon?.aboutLine).toBe('Pokémon card data from TCGdex.');
    // One Piece and Riftbound wait for their publishers: no source, no credit.
    expect(attributionFor('onepiece')).toBeNull();
    expect(attributionFor('riftbound')).toBeNull();
  });

  it('lists the credits of the games that hold cards, in the games order', () => {
    const before = [
      { slug: 'yugioh', hasCards: true },
      { slug: 'pokemon', hasCards: false },
      { slug: 'mtg', hasCards: false },
      { slug: 'onepiece', hasCards: false },
    ];
    expect(creditedGames(before).map((credit) => credit.game)).toEqual(['yugioh']);
    const after = before.map((game) => ({ ...game, hasCards: game.slug !== 'onepiece' }));
    expect(creditedGames(after).map((credit) => credit.game)).toEqual(['yugioh', 'pokemon', 'mtg']);
    expect(creditedGames([{ slug: 'riftbound', hasCards: true }])).toEqual([]);
    // Without the games list every credit shows.
    expect(creditedGames(null).map((credit) => credit.game)).toEqual(['yugioh', 'pokemon', 'mtg']);
  });
});
