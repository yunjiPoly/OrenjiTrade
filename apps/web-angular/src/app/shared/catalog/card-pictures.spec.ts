import { CardDetail, PrintingImageKindEnum, PrintingSummary } from '@orenji/api-client';
import {
  cardPicturesOfCard,
  cardPicturesOfPrinting,
  cardPicturesOfResults,
  pictureFor,
} from './card-pictures';

const API = 'http://localhost:8080/api/v1/public';

function printing(id: string, url: string | null, cardId = 'card-1'): PrintingSummary {
  return {
    id,
    cardId,
    printingCode: id.toUpperCase(),
    images: url ? [{ kind: PrintingImageKindEnum.Front, url, width: 320, height: 467 }] : [],
  };
}

const CARD: CardDetail = {
  id: 'card-1',
  game: 'yugioh',
  name: 'Azure-Eyes Sky Dragon',
  primaryImageUrl: `${API}/card-images/img-1`,
  printings: [
    printing('p-en', `${API}/card-images/img-1`),
    printing('p-fr', `${API}/placeholder-images/yugioh/azure-fr.svg`),
    printing('p-none', null),
  ],
};

describe('card pictures', () => {
  it('maps a card and its printings to their API pictures', () => {
    const pictures = cardPicturesOfCard(CARD);
    expect(pictures).toEqual({
      name: 'Azure-Eyes Sky Dragon',
      game: 'yugioh',
      imageUrl: `${API}/card-images/img-1`,
      byPrinting: {
        'p-en': `${API}/card-images/img-1`,
        'p-fr': `${API}/placeholder-images/yugioh/azure-fr.svg`,
      },
    });
    expect(pictureFor(pictures, 'p-fr')).toBe(`${API}/placeholder-images/yugioh/azure-fr.svg`);
    // A printing without its own picture, or an unknown one, shows the card's picture.
    expect(pictureFor(pictures, 'p-none')).toBe(`${API}/card-images/img-1`);
    expect(pictureFor(pictures, null)).toBe(`${API}/card-images/img-1`);
    expect(pictureFor(null, 'p-en')).toBeNull();
  });

  it('uses the printing picture, else its card picture, for a printing', () => {
    expect(
      cardPicturesOfPrinting({
        printing: printing('p-fr', `${API}/placeholder-images/yugioh/azure-fr.svg`),
        card: { id: 'card-1', name: 'Azure-Eyes Sky Dragon', game: 'yugioh' },
      }).imageUrl,
    ).toBe(`${API}/placeholder-images/yugioh/azure-fr.svg`);
    expect(
      cardPicturesOfPrinting({
        printing: printing('p-none', null),
        card: { id: 'card-1', name: 'Azure-Eyes Sky Dragon', primaryImageUrl: `${API}/x` },
      }),
    ).toEqual({ name: 'Azure-Eyes Sky Dragon', game: null, imageUrl: `${API}/x`, byPrinting: {} });
  });

  it('builds the pictures of a resolved search from its card and printings', () => {
    const results = cardPicturesOfResults(
      { id: 'card-1', name: 'Azure-Eyes Sky Dragon', game: 'yugioh', primaryImageUrl: `${API}/c` },
      [printing('p-en', `${API}/p-en`), printing('other', `${API}/other`, 'card-2')],
      'p-en',
    );
    expect(results?.imageUrl).toBe(`${API}/p-en`);
    // Printings of other cards found by the same query are left out.
    expect(results?.byPrinting).toEqual({ 'p-en': `${API}/p-en` });
    expect(cardPicturesOfResults(undefined, [], null)).toBeNull();
  });
});
