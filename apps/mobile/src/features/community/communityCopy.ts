/**
 * The approved English copy of Messages › Community (stage R11, owner prompt 2026-10-20, mockup v50
 * screens 32 and 33): the room list and a room (top bar, rules, banner, posts, the "⋯" sheet, the
 * message box and its "+" sheet, the errors). One object per screen, so a translation could slot
 * in later; functions build the sentences that carry a name. Deals ship by mail (ADR 0018): nothing
 * here speaks of meeting, and nothing promises protection.
 */

/** A room's name by its game, until the list answers (V134 names the rooms after their game). */
export const ROOM_NAMES: Readonly<Record<string, string>> = {
  yugioh: 'Yu-Gi-Oh!',
  pokemon: 'Pokémon',
  mtg: 'Magic: The Gathering',
  onepiece: 'One Piece',
  riftbound: 'Riftbound',
};

/** Messages › Community: the room list (screen 32). */
export const ROOMS_COPY = {
  list: (region: string) => `Rooms of ${region}`,
  loading: 'Loading the rooms',
  noPosts: 'No posts yet. Say hi!',
  preview: (handle: string, text: string) => `${handle}: ${text}`,
  footnote: (region: string) =>
    `Every collector in ${region} can read these rooms. Keep deals and addresses in private chats.`,
  rowLabel: (input: {
    name: string;
    region: string;
    preview: string | null;
    when: string;
    unread: boolean;
  }) =>
    `${input.name} room, ${input.region}. ${
      input.preview ? `Last post: ${input.preview}, ${input.when}.` : 'No posts yet.'
    }${input.unread ? ' New posts.' : ''}`,
  newPosts: 'New posts',
  loadError: 'The rooms could not load',
  emptyTitle: (region: string) => `No rooms in ${region} yet`,
  emptyBody: 'Rooms open one game at a time. Try another region.',
  closedTitle: 'The community is closed right now',
  closedBody: 'Public rooms are turned off for the moment. Private chats still work.',
  closedAction: 'Open chats',
} as const;

/** One room (screen 33). */
export const ROOM_COPY = {
  back: 'Back to Community',
  subtitle: (region: string) => `${region} · public room`,
  rulesButton: 'Room rules',
  rulesTitle: 'Room rules',
  rules: [
    'Be kind. No hate, harassment, scams or spam.',
    'Talk cards here. Agree on deals in a private chat, and never post your address or e-Transfer email in a room.',
    'Check ratings before you send an e-Transfer, and ask for tracking.',
    'Report a post with ⋯. Moderators remove what breaks the rules.',
  ],
  rateRule: 'You can post up to 10 times an hour in each room.',
  gotIt: 'Got it',
  banner: 'Every collector can read this room. Keep deals and addresses in private chats.',
  postsLabel: (name: string) => `Posts of the ${name} room`,
  loading: 'Loading the posts',
  emptyTitle: 'No posts yet',
  emptyBody: 'Say hi! Ask about a card, show a binder or a deck core you sell by mail.',
  loadError: 'The posts could not load',
  notFoundTitle: 'This room is closed',
  notFoundBody: 'It may have been archived. Pick another room from the list.',
  notFoundAction: 'All rooms',
  more: (handle: string) => `More for the post by ${handle}`,
  message: (handle: string) => `Message ${handle}`,
  report: 'Report this post',
  block: (handle: string) => `Block ${handle}`,
  delete: 'Delete',
  cancel: 'Cancel',
  deleteTitle: 'Delete this post?',
  deleteBody: 'Your post and its photos leave the room for everyone.',
  deleted: 'Post deleted.',
  you: 'You',
  postLabel: (input: { handle: string; own: boolean; place: string | null; time: string }) =>
    [input.own ? `${input.handle}, you` : input.handle, input.place, input.time]
      .filter(Boolean)
      .join(', '),
  photo: (index: number, count: number, handle: string) =>
    `Photo ${index} of ${count} from ${handle}. Opens it full screen.`,
  photoViewer: 'Photo of the post',
  closePhoto: 'Close the photo',
  photoUnavailable: 'Photo unavailable',
  deckCore: 'Deck core',
  binder: (name: string, handle: string) => `Binder: ${name} by ${handle}`,
  binderUnavailable: 'Binder no longer available',
  profileHint: (handle: string) => `Opens the profile of ${handle}`,
  deckCoreLabel: (name: string, price: string | null) =>
    `Deck core: ${name}${price ? `, ${price}` : ''}`,
} as const;

/** The message box of a room and its "+" sheet. */
export const ROOM_COMPOSER_COPY = {
  placeholder: 'Write to the room',
  field: (room: string) => `Write to the ${room} room`,
  attach: 'Send a photo, or share a card or a binder',
  photo: 'Send a photo',
  photoDetail: 'Up to 4 photos, 3 MB each',
  card: 'Share a card',
  binder: 'Share a binder or deck core',
  cancel: 'Cancel',
  send: 'Post',
  sending: 'Posting…',
  removePhoto: (index: number) => `Remove photo ${index}`,
  photoToPost: (index: number) => `Photo ${index} to post`,
  removeCard: 'Remove the card',
  removeBinder: 'Remove the binder',
  photoAccess: 'Allow access to your photos to post one.',
  photoType: 'Use a JPEG, PNG or WebP photo.',
  photoTooLarge: 'Choose a photo up to 3 MB.',
  photoEmpty: 'This file is empty.',
  photosFull: 'A post has 4 photos at most.',
  needsText: 'Write a few words to go with your post.',
  nearLimit: (length: number, max: number) => `${length} / ${max} characters`,
  tooLong: (max: number) => `Posts are limited to ${max} characters.`,
  tryAgain: 'Try again',
} as const;

/** Why a post was refused (under the message box). */
export const ROOM_ERROR_COPY = {
  rateLimited: 'You can post up to 10 times an hour in each room. Try again later.',
  duplicate: 'You already posted this.',
  blocked: 'This post breaks the community rules, so it was not published. Please rephrase it.',
  network: 'Your post was not sent. Check your connection.',
  closed: 'The community is closed right now.',
  gone: 'This room is no longer open.',
  photoRefused: 'One of the photos could not be posted. Remove it and try again.',
  photoTooLarge: 'One of the photos is larger than 3 MB. Remove it and try again.',
  photosRateLimited: 'You sent a lot of photos in a short time. Try again later.',
} as const;
