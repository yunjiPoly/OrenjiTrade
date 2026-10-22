import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import type {
  CommunityChannel,
  CommunityLastPost,
  CreatePostRequest,
  PostResponse,
} from '@/src/api/types';
import { dayLabel } from '@/src/features/messages/threadItems';
import type {
  BinderLinkChoice,
  CardLinkChoice,
  PickedPhoto,
} from '@/src/features/messages/messageDraft';

import { ROOM_COMPOSER_COPY, ROOM_ERROR_COPY } from './communityCopy';

/** `CreatePostRequest.body` limit. */
export const POST_MAX_LENGTH = 2000;
/** Photos per post (stage R11, owner 2026-10-08: up to 4, 3 MB each, photos only). */
export const ROOM_PHOTOS_MAX = 4;
/** The error code the phone gives an upload refused by the uploads' own hourly limit (429). */
export const UPLOAD_RATE_LIMITED = 'UPLOAD_RATE_LIMITED';
/** `POST /uploads/images?kind=COMMUNITY` limit. */
export const ROOM_PHOTO_MAX_BYTES = 3 * 1024 * 1024;
export const ROOM_PHOTO_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * The rooms of a region in the list's order (stage R11, screen 32): the browsed game's room first,
 * then the others in the games' order (`gameOrder`, the order of `GET /games`); a room of a game
 * the list does not know keeps the server's order, at the end.
 */
export function orderRooms(
  rooms: readonly CommunityChannel[],
  browsedGame: string | null,
  gameOrder: readonly string[]
): CommunityChannel[] {
  const rank = (room: CommunityChannel) => {
    if (room.game && room.game === browsedGame) {
      return -1;
    }
    const index = room.game ? gameOrder.indexOf(room.game) : -1;
    return index === -1 ? gameOrder.length : index;
  };
  return rooms
    .map((room, index) => ({ room, index }))
    .sort((a, b) => rank(a.room) - rank(b.room) || a.index - b.index)
    .map(({ room }) => room);
}

/**
 * Whether a room shows bold with an orange dot: someone else posted after the collector's last
 * visit on this phone (no visit yet: any post of someone else). Their own newest post never counts.
 */
export function isRoomUnread(
  lastPost: CommunityLastPost | null | undefined,
  visitedAt: string | null | undefined
): boolean {
  if (!lastPost || lastPost.mine) {
    return false;
  }
  if (!visitedAt) {
    return true;
  }
  const posted = Date.parse(lastPost.createdAt);
  const visited = Date.parse(visitedAt);
  return Number.isNaN(visited) || (!Number.isNaN(posted) && posted > visited);
}

/** The newer of two instants (ISO strings); a visit never moves back. */
export function laterOf(current: string | null | undefined, next: string): string {
  if (!current) {
    return next;
  }
  return Date.parse(next) > Date.parse(current) ? next : current;
}

/** "{handle}: {text}" of a room row, or null without a post. */
export function roomPreview(lastPost: CommunityLastPost | null | undefined): string | null {
  return lastPost ? `${lastPost.authorHandle}: ${lastPost.body}` : null;
}

/** The state or province under a post's handle ("Quebec"), never a city; null when not shared. */
export function postPlace(post: Pick<PostResponse, 'place'>): string | null {
  const place = post.place;
  if (!place) {
    return null;
  }
  return place.subdivisionName || place.countryName || null;
}

/** "9:12 AM": a post's time in the room (the day separators carry the day). */
export function postTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(date);
}

export interface RoomDayItem {
  kind: 'day';
  key: string;
  label: string;
}

export interface RoomPostItem {
  kind: 'post';
  key: string;
  post: PostResponse;
}

export type RoomItem = RoomDayItem | RoomPostItem;

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/**
 * A room's posts as the chat-like list reads them, oldest first with a day separator before the
 * first post of each day of the phone's time zone ("Today", "Yesterday", "Monday, September 28");
 * the screen shows them reversed in an inverted list (newest at the bottom). `posts` come newest
 * first, as the API pages them; a post seen twice (a page and the post just made) is kept once.
 */
