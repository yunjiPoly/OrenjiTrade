/**
 * Minimal STOMP 1.2 frame codec (https://stomp.github.io/stomp-specification-1.2.html) for the
 * realtime channel of the Phase 5 contract (port of the web's
 * `core/realtime/stomp-frames.ts`). Only what the OrenjiTrade server speaks is covered: text
 * frames, `content-length` measured in UTF-8 bytes, escaped header values and heartbeats (bare
 * end-of-lines between frames).
 */

/** One decoded frame. Repeated headers keep their first value (STOMP 1.2 "Repeated Header Entries"). */
export interface StompFrame {
  command: string;
  headers: Readonly<Record<string, string>>;
  body: string;
}

const NUL = 0x00;
const LF = 0x0a;
const CR = 0x0d;

/** Commands whose headers are never escaped (STOMP 1.2 "Value Encoding"). */
const UNESCAPED_COMMANDS = new Set(['CONNECT', 'CONNECTED']);

export function escapeHeaderValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/:/g, '\\c');
}

export function unescapeHeaderValue(value: string): string {
  return value.replace(/\\([\\rnc])/g, (_, code: string) => {
    switch (code) {
      case 'r':
        return '\r';
      case 'n':
        return '\n';
      case 'c':
        return ':';
      default:
        return '\\';
    }
  });
}

/**
 * UTF-8 bytes of `text` (Hermes ships `TextEncoder`; the hand-written fallback keeps the codec
 * independent of the runtime).
 */
export function utf8Encode(text: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text);
  }
  const bytes: number[] = [];
  for (const char of text) {
    let code = char.codePointAt(0) ?? 0xfffd;
    if (code >= 0xd800 && code <= 0xdfff) {
      code = 0xfffd; // lone surrogate
    }
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return Uint8Array.from(bytes);
}

/** Text of UTF-8 `bytes` (Expo's runtime installs `TextDecoder` on native). */
export function utf8Decode(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(bytes);
  }
  let text = '';
  let i = 0;
  while (i < bytes.length) {
    const first = bytes[i] ?? 0;
    let code: number;
    let size: number;
    if (first < 0x80) {
      code = first;
      size = 1;
    } else if (first >= 0xf0) {
      code = first & 0x07;
      size = 4;
    } else if (first >= 0xe0) {
      code = first & 0x0f;
      size = 3;
    } else {
      code = first & 0x1f;
      size = 2;
    }
    for (let k = 1; k < size; k++) {
      code = (code << 6) | ((bytes[i + k] ?? 0x80) & 0x3f);
    }
    text += String.fromCodePoint(code);
    i += size;
  }
  return text;
}

/** Number of bytes of `text` once encoded as UTF-8. */
export function utf8Length(text: string): number {
  return utf8Encode(text).length;
}

/**
 * Serialises a client frame. A body gets a `content-length` header (in bytes) unless one is
 * given; the frame ends with NUL.
 */
export function encodeFrame(
  command: string,
  headers: Readonly<Record<string, string>> = {},
  body = ''
): string {
  const escape = UNESCAPED_COMMANDS.has(command)
    ? (value: string) => value
    : (value: string) => escapeHeaderValue(value);
  const lines = [command];
  for (const [name, value] of Object.entries(headers)) {
    lines.push(`${escape(name)}:${escape(value)}`);
  }
  if (body && !('content-length' in headers)) {
    lines.push(`content-length:${utf8Length(body)}`);
  }
  return `${lines.join('\n')}\n\n${body}\0`;
}

/** The single end-of-line a client sends as a heartbeat. */
export const HEARTBEAT = '\n';

/**
 * Incremental decoder: feed it every WebSocket message (text or binary) and it returns the
 * complete frames, keeping partial data for the next call. Heartbeats are skipped.
 */
export class StompFrameReader {
  private buffer: Uint8Array = new Uint8Array(0);

  push(data: string | ArrayBuffer | Uint8Array): StompFrame[] {
    const bytes =
      typeof data === 'string'
        ? utf8Encode(data)
        : data instanceof Uint8Array
          ? data
          : new Uint8Array(data);
    this.buffer = concat(this.buffer, bytes);
    const frames: StompFrame[] = [];
    for (;;) {
      this.skipEndOfLines();
      const frame = this.readFrame();
      if (!frame) {
        return frames;
      }
      frames.push(frame);
    }
  }

  /** Bytes waiting for the rest of their frame (tests, diagnostics). */
  get pending(): number {
    return this.buffer.length;
  }

  private skipEndOfLines(): void {
    let start = 0;
    while (
      start < this.buffer.length &&
      (this.buffer[start] === LF ||
        (this.buffer[start] === CR && this.buffer[start + 1] === LF) ||
        this.buffer[start] === NUL)
    ) {
      start += this.buffer[start] === CR ? 2 : 1;
    }
    if (start > 0) {
      this.buffer = this.buffer.subarray(start);
    }
  }

  private readFrame(): StompFrame | null {
    const headerEnd = findHeaderEnd(this.buffer);
    if (!headerEnd) {
      return null;
    }
    const head = utf8Decode(this.buffer.subarray(0, headerEnd.headEnd));
    const lines = head.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
    const command = (lines[0] ?? '').trim();
    const unescape = UNESCAPED_COMMANDS.has(command)
      ? (value: string) => value
      : (value: string) => unescapeHeaderValue(value);
    const headers: Record<string, string> = {};
    for (const line of lines.slice(1)) {
      const colon = line.indexOf(':');
      if (colon <= 0) {
        continue;
      }
      const name = unescape(line.slice(0, colon));
      if (!(name in headers)) {
        headers[name] = unescape(line.slice(colon + 1));
      }
    }

    const bodyStart = headerEnd.bodyStart;
    const declared = headers['content-length'];
    const length = declared !== undefined ? Number.parseInt(declared, 10) : Number.NaN;
    let bodyEnd: number;
    let frameEnd: number;
    if (Number.isFinite(length) && length >= 0) {
      if (this.buffer.length < bodyStart + length + 1) {
        return null;
      }
      bodyEnd = bodyStart + length;
      frameEnd = bodyEnd + 1;
    } else {
      const nul = this.buffer.indexOf(NUL, bodyStart);
      if (nul < 0) {
        return null;
      }
      bodyEnd = nul;
      frameEnd = nul + 1;
    }
    const body = utf8Decode(this.buffer.subarray(bodyStart, bodyEnd));
    this.buffer = this.buffer.subarray(frameEnd);
    return { command, headers, body };
  }
}

function findHeaderEnd(buffer: Uint8Array): { headEnd: number; bodyStart: number } | null {
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] !== LF) {
      continue;
    }
    if (buffer[i + 1] === LF) {
      return { headEnd: i, bodyStart: i + 2 };
    }
    if (buffer[i + 1] === CR && buffer[i + 2] === LF) {
      return { headEnd: i, bodyStart: i + 3 };
    }
  }
  return null;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) {
    return b.slice();
  }
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

/**
 * Heartbeat intervals agreed by both sides (STOMP 1.2 "Heart-beating"): `outgoing` is how often
 * the client must send something, `incoming` how often the server promised to; 0 disables one.
 */
export function negotiateHeartbeat(
  client: readonly [number, number],
  serverHeader: string | undefined
): { outgoing: number; incoming: number } {
  const [sx = 0, sy = 0] = (serverHeader ?? '0,0')
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10) || 0);
  const [cx, cy] = client;
  return {
    outgoing: cx === 0 || !sy ? 0 : Math.max(cx, sy),
    incoming: cy === 0 || !sx ? 0 : Math.max(cy, sx),
  };
}
