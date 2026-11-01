import type {
  CommunityChannel,
  CommunityLastPost,
  CreatePostRequest,
  PostResponse,
} from '@orenji/api-client';
import { ROOM_VISITS_PREFIX } from '../../../core/auth/account-storage';
import { ApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { dayLabel } from '../../messages/data/thread-items';
import type { RoomShareChoice } from '../../messages/dialogs/share-picker-dialog.component';
import { ROOM_ERROR_COPY, ROOMS_COPY } from './community-copy';

/**
 * The rules of Messages › Community on the web (stage WF, spec 10.7, board W22), the phone's where
 * they are shared (stage R11, `communityHelpers.ts`): the rooms' order and dots, the times, the
 * posts read like a chat, the message box and the refusals.
 */

/** `CreatePostRequest.body` limit. */
export const POST_MAX_LENGTH = 2000;
/** From this length on, the message box says how many characters are left. */
export const POST_NEAR_LIMIT = 1800;
/** Posts per page of `GET /community/channels/{slug}/posts`. */
export const POSTS_PAGE = 30;
/** An open room asks for its first page again this often while on screen (the phone's 15 s). */
export const ROOM_POLL_MS = 15_000;
/** The Room rules pane at 1280 and wider: shown or hidden, remembered in this browser. */
export const RULES_PANE_KEY = 'orenjitrade.community.rulesPanel';

/**
 * The rooms of a region in the list's order: the browsed game's room first, then the others in
 * the games' order (`gameOrder`, the order of `GET /games`); a room of a game the list does not
 * know keeps the server's order, at the end. Only the region's game rooms (kind `REGION` with a
 * game) are listed: V134 archived every other channel.
 */
export function orderRooms(
  rooms: readonly CommunityChannel[],
  browsedGame: string | null,
  gameOrder: readonly string[],
): CommunityChannel[] {
  const rank = (room: CommunityChannel) => {
    if (room.game && room.game === browsedGame) {
      return -1;
    }
    const index = room.game ? gameOrder.indexOf(room.game) : -1;
    return index === -1 ? gameOrder.length : index;
  };
  return rooms
    .filter((room) => room.kind === 'REGION' && !!room.game)
    .map((room, index) => ({ room, index }))
    .sort((a, b) => rank(a.room) - rank(b.room) || a.index - b.index)
    .map(({ room }) => room);
}

/**
 * Whether a room shows bold with an orange dot: someone else posted after the collector's last
 * visit in this browser (no visit yet: any post of someone else). Their own newest post never
 * counts.
 */
export function isRoomUnread(
  lastPost: CommunityLastPost | null | undefined,
  visitedAt: string | null | undefined,
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

/** "{handle}: {text}" of a room row ("You: …" for one's own), or null without a post. */
export function roomPreview(lastPost: CommunityLastPost | null | undefined): string | null {
  if (!lastPost) {
    return null;
  }
  return ROOMS_COPY.preview(lastPost.mine ? 'You' : lastPost.authorHandle, lastPost.body);
}

const CLOCK = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' });
const WEEKDAY = new Intl.DateTimeFormat('en', { weekday: 'short' });
const MONTH_DAY = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
const DAY_MS = 86_400_000;

/** A room row's time (board W22): "9:31 AM" today, "Yesterday", "Sun" this week, else "Sep 28". */
export function roomTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return '';
  }
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (at.getTime() >= startOfToday) {
    return CLOCK.format(at);
  }
  if (at.getTime() >= startOfToday - DAY_MS) {
    return 'Yesterday';
  }
  if (at.getTime() >= startOfToday - 6 * DAY_MS) {
    return WEEKDAY.format(at);
  }
  return MONTH_DAY.format(at);
}

/** "9:12 AM": a post's time in the room (the day separators carry the day). */
export function postTime(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '' : CLOCK.format(at);
}

/** The state or province beside a post's handle ("Quebec"), never a city; null when not shared. */
export function postPlace(post: Pick<PostResponse, 'place'>): string | null {
  const place = post.place;
  if (!place) {
    return null;
  }
  return place.subdivisionName || place.countryName || null;
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
  /** The day separator's words before the time, for the post's spoken label ("Yesterday"). */
  day: string;
}

export type RoomItem = RoomDayItem | RoomPostItem;

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/**
 * A room's posts as the chat-like log reads them: oldest first, newest at the bottom, a day
 * separator before the first post of each day ("Today", "Yesterday", "Monday, September 28").
 * `posts` come newest first, as the API pages them; a post seen twice is kept once.
 */
export function buildRoomItems(posts: readonly PostResponse[], now: Date = new Date()): RoomItem[] {
  const ordered = mergePosts([], posts).reverse();
  const items: RoomItem[] = [];
  let previous = '';
  let label = '';
  for (const post of ordered) {
    const at = new Date(post.createdAt);
    const key = dayKey(at);
    if (key !== previous) {
      label = dayLabel(at, now);
      items.push({ kind: 'day', key: `day-${key}`, label });
      previous = key;
    }
    items.push({ kind: 'post', key: post.id, post, day: label });
  }
  return items;
}

/**
 * The posts shown, newest first, without duplicates: `incoming` (a fresh page, a new post) wins
 * over what was shown for the same id.
 */
export function mergePosts(
  current: readonly PostResponse[],
  incoming: readonly PostResponse[],
): PostResponse[] {
  const byId = new Map<string, PostResponse>();
  for (const post of current) {
    byId.set(post.id, post);
  }
  for (const post of incoming) {
    byId.set(post.id, post);
  }
  return [...byId.values()].sort(comparePosts);
}

