import type { CardDetail, CardSummary, PrintingDetail, PrintingSummary } from '@orenji/api-client';
import { printingImageUrl } from '../inventory/inventory-labels';

/**
 * The pictures of one card for listings that only carry ids (`MatchingItem` of the map and search
 * holders): the card's picture and its printings' pictures by printing id. Every URL comes from
 * the API (ADR 0015); nothing is built in the client.
 */
export interface CardPictures {
  /** Card name (alt text). */
  name: string;
  game: string | null;
  /** Picture of the card, or of the chosen printing. */
  imageUrl: string | null;
  /** Front pictures of the printings, by printing id. */
  byPrinting: Readonly<Record<string, string>>;
}

function byPrinting(printings: readonly PrintingSummary[]): Record<string, string> {
  const pictures: Record<string, string> = {};
  for (const printing of printings) {
    const url = printingImageUrl(printing);
    if (printing.id && url) {
      pictures[printing.id] = url;
    }
  }
  return pictures;
}

/** Pictures of a card and every printing it lists (`GET /cards/{id}`). */
export function cardPicturesOfCard(card: CardDetail): CardPictures {
  return {
    name: card.name ?? '',
    game: card.game ?? null,
    imageUrl: card.primaryImageUrl ?? null,
    byPrinting: byPrinting(card.printings ?? []),
  };
}

/** Pictures of one printing (`GET /printings/{id}`); its card's picture when it has none. */
export function cardPicturesOfPrinting(detail: PrintingDetail): CardPictures {
  const own = printingImageUrl(detail.printing);
  return {
    name: detail.card?.name ?? '',
    game: detail.card?.game ?? null,
    imageUrl: own ?? detail.card?.primaryImageUrl ?? null,
    byPrinting: byPrinting(detail.printing ? [detail.printing] : []),
  };
}

/** Pictures from search results: the card and the printings found with it. */
export function cardPicturesOfResults(
  card: CardSummary | undefined,
  printings: readonly PrintingSummary[],
  printingId: string | null,
): CardPictures | null {
  const chosen = printingId ? printings.find((printing) => printing.id === printingId) : undefined;
  const imageUrl = printingImageUrl(chosen) ?? card?.primaryImageUrl ?? null;
  if (!card && !imageUrl) {
    return null;
  }
  return {
    name: card?.name ?? '',
    game: card?.game ?? null,
    imageUrl,
    byPrinting: byPrinting(printings.filter((printing) => !card || printing.cardId === card.id)),
  };
}

/** The picture of a listing's printing, else the card's. */
export function pictureFor(
  pictures: CardPictures | null | undefined,
  printingId: string | null | undefined,
): string | null {
  if (!pictures) {
    return null;
  }
  return (printingId ? pictures.byPrinting[printingId] : undefined) ?? pictures.imageUrl;
}
