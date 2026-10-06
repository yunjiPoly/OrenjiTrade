import {
  StompFrameReader,
  encodeFrame,
  escapeHeaderValue,
  negotiateHeartbeat,
  unescapeHeaderValue,
  utf8Decode,
  utf8Encode,
  utf8Length,
} from '@/src/realtime/stompFrames';

describe('STOMP frames', () => {
  it('encodes a SEND frame with an escaped destination and a byte content-length', () => {
    const frame = encodeFrame('SEND', { destination: '/app/typing' }, '{"text":"café"}');
    expect(frame).toBe('SEND\ndestination:/app/typing\ncontent-length:16\n\n{"text":"café"}\u0000');
    expect(utf8Length('café')).toBe(5);
    expect(utf8Length('🃏')).toBe(4);
  });

  it('never escapes CONNECT headers', () => {
    expect(encodeFrame('CONNECT', { 'heart-beat': '10000,10000', host: 'localhost:8080' })).toBe(
      'CONNECT\nheart-beat:10000,10000\nhost:localhost:8080\n\n\u0000'
    );
  });

  it('escapes and unescapes header values symmetrically', () => {
    const raw = 'a:b\\c\nd\re';
    expect(escapeHeaderValue(raw)).toBe('a\\cb\\\\c\\nd\\re');
    expect(unescapeHeaderValue(escapeHeaderValue(raw))).toBe(raw);
  });

  it('reads frames split across chunks, skips heartbeats and honours UTF-8 lengths', () => {
    const reader = new StompFrameReader();
    const body = '{"body":"Café é 🃏"}';
    const wire = `\nMESSAGE\ndestination:/user/queue/messages\nsubscription:sub-0\ncontent-length:${utf8Length(body)}\n\n${body}\u0000\n`;
    expect(reader.push(wire.slice(0, 30))).toEqual([]);
    const frames = reader.push(wire.slice(30));
    expect(frames).toEqual([
      {
        command: 'MESSAGE',
        headers: {
          destination: '/user/queue/messages',
          subscription: 'sub-0',
          'content-length': String(utf8Length(body)),
        },
        body,
      },
    ]);
    expect(reader.pending).toBe(0);
    expect(reader.push('\n')).toEqual([]);
  });

  it('keeps a body whose declared length is not complete yet', () => {
    const reader = new StompFrameReader();
    expect(reader.push('MESSAGE\ncontent-length:10\n\n12345')).toEqual([]);
    expect(reader.pending).toBeGreaterThan(0);
    expect(reader.push('67890\u0000')).toEqual([
      { command: 'MESSAGE', headers: { 'content-length': '10' }, body: '1234567890' },
    ]);
  });

  it('reads several frames of one message, bodies without content-length and CRLF lines', () => {
    const reader = new StompFrameReader();
    const frames = reader.push(
      'CONNECTED\r\nversion:1.2\r\nheart-beat:20000,20000\r\n\r\n\u0000ERROR\nmessage:Bad\\cthing\nmessage:second\n\n\u0000'
    );
    expect(frames.map((frame) => frame.command)).toEqual(['CONNECTED', 'ERROR']);
    expect(frames[0]?.headers['heart-beat']).toBe('20000,20000');
    expect(frames[1]?.headers['message']).toBe('Bad:thing');
  });

  it('accepts binary chunks', () => {
    const reader = new StompFrameReader();
    const bytes = utf8Encode('RECEIPT\nreceipt-id:1\n\n\u0000');
    expect(reader.push(bytes.slice().buffer)).toEqual([
      { command: 'RECEIPT', headers: { 'receipt-id': '1' }, body: '' },
    ]);
    expect(reader.push(utf8Encode('RECEIPT\nreceipt-id:2\n\n\u0000'))).toHaveLength(1);
  });

  it('encodes and decodes UTF-8 without the platform codecs too', () => {
    const encoder = globalThis.TextEncoder;
    const decoder = globalThis.TextDecoder;
    const text = 'Noé · 🃏 · 日本';
    const native = utf8Encode(text);
    try {
      // @ts-expect-error simulating a runtime without the codecs
      delete globalThis.TextEncoder;
      // @ts-expect-error simulating a runtime without the codecs
      delete globalThis.TextDecoder;
      const fallback = utf8Encode(text);
      expect([...fallback]).toEqual([...native]);
      expect(utf8Decode(fallback)).toBe(text);
    } finally {
      globalThis.TextEncoder = encoder;
      globalThis.TextDecoder = decoder;
    }
  });

  it('negotiates heartbeats like the specification', () => {
    expect(negotiateHeartbeat([10000, 10000], '20000,20000')).toEqual({
      outgoing: 20000,
      incoming: 20000,
    });
    expect(negotiateHeartbeat([10000, 10000], '0,0')).toEqual({ outgoing: 0, incoming: 0 });
    expect(negotiateHeartbeat([0, 5000], '1000,3000')).toEqual({ outgoing: 0, incoming: 5000 });
    expect(negotiateHeartbeat([10000, 10000], undefined)).toEqual({ outgoing: 0, incoming: 0 });
  });
});
