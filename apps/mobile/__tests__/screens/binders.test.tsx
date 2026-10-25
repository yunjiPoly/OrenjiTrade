import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { Dimensions, Keyboard, View } from 'react-native';

import BinderScreen from '@/app/binders/[id]';
import type { BinderResponse, UpdateBinderRequest } from '@/src/api/types';
import EditBinderScreen from '@/app/binders/edit';
import NewBinderScreen from '@/app/binders/new';
import { useBinderUiStore } from '@/src/features/binders/binderUiStore';
import { PINNED_MAX_FONT_SCALE } from '@/src/theme';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  binderFixture,
  BINDER_ID,
  BINDER_PHOTO,
  conversationFixture,
  GAMES,
  deckCoreFixture,
  inventoryPage,
  ITEM_ID,
  itemFixture,
  meFixture,
  publicBinderFixture,
  publicDeckCoreFixture,
  publicItemFixture,
} from '../support/fixtures';
import { mockApi, noContent, ok, problem, type MockRequest } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: () => undefined,
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));

const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  useBinderUiStore.setState({ failedPhotos: {} });
  picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true } as never);
});

const port = () => new FakeAuthPort(testUser());

const CORE_ID = deckCoreFixture().id;
const FILED = itemFixture({ binder: { id: BINDER_ID, name: 'Trade binder' } });
const OTHER = itemFixture({
  id: 'item-2',
  card: { id: 'c2', name: 'Tidal Otterling', game: 'pokemon' },
  visibility: 'PRIVATE',
});

function libraryPick(...names: string[]) {
  picker.launchImageLibraryAsync.mockResolvedValue({
    canceled: false,
    assets: names.map((name) => ({
      uri: `file:///${name}`,
      mimeType: 'image/jpeg',
      fileName: name,
      fileSize: 120_000,
    })),
  } as never);
}

/**
 * A binder the fake API keeps (GET answers what PATCH saved), with its public page, for the
 * screens that must follow a save made elsewhere.
 */
function savedBinder(start: BinderResponse) {
  let current = start;
  const patch = ({ body }: MockRequest) => {
    const changes = body as UpdateBinderRequest;
    current = {
      ...current,
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      ...(changes.askingPriceText !== undefined
        ? { askingPriceText: changes.askingPriceText }
        : {}),
      ...(changes.sellsAsCore !== undefined ? { sellsAsCore: changes.sellsAsCore } : {}),
    };
    return ok(current);
  };
  return {
    'GET /api/v1/binders': () => ok([current]),
    'GET /api/v1/binders/{id}': () => ok(current),
    'PATCH /api/v1/binders/{id}': patch,
    'GET /api/v1/public/binders/{id}': () =>
      ok(
        publicDeckCoreFixture({
          id: current.id,
          name: current.name,
          askingPriceText: current.askingPriceText,
        })
      ),
  };
}

function editRoutes(binder = binderFixture(), extra = {}) {
  return signedInRoutes({
    'GET /api/v1/binders': ok([binder]),
    'GET /api/v1/binders/{id}': ok(binder),
    'GET /api/v1/binders/{id}/items': ok(inventoryPage(binder.sellsAsCore ? [] : [FILED])),
    ...extra,
  });
}

