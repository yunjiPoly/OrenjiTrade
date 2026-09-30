import type { CardDetail, CardSuggestion } from '@orenji/api-client';

/** A printing chosen to share in a message or a community post (`cardPrintingId`). */
export interface CardLinkChoice {
  printingId: string;
  cardId: string;
  name: string;
  printingCode: string | null;
  imageUrl: string | null;
  game: string | null;
}

/** One of the caller's public binders chosen to share (`binderId`). */
export interface BinderLinkChoice {
  binderId: string;
  name: string;
  itemCount: number;
}

/**
 * The printing a suggestion stands for: a PRINTING suggestion names it; a CARD suggestion names
 * the card, so its printing with the suggested code is taken (or the first one).
 */
export function printingForSuggestion(
  suggestion: CardSuggestion,
  card: Pick<CardDetail, 'id' | 'printings'> | null,
): string | null {
  if (suggestion.kind === 'PRINTING' && suggestion.printingId) {
    return suggestion.printingId;
  }
  const printings = card?.printings ?? [];
  const byCode = suggestion.printingCode
    ? printings.find((printing) => printing.printingCode === suggestion.printingCode)
    : undefined;
  return (byCode ?? printings[0])?.id ?? null;
}
