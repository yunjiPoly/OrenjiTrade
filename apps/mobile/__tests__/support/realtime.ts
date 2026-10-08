import { RealtimeClient, type StompConnector } from '@/src/realtime/realtimeClient';
import type { StompConnectOptions, StompSession } from '@/src/realtime/stompConnection';
import type { StompFrame } from '@/src/realtime/stompFrames';

/** A STOMP session that never touches the network: pushes are delivered by the test. */
export class FakeSession implements StompSession {
  readonly handlers = new Map<string, (frame: StompFrame) => void>();
  readonly sent: { destination: string; body: string }[] = [];
  closed = false;

  constructor(readonly options: StompConnectOptions) {}

  subscribe(destination: string, handler: (frame: StompFrame) => void): () => void {
    this.handlers.set(destination, handler);
    return () => this.handlers.delete(destination);
  }

  send(destination: string, body: string): void {
    this.sent.push({ destination, body });
  }

  close(): void {
    this.closed = true;
  }

  push(destination: string, payload: unknown): void {
    this.handlers.get(destination)?.({
      command: 'MESSAGE',
      headers: {},
      body: JSON.stringify(payload),
    });
  }

  drop(): void {
    this.options.onClose({ code: 1006, reason: 'closed', connected: true });
  }
}

export interface FakeRealtime {
  client: RealtimeClient;
  sessions: FakeSession[];
  tokenSource: jest.Mock<Promise<string | null>, [boolean]>;
  /** The newest open session (throws when none). */
  current: () => FakeSession;
  /** Fail the next `n` connection attempts (a refused handshake). */
  failNext: (n: number) => void;
}

/** A realtime client wired to fake sessions (no WebSocket, no timers of its own). */
export function fakeRealtime(): FakeRealtime {
  const sessions: FakeSession[] = [];
  let failures = 0;
  const tokenSource = jest.fn(async (_force: boolean) => 'id-token/with+chars' as string | null);
  const connector: StompConnector = {
    connect: async (options) => {
      if (failures > 0) {
        failures--;
        throw new Error('handshake refused');
      }
      const session = new FakeSession(options);
      sessions.push(session);
      return session;
    },
  };
  const client = new RealtimeClient({
    tokenSource,
    endpointFor: (token) => ({
      url: 'ws://10.0.2.2:8090/ws',
      headers: { Authorization: `Bearer ${token}` },
    }),
    connector,
    random: () => 0.5,
  });
  return {
    client,
    sessions,
    tokenSource,
    current: () => {
      const session = sessions.filter((candidate) => !candidate.closed).at(-1);
      if (!session) {
        throw new Error('No open realtime session.');
      }
      return session;
    },
    failNext: (n) => {
      failures = n;
    },
  };
}
