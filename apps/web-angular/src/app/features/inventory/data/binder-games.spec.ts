import { binder, item } from '../testing/fixtures';
import {
  binderTakes,
  binderTakesAll,
  gameOpenForBinders,
  groupBindersByGame,
  onlyGameLabel,
  reorderWithinGame,
} from './binder-games';

describe('binders by game (stage G, spec 9.2)', () => {
  const yugioh = binder('y1', { game: 'yugioh' });
  const pokemon = binder('p1', { game: 'pokemon', games: ['pokemon'] });

  it("groups in the phone's order, binders keeping theirs", () => {
    const groups = groupBindersByGame([pokemon, yugioh, binder('y2', { game: 'yugioh' })]);
    expect(groups.map((group) => group.game)).toEqual(['yugioh', 'pokemon']);
    expect(groups[0].binders.map((b) => b.id)).toEqual(['y1', 'y2']);
  });

  it('takes cards of its game only', () => {
    const card = item('a');
    expect(binderTakes(yugioh, card)).toBe(true);
    expect(binderTakes(pokemon, card)).toBe(false);
    expect(
      binderTakesAll(yugioh, [card, item('b', { card: { id: 'x', name: 'X', game: 'pokemon' } })]),
    ).toBe(false);
    expect(onlyGameLabel('pokemon')).toBe('Only Pokémon cards can go in');
  });

  it('moves a binder up or down within its game, the others in place', () => {
    const list = [yugioh, pokemon, binder('y2', { game: 'yugioh' })];
    expect(reorderWithinGame(list, 'y2', -1)).toEqual(['y2', 'p1', 'y1']);
    expect(reorderWithinGame(list, 'y1', -1)).toEqual(['y1', 'p1', 'y2']);
    expect(reorderWithinGame(list, 'p1', 1)).toEqual(['y1', 'p1', 'y2']);
  });

  it('opens a game for binders when it has cards', () => {
    expect(gameOpenForBinders({ hasCards: false })).toBe(false);
    expect(gameOpenForBinders({ hasCards: true, status: 'HIDDEN' as never })).toBe(false);
    expect(gameOpenForBinders({ hasCards: true })).toBe(true);
  });
});
