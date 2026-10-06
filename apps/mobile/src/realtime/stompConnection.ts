import {
  HEARTBEAT,
  StompFrameReader,
  encodeFrame,
  negotiateHeartbeat,
  utf8Encode,
  type StompFrame,
} from './stompFrames';

/** The subset of the WebSocket the connection uses (tests pass a fake). */
export interface WebSocketLike {
  readonly readyState: number;
  binaryType: string;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
}

/**
 * Opens a socket. `headers` are sent with the handshake where the platform allows it (React
 * Native's WebSocket takes them as a third argument; browsers cannot set headers at all).
 */
export type WebSocketFactory = (
  url: string,
  protocols: string[],
  headers: Readonly<Record<string, string>> | undefined
) => WebSocketLike;

/** Why a connection ended. `connected` tells whether the STOMP session had been established. */
export interface StompCloseInfo {
  code: number;
  reason: string;
  connected: boolean;
}

export interface StompConnectOptions {
  url: string;
  /** Handshake headers (native only: `Authorization: Bearer <ID token>`). Never logged. */
  handshakeHeaders?: Readonly<Record<string, string>>;
  /** Extra CONNECT headers. */
  connectHeaders?: Readonly<Record<string, string>>;
  /** Heartbeat interval the client offers and asks for (ms); 0 disables heartbeats. */
  heartbeatMs?: number;
  /** How long to wait for CONNECTED after the socket opened (ms). */
  connectTimeoutMs?: number;
  /** Called once when the connection ends after it was established, or fails before. */
  onClose: (info: StompCloseInfo) => void;
  webSocketFactory?: WebSocketFactory;
  /**
   * React Native drops the NUL that ends every STOMP frame from text WebSocket messages, in both
   * directions (its bridge passes strings as C strings). With this flag, frames are sent as binary
   * messages (UTF-8 bytes, NUL included; the server accepts both) and a received text message
   * that lost its NUL gets it back (the server sends one frame per message, heartbeats aside).
   */
  nulSafeFrames?: boolean;
}

/** A connected STOMP session, as seen by the realtime client. */
export interface StompSession {
  subscribe(destination: string, handler: (frame: StompFrame) => void): () => void;
  send(destination: string, body: string): void;
  close(): void;
}

const OPEN = 1;
/** Closed because the server stopped sending heartbeats. */
export const HEARTBEAT_TIMEOUT_CODE = 4000;
/** Closed because CONNECTED never came. */
export const CONNECT_TIMEOUT_CODE = 4001;
/** Closed after a STOMP ERROR frame. */
export const STOMP_ERROR_CODE = 4002;
/** Missed heartbeats tolerated before the connection is considered dead. */
const HEARTBEAT_GRACE = 2.5;

type NativeWebSocketConstructor = new (
  url: string,
  protocols?: string | string[] | null,
  options?: { headers: Record<string, string> } | null
) => WebSocketLike;

/** The platform WebSocket (React Native's accepts handshake headers as a third argument). */
export const defaultWebSocketFactory: WebSocketFactory = (url, protocols, headers) => {
  const Socket = globalThis.WebSocket as unknown as NativeWebSocketConstructor;
  return headers && Object.keys(headers).length > 0
    ? new Socket(url, protocols, { headers: { ...headers } })
    : new Socket(url, protocols);
};

/**
 * STOMP 1.2 client over a WebSocket (no SockJS, as the server offers none): CONNECT, SUBSCRIBE /
 * UNSUBSCRIBE, SEND, DISCONNECT and heartbeats in both directions (port of the web's
 * `core/realtime/stomp-connection.ts`). It never reconnects by itself; `RealtimeClient` owns the
 * retry policy.
 */
export class StompConnection implements StompSession {
  private readonly reader = new StompFrameReader();
  private readonly handlers = new Map<string, (frame: StompFrame) => void>();
  private nextSubscription = 0;
  private connected = false;
  private closed = false;
  private lastReceived = Date.now();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private resolveConnected!: () => void;
  private rejectConnected!: (error: Error) => void;
  private readonly ready = new Promise<void>((resolve, reject) => {
    this.resolveConnected = resolve;
    this.rejectConnected = reject;
  });
  private readonly socket: WebSocketLike;

  private constructor(private readonly options: StompConnectOptions) {
    // A failure before CONNECTED rejects `ready` and is also reported through `onClose`.
    this.ready.catch(() => undefined);
    const factory = options.webSocketFactory ?? defaultWebSocketFactory;
    this.socket = factory(options.url, ['v12.stomp'], options.handshakeHeaders);
    this.socket.binaryType = 'arraybuffer';
    this.socket.onopen = () => this.onOpen();
    this.socket.onmessage = (event) => this.onData(event.data);
    this.socket.onerror = () => undefined; // followed by onclose
    this.socket.onclose = (event) => this.finish(event.code, event.reason || 'closed');
  }

