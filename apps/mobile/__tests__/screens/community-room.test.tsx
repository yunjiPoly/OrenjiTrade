import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { Dimensions } from 'react-native';

import RoomScreen from '@/app/community/[slug]';
import { ROOM_REFRESH_MS } from '@/src/api/hooks/community';
import { useRoomVisitsStore } from '@/src/features/community/roomVisits';
import { lightPalette } from '@/src/theme';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  BINDER_ID,
  CARD_ID,
  PRINTING_A,
  ROOMS,
  ownPostFixture,
  postFixture,
  postPage,
} from '../support/fixtures';
import {
  mockApi,
  noContent,
  ok,
  problem,
  type MockAnswer,
  type MockRoutes,
} from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;

const PHOTO_POST = postFixture({
  id: '00000000-0000-4000-8f10-000000000002',
  author: {
    id: '00000000-0000-4000-8000-0000000000b2',
    handle: 'maya_k',
    displayName: 'Maya K',
    avatarUrl: null,
  },
  body: 'Opened 3 boxes of the new set. Spare Ash Blossoms if anyone needs one, ships tracked.',
  createdAt: '2026-10-05T13:12:00Z',
  payload: {
    photos: [
      { url: '/api/v1/public/media/uploads/a.jpg', width: 800, height: 600 },
      { url: '/api/v1/public/media/uploads/b.jpg', width: 600, height: 800 },
    ],
    card: {
      id: PRINTING_A,
      cardId: CARD_ID,
      name: 'Ash Blossom & Joyous Spring',
      printingCode: 'RA01-EN008',
      imageUrl: null,
    },
  },
  place: {
    ...postFixture().place!,
    subdivisionCode: 'CA-QC',
    subdivisionName: 'Quebec',
    label: 'Quebec, Canada',
  },
});

const CORE_POST = postFixture({
  id: '00000000-0000-4000-8f10-000000000003',
  author: {
    id: '00000000-0000-4000-8000-0000000000b3',
    handle: 'duelist.jp',
    displayName: 'Duelist JP',
    avatarUrl: null,
  },
  body: 'My Yubel core is up, photos in the binder. Message me if you want it.',
  createdAt: '2026-10-05T15:05:00Z',
  payload: {
    photos: [],
    binder: {
      id: BINDER_ID,
      name: 'Yubel core',
      ownerHandle: 'duelist.jp',
      deckCore: true,
      askingPriceText: '$95',
    },
  },
  place: undefined,
});

/** Newest first, as the API pages them. */
const POSTS = [
  CORE_POST,
  PHOTO_POST,
  postFixture({ createdAt: '2026-10-04T10:00:00Z' }),
  ownPostFixture({ createdAt: '2026-10-04T09:00:00Z' }),
];

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  mockParams.current = { slug: 'americas-north-yugioh' };
  picker.requestMediaLibraryPermissionsAsync.mockReset();
  picker.launchImageLibraryAsync.mockReset();
});

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/community/channels': ok(ROOMS),
    'GET /api/v1/community/channels/{slug}/posts': ok(postPage(POSTS)),
    ...extra,
  });
}

const render = () => renderWithProviders(<RoomScreen />, { port: new FakeAuthPort(testUser()) });