describe('Edit binder (screen 18)', () => {
  beforeEach(() => {
    mockParams.current = { id: BINDER_ID };
  });

  it('opens a plain binder: its name, who can see it, the switch off and the cards inside', async () => {
    mockApi(editRoutes());
    renderWithProviders(<EditBinderScreen />, { port: port() });
    expect(await screen.findByTestId('binder-name')).toHaveProp('value', 'Trade binder');
    expect(screen.getByText('Edit binder')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Private' })).toBeChecked();
    expect(screen.getByTestId('binder-visibility-hint')).toHaveTextContent(
      'Only you see it until you make it public.'
    );
    expect(screen.getByTestId('binder-deck-core-switch')).toHaveProp('value', false);
    expect(screen.getByText('Photos, one price and a note')).toBeOnTheScreen();
    expect(screen.queryByTestId('binder-price')).toBeNull();
    expect(screen.getByTestId('binder-cards-title')).toHaveTextContent('Cards inside');
    expect(await screen.findByTestId(`binder-card-${ITEM_ID}`)).toBeOnTheScreen();
    expect(screen.queryByTestId('binder-cards-hint')).toBeNull();
    // Nothing changed yet: the button says so and does nothing.
    const save = screen.getByTestId('edit-binder-save');
    expect(save).toHaveTextContent('No changes yet');
    expect(save).toBeDisabled();
    expect(screen.getByTestId('edit-binder-delete')).toHaveTextContent('Delete binder');
  });

  it('the owner’s own binder link opens Edit binder too', async () => {
    mockApi(editRoutes());
    renderWithProviders(<BinderScreen />, { port: port() });
    expect(screen.getByTestId('binder-resolving')).toBeOnTheScreen();
    expect(await screen.findByTestId('binder-name')).toHaveProp('value', 'Trade binder');
    expect(screen.getByTestId('edit-binder-back').props.accessibilityLabel).toBe(
      'Back to your binders'
    );
  });

  it('says where Back leads when a reminder in Notifications opened it (stage R9)', async () => {
    mockParams.current = { id: BINDER_ID, from: 'notifications' };
    mockApi(editRoutes());
    renderWithProviders(<BinderScreen />, { port: port() });
    expect(await screen.findByTestId('binder-name')).toHaveProp('value', 'Trade binder');
    expect(screen.getByTestId('edit-binder-back').props.accessibilityLabel).toBe(
      'Back to Notifications'
    );
    fireEvent.press(screen.getByTestId('edit-binder-back'));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('turns on “Sell as a deck core”: photos, price, note, public, and key cards', async () => {
    mockApi(editRoutes());
    renderWithProviders(<EditBinderScreen />, { port: port() });
    fireEvent(await screen.findByTestId('binder-deck-core-switch'), 'valueChange', true);
    expect(screen.getByTestId('card-photos-count')).toHaveTextContent('0 / 4');
    expect(screen.getByTestId('card-photos-add')).toHaveTextContent(/Add$/);
    expect(screen.getByTestId('binder-price')).toHaveProp('placeholder', '$180 or Trade only');
    expect(screen.getByTestId('binder-note')).toHaveProp(
      'placeholder',
      "What's in it, condition, language"
    );
    // The description becomes the note: "Duplicates for trade."
    expect(screen.getByText('21 / 500')).toBeOnTheScreen();
    // A deck core is for buyers: the switch makes it public, and the section names key cards.
    expect(screen.getByRole('radio', { name: 'Public' })).toBeChecked();
    expect(screen.getByTestId('binder-cards-title')).toHaveTextContent('Key cards · optional');
    expect(screen.getByTestId('binder-cards-hint')).toHaveTextContent(
      'Helps buyers find it when they search a card.'
    );
    // Private again: buyers cannot find it, said in the warning colour.
    fireEvent.press(screen.getByTestId('binder-visibility-PRIVATE'));
    expect(screen.getByTestId('binder-visibility-hint')).toHaveTextContent(
      'Buyers can only find a deck core when it is public.'
    );
    expect(screen.getByTestId('edit-binder-save')).toHaveTextContent('Save changes');
    expect(screen.getByTestId('edit-binder-save')).not.toBeDisabled();
  });

  it('saves a deck core with its price and note, and confirms it is still available', async () => {
    const api = mockApi(
      editRoutes(binderFixture(), {
        'PATCH /api/v1/binders/{id}': ok(
          binderFixture({ sellsAsCore: true, askingPriceText: '$180', visibility: 'PUBLIC' })
        ),
      })
    );
    renderWithProviders(<EditBinderScreen />, { port: port() });
    fireEvent(await screen.findByTestId('binder-deck-core-switch'), 'valueChange', true);
    fireEvent.changeText(screen.getByTestId('binder-price'), ' $180 ');
    fireEvent.changeText(screen.getByTestId('binder-note'), 'All NM, English.');
    fireEvent.press(screen.getByTestId('edit-binder-save'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.callsTo('PATCH /api/v1/binders/{id}')[0]?.body).toEqual({
      confirm: true,
      visibility: 'PUBLIC',
      sellsAsCore: true,
      askingPriceText: '$180',
      description: 'All NM, English.',
    });
    expect(await screen.findByText('Saved')).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/inventory/items/bulk')).toHaveLength(0);
  });

  it('checks the price and the note before saving', async () => {
    const api = mockApi(editRoutes(deckCoreFixture()));
    mockParams.current = { id: CORE_ID };
    renderWithProviders(<EditBinderScreen />, { port: port() });
    fireEvent.changeText(await screen.findByTestId('binder-price'), 'x'.repeat(41));
    fireEvent.changeText(screen.getByTestId('binder-note'), 'y'.repeat(501));
    fireEvent.press(screen.getByTestId('edit-binder-save'));
    expect(await screen.findByText('At most 40 characters.')).toBeOnTheScreen();
    expect(screen.getByText('At most 500 characters.')).toBeOnTheScreen();
    expect(screen.getByTestId('edit-binder-error')).toHaveTextContent(
      /Check the highlighted fields\.$/
    );
    expect(api.callsTo('PATCH /api/v1/binders/{id}')).toHaveLength(0);
  });

  it('adds photos to a deck core and removes one with “Save changes”', async () => {
    mockParams.current = { id: CORE_ID };
    const api = mockApi(
      editRoutes(deckCoreFixture(), {
        'PATCH /api/v1/binders/{id}': ok(deckCoreFixture()),
        'DELETE /api/v1/binders/{id}/images/{imageId}': noContent,
        'POST /api/v1/binders/{id}/images': ok(deckCoreFixture(), 201),
      })
    );
    libraryPick('front.jpg', 'back.jpg');
    renderWithProviders(<EditBinderScreen />, { port: port() });
    expect(await screen.findByTestId('card-photos-count')).toHaveTextContent('1 / 4');
    fireEvent.press(screen.getByTestId('card-photos-add'));
    fireEvent.press(await screen.findByTestId('card-photos-library'));
    expect(await screen.findByText('3 / 4')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('card-photo-1-remove'));
    expect(screen.getByTestId('card-photos-count')).toHaveTextContent('2 / 4');
    fireEvent.press(screen.getByTestId('edit-binder-save'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.callsTo('PATCH /api/v1/binders/{id}')[0]?.body).toEqual({ confirm: true });
    expect(api.callsTo('DELETE /api/v1/binders/{id}/images/{imageId}')[0]?.path).toContain(
      BINDER_PHOTO.id
    );
    expect(api.callsTo('POST /api/v1/binders/{id}/images')).toHaveLength(2);
  });

  it('keeps a photo that was not saved, with “Try again”', async () => {
    mockParams.current = { id: CORE_ID };
    const api = mockApi(
      editRoutes(deckCoreFixture({ photos: [], previewImages: [] }), {
        'PATCH /api/v1/binders/{id}': ok(deckCoreFixture()),
        'POST /api/v1/binders/{id}/images': [
          problem(500, 'INTERNAL_ERROR', 'boom'),
          ok(deckCoreFixture(), 201),
        ],
      })
    );
    libraryPick('front.jpg');
    renderWithProviders(<EditBinderScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('card-photos-add'));
    fireEvent.press(await screen.findByTestId('card-photos-library'));
    fireEvent.press(await screen.findByTestId('edit-binder-save'));
    expect(await screen.findByTestId('card-photos-failed')).toHaveTextContent(
      /^1 photo wasn't saved\. Try again\./
    );
    expect(await screen.findByText("Saved · 1 photo wasn't saved")).toBeOnTheScreen();
    expect(mockRouter.back).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('card-photos-retry'));
    await waitFor(() => expect(api.callsTo('POST /api/v1/binders/{id}/images')).toHaveLength(2));
    await waitFor(() => expect(screen.queryByTestId('card-photos-failed')).toBeNull());
  });

  it('picks cards from the inventory and moves them in with the save; a deck core shows them', async () => {
    mockParams.current = { id: CORE_ID };
    const api = mockApi(
      editRoutes(deckCoreFixture(), {
        'GET /api/v1/inventory/items': ok(inventoryPage([FILED, OTHER])),
        'PATCH /api/v1/binders/{id}': ok(deckCoreFixture()),
        'POST /api/v1/inventory/items/bulk': ok({ updated: 1, skipped: [] }),
      })
    );
    renderWithProviders(<EditBinderScreen />, { port: port() });
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    fireEvent.press(await screen.findByTestId('binder-add-cards'));
    const sheet = await screen.findByTestId('card-picker-sheet');
    // The name or note typed last lets go of the keyboard: iOS would give it back to that field
    // when the picker leaves, over the form's button (stage R5 review, F2).
    expect(dismiss).toHaveBeenCalled();
    dismiss.mockRestore();
    expect(
      within(sheet).getByText(
        'Cards in another binder move here. Buyers see them when the deck core is public.'
      )
    ).toBeOnTheScreen();
    expect(within(sheet).getByTestId('card-picker-submit')).toBeDisabled();
    fireEvent.press(await within(sheet).findByTestId('card-picker-item-2'));
    expect(within(sheet).getByTestId('card-picker-submit')).toHaveTextContent('Add 1 card');
    fireEvent.press(within(sheet).getByTestId('card-picker-submit'));
    expect(await screen.findByTestId('binder-card-note-item-2')).toHaveTextContent(
      'Added when you save'
    );
    expect(screen.getByTestId('edit-binder-save')).toHaveTextContent('Save changes');
    fireEvent.press(screen.getByTestId('edit-binder-save'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    // Only a move: the card keeps the visibility its collector gave it (a public deck core shows
    // its cards as key cards; a card that leaves it is as private as before).
    expect(api.callsTo('POST /api/v1/inventory/items/bulk').map((call) => call.body)).toEqual([
      { action: 'MOVE_TO_BINDER', binderId: CORE_ID, itemIds: ['item-2'] },
    ]);
  });

  it('keeps the picker’s cards and its button within reach at the largest text size', async () => {
    mockParams.current = { id: CORE_ID };
    mockApi(
      editRoutes(deckCoreFixture(), {
        'GET /api/v1/inventory/items': ok(inventoryPage([FILED, OTHER])),
      })
    );
    const window = Dimensions.get('window');
    const textSize = (fontScale: number) =>
      act(() => {
        Dimensions.set({
          window: { ...window, fontScale },
          screen: { ...window, fontScale },
        });
      });
    textSize(3.1);
    try {
      renderWithProviders(<EditBinderScreen />, { port: port() });
      fireEvent.press(await screen.findByTestId('binder-add-cards'));
      const sheet = await screen.findByTestId('card-picker-sheet');
      // The field and the hint scroll with the cards (above them they filled the sheet: no card
      // and no button was left on screen); the button stays under the list.
      const list = within(sheet).getByTestId('card-picker-list');
      expect(within(list).getByTestId('card-picker-search')).toBeOnTheScreen();
      expect(
        within(list).getByText(
          'Cards in another binder move here. Buyers see them when the deck core is public.'
        )
      ).toBeOnTheScreen();
      expect(await within(list).findByTestId('card-picker-item-2')).toBeOnTheScreen();
      expect(within(list).queryByTestId('card-picker-submit')).toBeNull();
      const submit = within(sheet).getByTestId('card-picker-submit');
      expect(within(submit).getByText('Add cards')).toHaveProp(
        'maxFontSizeMultiplier',
        PINNED_MAX_FONT_SCALE
      );
      expect(within(sheet).getByTestId('card-picker-sheet-title')).toHaveProp(
        'maxFontSizeMultiplier',
        2
      );
      fireEvent.press(within(list).getByTestId('card-picker-item-2'));
      expect(within(submit).getByText('Add 1 card')).toBeOnTheScreen();

      // At the default size the field stays above the list, as in the mockup.
      textSize(1);
      expect(within(list).queryByTestId('card-picker-search')).toBeNull();
      expect(within(sheet).getByTestId('card-picker-search')).toBeOnTheScreen();
    } finally {
      textSize(1);
    }
  });

  it('takes a card out of a deck core with a move only: it keeps its own visibility', async () => {
    mockParams.current = { id: CORE_ID };
    const inCore = itemFixture({
      id: 'item-core',
      binder: { id: CORE_ID, name: 'Snake-Eye core' },
      visibility: 'PRIVATE',
    });
    const api = mockApi(
      editRoutes(deckCoreFixture(), {
        'GET /api/v1/binders/{id}/items': ok(inventoryPage([inCore])),
        'PATCH /api/v1/binders/{id}': ok(deckCoreFixture()),
        'POST /api/v1/inventory/items/bulk': ok({ updated: 1, skipped: [] }),
      })
    );
    renderWithProviders(<EditBinderScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('binder-card-toggle-item-core'));
    fireEvent.press(screen.getByTestId('edit-binder-save'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.callsTo('POST /api/v1/inventory/items/bulk').map((call) => call.body)).toEqual([
      { action: 'MOVE_TO_BINDER', itemIds: ['item-core'] },
    ]);
  });

  it('a binder saved elsewhere leaves this Edit binder up to date, with nothing to save', async () => {
    mockParams.current = { id: CORE_ID };
    const api = mockApi(editRoutes(deckCoreFixture(), savedBinder(deckCoreFixture())));
    // Two Edit binders of one deck core, as when the deck core page opened a second one.
    renderWithProviders(
      <>
        <View testID="first">
          <EditBinderScreen />
        </View>
        <View testID="second">
          <EditBinderScreen />
        </View>
      </>,
      { port: port() }
    );
    const first = within(await screen.findByTestId('first'));
    const second = within(screen.getByTestId('second'));
    fireEvent.changeText(await second.findByTestId('binder-price'), '$150');
    fireEvent.press(second.getByTestId('edit-binder-save'));
    await waitFor(() => expect(first.getByTestId('binder-price')).toHaveProp('value', '$150'));
    expect(first.getByTestId('edit-binder-save')).toHaveTextContent('No changes yet');
    expect(first.getByTestId('edit-binder-save')).toBeDisabled();
    // A field changed here stays, the others follow: the save sends only the change made here.
    fireEvent.changeText(first.getByTestId('binder-name'), 'Snake-Eye engine');
    fireEvent.press(first.getByTestId('edit-binder-save'));
    await waitFor(() => expect(api.callsTo('PATCH /api/v1/binders/{id}')).toHaveLength(2));
    expect(api.callsTo('PATCH /api/v1/binders/{id}')[1]?.body).toEqual({
      confirm: true,
      name: 'Snake-Eye engine',
    });
  });

  it('Save changes refreshes the deck core page under it', async () => {
    mockParams.current = { id: CORE_ID, view: 'public' };
    mockApi(
      editRoutes(deckCoreFixture(), {
        'GET /api/v1/me': ok(meFixture({ id: publicDeckCoreFixture().owner.id ?? undefined })),
        ...savedBinder(deckCoreFixture()),
      })
    );
    renderWithProviders(
      <>
        <BinderScreen />
        <EditBinderScreen />
      </>,
      { port: port() }
    );
    expect(await screen.findByTestId('deck-core-price')).toHaveTextContent('$180');
    fireEvent.changeText(await screen.findByTestId('binder-price'), '$150');
    fireEvent.press(screen.getByTestId('edit-binder-save'));
    await waitFor(() => expect(screen.getByTestId('deck-core-price')).toHaveTextContent('$150'));
  });

  it('photos picked, then the switch turned off, are not uploaded', async () => {
    mockParams.current = { id: CORE_ID };
    const api = mockApi(
      editRoutes(deckCoreFixture(), {
        'PATCH /api/v1/binders/{id}': ok(deckCoreFixture({ sellsAsCore: false })),
        'POST /api/v1/binders/{id}/images': ok(deckCoreFixture(), 201),
        'DELETE /api/v1/binders/{id}/images/{imageId}': noContent,
      })
    );
    libraryPick('front.jpg');
    renderWithProviders(<EditBinderScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('card-photos-add'));
    fireEvent.press(await screen.findByTestId('card-photos-library'));
    expect(await screen.findByText('2 / 4')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('card-photo-1-remove'));
    fireEvent(screen.getByTestId('binder-deck-core-switch'), 'valueChange', false);
    fireEvent.press(screen.getByTestId('edit-binder-save'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.callsTo('PATCH /api/v1/binders/{id}')[0]?.body).toEqual({
      confirm: true,
      sellsAsCore: false,
    });
    expect(api.callsTo('POST /api/v1/binders/{id}/images')).toHaveLength(0);
    expect(api.callsTo('DELETE /api/v1/binders/{id}/images/{imageId}')).toHaveLength(0);
  });

  it('the public note’s label keeps its words at large text: the counter goes under it', async () => {
    mockParams.current = { id: CORE_ID };
    mockApi(editRoutes(deckCoreFixture()));
    renderWithProviders(<EditBinderScreen />, { port: port() });
    const row = await screen.findByTestId('field-label-row-Public note');
    expect(row).toHaveStyle({ flexWrap: 'wrap' });
    expect(within(row).getByText('Public note')).not.toHaveStyle({ flex: 1 });
    expect(within(row).getByText('Public note')).toHaveStyle({ flexShrink: 1 });
  });

  it('takes a card out of a plain binder with the save (it becomes unfiled)', async () => {
    const api = mockApi(
      editRoutes(binderFixture(), {
        'PATCH /api/v1/binders/{id}': ok(binderFixture()),
        'POST /api/v1/inventory/items/bulk': ok({ updated: 1, skipped: [] }),
      })
    );
    renderWithProviders(<EditBinderScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId(`binder-card-toggle-${ITEM_ID}`));
    expect(screen.getByTestId(`binder-card-note-${ITEM_ID}`)).toHaveTextContent(
      'Leaves when you save'
    );
    fireEvent.press(screen.getByTestId('edit-binder-save'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.callsTo('POST /api/v1/inventory/items/bulk')[0]?.body).toEqual({
      action: 'MOVE_TO_BINDER',
      itemIds: [ITEM_ID],
    });
  });

  it('confirms a stale binder', async () => {
    const stale = binderFixture({
      freshness: {
        state: 'STALE',
        confirmedAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z',
        label: 'Updated 2 months ago',
      },
    });
    const api = mockApi(
      editRoutes(stale, { 'POST /api/v1/binders/{id}/confirm': ok(binderFixture()) })
    );
    renderWithProviders(<EditBinderScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('edit-binder-confirm'));
    expect(
      await screen.findByText('Confirmed: your binder and its cards are listed as available again.')
    ).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/binders/{id}/confirm')).toHaveLength(1);
  });

  it('deletes a deck core after a sheet; its cards stay', async () => {
    mockParams.current = { id: CORE_ID };
    const api = mockApi(
      editRoutes(deckCoreFixture(), { 'DELETE /api/v1/binders/{id}': noContent })
    );
    renderWithProviders(<EditBinderScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('edit-binder-delete'));
    const sheet = await screen.findByTestId('edit-binder-delete-sheet');
    expect(within(sheet).getByText('Delete Snake-Eye core?')).toBeOnTheScreen();
    expect(
      within(sheet).getByText(
        'Its photos, price and note go away. Your cards stay in your inventory.'
      )
    ).toBeOnTheScreen();
    expect(within(sheet).getByTestId('edit-binder-delete-sheet-cancel')).toHaveTextContent(
      'Keep it'
    );
    fireEvent.press(within(sheet).getByTestId('edit-binder-delete-sheet-confirm'));
    // Every screen of the deleted binder closes (its public page may be under this one).
    await waitFor(() =>
      expect(mockRouter.dismissTo).toHaveBeenCalledWith({
        pathname: '/inventory',
        params: { view: 'binders' },
      })
    );
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(api.callsTo('DELETE /api/v1/binders/{id}')).toHaveLength(1);
    expect(api.callsTo('DELETE /api/v1/binders/{id}')[0]?.query.get('deleteItems')).toBe('false');
    // The cards are left as they were: no visibility change.
    expect(api.callsTo('POST /api/v1/inventory/items/bulk')).toHaveLength(0);
    expect(await screen.findByText('Binder deleted')).toBeOnTheScreen();
  });

  it('deleted from its own link (/binders/[id]), it lands on Inventory › Binders', async () => {
    // The owner opens their own binder's link (a profile row, a chat card, a deep link): Edit
    // binder answers. The delete takes the binder out of their list; the screen keeps Edit binder
    // until it has closed every screen of the binder (review fix 2 of stage R3: it showed "This
    // binder is not available" and stayed).
    mockParams.current = { id: CORE_ID };
    let deleted = false;
    const api = mockApi(
      editRoutes(deckCoreFixture(), {
        'GET /api/v1/binders': () => ok(deleted ? [] : [deckCoreFixture()]),
        'DELETE /api/v1/binders/{id}': () => {
          deleted = true;
          return noContent;
        },
      })
    );
    renderWithProviders(<BinderScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('edit-binder-delete'));
    fireEvent.press(await screen.findByTestId('edit-binder-delete-sheet-confirm'));
    await waitFor(() =>
      expect(mockRouter.dismissTo).toHaveBeenCalledWith({
        pathname: '/inventory',
        params: { view: 'binders' },
      })
    );
    expect(api.callsTo('DELETE /api/v1/binders/{id}')).toHaveLength(1);
    expect(screen.queryByTestId('public-binder-not-found')).toBeNull();
    expect(api.callsTo('GET /api/v1/public/binders/{id}')).toHaveLength(0);
    expect(await screen.findByText('Binder deleted')).toBeOnTheScreen();
  });

  it('a deleted binder’s public page leaves the cache', async () => {
    mockParams.current = { id: CORE_ID };
    mockApi(editRoutes(deckCoreFixture(), { 'DELETE /api/v1/binders/{id}': noContent }));
    const { queryClient } = renderWithProviders(<EditBinderScreen />, { port: port() });
    queryClient.setQueryData(
      ['public', 'binders', CORE_ID, 'uid'],
      publicDeckCoreFixture({ id: CORE_ID })
    );
    fireEvent.press(await screen.findByTestId('edit-binder-delete'));
    fireEvent.press(await screen.findByTestId('edit-binder-delete-sheet-confirm'));
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalled());
    expect(queryClient.getQueryData(['public', 'binders', CORE_ID, 'uid'])).toBeUndefined();
  });

  it('shows its public page to the owner once it is public', async () => {
    mockParams.current = { id: CORE_ID };
    mockApi(editRoutes(deckCoreFixture()));
    renderWithProviders(<EditBinderScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('edit-binder-public-page'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/binders/[id]',
      params: { id: CORE_ID, view: 'public', from: 'edit' },
    });
  });

  it('keeps the game while a card that left the binder can still come back (review fix 1, U2)', async () => {
    const empty = binderFixture({ itemCount: 0, gameLocked: true });
    mockApi(editRoutes(empty, { 'GET /api/v1/binders/{id}/items': ok(inventoryPage([])) }));
    renderWithProviders(<EditBinderScreen />, { port: port() });
    const locked = await screen.findByTestId('binder-game-locked');
    expect(locked.props.accessibilityLabel).toBe(
      "Game: Pokémon. It can't change while a card that left the binder can still come back with Undo"
    );
    expect(screen.getByTestId('binder-game-undo-note')).toHaveTextContent(
      'A card that left this binder in the last 10 minutes can still come back with Undo. You can change the game after that.'
    );
    expect(screen.queryByTestId('binder-game-change')).toBeNull();
  });

  it('lets an empty binder change its game once nothing can come back', async () => {
    const empty = binderFixture({ itemCount: 0, gameLocked: false });
    mockApi(editRoutes(empty, { 'GET /api/v1/binders/{id}/items': ok(inventoryPage([])) }));
    renderWithProviders(<EditBinderScreen />, { port: port() });
    expect(await screen.findByTestId('binder-game-change')).toBeOnTheScreen();
    expect(screen.queryByTestId('binder-game-undo-note')).toBeNull();
  });

  it('explains a missing binder, a load error and a save error', async () => {
    const api = mockApi(
      editRoutes(binderFixture(), {
        'PATCH /api/v1/binders/{id}': problem(500, 'INTERNAL_ERROR', 'boom'),
      })
    );
    const { unmount } = renderWithProviders(<EditBinderScreen />, { port: port() });
    fireEvent.changeText(await screen.findByTestId('binder-name'), 'Renamed');
    fireEvent.press(screen.getByTestId('edit-binder-save'));
    expect(await screen.findByTestId('edit-binder-error')).toBeOnTheScreen();
    expect(api.callsTo('PATCH /api/v1/binders/{id}')).toHaveLength(1);
    unmount();

    mockApi(
      signedInRoutes({
        'GET /api/v1/binders': ok([]),
        'GET /api/v1/binders/{id}': problem(404, 'NOT_FOUND', 'Not found'),
      })
    );
    const second = renderWithProviders(<EditBinderScreen />, { port: port() });
    expect(await screen.findByText('Binder not found')).toBeOnTheScreen();
    second.unmount();

    mockApi(signedInRoutes({ 'GET /api/v1/binders/{id}': problem(500, 'INTERNAL_ERROR', 'boom') }));
    renderWithProviders(<EditBinderScreen />, { port: port() });
    expect(await screen.findByText('This binder could not load')).toBeOnTheScreen();
  });
});

describe('New binder', () => {
  it('creates a private binder once it has a name', async () => {
    const api = mockApi(
      signedInRoutes({
        'POST /api/v1/binders': ok(binderFixture({ id: 'b-new', name: 'Holos' }), 201),
      })
    );
    renderWithProviders(<NewBinderScreen />, { port: port() });
    expect(screen.getByText('New binder')).toBeOnTheScreen();
    const create = screen.getByTestId('edit-binder-save');
    expect(create).toHaveTextContent('Create binder');
    expect(create).toBeDisabled();
    expect(screen.queryByTestId('edit-binder-delete')).toBeNull();
    // The browsed game (the profile's Pokémon) once the games answered.
    expect(await screen.findByTestId('binder-game-pokemon')).toBeChecked();
    // Stage R14 (mockup v50 screen 63): the Settings top bar, and the game's line under "Cards
    // inside".
    expect(screen.getByRole('header', { name: 'New binder' })).toBeOnTheScreen();
    expect(screen.getByTestId('edit-binder-back')).toHaveProp(
      'accessibilityLabel',
      'Back to your binders'
    );
    expect(screen.getByTestId('binder-cards-hint')).toHaveTextContent(
      'Only your Pokémon cards can go in. Cards in another binder move here.'
    );
    fireEvent.changeText(screen.getByTestId('binder-name'), '  Holos ');
    fireEvent.press(screen.getByTestId('edit-binder-save'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.callsTo('POST /api/v1/binders')[0]?.body).toEqual({
      name: 'Holos',
      visibility: 'PRIVATE',
      sellsAsCore: false,
      gameId: 'g1',
    });
    expect(await screen.findByText('Saved')).toBeOnTheScreen();
  });

  it('says when the collector has no card of the binder’s game yet (R14 review fix 1, U4)', async () => {
    // Yu-Gi-Oh! cards only: a Pokémon binder has none to offer.
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items': (request) =>
          ok(inventoryPage(request.query.get('game') === 'pokemon' ? [] : [FILED])),
      })
    );
    renderWithProviders(<NewBinderScreen />, { port: port() });
    expect(await screen.findByTestId('binder-game-pokemon')).toBeChecked();
    fireEvent.press(screen.getByTestId('binder-add-cards'));
    const sheet = await screen.findByTestId('card-picker-sheet');
    expect(await within(sheet).findByTestId('card-picker-empty')).toHaveTextContent(
      'You have no Pokémon cards yet. Add them to your inventory first.'
    );
    expect(within(sheet).getByTestId('card-picker-submit')).toBeDisabled();
    expect(api.callsTo('GET /api/v1/inventory/items').at(-1)?.query.get('game')).toBe('pokemon');
  });

  it('says so when every card of the binder’s game is already in it', async () => {
    mockParams.current = { id: BINDER_ID };
    mockApi(
      editRoutes(binderFixture(), { 'GET /api/v1/inventory/items': ok(inventoryPage([FILED])) })
    );
    renderWithProviders(<EditBinderScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('binder-add-cards'));
    const sheet = await screen.findByTestId('card-picker-sheet');
    expect(await within(sheet).findByTestId('card-picker-empty')).toHaveTextContent(
      'All your cards are already in this binder.'
    );
  });

  it('creates a deck core with its photo; a photo that fails opens Edit binder on it', async () => {
    const created = deckCoreFixture({ id: 'core-new', name: 'Branded core', photos: [] });
    const api = mockApi(
      signedInRoutes({
        'POST /api/v1/binders': ok(created, 201),
        'POST /api/v1/binders/{id}/images': problem(503, 'UNAVAILABLE', 'later'),
      })
    );
    libraryPick('core.jpg');
    renderWithProviders(<NewBinderScreen />, { port: port() });
    fireEvent.changeText(screen.getByTestId('binder-name'), 'Branded core');
    fireEvent(screen.getByTestId('binder-deck-core-switch'), 'valueChange', true);
    fireEvent.changeText(screen.getByTestId('binder-price'), 'Trade only');
    fireEvent.press(screen.getByTestId('card-photos-add'));
    fireEvent.press(await screen.findByTestId('card-photos-library'));
    expect(await screen.findByText('1 / 4')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('edit-binder-save'));
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/binders/edit',
        params: { id: 'core-new' },
      })
    );
    expect(api.callsTo('POST /api/v1/binders')[0]?.body).toEqual({
      name: 'Branded core',
      visibility: 'PUBLIC',
      sellsAsCore: true,
      askingPriceText: 'Trade only',
      // Stage G: the browsed game (the profile's first game with cards).
      gameId: 'g1',
    });
    expect(useBinderUiStore.getState().failedPhotos['core-new']).toHaveLength(1);
  });

  it('a card move that fails after the binder was made opens Edit binder with the photos kept', async () => {
    const created = binderFixture({ id: 'b-new', name: 'Holos' });
    mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items': ok(inventoryPage([OTHER])),
        'POST /api/v1/binders': ok(created, 201),
        'POST /api/v1/inventory/items/bulk': problem(500, 'INTERNAL_ERROR', 'boom'),
      })
    );
    libraryPick('core.jpg');
    renderWithProviders(<NewBinderScreen />, { port: port() });
    fireEvent.changeText(screen.getByTestId('binder-name'), 'Holos');
    fireEvent(screen.getByTestId('binder-deck-core-switch'), 'valueChange', true);
    fireEvent.press(screen.getByTestId('card-photos-add'));
    fireEvent.press(await screen.findByTestId('card-photos-library'));
    expect(await screen.findByText('1 / 4')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('binder-add-cards'));
    const sheet = await screen.findByTestId('card-picker-sheet');
    fireEvent.press(await within(sheet).findByTestId('card-picker-item-2'));
    fireEvent.press(within(sheet).getByTestId('card-picker-submit'));
    fireEvent.press(screen.getByTestId('edit-binder-save'));
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/binders/edit',
        params: { id: 'b-new' },
      })
    );
    expect(await screen.findByTestId('snackbar')).toBeOnTheScreen();
    expect(useBinderUiStore.getState().failedPhotos['b-new']).toHaveLength(1);
  });

  it('saves only with the binder’s game: without the games list, “Try again” (review fix 1, P3)', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/games': [problem(503, 'UNAVAILABLE', 'Down'), ok(GAMES)],
        'POST /api/v1/binders': ok(binderFixture({ id: 'b-new', name: 'Holos' }), 201),
      })
    );
    renderWithProviders(<NewBinderScreen />, { port: port() });
    fireEvent.changeText(screen.getByTestId('binder-name'), 'Holos');
    expect(await screen.findByTestId('binder-game-error')).toHaveTextContent(
      /The games could not load/
    );
    // Never a binder without its game: the API would make one that takes any game.
    expect(screen.getByTestId('edit-binder-save')).toBeDisabled();
    fireEvent.press(screen.getByTestId('edit-binder-save'));
    expect(api.callsTo('POST /api/v1/binders')).toHaveLength(0);

    fireEvent.press(within(screen.getByTestId('binder-game-error')).getByText('Try again'));
    expect(await screen.findByTestId('binder-game-pokemon')).toBeChecked();
    expect(screen.queryByTestId('binder-game-error')).toBeNull();
    fireEvent.press(screen.getByTestId('edit-binder-save'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.callsTo('POST /api/v1/binders')).toHaveLength(1);
    expect((api.callsTo('POST /api/v1/binders')[0]?.body as { gameId?: string }).gameId).toBe('g1');
  });

  it('explains the binders limit plainly', async () => {
    mockApi(
      signedInRoutes({
        'POST /api/v1/binders': problem(429, 'LIMIT_REACHED', 'Limit reached', {
          limitKey: 'binders.max',
          limit: 5,
          used: 5,
        }),
      })
    );
    renderWithProviders(<NewBinderScreen />, { port: port() });
    await screen.findByTestId('binder-game-pokemon');
    fireEvent.changeText(screen.getByTestId('binder-name'), 'Sixth');
    fireEvent.press(screen.getByTestId('edit-binder-save'));
    expect(
      await screen.findByText('You reached the number of binders you can have')
    ).toBeOnTheScreen();
    expect(screen.getByTestId('binder-limit-message')).toHaveTextContent(
      /^You have used 5 of 5 binders\. Delete a binder you no longer need\.$/
    );
    expect(screen.queryByText(/Premium|upgrade|plan/i)).toBeNull();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});

