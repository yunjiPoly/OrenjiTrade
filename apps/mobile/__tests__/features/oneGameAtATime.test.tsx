import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { BinderResponse, GameResponse } from '@/src/api/types';
import { bindersByGame, bindersForGame } from '@/src/features/binders/binderForm';
import { InventoryBinders } from '@/src/features/binders/InventoryBinders';
import {
  BROWSING_GAME_STORAGE_PREFIX,
  gameOptions,
  resolveBrowsingGame,
  useBrowsingGame,
} from '@/src/features/games/browsingGame';
import { GamePill } from '@/src/features/games/GamePill';
import { gameTile } from '@/src/features/games/gameTiles';
import { bulkResultMessage } from '@/src/features/inventory/bulkActions';
import { regionLine } from '@/src/features/regions/regionCopy';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  binderFixture,
  deckCoreFixture,
  profileFixture,
  summaryFixture,
} from '../support/fixtures';
import { mockApi, ok } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { renderWithProviders, resetAppState } from '../test-utils';

beforeEach(async () => {
  resetAppState();
  await AsyncStorage.clear();
});

/** The five games of stage G as `GET /games` lists them (One Piece without cards yet). */
const FIVE_GAMES: GameResponse[] = [
  ['yugioh', 'Yu-Gi-Oh!', true],
  ['pokemon', 'Pokémon', true],
  ['mtg', 'Magic', true],
  ['onepiece', 'One Piece', false],
  ['riftbound', 'Riftbound', true],
].map(([slug, shortName, hasCards], index) => ({
  id: `game-${String(slug)}`,
  slug: String(slug),
  name: `${String(shortName)} TCG`,
  shortName: String(shortName),
  status: 'ACTIVE',
  sortOrder: (index + 1) * 10,
  hasCards: Boolean(hasCards),
}));

const OPTIONS = gameOptions(FIVE_GAMES);

/** What a screen reads of the browsed game, as text. */
function Probe() {
  const { game, ready } = useBrowsingGame();
  return <Text testID="probe">{`${game}|${ready ? 'ready' : 'waiting'}`}</Text>;
}

const probe = () => screen.getByTestId('probe');

function routes(profileGames: string[], extra = {}) {
  return signedInRoutes({
    'GET /api/v1/games': ok(FIVE_GAMES),
    'GET /api/v1/me/profile': ok(profileFixture({ games: profileGames })),
    'GET /api/v1/inventory/summary': ok(summaryFixture({ byGame: { yugioh: 38, pokemon: 2 } })),
    ...extra,
  });
}

describe('which game Home and Search browse (pure)', () => {
  it('prefers the pick, then the phone, then the first profile game with cards, then Yu-Gi-Oh!', () => {
    const base = { picked: null, stored: null, profileGames: [], options: OPTIONS };
    expect(resolveBrowsingGame({ ...base, picked: 'mtg', stored: 'pokemon' })).toBe('mtg');
    expect(resolveBrowsingGame({ ...base, stored: 'pokemon', profileGames: ['mtg'] })).toBe(
      'pokemon'
    );
    expect(resolveBrowsingGame({ ...base, profileGames: ['onepiece', 'mtg'] })).toBe('mtg');
    expect(resolveBrowsingGame({ ...base, profileGames: ['onepiece'] })).toBe('yugioh');
    expect(resolveBrowsingGame(base)).toBe('yugioh');
  });

  it('never browses a game without cards, even remembered or picked', () => {
    const base = { picked: null, stored: null, profileGames: [], options: OPTIONS };
    expect(resolveBrowsingGame({ ...base, picked: 'onepiece' })).toBe('yugioh');
    expect(resolveBrowsingGame({ ...base, stored: 'onepiece', profileGames: ['pokemon'] })).toBe(
      'pokemon'
    );
    // Without the games list (not read yet, offline) the server answers for the choice.
    expect(resolveBrowsingGame({ ...base, stored: 'mtg', options: null })).toBe('mtg');
  });

  it('marks the games that can be browsed: ACTIVE with cards', () => {
    expect(OPTIONS.map((option) => [option.slug, option.name, option.browsable])).toEqual([
      ['yugioh', 'Yu-Gi-Oh!', true],
      ['pokemon', 'Pokémon', true],
      ['mtg', 'Magic', true],
      ['onepiece', 'One Piece', false],
      ['riftbound', 'Riftbound', true],
    ]);
  });

  it('takes the monogram tiles from the design tokens', () => {
    expect(gameTile('yugioh')).toEqual({
      letter: 'Y',
      foreground: '#FDBA74',
      background: '#4A2A0A',
    });
    expect(gameTile('onepiece')).toEqual({
      letter: 'O',
      foreground: '#FCA5A5',
      background: '#4A1D1D',
    });
    expect(gameTile('lorcana', 'Lorcana').letter).toBe('L');
  });
});