describe('A room (stage R11, screen 33)', () => {
  it('shows the top bar, the banner and the posts like a chat, with day separators', async () => {
    mockApi(routes());
    render();
    await waitFor(() => expect(screen.getByTestId('room-head')).toHaveTextContent(/Yu-Gi-Oh!/));
    expect(screen.getByTestId('room-subtitle')).toHaveTextContent('Americas (North) · public room');
    expect(screen.getByTestId('room-banner')).toHaveTextContent(
      /Every collector can read this room\. Keep deals and addresses in private chats\.$/
    );
    expect(screen.getByLabelText('Back to Community')).toBeOnTheScreen();
    expect(await screen.findByTestId(`room-post-${PHOTO_POST.id}`)).toBeOnTheScreen();
    // The province, never a city; the time of day (the separators carry the day).
    expect(screen.getByTestId(`room-post-line-${PHOTO_POST.id}`)).toHaveTextContent(
      /^Quebec · \d{1,2}:\d{2} [AP]M$/
    );
    expect(screen.getByTestId(`room-post-line-${CORE_POST.id}`)).toHaveTextContent(
      /^\d{1,2}:\d{2} [AP]M$/
    );
    // Two photos, a shared card that opens Who has this card, a deck core with its badge and price.
    const photoPost = within(screen.getByTestId(`room-post-${PHOTO_POST.id}`));
    expect(photoPost.getByTestId('room-photo-0').props.accessibilityLabel).toBe(
      'Photo 1 of 2 from maya_k. Opens it full screen.'
    );
    expect(photoPost.getByTestId('room-photo-1')).toBeOnTheScreen();
    fireEvent.press(photoPost.getByTestId('room-shared-card'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/cards/[id]',
      params: { id: CARD_ID, printing: PRINTING_A },
    });
    const core = screen.getByTestId('room-shared-deck-core');
    expect(core).toHaveTextContent(/Yubel core/);
    expect(core).toHaveTextContent(/Deck core/);
    expect(core).toHaveTextContent(/\$95/);
    expect(core.props.accessibilityLabel).toBe('Deck core: Yubel core, $95');
    fireEvent.press(core);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/binders/[id]',
      params: { id: BINDER_ID },
    });
    // Oldest at the top of the screen: the inverted list holds the newest item first.
    const list = screen.getByTestId('room-posts');
    const keys = (list.props.data as { key: string }[]).map((item) => item.key);
    expect(keys[0]).toBe(CORE_POST.id);
    expect(keys.filter((key) => key.startsWith('day-'))).toHaveLength(2);
    // Reading the room marks its newest post as read on this phone.
    await waitFor(() =>
      expect(useRoomVisitsStore.getState().visits[testUser().uid]?.['americas-north-yugioh']).toBe(
        CORE_POST.createdAt
      )
    );
  });

  it('shows newer posts while the room is open: every 15 s, and with a pull at the newest end', async () => {
    jest.useFakeTimers();
    try {
      const answer = postFixture({
        id: '00000000-0000-4000-8f10-000000000004',
        body: 'I have one, ships tracked tomorrow.',
        createdAt: '2026-10-05T16:30:00Z',
      });
      const later = postFixture({
        id: '00000000-0000-4000-8f10-000000000005',
        body: 'Sent you a message.',
        createdAt: '2026-10-05T16:40:00Z',
      });
      const api = mockApi(
        routes({
          'GET /api/v1/community/channels/{slug}/posts': [
            ok(postPage(POSTS)),
            ok(postPage([answer, ...POSTS])),
            ok(postPage([later, answer, ...POSTS])),
          ],
        })
      );
      render();
      expect(await screen.findByTestId(`room-post-${PHOTO_POST.id}`)).toBeOnTheScreen();
      expect(screen.queryByTestId(`room-post-${answer.id}`)).toBeNull();
      // Someone answers while the room is open: it shows at the bottom, without leaving the room.
      await act(async () => {
        jest.advanceTimersByTime(ROOM_REFRESH_MS);
      });
      expect(await screen.findByTestId(`room-post-${answer.id}`)).toBeOnTheScreen();
      expect((screen.getByTestId('room-posts').props.data as { key: string }[])[0]?.key).toBe(
        answer.id
      );
      await waitFor(() =>
        expect(
          useRoomVisitsStore.getState().visits[testUser().uid]?.['americas-north-yugioh']
        ).toBe(answer.createdAt)
      );
      // A pull at the newest end asks at once.
      const refresh = screen.getByTestId('room-posts').props.refreshControl as {
        props: { onRefresh: () => void };
      };
      await act(async () => {
        refresh.props.onRefresh();
      });
      expect(await screen.findByTestId(`room-post-${later.id}`)).toBeOnTheScreen();
      expect(api.callsTo('GET /api/v1/community/channels/{slug}/posts')).toHaveLength(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('opens the author’s profile from the avatar and the handle', async () => {
    mockApi(routes());
    render();
    const author = await screen.findByTestId(`room-post-author-${PHOTO_POST.id}`);
    expect(author.props.accessibilityRole).toBe('link');
    expect(author.props.accessibilityLabel).toMatch(/^maya_k, Quebec, \d{1,2}:\d{2} [AP]M$/);
    expect(author.props.accessibilityHint).toBe('Opens the profile of maya_k');
    fireEvent.press(author);
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/collectors/[id]',
      params: { id: 'maya_k' },
    });
    mockRouter.push.mockClear();
    // The avatar is a target for a finger only (the handle is the link screen readers stop on).
    fireEvent.press(
      screen.getByTestId(`room-post-avatar-${CORE_POST.id}`, { includeHiddenElements: true })
    );
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/collectors/[id]',
      params: { id: 'duelist.jp' },
    });
  });

  it('puts the province and the time under the handle at the largest text size', async () => {
    const window = Dimensions.get('window');
    act(() => {
      Dimensions.set({
        window: { ...window, fontScale: 3.1 },
        screen: { ...window, fontScale: 3.1 },
      });
    });
    try {
      mockApi(routes());
      render();
      const own = ownPostFixture();
      const line = await screen.findByTestId(`room-post-line-${PHOTO_POST.id}`);
      expect(line).toHaveTextContent(/^Quebec · \d{1,2}:\d{2} [AP]M$/);
      expect(line).toHaveProp('numberOfLines', 2);
      // A column: the handle (and "· You") wraps, the line goes under it.
      expect(screen.getByTestId(`room-post-author-${PHOTO_POST.id}`)).not.toHaveStyle({
        flexDirection: 'row',
      });
      expect(
        within(screen.getByTestId(`room-post-author-${own.id}`)).getByText(/^maika/)
      ).toHaveProp('numberOfLines', 3);
      // The ⋯ button stays beside the handle.
      expect(screen.getByTestId(`room-post-more-${own.id}`)).toBeOnTheScreen();
    } finally {
      act(() => {
        Dimensions.set({ window, screen: window });
      });
    }
  });

  it('shows a shared binder the reader can no longer open as a plain row, without its name or owner', async () => {
    const gone = postFixture({
      id: '00000000-0000-4000-8f10-000000000006',
      body: 'Look at this deck core',
      createdAt: '2026-10-05T15:30:00Z',
      payload: { photos: [], binderUnavailable: true },
    });
    mockApi(
      routes({ 'GET /api/v1/community/channels/{slug}/posts': ok(postPage([gone, ...POSTS])) })
    );
    render();
    const post = within(await screen.findByTestId(`room-post-${gone.id}`));
    const row = post.getByTestId('room-binder-unavailable');
    expect(row).toHaveTextContent(/Binder no longer available$/);
    expect(row.props.accessibilityRole).toBeUndefined();
    expect(post.queryByTestId('room-shared-binder')).toBeNull();
    expect(post.queryByTestId('room-shared-deck-core')).toBeNull();
    fireEvent.press(row);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('opens the room rules and closes them with Got it', async () => {
    mockApi(routes());
    render();
    fireEvent.press(await screen.findByLabelText('Room rules'));
    const sheet = await screen.findByTestId('room-rules-sheet');
    expect(sheet).toHaveTextContent(/Be kind\. No hate, harassment, scams or spam\./);
    expect(sheet).toHaveTextContent(/never post your address or e-Transfer email in a room/);
    expect(screen.getByTestId('room-rate-rule')).toHaveTextContent(
      'You can post up to 10 times an hour in each room.'
    );
    fireEvent.press(screen.getByTestId('room-rules-ok'));
    await waitFor(() => expect(screen.queryByTestId('room-rate-rule')).toBeNull());
  });

  it('offers Message, Report and Block on another’s post, and Delete on your own', async () => {
    const api = mockApi(
      routes({
        'POST /api/v1/conversations': ok({ id: 'conv-new' }, 201),
      })
    );
    render();
    fireEvent.press(await screen.findByTestId(`room-post-more-${PHOTO_POST.id}`));
    const sheet = await screen.findByTestId('room-post-sheet');
    expect(within(sheet).getByText('Message maya_k')).toBeOnTheScreen();
    expect(within(sheet).getByText('Report this post')).toBeOnTheScreen();
    expect(within(sheet).getByText('Block maya_k')).toBeOnTheScreen();
    expect(within(sheet).queryByText('Delete')).toBeNull();
    fireEvent.press(within(sheet).getByText('Message maya_k'));
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/conversations')[0]?.body).toEqual({
        recipientId: PHOTO_POST.author.id,
      })
    );
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/messages/[id]',
        params: { id: 'conv-new' },
      })
    );

    const own = ownPostFixture();
    fireEvent.press(screen.getByTestId(`room-post-more-${own.id}`));
    const mine = await screen.findByTestId('room-post-sheet');
    expect(within(mine).getByText('Delete')).toBeOnTheScreen();
    expect(within(mine).queryByText(/^Message /)).toBeNull();
    expect(within(mine).queryByText('Report this post')).toBeNull();
  });

  it('reports a post with the post as context', async () => {
    mockApi(routes());
    render();
    fireEvent.press(await screen.findByTestId(`room-post-more-${PHOTO_POST.id}`));
    fireEvent.press(await screen.findByTestId('room-post-report'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/report',
      params: {
        userId: PHOTO_POST.author.id,
        name: PHOTO_POST.author.displayName,
        handle: PHOTO_POST.author.handle,
        source: 'POST',
        postId: PHOTO_POST.id,
      },
    });
  });

  it('blocks an author after a confirmation and hides their posts', async () => {
    const waiting: ((answer: MockAnswer) => void)[] = [];
    const api = mockApi(
      routes({
        'POST /api/v1/users/{id}/block': ok({}),
        // Later reads of the room answer only at the end: the posts leave the room at once, from
        // what the phone already holds, not from a new read (review fix 1, F4).
        'GET /api/v1/community/channels/{slug}/posts': [
          ok(postPage(POSTS)),
          () => new Promise<MockAnswer>((resolve) => waiting.push(resolve)),
        ],
      })
    );
    render();
    fireEvent.press(await screen.findByTestId(`room-post-more-${PHOTO_POST.id}`));
    const sheet = await screen.findByTestId('room-post-sheet');
    // "Block {handle}" in red, the other actions in ink.
    expect(within(sheet).getByText('Block maya_k')).toHaveStyle({ color: lightPalette.danger });
    expect(within(sheet).getByText('Report this post')).toHaveStyle({ color: lightPalette.ink });
    fireEvent.press(await screen.findByTestId('room-post-block'));
    expect(await screen.findByText('Block maya_k?')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Block' }));
    await waitFor(() => expect(api.callsTo('POST /api/v1/users/{id}/block')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByTestId(`room-post-${PHOTO_POST.id}`)).toBeNull());
    expect(screen.getByTestId(`room-post-${CORE_POST.id}`)).toBeOnTheScreen();
    // The reads that waited answer as the API would, without the blocked author.
    await act(async () => {
      waiting.forEach((answer) =>
        answer(ok(postPage(POSTS.filter((post) => post.id !== PHOTO_POST.id))))
      );
    });
    expect(screen.queryByTestId(`room-post-${PHOTO_POST.id}`)).toBeNull();
  });

  it('deletes your own post after a confirmation', async () => {
    const own = ownPostFixture();
    const api = mockApi(routes({ 'DELETE /api/v1/community/posts/{id}': noContent }));
    render();
    fireEvent.press(await screen.findByTestId(`room-post-more-${own.id}`));
    fireEvent.press(await screen.findByTestId('room-post-delete'));
    expect(await screen.findByText('Delete this post?')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.callsTo('DELETE /api/v1/community/posts/{id}')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByTestId(`room-post-${own.id}`)).toBeNull());
    expect(await screen.findByText('Post deleted.')).toBeOnTheScreen();
  });

  it('turns the send button orange with text and posts it at the bottom', async () => {
    const created = ownPostFixture({
      id: 'new-post',
      body: 'Shipping a few trades tonight',
      createdAt: '2026-10-05T16:00:00Z',
    });
    const api = mockApi(
      routes({ 'POST /api/v1/community/channels/{slug}/posts': ok(created, 201) })
    );
    render();
    await screen.findByTestId(`room-post-${PHOTO_POST.id}`);
    expect(screen.getByTestId('room-send')).toBeDisabled();
    expect(screen.getByTestId('room-send')).toHaveStyle({
      backgroundColor: lightPalette.surfaceVariant,
    });
    fireEvent.changeText(screen.getByLabelText('Write to the Yu-Gi-Oh! room'), '   ');
    expect(screen.getByTestId('room-send')).toBeDisabled();
    fireEvent.changeText(
      screen.getByLabelText('Write to the Yu-Gi-Oh! room'),
      'Shipping a few trades tonight'
    );
    expect(screen.getByTestId('room-send')).toBeEnabled();
    // Orange with text.
    expect(screen.getByTestId('room-send')).toHaveStyle({ backgroundColor: lightPalette.primary });
    fireEvent.press(screen.getByTestId('room-send'));
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/community/channels/{slug}/posts')[0]?.body).toEqual({
        body: 'Shipping a few trades tonight',
      })
    );
    expect(await screen.findByTestId('room-post-new-post')).toBeOnTheScreen();
    expect(screen.getByLabelText('Write to the Yu-Gi-Oh! room').props.value).toBe('');
    // The newest item of the inverted list: at the bottom of the room.
    expect((screen.getByTestId('room-posts').props.data as { key: string }[])[0]?.key).toBe(
      'new-post'
    );
  });

  it('posts up to 4 photos: uploads each as COMMUNITY first, in order', async () => {
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true } as never);
    picker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///a.jpg',
          mimeType: 'image/jpeg',
          fileName: 'a.jpg',
          fileSize: 900_000,
          width: 800,
          height: 600,
        },
        {
          uri: 'file:///b.png',
          mimeType: 'image/png',
          fileName: 'b.png',
          fileSize: 400_000,
          width: 600,
          height: 600,
        },
        {
          uri: 'file:///c.jpg',
          mimeType: 'image/jpeg',
          fileName: 'c.jpg',
          fileSize: 4_000_000,
          width: 4000,
          height: 3000,
        },
      ],
    } as never);
    let upload = 0;
    const api = mockApi(
      routes({
        'POST /api/v1/uploads/images': () => {
          upload += 1;
          return ok(
            {
              uploadId: `upload-${upload}`,
              url: `/api/v1/public/media/uploads/${upload}.jpg`,
              width: 800,
              height: 600,
              expiresAt: '2026-10-05T17:00:00Z',
            },
            201
          );
        },
        'POST /api/v1/community/channels/{slug}/posts': ok(
          ownPostFixture({ id: 'photo-post', body: 'Two photos of my binder' }),
          201
        ),
      })
    );
    render();
    await screen.findByTestId(`room-post-${PHOTO_POST.id}`);
    fireEvent.press(screen.getByTestId('room-attach'));
    const sheet = await screen.findByTestId('room-attach-sheet');
    expect(within(sheet).getByText('Send a photo')).toBeOnTheScreen();
    expect(within(sheet).getByText('Share a card')).toBeOnTheScreen();
    expect(within(sheet).getByText('Share a binder or deck core')).toBeOnTheScreen();
    fireEvent.press(within(sheet).getByTestId('room-attach-photo'));
    expect(await screen.findByTestId('room-attachment-photo-1')).toBeOnTheScreen();
    expect(screen.queryByTestId('room-attachment-photo-2')).toBeNull();
    // The 4 MB photo is refused before anything is sent.
    expect(screen.getByTestId('room-photo-error')).toHaveTextContent('Choose a photo up to 3 MB.');
    expect(picker.launchImageLibraryAsync.mock.calls[0]?.[0]).toMatchObject({
      mediaTypes: ['images'],
      preferredAssetRepresentationMode: 'compatible',
      allowsMultipleSelection: true,
      selectionLimit: 4,
    });
    // Photos alone are not a post.
    expect(screen.getByTestId('room-needs-text')).toBeOnTheScreen();
    expect(screen.getByTestId('room-send')).toBeDisabled();
    fireEvent.press(screen.getByTestId('room-attachment-photo-remove-1'));
    expect(screen.queryByTestId('room-attachment-photo-1')).toBeNull();
    fireEvent.press(screen.getByTestId('room-attach'));
    fireEvent.press(await screen.findByTestId('room-attach-photo'));
    expect(await screen.findByTestId('room-attachment-photo-2')).toBeOnTheScreen();
    expect(picker.launchImageLibraryAsync.mock.calls[1]?.[0]).toMatchObject({ selectionLimit: 3 });
    fireEvent.changeText(
      screen.getByLabelText('Write to the Yu-Gi-Oh! room'),
      'Two photos of my binder'
    );
    fireEvent.press(screen.getByTestId('room-send'));
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/community/channels/{slug}/posts')[0]?.body).toEqual({
        body: 'Two photos of my binder',
        photoUploadIds: ['upload-1', 'upload-2', 'upload-3'],
      })
    );
    const uploads = api.callsTo('POST /api/v1/uploads/images');
    expect(uploads).toHaveLength(3);
    uploads.forEach((call) => expect(call.query.get('kind')).toBe('COMMUNITY'));
    await waitFor(() => expect(screen.queryByTestId('room-attachments')).toBeNull());
  });

  it('words the uploads’ own hourly limit apart from the room’s, and keeps the photos', async () => {
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true } as never);
    picker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///a.jpg',
          mimeType: 'image/jpeg',
          fileName: 'a.jpg',
          fileSize: 900_000,
          width: 800,
          height: 600,
        },
      ],
    } as never);
    const api = mockApi(
      routes({
        'POST /api/v1/uploads/images': problem(429, 'RATE_LIMITED', 'Too many uploads', {
          retryAfterSeconds: 1200,
        }),
      })
    );
    render();
    await screen.findByTestId(`room-post-${PHOTO_POST.id}`);
    fireEvent.press(screen.getByTestId('room-attach'));
    fireEvent.press(await screen.findByTestId('room-attach-photo'));
    expect(await screen.findByTestId('room-attachment-photo-0')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Write to the Yu-Gi-Oh! room'), 'My binder photo');
    fireEvent.press(screen.getByTestId('room-send'));
    expect(await screen.findByTestId('room-post-error')).toHaveTextContent(
      'You sent a lot of photos in a short time. Try again later.'
    );
    expect(api.callsTo('POST /api/v1/community/channels/{slug}/posts')).toHaveLength(0);
    expect(screen.getByTestId('room-attachment-photo-0')).toBeOnTheScreen();
  });

  it('explains the posting limit and a duplicate, and keeps the text', async () => {
    mockApi(
      routes({
        'POST /api/v1/community/channels/{slug}/posts': [
          problem(429, 'RATE_LIMITED', 'Limit', { retryAfterSeconds: 3600 }),
          problem(409, 'DUPLICATE_POST', 'You already posted this text in the last 24 hours'),
        ],
      })
    );
    render();
    await screen.findByTestId(`room-post-${PHOTO_POST.id}`);
    const field = screen.getByLabelText('Write to the Yu-Gi-Oh! room');
    fireEvent.changeText(field, 'Selling a sealed box by mail');
    fireEvent.press(screen.getByTestId('room-send'));
    expect(await screen.findByTestId('room-post-error')).toHaveTextContent(
      'You can post up to 10 times an hour in each room. Try again later.'
    );
    expect(screen.queryByTestId('room-post-retry')).toBeNull();
    expect(screen.getByLabelText('Write to the Yu-Gi-Oh! room').props.value).toBe(
      'Selling a sealed box by mail'
    );
    fireEvent.press(screen.getByTestId('room-send'));
    await waitFor(() =>
      expect(screen.getByTestId('room-post-error')).toHaveTextContent('You already posted this.')
    );
  });

  it('keeps the text after a network error and sends it again with Try again', async () => {
    const created = ownPostFixture({ id: 'after-retry', body: 'Looking for Nibiru by mail' });
    const api = mockApi(
      routes({
        'POST /api/v1/community/channels/{slug}/posts': [
          () => {
            throw new TypeError('Network request failed');
          },
          ok(created, 201),
        ],
      })
    );
    render();
    await screen.findByTestId(`room-post-${PHOTO_POST.id}`);
    fireEvent.changeText(
      screen.getByLabelText('Write to the Yu-Gi-Oh! room'),
      'Looking for Nibiru by mail'
    );
    fireEvent.press(screen.getByTestId('room-send'));
    expect(await screen.findByTestId('room-post-error')).toHaveTextContent(
      'Your post was not sent. Check your connection.'
    );
    expect(screen.getByLabelText('Write to the Yu-Gi-Oh! room').props.value).toBe(
      'Looking for Nibiru by mail'
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('room-post-retry'));
    });
    expect(await screen.findByTestId('room-post-after-retry')).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/community/channels/{slug}/posts')).toHaveLength(2);
    expect(screen.queryByTestId('room-post-error')).toBeNull();
  });

  it('shows the skeleton, an empty room, a closed room, the community off and an error with Try again', async () => {
    mockApi(routes({ 'GET /api/v1/community/channels/{slug}/posts': ok(postPage([])) }));
    const first = render();
    expect(screen.getByTestId('room-loading')).toBeOnTheScreen();
    expect(await screen.findByTestId('room-empty')).toHaveTextContent(/No posts yet/);
    first.unmount();

    mockApi(
      routes({
        'GET /api/v1/community/channels/{slug}/posts': problem(404, 'NOT_FOUND', 'No room'),
      })
    );
    const second = render();
    expect(await screen.findByTestId('room-not-found')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('All rooms'));
    expect(mockRouter.navigate).toHaveBeenCalledWith({
      pathname: '/messages',
      params: { view: 'community' },
    });
    expect(screen.queryByTestId('room-composer')).toBeNull();
    second.unmount();

    mockApi(
      routes({
        'GET /api/v1/community/channels/{slug}/posts': problem(404, 'FEATURE_DISABLED', 'Off'),
      })
    );
    const third = render();
    expect(await screen.findByTestId('community-disabled')).toBeOnTheScreen();
    third.unmount();

    mockApi(
      routes({
        'GET /api/v1/community/channels/{slug}/posts': [
          problem(500, 'INTERNAL_ERROR', 'Boom'),
          ok(postPage(POSTS)),
        ],
      })
    );
    render();
    expect(await screen.findByTestId('room-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId(`room-post-${PHOTO_POST.id}`)).toBeOnTheScreen();
  });
});
