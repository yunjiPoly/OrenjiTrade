/**
 * The English copy of Messages › Community on the web (stage WF, spec 10.7, board W22), the
 * phone's words (stage R11, `apps/mobile/src/features/community/communityCopy.ts`) where the web
 * shares them, the board's where it has its own (the third pane, the "+" menu's titles, the share
 * picker, the report and block dialogs). Deals ship by mail (ADR 0018): nothing here speaks of
 * meeting, and nothing promises protection. English only (owner, 2026-10-20).
 */

/** A text read as a sentence: a full stop only when it does not end with its own. */
function sentence(text: string): string {
  return /[.!?…]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
}

/** The inbox column: the region pill, the five rooms and the footnote. */
export const ROOMS_COPY = {
  heading: 'Game rooms',
  group: (region: string) => `Game rooms in ${region}`,
  loading: 'Loading the rooms',
  noPosts: 'No posts yet. Say hi!',
  preview: (handle: string, text: string) => `${handle}: ${text}`,
  footnote: (region: string) =>
    `Every collector in ${region} can read these rooms. Keep deals and addresses in private chats.`,
  rowLabel: (input: {
    name: string;
    open: boolean;
    preview: string | null;
    when: string;
    unread: boolean;
  }) =>
    `${input.name} room${input.open ? ', open' : ''}. ${
      input.preview ? `Last post, ${input.when}: ${sentence(input.preview)}` : 'No posts yet.'
    }${input.unread ? ' New posts.' : ''}`,
  loadError: 'The rooms could not load',
  emptyTitle: (region: string) => `No rooms in ${region} yet`,
  emptyBody: 'Rooms open one game at a time. Try another region.',
  closedTitle: 'The community is closed right now',
  closedBody: 'Public rooms are turned off for the moment. Private chats still work.',
  closedAction: 'Open chats',
  chooseTitle: 'Choose a room',
  chooseBody: 'Every game of your region has its own public room.',
} as const;

/** One room: the header, the banner, the posts and their "⋯" menu. */
export const ROOM_COPY = {
  back: 'Back to Community',
  subtitle: (region: string) => `${region} · public room`,
  rulesButton: 'Room rules',
  rulesShown: 'Room rules shown',
  rulesHidden: 'Room rules hidden',
  banner: 'Every collector can read this room. Keep deals and addresses in private chats.',
  postsLabel: (name: string) => `Posts in the ${name} room`,
  loading: 'Loading the posts',
  emptyTitle: 'No posts yet',
  emptyBody: (region: string, name: string) =>
    `Say hi! Every collector in ${region} can read the ${name} room.`,
  loadError: 'The posts could not load',
  notFoundTitle: 'This room is closed',
  notFoundBody: 'It may have been archived. Pick another room from the list.',
  notFoundAction: 'All rooms',
  older: 'Show older posts',
  olderLoading: 'Loading older posts…',
  olderFailed: 'Older posts could not load.',
  more: (handle: string) => `More for the post by ${handle}`,
  message: (handle: string) => `Message ${handle}`,
  report: 'Report this post',
  block: (handle: string) => `Block ${handle}`,
  edit: 'Edit',
  delete: 'Delete',
  remove: 'Remove (moderator)',
  deleteTitle: 'Delete this post?',
  deleteBody: 'Your post leaves the room for everyone.',
  deleted: 'Post deleted.',
  removed: 'Post removed. The action is in the audit log.',
  updated: 'Post updated.',
  you: 'You',
  edited: 'edited',
  postLabel: (input: { handle: string; own: boolean; place: string | null; when: string }) =>
    [input.own ? `${input.handle} (you)` : input.handle, input.place, input.when]
      .filter(Boolean)
      .join(', '),
  photos: (count: number, handle: string) =>
    `${count} ${count === 1 ? 'photo' : 'photos'} from ${handle}`,
  photo: (index: number, count: number, handle: string) =>
    `Photo ${index} of ${count} from ${handle}. Open larger`,
  photoTitle: (index: number, count: number) => `Photo ${index} of ${count}`,
  photoAlt: (handle: string) => `Photo from ${handle}`,
  previousPhoto: 'Previous photo',
  nextPhoto: 'Next photo',
  close: 'Close',
  view: 'View',
  open: 'Open',
  viewCard: (name: string) => `View ${name}, who has this card`,
  openBinder: (name: string) => `Open ${name}`,
  deckCore: 'Deck core',
  publicBinder: 'Public binder',
  binderUnavailable: 'Binder no longer available',
  editLabel: 'Edit your post',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  needsText: 'A post needs some text.',
} as const;

