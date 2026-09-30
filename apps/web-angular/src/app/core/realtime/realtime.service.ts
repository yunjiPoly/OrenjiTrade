import { DOCUMENT } from '@angular/common';
import {
  DestroyRef,
  EnvironmentProviders,
  InjectionToken,
  Injectable,
  Injector,
  computed,
  effect,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
  signal,
  untracked,
} from '@angular/core';
import type { MessageResponse, NotificationResponse } from '@orenji/api-client';
import { Observable, Subject } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { SessionService } from '../auth/session.service';
import { AppConfig } from '../config/app-config.model';
import { AppConfigService } from '../config/app-config.service';
import {
  PresenceNotice,
  REALTIME_DESTINATIONS,
  ReadReceiptNotice,
  TypingNotice,
  isNotificationResponse,
  isPresenceNotice,
  isReadReceipt,
  isTypingNotice,
} from './realtime-events';
import type { StompConnectOptions, StompSession } from './stomp-connection';

/**
 * - `disabled`: nobody is signed in (or the account is not ready): no connection is wanted;
 * - `connecting`: first connection of the session;
 * - `connected`: STOMP session established, pushes arrive;
 * - `reconnecting`: the connection dropped or failed; a retry is scheduled (backoff).
 */
export type RealtimeState = 'disabled' | 'connecting' | 'connected' | 'reconnecting';

/** Opens a STOMP session (the default loads the client lazily; tests provide a fake). */
export interface StompConnector {
  connect(options: StompConnectOptions): Promise<StompSession>;
}

export const STOMP_CONNECTOR = new InjectionToken<StompConnector>('STOMP_CONNECTOR', {
  providedIn: 'root',
  factory: () => ({
    connect: async (options) => {
      const { StompConnection } = await import('./stomp-connection');
      return StompConnection.open(options);
    },
  }),
});

/** Heartbeat interval offered to the server (it answers with 20 s; the larger value wins). */
export const REALTIME_HEARTBEAT_MS = 10_000;
export const RECONNECT_BASE_MS = 1_000;
export const RECONNECT_MAX_MS = 30_000;

/**
 * Delay before reconnection attempt `attempt` (1-based): exponential from 1 s, capped at 30 s,
 * with ±20 % jitter so a server restart does not bring every client back at the same instant.
 */
export function reconnectDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.8 + random() * 0.4));
}

/**
 * WebSocket URL of the realtime endpoint with the ID token as `access_token` (browsers cannot set
 * headers on WebSocket requests; the server validates it at the handshake and never logs it).
 * `wsBaseUrl` comes from `/config.json`; when empty it is derived from the API origin.
 */
