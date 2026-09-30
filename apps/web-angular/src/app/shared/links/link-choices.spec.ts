import {
  BinderResponse,
  BinderResponseKindEnum,
  BinderResponseVisibilityEnum,
  CardSuggestionKindEnum,
  FreshnessStateEnum,
} from '@orenji/api-client';
import { matchingBinders } from './binder-link-picker.component';
import { printingForSuggestion } from './link-choices';

function binder(name: string, effectivePublic: boolean): BinderResponse {
  return {
    id: name,
    name,
    description: '',
    kind: BinderResponseKindEnum.Trade,
    visibility: effectivePublic
      ? BinderResponseVisibilityEnum.Public
      : BinderResponseVisibilityEnum.Private,
    sortOrder: 0,
    itemCount: 3,
    publicItemCount: effectivePublic ? 3 : 0,
    effectivePublic,
    games: [],
    freshness: {
      state: FreshnessStateEnum.Active,
      confirmedAt: '',
      updatedAt: '',
      label: '',
    },
    createdAt: '',
    updatedAt: '',
  };
}

describe('link choices', () => {
  it('uses the printing of a printing suggestion', () => {
    expect(
      printingForSuggestion(
        { kind: CardSuggestionKindEnum.Printing, id: 'c', printingId: 'p9' },
        null,
      ),
    ).toBe('p9');
  });

  it('resolves a card suggestion to its printing with the suggested code, else the first', () => {
    const card = {
      id: 'c',
      printings: [
        { id: 'p1', printingCode: 'AZR-EN001' },
        { id: 'p2', printingCode: 'AZR-FR001' },
      ],
    } as Parameters<typeof printingForSuggestion>[1];
    expect(
      printingForSuggestion(
        { kind: CardSuggestionKindEnum.Card, id: 'c', printingCode: 'AZR-FR001' },
        card,
      ),
    ).toBe('p2');
    expect(printingForSuggestion({ kind: CardSuggestionKindEnum.Card, id: 'c' }, card)).toBe('p1');
    expect(printingForSuggestion({ kind: CardSuggestionKindEnum.Card, id: 'c' }, null)).toBeNull();
  });

  it('offers only public binders, matched without case or accents', () => {
    const binders = [
      binder('Échanges Pokémon', true),
      binder('Private stash', false),
      binder('Trades', true),
    ];
    expect(matchingBinders(binders, '').map((b) => b.name)).toEqual(['Échanges Pokémon', 'Trades']);
    expect(matchingBinders(binders, 'echanges pokemon').map((b) => b.name)).toEqual([
      'Échanges Pokémon',
    ]);
    expect(matchingBinders(binders, 'stash')).toEqual([]);
  });
});
