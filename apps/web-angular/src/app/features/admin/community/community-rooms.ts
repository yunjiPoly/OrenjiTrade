import type { AdminCommunityChannel } from '@orenji/api-client';
import { PLATFORM_REGION_NAMES } from '../../../shared/regions/regions.store';
import { gameName } from '../console/console-labels';
import {
  CHANNEL_DESCRIPTION_MAX,
  CHANNEL_NAME_MAX,
  RATE_LIMIT_MAX,
  RATE_LIMIT_MIN,
} from './admin-community-labels';

/** The rooms grid's games, in the boards' order (A5). */
export const ROOM_GAMES = ['yugioh', 'pokemon', 'mtg', 'onepiece', 'riftbound'] as const;
/** The rooms grid's regions, in the platform's order. */
export const ROOM_REGIONS = ['americas-north', 'americas-south', 'europe'] as const;

/** One cell of the 3 x 5 grid: a region's room of a game (or none yet). */
export interface RoomCell {
  region: string;
  game: string;
  room: AdminCommunityChannel | null;
}

/** A row of the grid: a region and its five rooms. */
export interface RoomRow {
  region: string;
  regionName: string;
  cells: RoomCell[];
  open: number;
}

/** A room is a REGION channel of a platform region and a game (V134's 15 rooms). */
function isRoomOf(channel: AdminCommunityChannel, region: string, game: string): boolean {
  return (
    channel.slug === `${region}-${game}` ||
    (channel.kind === 'REGION' && channel.regionLabel === region && channel.game === game)
  );
}

/**
 * The rooms grid (spec 15.4, A5: 3 regions x 5 games) and every other channel, which reads under
 * "Archived channels" (the channels from before the rooms).
 */
export function roomsGrid(channels: readonly AdminCommunityChannel[]): {
  rows: RoomRow[];
  others: AdminCommunityChannel[];
} {
  const used = new Set<string>();
  const rows = ROOM_REGIONS.map((region) => {
    const cells = ROOM_GAMES.map((game) => {
      const room = channels.find((channel) => isRoomOf(channel, region, game)) ?? null;
      if (room) {
        used.add(room.id);
      }
      return { region, game, room };
    });
    return {
      region,
      regionName: PLATFORM_REGION_NAMES[region] ?? region,
      cells,
      open: cells.filter((cell) => cell.room?.status === 'ACTIVE').length,
    };
  });
  const others = channels
    .filter((channel) => !used.has(channel.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  return { rows, others };
}

/** "15 rooms · 15 open · 52 posts in 24 h" */
export function roomsSummary(rows: readonly RoomRow[]): string {
  const rooms = rows.flatMap((row) => row.cells).filter((cell) => cell.room);
  const open = rooms.filter((cell) => cell.room?.status === 'ACTIVE').length;
  const posts = rooms.reduce((sum, cell) => sum + (cell.room?.postCount24h ?? 0), 0);
  return `${rooms.length} ${rooms.length === 1 ? 'room' : 'rooms'} · ${open} open · ${posts} ${posts === 1 ? 'post' : 'posts'} in 24 h`;
}

/** "Americas (North) · Yu-Gi-Oh!" */
export function roomTitle(region: string, game: string): string {
  return `${PLATFORM_REGION_NAMES[region] ?? region} · ${gameName(game) ?? game}`;
}

/** The room drawer's form. */
export interface RoomDraft {
  name: string;
  description: string;
  postRateLimitPerHour: string;
  sortOrder: string;
}

/** The drawer's errors, by field (empty when it can be saved). */
export function roomDraftErrors(draft: RoomDraft): Partial<Record<keyof RoomDraft, string>> {
  const errors: Partial<Record<keyof RoomDraft, string>> = {};
  const name = draft.name.trim();
  if (!name) {
    errors.name = 'A name is required.';
  } else if (name.length > CHANNEL_NAME_MAX) {
    errors.name = `At most ${CHANNEL_NAME_MAX} characters.`;
  }
  if (draft.description.trim().length > CHANNEL_DESCRIPTION_MAX) {
    errors.description = `At most ${CHANNEL_DESCRIPTION_MAX} characters.`;
  }
  const rate = Number(draft.postRateLimitPerHour);
  if (
    draft.postRateLimitPerHour.trim() === '' ||
    !Number.isInteger(rate) ||
    rate < RATE_LIMIT_MIN ||
    rate > RATE_LIMIT_MAX
  ) {
    errors.postRateLimitPerHour = `Between ${RATE_LIMIT_MIN} and ${RATE_LIMIT_MAX.toLocaleString('en-US')}.`;
  }
  const order = Number(draft.sortOrder);
  if (draft.sortOrder.trim() === '' || !Number.isInteger(order) || order < 0 || order > 100_000) {
    errors.sortOrder = 'Between 0 and 100,000.';
  }
  return errors;
}

/** "10 an hour per member" */
export function rateLine(rate: number): string {
  return `${rate} an hour per member`;
}