export function buildRoomItems(posts: readonly PostResponse[], now: Date = new Date()): RoomItem[] {
  const seen = new Set<string>();
  const ordered = [...posts]
    .filter((post) => (seen.has(post.id) ? false : (seen.add(post.id), true)))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
  const items: RoomItem[] = [];
  let previous = '';
  for (const post of ordered) {
    const at = new Date(post.createdAt);
    const key = dayKey(at);
    if (key !== previous) {
      items.push({ kind: 'day', key: `day-${key}`, label: dayLabel(at, now) });
      previous = key;
    }
    items.push({ kind: 'post', key: post.id, post });
  }
  return items;
}

/** What a room post is made of on the phone before it is sent. */
export interface RoomDraft {
  text: string;
  photos: readonly PickedPhoto[];
  card: CardLinkChoice | null;
  binder: BinderLinkChoice | null;
}

export const EMPTY_ROOM_DRAFT: RoomDraft = { text: '', photos: [], card: null, binder: null };

/** Whether the send button is orange: some text, not too long (a post always has text). */
export function canPost(draft: RoomDraft, busy = false): boolean {
  const length = draft.text.trim().length;
  return !busy && length > 0 && draft.text.length <= POST_MAX_LENGTH;
}

/** The request of a draft, with the uploads of its photos in their order. */
export function postRequest(
  draft: RoomDraft,
  photoUploadIds: readonly string[] = []
): CreatePostRequest {
  const request: CreatePostRequest = { body: draft.text.trim() };
  if (draft.card) {
    request.cardPrintingId = draft.card.printingId;
  }
  if (draft.binder) {
    request.binderId = draft.binder.binderId;
  }
  if (photoUploadIds.length > 0) {
    request.photoUploadIds = [...photoUploadIds];
  }
  return request;
}

/** Why a picked photo cannot be posted, or null (the API checks again and strips its metadata). */
export function roomPhotoProblem(photo: Pick<PickedPhoto, 'mimeType' | 'size'>): string | null {
  if (!ROOM_PHOTO_TYPES.includes(photo.mimeType)) {
    return ROOM_COMPOSER_COPY.photoType;
  }
  if (photo.size === 0) {
    return ROOM_COMPOSER_COPY.photoEmpty;
  }
  if (photo.size !== null && photo.size > ROOM_PHOTO_MAX_BYTES) {
    return ROOM_COMPOSER_COPY.photoTooLarge;
  }
  return null;
}

/**
 * Wording of a refused post, under the message box (stage R11): the room's limit (429), the same
 * text twice (409 `DUPLICATE_POST`), the moderation rules (422), a photo the upload refused (413,
 * 415, 400), the community turned off, the room gone, and a network error (the text stays in the
 * box with "Try again").
 */
export function postErrorMessage(error: ApiError): string {
  switch (error.errorCode) {
    case 'RATE_LIMITED':
      return ROOM_ERROR_COPY.rateLimited;
    case UPLOAD_RATE_LIMITED:
      return ROOM_ERROR_COPY.photosRateLimited;
    case 'DUPLICATE_POST':
      return ROOM_ERROR_COPY.duplicate;
    case 'POST_BLOCKED':
      return ROOM_ERROR_COPY.blocked;
    case 'PAYLOAD_TOO_LARGE':
      return ROOM_ERROR_COPY.photoTooLarge;
    case 'UNSUPPORTED_MEDIA_TYPE':
      return ROOM_COMPOSER_COPY.photoType;
    case 'FEATURE_DISABLED':
      return ROOM_ERROR_COPY.closed;
    case 'NOT_FOUND':
      return ROOM_ERROR_COPY.gone;
    case 'VALIDATION_FAILED':
      return error.fieldErrors.photoUploadIds || error.fieldErrors.file
        ? ROOM_ERROR_COPY.photoRefused
        : error.message || friendlyMessage(error);
    default:
      return error.status === 0 ? ROOM_ERROR_COPY.network : friendlyMessage(error);
  }
}

/** Whether a refusal is worth the same post again as it is ("Try again"): a network error. */
export function isRetryable(error: ApiError): boolean {
  return error.status === 0 || error.status >= 500;
}
