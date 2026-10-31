import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { CommunityChannel, CommunityLastPost, CommunityService } from '@orenji/api-client';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { GameContext } from '../../../core/game/game-context.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { silentErrors } from '../../../core/http/http-context';
import { GamesStore } from '../../../shared/catalog/games.store';
import {
  RoomVisits,
  isRoomUnread,
  laterOf,
  orderRooms,
  readVisits,
  writeVisits,
} from './community-rules';

export type RoomsStatus = 'loading' | 'ready' | 'error' | 'disabled';

/**
 * The inbox column of Messages › Community (stage WF, spec 10.7, board W22): the five game rooms
 * of the browsed platform region (`GET /community/channels?region=`, each with the newest post the
 * caller may see), the browsed game's room first, then the games' order; a room is bold with an
 * orange dot while someone else posted after the collector's last visit in this browser (kept per
 * account in `localStorage`, removed on sign-out; nothing is stored on the server).
 *
 * Provided by the community view.
 */
@Injectable()
export class CommunityRoomsStore {
  private readonly api = inject(CommunityService);
  private readonly auth = inject(AuthService);
  private readonly game = inject(GameContext);
  private readonly games = inject(GamesStore);
  private readonly document = inject(DOCUMENT);

  private readonly channelsState = signal<CommunityChannel[]>([]);
  private readonly statusState = signal<RoomsStatus>('loading');
  private readonly errorState = signal<ApiError | null>(null);
  private readonly regionState = signal<string | null>(null);
  private readonly visitsState = signal<RoomVisits>({});
  private request: Subscription | null = null;
  private visitsFor: string | null = null;

  readonly status = this.statusState.asReadonly();
  readonly error = this.errorState.asReadonly();
  /** The region whose rooms are listed (or being read). */
  readonly region = this.regionState.asReadonly();
  readonly visits = this.visitsState.asReadonly();
  /** The rooms in the list's order. */
  readonly rooms = computed(() =>
    orderRooms(
      this.channelsState(),
      this.game.current(),
      (this.games.games() ?? []).map((game) => game.slug ?? ''),
    ),
  );
  /** The slugs of the rooms with someone else's post since the last visit. */
  readonly unread = computed(() => {
    const visits = this.visitsState();
    return new Set(
      this.rooms()
        .filter((room) => isRoomUnread(room.lastPost, visits[room.slug]))
        .map((room) => room.slug),
    );
  });

  constructor() {
    void this.games.load();
    // The visits belong to the signed-in account: another account reads its own.
    effect(() => {
      const uid = this.auth.user()?.uid ?? null;
      untracked(() => {
        if (uid !== this.visitsFor) {
          this.visitsFor = uid;
          this.visitsState.set(uid ? readVisits(this.storage(), uid) : {});
        }
      });
    });
  }

  /** Reads the rooms of `region` (again with `force`, the error's "Try again"). */
  load(region: string, force = false): void {
    if (!force && region === this.regionState() && this.statusState() !== 'error') {
      return;
    }
    this.request?.unsubscribe();
    if (region !== this.regionState()) {
      this.channelsState.set([]);
    }
    this.regionState.set(region);
    this.statusState.set('loading');
    this.errorState.set(null);
    this.request = this.api
      .listCommunityChannels({ region }, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (channels) => {
          this.channelsState.set(channels ?? []);
          this.statusState.set('ready');
        },
        error: (error: unknown) => {
          const apiError = toApiError(error);
          this.errorState.set(apiError);
          this.statusState.set(apiError.errorCode === 'FEATURE_DISABLED' ? 'disabled' : 'error');
        },
      });
  }

  /** Quietly reads the rooms again (the previews and dots), keeping what is shown on failure. */
  refresh(): void {
    const region = this.regionState();
    if (!region || this.statusState() !== 'ready') {
      return;
    }
    this.api
      .listCommunityChannels({ region }, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (channels) => {
          if (region === this.regionState()) {
            this.channelsState.set(channels ?? []);
          }
        },
        error: (error: unknown) => {
          if (toApiError(error).errorCode === 'FEATURE_DISABLED') {
            this.statusState.set('disabled');
          }
        },
      });
  }

  /**
   * The community was turned off (the open room answered `FEATURE_DISABLED`): the list says so at
   * once, without its rooms, whatever its own last read was (WF leftover F9).
   */
  disable(): void {
    this.request?.unsubscribe();
    this.request = null;
    this.channelsState.set([]);
    this.errorState.set(null);
    this.statusState.set('disabled');
  }

  /** The room of `slug` among the listed ones. */
  room(slug: string | null | undefined): CommunityChannel | null {
    return slug ? (this.rooms().find((room) => room.slug === slug) ?? null) : null;
  }

  /** The room's newest post as the open room read it (the list follows without a new read). */
  setLastPost(slug: string, lastPost: CommunityLastPost | null): void {
    this.channelsState.update((channels) =>
      channels.map((channel) =>
        channel.slug === slug ? { ...channel, lastPost: lastPost ?? undefined } : channel,
      ),
    );
  }

  /** The collector saw the room up to `newest` (its newest post's time): its dot goes. */
  markVisited(slug: string, newest: string | null): void {
    const uid = this.visitsFor;
    if (!uid) {
      return;
    }
    const current = this.visitsState();
    const at = laterOf(current[slug], newest ?? new Date().toISOString());
    if (current[slug] === at) {
      return;
    }
    const next = { ...current, [slug]: at };
    this.visitsState.set(next);
    writeVisits(this.storage(), uid, next);
  }

  private storage(): Storage | null {
    try {
      return this.document.defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  }
}
