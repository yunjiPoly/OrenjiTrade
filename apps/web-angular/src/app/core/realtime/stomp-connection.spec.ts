import {
  CONNECT_TIMEOUT_CODE,
  HEARTBEAT_TIMEOUT_CODE,
  STOMP_ERROR_CODE,
  StompCloseInfo,
  StompConnection,
  WebSocketLike,
} from './stomp-connection';

class FakeSocket implements WebSocketLike {
  readyState = 0;
  binaryType = 'blob';
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readonly sent: string[] = [];
  closedWith: number | null = null;

  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(code = 1000): void {
    this.closedWith = code;
    this.readyState = 3;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  receive(data: string): void {
    this.onmessage?.({ data });
  }

  drop(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code, reason: '' });
  }
}

const CONNECTED = 'CONNECTED\nversion:1.2\nheart-beat:20000,20000\n\n\u0000';

describe('StompConnection', () => {
  let socket: FakeSocket;
  let closes: StompCloseInfo[];

  function open(extra: { heartbeatMs?: number } = {}): Promise<StompConnection> {
    closes = [];
    return StompConnection.open({
      url: 'ws://localhost:8080/ws?access_token=t0k',
      heartbeatMs: extra.heartbeatMs ?? 10_000,
      connectTimeoutMs: 5_000,
      onClose: (info) => closes.push(info),
      webSocketFactory: (url, protocols) => (socket = new FakeSocket(url, protocols)),
    });
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends CONNECT with heartbeats, then subscribes, dispatches and sends', async () => {
    const pending = open();
    expect(socket.protocols).toEqual(['v12.stomp']);
    socket.open();
    expect(socket.sent[0]).toBe(
      'CONNECT\naccept-version:1.2\nhost:localhost:8080\nheart-beat:10000,10000\n\n\u0000',
    );
    socket.receive(CONNECTED);
    const connection = await pending;

    const received: string[] = [];
    const unsubscribe = connection.subscribe('/user/queue/messages', (frame) =>
      received.push(frame.body),
    );
    expect(socket.sent[1]).toBe(
      'SUBSCRIBE\nid:sub-0\ndestination:/user/queue/messages\nack:auto\n\n\u0000',
    );
    socket.receive(
      'MESSAGE\nsubscription:sub-0\ndestination:/user/queue/messages\n\n{"a":1}\u0000',
    );
    socket.receive('MESSAGE\nsubscription:sub-9\n\n{"ignored":true}\u0000');
    expect(received).toEqual(['{"a":1}']);

    connection.send('/app/typing', '{"conversationId":"c1"}');
    expect(socket.sent.at(-1)).toContain('SEND\ndestination:/app/typing');

    unsubscribe();
    expect(socket.sent.at(-1)).toBe('UNSUBSCRIBE\nid:sub-0\n\n\u0000');

    connection.close();
    expect(socket.sent.at(-1)).toBe('DISCONNECT\n\n\u0000');
    expect(socket.closedWith).toBe(1000);
    expect(closes).toEqual([]);
  });

  it('sends heartbeats and closes when the server goes silent', async () => {
    const pending = open();
    socket.open();
    socket.receive(CONNECTED);
    await pending;
    const before = socket.sent.length;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(socket.sent.slice(before)).toContain('\n');
    socket.receive('\n'); // server heartbeat keeps it alive
    await vi.advanceTimersByTimeAsync(40_000);
    expect(closes).toEqual([]);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(closes).toEqual([
      { code: HEARTBEAT_TIMEOUT_CODE, reason: 'heartbeat timeout', connected: true },
    ]);
  });

  it('rejects when the socket closes before CONNECTED (refused handshake)', async () => {
    const pending = open();
    socket.drop(1006);
    await expect(pending).rejects.toThrow();
    expect(closes).toEqual([{ code: 1006, reason: 'closed', connected: false }]);
  });

  it('rejects on an ERROR frame and on a connect timeout', async () => {
    const refused = open();
    socket.open();
    socket.receive('ERROR\nmessage:Authentication required\n\n\u0000');
    await expect(refused).rejects.toThrow('Authentication required');
    expect(closes[0]).toEqual({
      code: STOMP_ERROR_CODE,
      reason: 'Authentication required',
      connected: false,
    });

    const slow = open();
    socket.open();
    const assertion = expect(slow).rejects.toThrow('connect timeout');
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
    expect(closes[0].code).toBe(CONNECT_TIMEOUT_CODE);
  });

  it('reports a dropped connection once', async () => {
    const pending = open();
    socket.open();
    socket.receive(CONNECTED);
    await pending;
    socket.drop(1001);
    socket.drop(1001);
    expect(closes).toEqual([{ code: 1001, reason: 'closed', connected: true }]);
  });
});