export function realtimeUrl(
  config: Pick<AppConfig, 'wsBaseUrl' | 'apiBaseUrl'>,
  token: string,
  origin = globalThis.location?.origin ?? 'http://localhost',
): string {
  let base = config.wsBaseUrl.trim();
  if (!base) {
    const api = (config.apiBaseUrl || origin).replace(/\/+$/, '');
    base = `${api.replace(/^http/i, 'ws')}/ws`;
  }
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}access_token=${encodeURIComponent(token)}`;
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function isMessageResponse(value: unknown): value is MessageResponse {
  const candidate = value as Partial<MessageResponse> | null;
  return (
    !!candidate &&
    typeof candidate.id === 'string' &&
    typeof candidate.conversationId === 'string' &&
    typeof candidate.kind === 'string'
  );
}

/**
 * The realtime channel of the Phase 5 contract: STOMP over a native WebSocket at `/ws`,
 * authenticated with the Firebase ID token.
 *
 * - Connects while a collector is signed in with a ready account (`SessionService.status`), and
 *   disconnects on sign-out or when another account signs in.
 * - Subscribes to the caller's own queues only
 *   (`/user/queue/messages|receipts|typing|presence|notifications`) and sends nothing but
 *   `/app/typing`.
 * - Reconnects with exponential backoff (1 s → 30 s, jitter) and right away when the browser comes
 *   back online or the tab becomes visible. A connection that fails before STOMP CONNECTED may be
 *   a refused (expired) token, so the next attempt asks Firebase for a fresh one.
 * - {@link resync$} fires after every successful connection: pushes sent while the socket was
 *   down are lost, so views re-read their data over REST.
 *
 * The STOMP client itself is a lazy chunk (`stomp-connection.ts`).
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  private readonly appConfig = inject(AppConfigService);
  private readonly connector = inject(STOMP_CONNECTOR);
  private readonly injector = inject(Injector);
  private readonly doc = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  private readonly stateSignal = signal<RealtimeState>('disabled');
  private readonly messagesSubject = new Subject<MessageResponse>();
  private readonly receiptsSubject = new Subject<ReadReceiptNotice>();
  private readonly typingSubject = new Subject<TypingNotice>();
  private readonly presenceSubject = new Subject<PresenceNotice>();
  private readonly notificationsSubject = new Subject<NotificationResponse>();
  private readonly resyncSubject = new Subject<void>();

  /** Connection state, for status indicators. */
  readonly state = this.stateSignal.asReadonly();
  readonly connected = computed(() => this.stateSignal() === 'connected');
  /** New messages of the caller's conversations (sent by either participant). */
  readonly messages$: Observable<MessageResponse> = this.messagesSubject.asObservable();
  readonly receipts$: Observable<ReadReceiptNotice> = this.receiptsSubject.asObservable();
  readonly typing$: Observable<TypingNotice> = this.typingSubject.asObservable();
  readonly presence$: Observable<PresenceNotice> = this.presenceSubject.asObservable();
  /** New in-app notifications of the caller (Phase 6 notification centre). */
  readonly notifications$: Observable<NotificationResponse> =
    this.notificationsSubject.asObservable();
  /** Fires after each successful (re)connection: re-read over REST what may have been missed. */
  readonly resync$: Observable<void> = this.resyncSubject.asObservable();

  /** Firebase uid the connection belongs to (null: none wanted). */
  private uid: string | null = null;
  private connection: StompSession | null = null;
  private generation = 0;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private connecting = false;
  private forceTokenRefresh = false;
  private started = false;

  /** Follows the session from now on (called once by {@link provideRealtime}). */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    effect(
      () => {
        const ready = this.session.status() === 'ready';
        const uid = this.auth.user()?.uid ?? null;
        untracked(() => this.follow(ready ? uid : null));
      },
      { injector: this.injector },
    );
    const view = this.doc.defaultView;
    const onOnline = () => this.reconnectNow();
    const onVisible = () => {
      if (this.doc.visibilityState === 'visible') {
        this.reconnectNow();
      }
    };
    view?.addEventListener('online', onOnline);
    this.doc.addEventListener('visibilitychange', onVisible);
    this.destroyRef.onDestroy(() => {
      view?.removeEventListener('online', onOnline);
      this.doc.removeEventListener('visibilitychange', onVisible);
      this.follow(null);
    });
  }

  /** Connects for account `uid`, or disconnects for `null`. No-op when nothing changes. */
  follow(uid: string | null): void {
    if (uid === this.uid) {
      return;
    }
    this.teardown();
    this.uid = uid;
    if (uid) {
      this.stateSignal.set('connecting');
      void this.connect(this.generation);
    } else {
      this.stateSignal.set('disabled');
    }
  }

  /** Tells the other participant that the caller is typing (`SEND /app/typing`). */
  sendTyping(conversationId: string): void {
    this.connection?.send(REALTIME_DESTINATIONS.sendTyping, JSON.stringify({ conversationId }));
  }

  /** Skips the backoff wait (network back, tab visible again). */
  reconnectNow(): void {
    if (!this.uid || this.connecting || this.stateSignal() === 'connected') {
      return;
    }
    this.clearRetry();
    this.attempt = 0;
    void this.connect(this.generation);
  }

  private async connect(generation: number): Promise<void> {
    this.connecting = true;
    try {
      const token = await this.auth.getIdToken(this.forceTokenRefresh);
      if (generation !== this.generation) {
        return;
      }
      if (!token) {
        this.stateSignal.set('disabled');
        return;
      }
      const connection = await this.connector.connect({
        url: realtimeUrl(this.appConfig.config(), token),
        heartbeatMs: REALTIME_HEARTBEAT_MS,
        onClose: (info) => {
          if (info.connected) {
            this.onConnectionLost(generation);
          }
        },
      });
      if (generation !== this.generation) {
        connection.close();
        return;
      }
      this.connection = connection;
      this.subscribeAll(connection);
      this.attempt = 0;
      this.forceTokenRefresh = false;
      this.stateSignal.set('connected');
      this.resyncSubject.next();
    } catch {
      if (generation !== this.generation) {
        return;
      }
      // Failed before CONNECTED: the handshake may have refused an expired token (browsers hide
      // the HTTP status of a failed WebSocket handshake).
      this.forceTokenRefresh = true;
      this.scheduleRetry(generation);
    } finally {
      if (generation === this.generation) {
        this.connecting = false;
      }
    }
  }

  private onConnectionLost(generation: number): void {
    if (generation !== this.generation) {
      return;
    }
    this.connection = null;
    this.scheduleRetry(generation);
  }

  private scheduleRetry(generation: number): void {
    this.attempt++;
    this.stateSignal.set('reconnecting');
    this.clearRetry();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (generation === this.generation && !this.connecting) {
        void this.connect(generation);
      }
    }, reconnectDelay(this.attempt));
  }

  private subscribeAll(connection: StompSession): void {
    connection.subscribe(REALTIME_DESTINATIONS.messages, (frame) => {
      const body = parseJson(frame.body);
      if (isMessageResponse(body)) {
        this.messagesSubject.next(body);
      }
    });
    connection.subscribe(REALTIME_DESTINATIONS.receipts, (frame) => {
      const body = parseJson(frame.body);
      if (isReadReceipt(body)) {
        this.receiptsSubject.next(body);
      }
    });
    connection.subscribe(REALTIME_DESTINATIONS.typing, (frame) => {
      const body = parseJson(frame.body);
      if (isTypingNotice(body)) {
        this.typingSubject.next(body);
      }
    });
    connection.subscribe(REALTIME_DESTINATIONS.presence, (frame) => {
      const body = parseJson(frame.body);
      if (isPresenceNotice(body)) {
        this.presenceSubject.next(body);
      }
    });
    connection.subscribe(REALTIME_DESTINATIONS.notifications, (frame) => {
      const body = parseJson(frame.body);
      if (isNotificationResponse(body)) {
        this.notificationsSubject.next(body);
      }
    });
  }

  private teardown(): void {
    this.generation++;
    this.clearRetry();
    this.connecting = false;
    this.attempt = 0;
    this.forceTokenRefresh = false;
    const connection = this.connection;
    this.connection = null;
    connection?.close();
  }

  private clearRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
}

/** Starts the realtime channel with the application (it waits for a signed-in session). */
export function provideRealtime(): EnvironmentProviders {
  return makeEnvironmentProviders([provideAppInitializer(() => inject(RealtimeService).start())]);
}