describe('the browsed game on the phone', () => {
  it('starts on the first profile game that has cards', async () => {
    mockApi(routes(['onepiece', 'pokemon']));
    renderWithProviders(<Probe />, { port: new FakeAuthPort(testUser({ uid: 'uid-maika' })) });
    await waitFor(() => expect(probe()).toHaveTextContent('pokemon|ready'));
  });

  it('is remembered per account on the phone, the slug alone', async () => {
    mockApi(routes(['pokemon']));
    const first = renderWithProviders(
      <>
        <GamePill testID="pill" />
        <Probe />
      </>,
      { port: new FakeAuthPort(testUser({ uid: 'uid-maika' })) }
    );
    await waitFor(() => expect(probe()).toHaveTextContent('pokemon|ready'));
    fireEvent.press(screen.getByTestId('pill'));
    fireEvent.press(screen.getByTestId('pill-sheet-option-mtg'));
    await waitFor(() => expect(probe()).toHaveTextContent('mtg|ready'));
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(`${BROWSING_GAME_STORAGE_PREFIX}uid-maika`)).toBe('mtg')
    );
    first.unmount();

    // Another account on the same phone starts on its own default.
    resetAppState();
    await AsyncStorage.setItem(`${BROWSING_GAME_STORAGE_PREFIX}uid-maika`, 'mtg');
    mockApi(routes(['pokemon']));
    const second = renderWithProviders(<Probe />, {
      port: new FakeAuthPort(testUser({ uid: 'uid-other' })),
    });
    await waitFor(() => expect(probe()).toHaveTextContent('pokemon|ready'));
    second.unmount();

    // The first account finds its game again after a restart.
    resetAppState();
    await AsyncStorage.setItem(`${BROWSING_GAME_STORAGE_PREFIX}uid-maika`, 'mtg');
    mockApi(routes(['pokemon']));
    renderWithProviders(<Probe />, { port: new FakeAuthPort(testUser({ uid: 'uid-maika' })) });
    await waitFor(() => expect(probe()).toHaveTextContent('mtg|ready'));
  });
});

describe('the game pill and "Choose a game" (screen 34)', () => {
  it('names the game and opens the sheet with every game, dimming those without cards', async () => {
    mockApi(routes(['yugioh']));
    renderWithProviders(
      <>
        <GamePill testID="pill" />
        <Probe />
      </>,
      { port: new FakeAuthPort(testUser({ uid: 'uid-maika' })) }
    );
    await waitFor(() => expect(probe()).toHaveTextContent('yugioh|ready'));
    const pill = screen.getByRole('button', { name: 'Game: Yu-Gi-Oh!. Change game' });
    fireEvent.press(pill);

    expect(screen.getByText('Choose a game')).toBeOnTheScreen();
    expect(screen.getByText('Home and Search show one game at a time.')).toBeOnTheScreen();
    // Each row: the name, then its line ("{n} of your cards"), said after the name.
    await waitFor(() =>
      expect(screen.getByTestId('pill-sheet-option-yugioh')).toHaveTextContent(
        'YYu-Gi-Oh!38 of your cards'
      )
    );
    expect(screen.getByRole('radio', { name: 'Yu-Gi-Oh!' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Pokémon' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Pokémon' }).props.accessibilityHint).toBe(
      '2 of your cards'
    );
    expect(screen.getByRole('radio', { name: 'Magic' }).props.accessibilityHint).toBe(
      'None of your cards yet'
    );
    const onePiece = screen.getByRole('radio', { name: 'One Piece' });
    expect(onePiece.props.accessibilityHint).toBe('Cards coming soon');
    expect(onePiece).toBeDisabled();
    expect(
      screen.getByText(
        'Your inventory keeps every game, with binders grouped by game. Chats and the bell show every game.'
      )
    ).toBeOnTheScreen();

    // A game without cards cannot be picked.
    fireEvent.press(onePiece);
    expect(probe()).toHaveTextContent('yugioh|ready');

    // Picking closes the sheet and the pill shows the game; nothing else to confirm.
    fireEvent.press(screen.getByRole('radio', { name: 'Pokémon' }));
    await waitFor(() => expect(probe()).toHaveTextContent('pokemon|ready'));
    expect(screen.getByRole('button', { name: 'Game: Pokémon. Change game' })).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByText('Choose a game')).toBeNull());
  });
});

