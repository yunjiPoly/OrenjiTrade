import { ocrResultOf } from './lines';
import type {
  OcrLine,
  OcrPhoto,
  OcrProvider,
  OcrResult,
  OcrRotation,
  PixelRect,
  RecognizeLinesOptions,
} from './types';

/**
 * The reader of the tests (spec 3.3: "one implementation on the device and a fake for tests"). It
 * answers, per photo, what a test wrote as text, and records every call.
 */

/** Lines as text (stacked top to bottom, full width) or as lines with boxes. */
export type FakeLines = readonly (string | OcrLine)[];

/** What one call answers: lines, or an error the engine throws. */
export type FakeAnswer = FakeLines | Error;

/** What a test says one photo holds. */
export interface FakeCardText {
  /** The name area. */
  name?: FakeAnswer;
  /**
   * The set code area of a camera photo, or the code band of a library photo: the first
   * `recognizeSetCode` call of the photo.
   */
  setCode?: FakeAnswer;
  /** The Pendulum spot: the second (and any later) `recognizeSetCode` call of the photo. */
  pendulum?: FakeAnswer;
  /** The whole photo, upright. */
  whole?: FakeAnswer;
  /** The whole photo turned clockwise. */
  turned?: Partial<Record<Exclude<OcrRotation, 0>, FakeAnswer>>;
}

export interface FakeOcrCall {
  method: 'recognizeName' | 'recognizeSetCode' | 'recognizeLines';
  uri: string;
  box?: PixelRect;
  rotation?: OcrRotation;
}

const ROW_HEIGHT = 0.06;
const ROW_STEP = 0.08;

/** Lines from text: one full-width row per entry, top to bottom, confidence 0.9. */
export function linesOf(lines: FakeLines): OcrLine[] {
  return lines.map((line, index) =>
    typeof line === 'string'
      ? {
          text: line,
          confidence: 0.9,
          box: {
            x: 0.05,
            y: Math.min(0.94, 0.02 + index * ROW_STEP),
            width: 0.9,
            height: ROW_HEIGHT,
          },
        }
      : line
  );
}

function answer(value: FakeAnswer | undefined): OcrLine[] {
  if (value instanceof Error) {
    throw value;
  }
  return linesOf(value ?? []);
}

export class FakeOcrProvider implements OcrProvider {
  readonly calls: FakeOcrCall[] = [];
  private readonly cards = new Map<string, FakeCardText>();

  constructor(cards: Record<string, FakeCardText> = {}) {
    for (const [uri, text] of Object.entries(cards)) {
      this.cards.set(uri, text);
    }
  }

  /** Says what the photo at `uri` holds (replaces what was said before). */
  setCard(uri: string, text: FakeCardText): void {
    this.cards.set(uri, text);
  }

  /** The calls made for one photo. */
  callsFor(uri: string): FakeOcrCall[] {
    return this.calls.filter((call) => call.uri === uri);
  }

  async recognizeName(photo: OcrPhoto, box: PixelRect): Promise<OcrResult> {
    this.calls.push({ method: 'recognizeName', uri: photo.uri, box });
    return ocrResultOf(answer(this.cards.get(photo.uri)?.name));
  }

  async recognizeSetCode(
    photo: OcrPhoto,
    box: PixelRect,
    options?: RecognizeLinesOptions
  ): Promise<OcrResult> {
    const earlier = this.callsFor(photo.uri).filter(
      (call) => call.method === 'recognizeSetCode'
    ).length;
    this.calls.push({
      method: 'recognizeSetCode',
      uri: photo.uri,
      box,
      ...(options?.rotation ? { rotation: options.rotation } : {}),
    });
    const card = this.cards.get(photo.uri);
    return ocrResultOf(answer(earlier === 0 ? card?.setCode : card?.pendulum));
  }

  async recognizeLines(photo: OcrPhoto, options?: RecognizeLinesOptions): Promise<OcrLine[]> {
    const rotation = options?.rotation ?? 0;
    this.calls.push({ method: 'recognizeLines', uri: photo.uri, rotation });
    const card = this.cards.get(photo.uri);
    return answer(rotation === 0 ? card?.whole : card?.turned?.[rotation]);
  }
}