/** The order of the posts shown: newest first (negative when `a` comes before `b`). */
export function comparePosts(
  a: Pick<PostResponse, 'id' | 'createdAt'>,
  b: Pick<PostResponse, 'id' | 'createdAt'>,
): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id);
}

/**
 * One thing a post shares besides its text: a card, or a binder or deck core (never a photo on the
 * web: community photos are S4). A post carries at most one of each (WF review U4).
 */
export type RoomAttachment = RoomShareChoice;

/**
 * The tray after the picker chose `choice`: it takes the place of what was there of its kind (a
 * card, or a binder or deck core); the other kind stays. The card comes first.
 */
export function addAttachment(
  current: readonly RoomAttachment[],
  choice: RoomAttachment,
): RoomAttachment[] {
  return [...current.filter((item) => item.kind !== choice.kind), choice].sort((a, b) =>
    a.kind === b.kind ? 0 : a.kind === 'card' ? -1 : 1,
  );
}

/** Whether the post button is orange: some text, not too long (a post always has text). */
export function canPost(text: string, busy = false): boolean {
  const length = text.trim().length;
  return !busy && length > 0 && text.length <= POST_MAX_LENGTH;
}

/** The request of a draft: its text, the card's printing and the binder, each when shared. */
export function postRequest(
  text: string,
  attachments: readonly RoomAttachment[] | null,
): CreatePostRequest {
  const request: CreatePostRequest = { body: text.trim() };
  for (const attachment of attachments ?? []) {
    if (attachment.kind === 'card') {
      request.cardPrintingId = attachment.card.printingId;
    } else {
      request.binderId = attachment.binder.binderId;
    }
  }
  return request;
}

/**
 * Wording of a refused post, under the message box (the phone's): the room's limit (429), the
 * same text twice (409 `DUPLICATE_POST`), the moderation rules (422), the community turned off,
 * the room gone, and a network error (the text stays in the box with "Try again").
 */
export function postErrorMessage(error: ApiError): string {
  switch (error.errorCode) {
    case 'RATE_LIMITED':
      return ROOM_ERROR_COPY.rateLimited;
    case 'DUPLICATE_POST':
      return ROOM_ERROR_COPY.duplicate;
    case 'POST_BLOCKED':
      return ROOM_ERROR_COPY.blocked;
    case 'FEATURE_DISABLED':
      return ROOM_ERROR_COPY.closed;
    case 'NOT_FOUND':
      return ROOM_ERROR_COPY.gone;
    default:
      return error.status === 0 ? ROOM_ERROR_COPY.network : friendlyMessage(error);
  }
}

/** Whether a refusal is worth the same post again as it is ("Try again"): a network error. */
export function isRetryable(error: ApiError): boolean {
  return error.status === 0 || error.status >= 500;
}

/** A room's slug: `{region}-{game}` (V134). */
export function roomSlug(region: string, game: string): string {
  return `${region}-${game}`;
}

/**
 * The region a room's slug names, among `regions` (the longest code that starts it, so
 * `americas-north-yugioh` is `americas-north`), or null.
 */
export function regionOfSlug(slug: string, regions: readonly string[]): string | null {
  const matches = regions.filter((code) => slug.startsWith(`${code}-`));
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** The game a room's slug names after its region, or null. */
export function gameOfSlug(slug: string, region: string | null): string | null {
  if (!region || !slug.startsWith(`${region}-`)) {
    return null;
  }
  return slug.slice(region.length + 1) || null;
}

/** The newest post seen in each room, per account in this browser (`roomVisits` of the phone). */
export type RoomVisits = Readonly<Record<string, string>>;

/** The rooms' visits of `uid` kept in `storage` (empty when unknown or unreadable). */
export function readVisits(storage: Storage | null | undefined, uid: string): RoomVisits {
  try {
    const raw = storage?.getItem(ROOM_VISITS_PREFIX + uid);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const visits: Record<string, string> = {};
    for (const [slug, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof at === 'string' && !Number.isNaN(Date.parse(at))) {
        visits[slug] = at;
      }
    }
    return visits;
  } catch {
    return {};
  }
}

/** Keeps the visits of `uid` (storage errors ignored: the dots then last for this visit only). */
export function writeVisits(
  storage: Storage | null | undefined,
  uid: string,
  visits: RoomVisits,
): void {
  try {
    storage?.setItem(ROOM_VISITS_PREFIX + uid, JSON.stringify(visits));
  } catch {
    // Private mode or a full storage: the visits stay in memory.
  }
}

/** The Room rules pane's state at lg: shown unless hidden before (board W22). */
export function readRulesPane(storage: Storage | null | undefined): boolean {
  try {
    return storage?.getItem(RULES_PANE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveRulesPane(storage: Storage | null | undefined, shown: boolean): void {
  try {
    storage?.setItem(RULES_PANE_KEY, shown ? 'on' : 'off');
  } catch {
    // Kept for this page only.
  }
}

/**
 * The room list's newest post from the newest post the open room shows (the list follows a post
 * or a refresh without a read of its own): the text on one line, cut to 140 characters with "…".
 */
export function toLastPost(
  post: PostResponse | null | undefined,
  selfId: string | null,
): CommunityLastPost | null {
  if (!post) {
    return null;
  }
  const flat = post.body.replace(/\s+/g, ' ').trim();
  return {
    id: post.id,
    authorHandle: post.author.handle,
    body: flat.length > 140 ? `${flat.slice(0, 139)}…` : flat,
    createdAt: post.createdAt,
    mine: post.author.id === selfId,
  };
}