describe('Inventory › Binders grouped by game (screen 17)', () => {
  const yugiohCore = deckCoreFixture({ id: 'b-core', game: 'yugioh', name: 'Snake-Eye core' });
  const yugiohBinder = binderFixture({ id: 'b-ygo', game: 'yugioh', name: 'For trade' });
  const pokemonBinder = binderFixture({ id: 'b-pkm', game: 'pokemon', name: 'Trade binder' });
  const order = OPTIONS.map((option) => option.slug);

  it('one section per game that has binders, in the games order, deck cores first', () => {
    const sections = bindersByGame([pokemonBinder, yugiohBinder, yugiohCore], order);
    expect(sections.map((section) => section.game)).toEqual(['yugioh', 'pokemon']);
    expect(sections[0]?.binders.map((binder) => binder.id)).toEqual(['b-core', 'b-ygo']);
    expect(sections[1]?.binders.map((binder) => binder.id)).toEqual(['b-pkm']);
  });

  it('a card goes into the binders of its own game only', () => {
    const all: BinderResponse[] = [yugiohCore, yugiohBinder, pokemonBinder];
    expect(bindersForGame(all, 'pokemon').map((binder) => binder.id)).toEqual(['b-pkm']);
    expect(bindersForGame(all, null)).toHaveLength(3);
  });

  it('shows each game with its tile, its name and its number of binders', async () => {
    mockApi(
      routes(['yugioh'], { 'GET /api/v1/binders': ok([pokemonBinder, yugiohBinder, yugiohCore]) })
    );
    renderWithProviders(<InventoryBinders />, {
      port: new FakeAuthPort(testUser({ uid: 'uid-maika' })),
    });
    await waitFor(() =>
      expect(screen.getByRole('header', { name: 'Yu-Gi-Oh!, 2 binders' })).toBeOnTheScreen()
    );
    expect(screen.getByRole('header', { name: 'Pokémon, 1 binder' })).toBeOnTheScreen();
    expect(screen.getByTestId('binders-section-yugioh')).toBeOnTheScreen();
    expect(screen.getByTestId('binders-section-pokemon')).toBeOnTheScreen();
    // The deck core keeps its purple tag.
    expect(screen.getByText(/Deck core/)).toBeOnTheScreen();
  });
});

describe('words of stage G', () => {
  it('says how many cards of another game a bulk move left where they were', () => {
    expect(
      bulkResultMessage(
        { kind: 'move', binderId: 'b-ygo', binderName: 'For trade' },
        {
          updated: 2,
          skipped: [
            { itemId: 'i1', reason: 'BINDER_GAME_MISMATCH' },
            { itemId: 'i2', reason: 'UNCHANGED' },
          ],
        }
      )
    ).toBe(
      '2 cards moved to “For trade”. 1 card skipped: already in that state. 1 card skipped: of another game than the binder.'
    );
  });

  it('names a few countries of each region, "Your region" first for the collector', () => {
    expect(regionLine('americas-north', true)).toBe('Your region · Canada, United States, Mexico');
    expect(regionLine('europe', false)).toBe('France, Germany, Spain and more');
    expect(regionLine('oceania', false, ['Australia', 'New Zealand'])).toBe(
      'Australia, New Zealand'
    );
  });
});