/** The third pane (lg) or the drawer (md): Room rules (board W22). */
export const RULES_COPY = {
  title: 'Room rules',
  hide: 'Hide room rules',
  rules: [
    'Be kind. No hate, harassment, scams or spam.',
    'Talk cards here. Agree on deals in a private chat, and never post your address or e-Transfer email in a room.',
    'Check ratings before you send an e-Transfer, and ask for tracking.',
    'Report a post with ⋯. Moderators remove what breaks the rules.',
  ],
  rateRule: 'You can post up to 10 times an hour in each room.',
  othersTitle: 'What others see',
  others: 'Your handle, your province and what you post. Your city never appears in a room.',
  blocks: 'Posts from collectors you block are hidden from you, in every room.',
  blocked: (handle: string) => `You blocked ${handle}`,
  unblock: 'Unblock',
  unblockLabel: (handle: string) => `Unblock ${handle}`,
  tradingSafely: 'Trading safely',
} as const;

/** The message box and its "+" menu. */
export const ROOM_COMPOSER_COPY = {
  placeholder: 'Write to the room',
  field: (room: string) => `Write to the ${room} room`,
  add: 'Add to your post',
  addTitle: 'Add a card, a binder or a deck core',
  card: 'Share a card',
  binder: 'Share a binder or deck core',
  post: (room: string) => `Post to the ${room} room`,
  hint: 'Enter to post · Shift+Enter for a new line',
  tray: 'Added to your post',
  remove: (name: string) => `Remove ${name} from your post`,
  nearLimit: (length: number, max: number) => `${length} / ${max} characters`,
  tooLong: (max: number) => `Posts are limited to ${max} characters.`,
  tryAgain: 'Try again',
  posted: (room: string) => `Posted in the ${room} room`,
} as const;

/** Why a post was refused (under the message box): the phone's words. */
export const ROOM_ERROR_COPY = {
  rateLimited: 'You can post up to 10 times an hour in each room. Try again later.',
  duplicate: 'You already posted this.',
  blocked: 'This post breaks the community rules, so it was not published. Please rephrase it.',
  network: 'Your post was not sent. Check your connection.',
  closed: 'The community is closed right now.',
  gone: 'This room is no longer open.',
} as const;

/** The block confirmation and its toast (board W22). */
export const ROOM_BLOCK_COPY = {
  title: (handle: string) => `Block ${handle}?`,
  body: 'They can’t message you, and you no longer see each other’s binders, profiles and posts anywhere. They are never told. You can unblock them later.',
  done: (handle: string) => `${handle} is blocked`,
  doneSub: 'Their posts are hidden from you. They are never told.',
  undo: 'Undo',
  unblocked: (handle: string) => `${handle} is unblocked`,
  unblockedSub: 'Their posts show again.',
} as const;

/** The share picker in a room (board W22): the room's game, your public cards and binders. */
export const ROOM_SHARE_COPY = {
  cardTitle: 'Share a card',
  binderTitle: 'Share a binder or deck core',
  lead: 'Everyone in this room can see it and open it.',
  cardSearch: (room: string) => `Search your ${room} cards`,
  binderSearch: (room: string) => `Search your ${room} binders`,
  cardFoot: 'Cards in your public binders',
  binderFoot: 'Your public binders and deck cores',
  cardEmpty: (room: string) => `You have no public ${room} cards to share yet.`,
  binderEmpty: (room: string) => `You have no public ${room} binders or deck cores yet.`,
  cardNoMatch: (room: string, query: string) =>
    `None of your public ${room} cards match “${query}”.`,
  binderNoMatch: (room: string, query: string) =>
    `None of your public ${room} binders match “${query}”.`,
  addCards: 'Add cards',
  yourBinders: 'Your binders',
  publicBinder: 'Public binder',
} as const;
