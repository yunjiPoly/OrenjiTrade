import { attributionFor, safeCardImageUrl } from '@/src/lib/cardImages';

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
    expect(attributionFor('pokemon')).toBeNull();
  });
});
