import type { CardSuggestion } from '@orenji/api-client';
import { uniqueSuggestions } from './card-suggestions';

const CARD = {
  kind: 'CARD',
  id: 'card-1',
  name: 'Azure-Eyes Sky Dragon',
  game: 'yugioh',
  printingCode: 'AZR-EN001',
} as CardSuggestion;
const PRINTING = {
  kind: 'PRINTING',
  id: 'card-2',
  printingId: 'printing-9',
  name: 'Lantern Fox Spirit',
  game: 'yugioh',
  printingCode: 'AZR-EN011',
} as CardSuggestion;

describe('uniqueSuggestions', () => {
  it('drops printings that repeat the same card and printing code', () => {
    const twin = { ...PRINTING, printingId: 'printing-10' };
    expect(uniqueSuggestions([CARD, PRINTING, twin])).toEqual([CARD, PRINTING]);
  });

  it('keeps the same card under another code, and a card beside its printing', () => {
    const other = { ...PRINTING, printingCode: 'AZR-EN012' };
    const asCard = { ...PRINTING, kind: 'CARD' } as CardSuggestion;
    expect(uniqueSuggestions([PRINTING, other, asCard])).toHaveLength(3);
  });
});