describe('Deck core page (screen 16)', () => {
  beforeEach(() => {
    mockParams.current = { id: 'core-1' };
  });

  function coreRoutes(extra = {}) {
    return signedInRoutes({
      'GET /api/v1/public/binders/{id}': ok(publicDeckCoreFixture()),
      ...extra,
    });
  }

  it('shows the photos, the tag, the name and price, the seller, the note and the key cards', async () => {
    mockApi(coreRoutes());
    renderWithProviders(<BinderScreen />, { port: port() });
    expect(await screen.findByTestId('deck-core-name')).toHaveTextContent('Yubel core');
    expect(screen.getByTestId('deck-core-tag')).toHaveTextContent('Deck core');
    expect(screen.getByText('YU-GI-OH!')).toBeOnTheScreen();
    expect(screen.getByTestId('deck-core-price')).toHaveTextContent('$95');
    expect(screen.getByTestId('deck-core-seller-line')).toHaveTextContent(
      'Quebec · 2 public binders'
    );
    expect(screen.getByTestId('deck-core-note')).toHaveTextContent(
      'Full Yubel engine plus 2 Ash Blossom. All NM, English.'
    );
    expect(screen.getByTestId('deck-core-card-card-yubel')).toHaveTextContent('Yubel ×3');
    expect(screen.getByTestId('deck-core-photos-counter')).toHaveTextContent('1 / 3');
    // Never a city or a distance on a buyer's page.
    expect(screen.queryByText(/Montréal|km/)).toBeNull();
    fireEvent.press(screen.getByTestId('deck-core-photos-dot-2'));
    expect(screen.getByTestId('deck-core-photos-counter')).toHaveTextContent('2 / 3');
    fireEvent.press(screen.getByTestId('deck-core-card-card-spirit'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/cards/[id]',
      params: { id: 'card-spirit' },
    });
    fireEvent.press(screen.getByTestId('deck-core-seller'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/collectors/[id]',
      params: { id: 'collector1' },
    });
  });

  it('“Message {handle}” opens the chat with the seller about the deck core', async () => {
    const api = mockApi(
      coreRoutes({ 'POST /api/v1/conversations': ok(conversationFixture({ id: 'conv-9' })) })
    );
    renderWithProviders(<BinderScreen />, { port: port() });
    const button = await screen.findByTestId('deck-core-message');
    expect(button).toHaveTextContent(/Message collector1$/);
    fireEvent.press(button);
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/messages/[id]',
        params: { id: 'conv-9' },
      })
    );
    // The chat opens about this deck core (stage R4: its pinned bar).
    expect(api.callsTo('POST /api/v1/conversations')[0]?.body).toEqual({
      recipientId: publicDeckCoreFixture().owner.id,
      subjectBinderId: publicDeckCoreFixture().id,
    });
  });

  it('the owner sees “Edit binder” instead of Message and Report', async () => {
    mockApi(
      coreRoutes({
        'GET /api/v1/me': ok(meFixture({ id: publicDeckCoreFixture().owner.id ?? undefined })),
      })
    );
    renderWithProviders(<BinderScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('deck-core-edit'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/binders/edit',
      params: { id: 'core-1' },
    });
    expect(screen.queryByTestId('deck-core-message')).toBeNull();
    expect(screen.queryByTestId('deck-core-report')).toBeNull();
  });

  it('opened from Edit binder, “Edit binder” goes back to it instead of opening another', async () => {
    mockParams.current = { id: 'core-1', view: 'public', from: 'edit' };
    mockApi(
      coreRoutes({
        'GET /api/v1/me': ok(meFixture({ id: publicDeckCoreFixture().owner.id ?? undefined })),
      })
    );
    renderWithProviders(<BinderScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('deck-core-edit'));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('without photos shows its card pictures, or says there are none', async () => {
    mockApi(
      coreRoutes({
        'GET /api/v1/public/binders/{id}': ok(
          publicDeckCoreFixture({
            photos: [],
            previewImages: [],
            keyCards: [],
            askingPriceText: null,
          })
        ),
      })
    );
    renderWithProviders(<BinderScreen />, { port: port() });
    expect(await screen.findByTestId('deck-core-photos-empty')).toHaveTextContent(/No photos yet$/);
    expect(screen.queryByTestId('deck-core-price')).toBeNull();
    expect(screen.queryByText('Key cards')).toBeNull();
  });
});