  /** Opens the socket and resolves once the server answered CONNECTED. */
  static async open(options: StompConnectOptions): Promise<StompConnection> {
    const connection = new StompConnection(options);
    await connection.ready;
    return connection;
  }

  subscribe(destination: string, handler: (frame: StompFrame) => void): () => void {
    const id = `sub-${this.nextSubscription++}`;
    this.handlers.set(id, handler);
    this.write(encodeFrame('SUBSCRIBE', { id, destination, ack: 'auto' }));
    return () => {
      if (this.handlers.delete(id)) {
        this.write(encodeFrame('UNSUBSCRIBE', { id }));
      }
    };
  }

  send(destination: string, body: string): void {
    this.write(encodeFrame('SEND', { destination, 'content-type': 'application/json' }, body));
  }

  /** Graceful close: DISCONNECT then close the socket. `onClose` is not called. */
  close(): void {
    if (this.closed) {
      return;
    }
    this.write(encodeFrame('DISCONNECT'));
    this.closed = true;
    this.stopTimers();
    this.handlers.clear();
    try {
      this.socket.close(1000, 'client closed');
    } catch {
      // already closing
    }
    this.rejectConnected(new Error('closed'));
  }

  private onOpen(): void {
    const heartbeat = this.options.heartbeatMs ?? 10_000;
    this.write(
      encodeFrame('CONNECT', {
        'accept-version': '1.2',
        host: hostOf(this.options.url),
        'heart-beat': `${heartbeat},${heartbeat}`,
        ...(this.options.connectHeaders ?? {}),
      })
    );
    this.connectTimer = setTimeout(
      () => this.abort(CONNECT_TIMEOUT_CODE, 'connect timeout'),
      this.options.connectTimeoutMs ?? 10_000
    );
  }

  private onData(data: unknown): void {
    this.lastReceived = Date.now();
    let chunk =
      typeof data === 'string' || data instanceof ArrayBuffer || data instanceof Uint8Array
        ? data
        : String(data);
    if (
      this.options.nulSafeFrames &&
      typeof chunk === 'string' &&
      chunk.trim().length > 0 &&
      !chunk.endsWith('\0')
    ) {
      chunk = `${chunk}\0`;
    }
    for (const frame of this.reader.push(chunk)) {
      this.onFrame(frame);
    }
  }

  private onFrame(frame: StompFrame): void {
    switch (frame.command) {
      case 'CONNECTED': {
        if (this.connectTimer) {
          clearTimeout(this.connectTimer);
          this.connectTimer = null;
        }
        this.connected = true;
        const heartbeat = this.options.heartbeatMs ?? 10_000;
        this.startHeartbeats(
          negotiateHeartbeat([heartbeat, heartbeat], frame.headers['heart-beat'])
        );
        this.resolveConnected();
        break;
      }
      case 'MESSAGE': {
        const handler = this.handlers.get(frame.headers['subscription'] ?? '');
        handler?.(frame);
        break;
      }
      case 'ERROR':
        this.abort(STOMP_ERROR_CODE, frame.headers['message'] ?? 'error');
        break;
      default:
        break; // RECEIPT: not requested
    }
  }

  private startHeartbeats(agreed: { outgoing: number; incoming: number }): void {
    if (agreed.outgoing > 0) {
      this.heartbeatTimer = setInterval(() => this.write(HEARTBEAT), agreed.outgoing);
    }
    if (agreed.incoming > 0) {
      const limit = agreed.incoming * HEARTBEAT_GRACE;
      this.watchdogTimer = setInterval(() => {
        if (Date.now() - this.lastReceived > limit) {
          this.abort(HEARTBEAT_TIMEOUT_CODE, 'heartbeat timeout');
        }
      }, agreed.incoming);
    }
  }

  /** Ends the connection because of a failure and reports it. */
  private abort(code: number, reason: string): void {
    try {
      this.socket.close(1000, reason.slice(0, 100));
    } catch {
      // already closing
    }
    this.finish(code, reason);
  }

  private finish(code: number, reason: string): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.stopTimers();
    this.handlers.clear();
    this.rejectConnected(new Error(reason));
    this.options.onClose({ code, reason, connected: this.connected });
  }

  private stopTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
    }
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
    }
    this.heartbeatTimer = this.watchdogTimer = this.connectTimer = null;
  }

  private write(data: string): void {
    if (this.closed || this.socket.readyState !== OPEN) {
      return;
    }
    try {
      if (this.options.nulSafeFrames && data !== HEARTBEAT) {
        const bytes = utf8Encode(data);
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        this.socket.send(copy.buffer);
      } else {
        this.socket.send(data);
      }
    } catch {
      // the close handler reports the failure
    }
  }
}

/** `host:port` of a ws(s) URL, without parsing the query (it may carry the ID token on web). */
export function hostOf(url: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url);
  return match?.[1] ?? 'localhost';
}
