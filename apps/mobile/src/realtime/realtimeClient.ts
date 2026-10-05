import type { MessageResponse, NotificationResponse } from '@/src/api/types';

import {
  REALTIME_DESTINATIONS,
  isMessageResponse,
  isNotificationResponse,
  isPresenceNotice,
  isReadReceipt,
  isTypingNotice,
  type PresenceNotice,
  type ReadReceiptNotice,
  type TypingNotice,
} from './realtimeEvents';
import { StompConnection, type StompConnectOptions, type StompSession } from './stompConnection';

/**
 * - `disabled`: nobody is signed in (or the account is not ready): no connection is wanted;
 * - `connecting`: first connection of the session (or after the app came back to the foreground);
 * - `connected`: STOMP session established, pushes arrive;
 * - `reconnecting`: the connection dropped or failed; a retry is scheduled (backoff);
 * - `paused`: the app is in the background; the socket is closed until it comes back.
 */
export type RealtimeState = 'disabled' | 'connecting' | 'connected' | 'reconnecting' | 'paused';

/** Opens a STOMP session (the default is `StompConnection`; tests provide a fake). */
export interface StompConnector {
  connect(options: StompConnectOptions): Promise<StompSession>;
}

export const defaultConnector: StompConnector = {
  connect: (options) => StompConnection.open(options),
};

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

/** Where and how a session opens its socket. */
export interface RealtimeEndpoint {
  url: string;
  /** Handshake headers (never logged). */
  headers?: Readonly<Record<string, string>>;
}

/**
 * The realtime endpoint of the API (`/ws`, native WebSocket, no SockJS) for an ID token. Native
 * apps send the token in the `Authorization` header of the handshake; a browser cannot set
 * headers on a WebSocket, so the web build passes it as `?access_token=` like the web app. The
 * server accepts both, validates the token at the handshake and never logs it; neither is
 * logged here.
 */
export function realtimeEndpoint(
  apiBaseUrl: string,
  token: string,
  platform: string
): RealtimeEndpoint {
  const api = apiBaseUrl.trim().replace(/\/+$/, '');
  const base = `${api.replace(/^http/i, 'ws')}/ws`;
  if (platform === 'web') {
    return { url: `${base}?access_token=${encodeURIComponent(token)}` };
  }
  return { url: base, headers: { Authorization: `Bearer ${token}` } };
}

export interface RealtimeEventMap {
  /** New messages of the caller's conversations (sent by either participant). */
  message: MessageResponse;
  receipt: ReadReceiptNotice;
  typing: TypingNotice;
  presence: PresenceNotice;
  /** New in-app notifications of the caller (Phase 6 notification centre). */
  notification: NotificationResponse;
  /** After each successful (re)connection: re-read over REST what may have been missed. */
  resync: undefined;
  state: RealtimeState;
}

export type RealtimeEvent = keyof RealtimeEventMap;
type Handler<K extends RealtimeEvent> = (payload: RealtimeEventMap[K]) => void;

export interface RealtimeClientOptions {
  /** The session's ID token; `forceRefresh` after a refused handshake. Null when signed out. */
  tokenSource: (forceRefresh: boolean) => Promise<string | null>;
  endpointFor: (token: string) => RealtimeEndpoint;
  connector?: StompConnector;
  random?: () => number;
  /** React Native: frames that survive its NUL handling (see `StompConnectOptions`). */
  nulSafeFrames?: boolean;
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/**
 * The realtime channel of the Phase 5 contract (port of the web's `RealtimeService`): STOMP over
 * a WebSocket at `/ws`, authenticated with the Firebase ID token.
 *
 * - {@link follow} connects for a signed-in collector with a ready account and disconnects on
 *   sign-out or when another account signs in.
 * - Subscribes to the caller's own queues only
 *   (`/user/queue/messages|receipts|typing|presence|notifications`) and sends nothing but
 *   `/app/typing`.
 * - Reconnects with exponential backoff (1 s → 30 s, jitter), and right away when the network
 *   comes back ({@link reconnectNow}). A connection that fails before STOMP CONNECTED may be a
 *   refused (expired) token, so the next attempt asks Firebase for a fresh one.
 * - {@link pause} (app in the background) closes the socket; {@link resume} reconnects at once.
 * - `resync` fires after every successful connection: pushes sent while the socket was down are
 *   lost, so screens re-read their data over REST.
 */
export class RealtimeClient {
  private readonly connector: StompConnector;
  private readonly random: () => number;
  private readonly listeners = new Map<RealtimeEvent, Set<Handler<RealtimeEvent>>>();
  private stateValue: RealtimeState = 'disabled';
  private uid: string | null = null;
  private paused = false;
  private connection: StompSession | null = null;
  private generation = 0;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private connecting = false;
  private forceTokenRefresh = false;