describe('Public binder', () => {
  beforeEach(() => {
    mockParams.current = { id: 'pub-1' };
  });

  function publicRoutes(extra = {}) {
    return signedInRoutes({
      'GET /api/v1/public/binders/{id}': ok(publicBinderFixture({ id: 'pub-1' })),
      'GET /api/v1/public/binders/{id}/items': ok({
        items: [publicItemFixture()],
        page: 0,
        size: 24,
        totalItems: 1,
        totalPages: 1,
      }),
      ...extra,
    });
  }

  it('shows someone else’s binder in the new look: the seller’s province, public cards only', async () => {
    const api = mockApi(publicRoutes());
    renderWithProviders(<BinderScreen />, { port: port() });
    expect(await screen.findByTestId('public-binder-title')).toHaveTextContent(
      'Yu-Gi-Oh! trade binder'
    );
    expect(screen.getByTestId('public-binder-line')).toHaveTextContent(
      '1 card · Yu-Gi-Oh! · Updated yesterday'
    );
    expect(screen.getByTestId('public-binder-owner-line')).toHaveTextContent(
      'Quebec · 2 public binders'
    );
    expect(screen.queryByText(/km/)).toBeNull();
    expect(await screen.findByText('Azure-Eyes Sky Dragon')).toBeOnTheScreen();
    expect(screen.queryByText(/-?\d{1,3}\.\d{3,}/)).toBeNull();
    fireEvent.press(screen.getByTestId('public-binder-owner'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/collectors/[id]',
      params: { id: 'collector1' },
    });
    fireEvent.changeText(screen.getByTestId('public-binder-search'), 'azure');
    await waitFor(() =>
      expect(api.callsTo('GET /api/v1/public/binders/{id}/items').at(-1)?.query.get('query')).toBe(
        'azure'
      )
    );
    expect(screen.getByTestId('public-binder-message')).toHaveTextContent(/Message collector1$/);
  });

  it('reports the owner of someone else’s binder, whose cards offer no offer', async () => {
    mockApi(publicRoutes());
    renderWithProviders(<BinderScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('public-binder-report'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/report',
      params: {
        userId: '00000000-0000-4000-8000-000000000001',
        name: 'Collector One',
        handle: 'collector1',
        source: 'BINDER',
        binderId: 'pub-1',
      },
    });
    const item = publicItemFixture();
    expect(await screen.findByTestId(`item-${item.id}`)).toBeOnTheScreen();
    // Offers left the phone (ADR 0018).
    expect(screen.queryByTestId(`make-offer-${item.id}`)).toBeNull();
  });

  it('opens the owner’s own binder as the public sees it', async () => {
    mockParams.current = { id: BINDER_ID, view: 'public' };
    mockApi(publicRoutes());
    renderWithProviders(<BinderScreen />, { port: port() });
    expect(await screen.findByTestId('public-binder-title')).toBeOnTheScreen();
    expect(screen.queryByTestId('binder-name')).toBeNull();
  });

  it('says when a binder is not public', async () => {
    mockApi(
      publicRoutes({ 'GET /api/v1/public/binders/{id}': problem(404, 'NOT_FOUND', 'Not found') })
    );
    renderWithProviders(<BinderScreen />, { port: port() });
    expect(await screen.findByText('This binder is not available')).toBeOnTheScreen();
    // "Back to the map" opens Search's map: `/` is Home since stage R7 (R7 review U2/F4).
    expect(screen.getByTestId('public-binder-not-found-action')).toHaveTextContent(
      'Back to the map'
    );
    fireEvent.press(screen.getByTestId('public-binder-not-found-action'));
    expect(mockRouter.navigate).toHaveBeenCalledWith({
      pathname: '/search',
      params: { segment: 'cards' },
    });
  });

  it('explains the daily binder views limit', async () => {
    mockApi(
      publicRoutes({
        'GET /api/v1/public/binders/{id}': problem(429, 'LIMIT_REACHED', 'Limit', {
          limitKey: 'binder.views.per_day',
          limit: 30,
          used: 30,
          resetsAt: '2099-01-01T00:00:00Z',
        }),
      })
    );
    renderWithProviders(<BinderScreen />, { port: port() });
    expect(await screen.findByText("You reached today's binder views")).toBeOnTheScreen();
    expect(screen.getByText(/You have used 30 of 30 public binder views today/)).toBeOnTheScreen();
    // Every collector has the same limits (stage F1): nothing to buy, no plan to name.
    expect(screen.queryByText(/Premium|\bplans?\b|upgrade|credits/i)).toBeNull();
  });

  it('shows an error with retry', async () => {
    mockApi(
      publicRoutes({
        'GET /api/v1/public/binders/{id}': [
          problem(500, 'INTERNAL_ERROR', 'boom'),
          ok(publicBinderFixture({ id: 'pub-1' })),
        ],
      })
    );
    renderWithProviders(<BinderScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('public-binder-error-retry'));
    expect(await screen.findByTestId('public-binder-title')).toBeOnTheScreen();
  });
});
