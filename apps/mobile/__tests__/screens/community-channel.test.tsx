import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import CommunityChannelScreen from '@/app/community/[slug]';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  CHANNELS,
  ownPostFixture,
  postFixture,
  postPage,
  replyFixture,
  replyPage,
} from '../support/fixtures';
import { mockApi, noContent, ok, problem, type MockRoutes } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  mockParams.current = { slug: 'montreal-pokemon' };
});

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/community/channels': ok(CHANNELS),
    'GET /api/v1/community/channels/{slug}/posts': ok(postPage([postFixture(), ownPostFixture()])),
    'GET /api/v1/community/posts/{id}/replies': ok(replyPage([])),
    ...extra,
  });
}

const render = () =>
  renderWithProviders(<CommunityChannelScreen />, { port: new FakeAuthPort(testUser()) });

describe('Community channel', () => {
  it('shows the channel with its activity, the composer and the posts', async () => {
    mockApi(routes());
    await render();
    expect(await screen.findByTestId('channel-head')).toHaveTextContent(/Montréal · Pokémon/);
    expect(screen.getByTestId('channel-activity')).toHaveTextContent(
      'Pokémon · Montréal · 3 posts today'
    );
    expect(await screen.findByText('Anyone trading Lantern Fox this weekend?')).toBeOnTheScreen();
    expect(screen.getByText('Looking for Azure Dawn boosters.')).toBeOnTheScreen();
    expect(screen.getByText('You are all caught up.')).toBeOnTheScreen();
  });

  it('publishes a post, counts it, and clears the composer', async () => {
    const created = ownPostFixture({ id: 'new-post', body: 'Trading tonight at the café' });
    const api = mockApi(
      routes({
        'GET /api/v1/community/channels/{slug}/posts': ok(postPage([])),
        'POST /api/v1/community/channels/{slug}/posts': ok(created, 201),
      })
    );
    await render();
    expect(await screen.findByTestId('channel-empty')).toHaveTextContent(/No posts yet/);
    // An empty post is refused inline.
    await fireEvent.press(screen.getByTestId('post-submit'));
    expect(api.callsTo('POST /api/v1/community/channels/{slug}/posts')).toHaveLength(0);
    await fireEvent.changeText(screen.getByTestId('post-text'), '  Trading tonight at the café ');
    await fireEvent.press(screen.getByTestId('post-submit'));
    expect(await screen.findByText('Trading tonight at the café')).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/community/channels/{slug}/posts')[0]?.body).toEqual({
      body: 'Trading tonight at the café',
    });
    expect(screen.getByTestId('channel-activity')).toHaveTextContent(/4 posts today$/);
    expect(screen.getByTestId('post-text').props.value).toBe('');
    expect(await screen.findByTestId('snackbar')).toHaveTextContent('Posted.');
  });

  it('explains the per-channel rate limit and moderation under the composer', async () => {
    mockApi(
      routes({
        'POST /api/v1/community/channels/{slug}/posts': [
          problem(429, 'RATE_LIMITED', 'Too many', { retryAfterSeconds: 1200 }),
          problem(422, 'POST_BLOCKED', 'Blocked'),
        ],
      })
    );
    await render();
    await screen.findByText('Anyone trading Lantern Fox this weekend?');
    await fireEvent.changeText(screen.getByTestId('post-text'), 'Again');
    await fireEvent.press(screen.getByTestId('post-submit'));
    expect(await screen.findByTestId('post-error')).toHaveTextContent(
      'You are posting a lot in a short time. Each channel limits posts per hour. Try again in 20 minutes.'
    );
    await fireEvent.press(screen.getByTestId('post-submit'));
    expect(await screen.findByTestId('post-error')).toHaveTextContent(/community guidelines/);
    expect(screen.getByTestId('post-text').props.value).toBe('Again');
  });

  it('edits and deletes an own post (after a confirmation)', async () => {
    const own = ownPostFixture();
    const api = mockApi(
      routes({
        'PATCH /api/v1/community/posts/{id}': ok({ ...own, body: 'Edited text', editedAt: 'x' }),
        'DELETE /api/v1/community/posts/{id}': noContent,
      })
    );
    await render();
    await screen.findByText('Looking for Azure Dawn boosters.');
    await fireEvent.press(screen.getByTestId(`post-menu-${own.id}`));
    await fireEvent.press(await screen.findByTestId('post-edit'));
    await fireEvent.changeText(screen.getByTestId('post-edit-text'), '   ');
    await fireEvent.press(screen.getByTestId('post-edit-save'));
    expect(await screen.findByText('A post needs some text.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('post-edit-text'), 'Edited text');
    await fireEvent.press(screen.getByTestId('post-edit-save'));
    expect(await screen.findByText('Edited text')).toBeOnTheScreen();
    expect(api.callsTo('PATCH /api/v1/community/posts/{id}')[0]?.body).toEqual({
      body: 'Edited text',
    });

    await fireEvent.press(screen.getByTestId(`post-menu-${own.id}`));
    await fireEvent.press(await screen.findByTestId('post-delete'));
    const dialog = await screen.findByTestId('post-delete-dialog');
    expect(dialog).toHaveTextContent(/Delete this post\?/);
    await fireEvent.press(within(dialog).getByTestId('post-delete-dialog-confirm'));
    await waitFor(() => expect(screen.queryByText('Edited text')).not.toBeOnTheScreen());
    expect(api.callsTo('DELETE /api/v1/community/posts/{id}')).toHaveLength(1);
  });

  it('opens replies, replies, and deletes an own reply', async () => {
    const post = postFixture();
    const api = mockApi(
      routes({
        'POST /api/v1/community/posts/{id}/replies': ok(replyFixture({ id: 'r-new' }), 201),
        'DELETE /api/v1/community/replies/{id}': noContent,
      })
    );
    await render();
    await screen.findByText('Anyone trading Lantern Fox this weekend?');
    await fireEvent.press(screen.getByTestId(`post-replies-toggle-${post.id}`));
    expect(await screen.findByText('No replies yet. Start the conversation.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId(`reply-text-${post.id}`), 'I have one!');
    await fireEvent.press(screen.getByTestId(`reply-submit-${post.id}`));
    expect(await screen.findByTestId('reply-r-new')).toHaveTextContent(/I have one!/);
    expect(api.callsTo('POST /api/v1/community/posts/{id}/replies')[0]?.body).toEqual({
      body: 'I have one!',
    });
    expect(screen.getByTestId(`post-replies-toggle-${post.id}`)).toHaveTextContent(/1 reply$/);
    await fireEvent.press(screen.getByTestId('reply-delete-r-new'));
    await waitFor(() => expect(screen.queryByTestId('reply-r-new')).not.toBeOnTheScreen());
    expect(screen.getByTestId(`post-replies-toggle-${post.id}`)).toHaveTextContent(/Reply$/);
  });

  it('blocks a post author after a confirmation and hides their posts', async () => {
    const post = postFixture();
    let blocked = false;
    const api = mockApi(
      routes({
        // The server hides a blocked author's posts from then on.
        'GET /api/v1/community/channels/{slug}/posts': () =>
          ok(postPage(blocked ? [ownPostFixture()] : [post, ownPostFixture()])),
        'POST /api/v1/users/{id}/block': () => {
          blocked = true;
          return ok({
            id: post.author.id,
            handle: 'collector2',
            displayName: 'Noé Verdun',
            blockedAt: 'x',
          });
        },
      })
    );
    await render();
    await screen.findByText('Anyone trading Lantern Fox this weekend?');
    await fireEvent.press(screen.getByTestId(`post-menu-${post.id}`));
    await fireEvent.press(await screen.findByTestId('post-block-author'));
    await fireEvent.press(await screen.findByTestId('block-dialog-confirm'));
    await waitFor(() =>
      expect(screen.queryByText('Anyone trading Lantern Fox this weekend?')).not.toBeOnTheScreen()
    );
    expect(api.callsTo('POST /api/v1/users/{id}/block')[0]?.path).toBe(
      `/api/v1/users/${post.author.id}/block`
    );
    expect(await screen.findByTestId('snackbar')).toHaveTextContent('Noé Verdun is blocked.');
  });

  it('reports a post author from the post options', async () => {
    const post = postFixture();
    mockApi(routes());
    await render();
    await screen.findByText('Anyone trading Lantern Fox this weekend?');
    await fireEvent.press(screen.getByTestId(`post-menu-${post.id}`));
    await fireEvent.press(await screen.findByTestId('post-report-author'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/report',
      params: {
        userId: post.author.id,
        name: post.author.displayName,
        handle: post.author.handle,
        source: 'POST',
        postId: post.id,
      },
    });
  });

  it('shows not found, closed, and error-with-retry states', async () => {
    mockApi(
      routes({
        'GET /api/v1/community/channels/{slug}/posts': problem(404, 'NOT_FOUND', 'No channel'),
      })
    );
    const { unmount } = await render();
    expect(await screen.findByTestId('channel-not-found')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('All channels'));
    expect(mockRouter.navigate).toHaveBeenCalledWith({
      pathname: '/messages',
      params: { view: 'community' },
    });
    await unmount();

    mockApi(
      routes({
        'GET /api/v1/community/channels/{slug}/posts': problem(403, 'FEATURE_DISABLED', 'Off'),
      })
    );
    const second = await render();
    expect(await screen.findByTestId('community-disabled')).toBeOnTheScreen();
    await second.unmount();

    mockApi(
      routes({
        'GET /api/v1/community/channels/{slug}/posts': [
          problem(500, 'INTERNAL_ERROR', 'Boom'),
          ok(postPage()),
        ],
      })
    );
    await render();
    expect(await screen.findByTestId('channel-error')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Anyone trading Lantern Fox this weekend?')).toBeOnTheScreen();
  });
});