  constructor(private readonly options: RealtimeClientOptions) {
    this.connector = options.connector ?? defaultConnector;
    this.random = options.random ?? Math.random;
  }

  get state(): RealtimeState {
    return this.stateValue;
  }

  /** Subscribes to an event; returns the unsubscribe function. */
  on<K extends RealtimeEvent>(event: K, handler: Handler<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as Handler<RealtimeEvent>);
    return () => {
      set.delete(handler as Handler<RealtimeEvent>);
    };
  }

  /** Connects for account `uid`, or disconnects for `null`. No-op when nothing changes. */
  follow(uid: string | null): void {
    if (uid === this.uid) {
      return;
    }
    this.teardown();
    this.uid = uid;
    if (!uid) {
      this.setState('disabled');
    } else if (this.paused) {
      this.setState('paused');
    } else {
      this.setState('connecting');
      void this.connect(this.generation);
    }
  }

  /** The app went to the background: close the socket and stop retrying. */
  pause(): void {
    if (this.paused) {
      return;
    }
    this.paused = true;
    this.teardown();
    if (this.uid) {
      this.setState('paused');
    }
  }

  /** The app is in the foreground again: connect right away (then `resync`). */
  resume(): void {
    if (!this.paused) {
      return;
    }
    this.paused = false;
    if (this.uid) {
      this.setState('connecting');
      void this.connect(this.generation);
    }
  }

  /** Skips the backoff wait (network back). */
  reconnectNow(): void {
    if (!this.uid || this.paused || this.connecting || this.stateValue === 'connected') {
      return;
    }
    this.clearRetry();
    this.attempt = 0;
    void this.connect(this.generation);
  }

  /** Tells the other participant that the caller is typing (`SEND /app/typing`). */
  sendTyping(conversationId: string): void {
    this.connection?.send(REALTIME_DESTINATIONS.sendTyping, JSON.stringify({ conversationId }));
  }

  /** Stops the connection (provider unmounted); listeners stay for a remount. */
  dispose(): void {
    this.teardown();
    this.uid = null;
    this.setState('disabled');
  }

  private emit<K extends RealtimeEvent>(event: K, payload: RealtimeEventMap[K]): void {
    for (const handler of [...(this.listeners.get(event) ?? [])]) {
      try {
        (handler as Handler<K>)(payload);
      } catch {
        // One failing listener must not starve the others.
      }
    }
  }

  private setState(state: RealtimeState): void {
    if (state !== this.stateValue) {
      this.stateValue = state;
      this.emit('state', state);
    }
  }

  private async connect(generation: number): Promise<void> {
    this.connecting = true;
    try {
      const token = await this.options.tokenSource(this.forceTokenRefresh);
      if (generation !== this.generation) {
        return;
      }
      if (!token) {
        // No token (signed out meanwhile, or the refresh failed): try again later.
        this.scheduleRetry(generation);
        return;
      }
      const endpoint = this.options.endpointFor(token);
      const connection = await this.connector.connect({
        url: endpoint.url,
        handshakeHeaders: endpoint.headers,
        heartbeatMs: REALTIME_HEARTBEAT_MS,
        nulSafeFrames: this.options.nulSafeFrames,
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
      this.setState('connected');
      this.emit('resync', undefined);
    } catch {
      if (generation !== this.generation) {
        return;
      }
      // Failed before CONNECTED: the handshake may have refused an expired token.
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
    this.setState('reconnecting');
    this.clearRetry();
    this.retryTimer = setTimeout(
      () => {
        this.retryTimer = null;
        if (generation === this.generation && !this.connecting) {
          void this.connect(generation);
        }
      },
      reconnectDelay(this.attempt, this.random)
    );
  }

  private subscribeAll(connection: StompSession): void {
    connection.subscribe(REALTIME_DESTINATIONS.messages, (frame) => {
      const body = parseJson(frame.body);
      if (isMessageResponse(body)) {
        this.emit('message', body);
      }
    });
    connection.subscribe(REALTIME_DESTINATIONS.receipts, (frame) => {
      const body = parseJson(frame.body);
      if (isReadReceipt(body)) {
        this.emit('receipt', body);
      }
    });
    connection.subscribe(REALTIME_DESTINATIONS.typing, (frame) => {
      const body = parseJson(frame.body);
      if (isTypingNotice(body)) {
        this.emit('typing', body);
      }
    });
    connection.subscribe(REALTIME_DESTINATIONS.presence, (frame) => {
      const body = parseJson(frame.body);
      if (isPresenceNotice(body)) {
        this.emit('presence', body);
      }
    });
    connection.subscribe(REALTIME_DESTINATIONS.notifications, (frame) => {
      const body = parseJson(frame.body);
      if (isNotificationResponse(body)) {
        this.emit('notification', body);
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
