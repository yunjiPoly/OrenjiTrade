import * as webReader from '@/src/features/scan/ocr/deviceOcr.web';
import {
  createDeviceOcrProvider,
  getDeviceOcrProvider,
  isDeviceOcrAvailable,
  loadNativeTextReader,
  nativeTextReaderLoader,
  resetDeviceOcrProvider,
} from '@/src/features/scan/ocr/deviceOcr';
import { FakeOcrProvider, linesOf } from '@/src/features/scan/ocr/fakeOcrProvider';
import { ocrResultOf, rowsOf, sanitizeLines } from '@/src/features/scan/ocr/lines';
import type {
  NativeRecognizeOptions,
  NativeRecognizeResult,
  NativeTextReaderModule,
} from '@/src/features/scan/ocr/nativeTextReader';
import type { OcrLine } from '@/src/features/scan/ocr/types';

const PHOTO = { uri: 'file:///scan/photo-1.jpg', width: 3024, height: 4032 };
const BOX = { x: 100, y: 200, width: 300, height: 40 };

function line(text: string, x: number, y: number, confidence: number | null = 0.9): OcrLine {
  return { text, confidence, box: { x, y, width: 0.3, height: 0.05 } };
}

function nativeModule(lines: unknown[] = []) {
  // What a native module hands over is checked, not trusted: the test may give any shape.
  const recognize = jest.fn(async (_uri: string, _options: NativeRecognizeOptions) => ({
    lines: lines as NativeRecognizeResult['lines'],
  }));
  return { recognize } satisfies NativeTextReaderModule;
}

afterEach(() => resetDeviceOcrProvider());

describe('lines', () => {
  it('joins the observations of one printed line, top to bottom and left to right', () => {
    const rows = rowsOf([
      line('Velvet Breeze', 0.45, 0.031),
      line('[SPELL CARD]', 0.5, 0.2),
      line('Yew Flowers &', 0.05, 0.03),
    ]);
    expect(rows.map((row) => row.text)).toEqual(['Yew Flowers & Velvet Breeze', '[SPELL CARD]']);
    expect(rows[0]?.box.x).toBeCloseTo(0.05);
    expect(rows[0]?.box.width).toBeCloseTo(0.7);
  });

  it('gives an area its text in reading order and the mean confidence', () => {
    const result = ocrResultOf([line('EN036', 0.5, 0.1, 0.8), line('ZACR-', 0.1, 0.1, 0.6)]);
    expect(result.text).toBe('ZACR- EN036');
    expect(result.confidence).toBeCloseTo(0.7);
    expect(result.lines).toHaveLength(2);
  });

  it('says null when the engine gives no confidence, and reads nothing as empty', () => {
    expect(ocrResultOf([line('ZOB-005', 0.1, 0.1, null)]).confidence).toBeNull();
    expect(ocrResultOf([])).toEqual({ text: '', confidence: null, lines: [] });
  });

  it('keeps only well-formed native lines, inside the image', () => {
    const lines = sanitizeLines([
      { text: 'ZACR-EN036', confidence: 0.97, box: { x: 0.1, y: 0.2, width: 0.5, height: 0.1 } },
      { text: 'over the edge', confidence: 3, box: { x: 0.8, y: -0.1, width: 0.5, height: 0.2 } },
      { text: '   ', confidence: 0.5, box: { x: 0, y: 0, width: 1, height: 1 } },
      { text: 'no box', confidence: 0.5 },
      { text: 'bad box', box: { x: 'a', y: 0, width: 1, height: 1 } },
      null,
      'ZACR-EN036',
    ]);
    expect(lines).toEqual([
      { text: 'ZACR-EN036', confidence: 0.97, box: { x: 0.1, y: 0.2, width: 0.5, height: 0.1 } },
      {
        text: 'over the edge',
        confidence: null,
        box: { x: 0.8, y: 0, width: expect.any(Number), height: 0.1 },
      },
    ]);
    expect(lines[1]?.box.width).toBeCloseTo(0.2);
    expect(sanitizeLines(undefined)).toEqual([]);
    expect(sanitizeLines({ lines: [] })).toEqual([]);
  });
});

describe('the device reader', () => {
  it('reads the set code area at twice its size, without language correction', async () => {
    const native = nativeModule([
      { text: 'ZACR-EN036', confidence: 0.95, box: { x: 0.1, y: 0.2, width: 0.8, height: 0.6 } },
    ]);
    const result = await createDeviceOcrProvider(native).recognizeSetCode(PHOTO, BOX);
    expect(native.recognize).toHaveBeenCalledWith(PHOTO.uri, {
      crop: BOX,
      rotation: 0,
      scale: 2,
      languageCorrection: false,
    });
    expect(result).toEqual({
      text: 'ZACR-EN036',
      confidence: 0.95,
      lines: [
        { text: 'ZACR-EN036', confidence: 0.95, box: { x: 0.1, y: 0.2, width: 0.8, height: 0.6 } },
      ],
    });
  });

  it('reads a set code area turned as asked (the code band of a library photo read turned)', async () => {
    const native = nativeModule([]);
    await createDeviceOcrProvider(native).recognizeSetCode(PHOTO, BOX, { rotation: 270 });
    expect(native.recognize).toHaveBeenCalledWith(PHOTO.uri, {
      crop: BOX,
      rotation: 270,
      scale: 2,
      languageCorrection: false,
    });
  });

  it('reads the name area at its size, and the whole photo turned as asked', async () => {
    const native = nativeModule([]);
    const provider = createDeviceOcrProvider(native);
    await provider.recognizeName(PHOTO, BOX);
    await provider.recognizeLines(PHOTO);
    await provider.recognizeLines(PHOTO, { rotation: 270 });
    expect(native.recognize.mock.calls.map(([, options]) => options)).toEqual([
      { crop: BOX, rotation: 0, scale: 1, languageCorrection: true },
      { crop: null, rotation: 0, scale: 1, languageCorrection: true },
      { crop: null, rotation: 270, scale: 1, languageCorrection: true },
    ]);
  });

  it('passes a failure of the engine on', async () => {
    const native = { recognize: jest.fn(async () => Promise.reject(new Error('unreadable file'))) };
    await expect(createDeviceOcrProvider(native).recognizeLines(PHOTO)).rejects.toThrow(
      'unreadable file'
    );
  });

  it('treats a missing native module as "unavailable" (jest, like Expo Go)', () => {
    // Expo's registry itself answers: this build has no such module.
    const { requireOptionalNativeModule } = jest.requireActual<typeof import('expo')>('expo');
    expect(requireOptionalNativeModule('OrenjiTextReader')).toBeNull();
    expect(loadNativeTextReader()).toBeNull();
    expect(getDeviceOcrProvider()).toBeNull();
    expect(isDeviceOcrAvailable()).toBe(false);
  });

  it('looks the module up once', () => {
    const loader = jest.fn(() => nativeModule());
    expect(isDeviceOcrAvailable(loader)).toBe(true);
    expect(getDeviceOcrProvider(loader)).not.toBeNull();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('takes from the module registry only a module that can read', () => {
    const registry = jest.fn();
    const load = nativeTextReaderLoader(registry);
    expect(registry).not.toHaveBeenCalled();
    registry.mockReturnValueOnce(nativeModule());
    expect(load()).not.toBeNull();
    expect(registry).toHaveBeenCalledWith('OrenjiTextReader');
    registry.mockReturnValueOnce({ somethingElse: true });
    expect(load()).toBeNull();
    registry.mockImplementationOnce(() => {
      throw new Error('no module registry');
    });
    expect(load()).toBeNull();
  });

  it('has no reader on the web', () => {
    expect(webReader.loadNativeTextReader()).toBeNull();
    expect(webReader.nativeTextReaderLoader(() => nativeModule())()).toBeNull();
    expect(webReader.getDeviceOcrProvider(() => nativeModule())).toBeNull();
    expect(webReader.isDeviceOcrAvailable()).toBe(false);
    expect(() => webReader.createDeviceOcrProvider(nativeModule())).toThrow();
  });
});

describe('the fake reader', () => {
  it('answers each area of a photo from text, the set code first and the Pendulum spot next', async () => {
    const fake = new FakeOcrProvider({
      [PHOTO.uri]: {
        name: ['Dim-Glow Pendulum Dragon'],
        setCode: ['Once per dusk, you can kindle'],
        pendulum: ['ZUEA-EN004'],
        whole: ['Dim-Glow Pendulum Dragon', 'ZUEA-EN004'],
        turned: { 90: ['sideways'] },
      },
    });
    expect((await fake.recognizeName(PHOTO, BOX)).text).toBe('Dim-Glow Pendulum Dragon');
    expect((await fake.recognizeSetCode(PHOTO, BOX)).text).toBe('Once per dusk, you can kindle');
    expect((await fake.recognizeSetCode(PHOTO, BOX)).text).toBe('ZUEA-EN004');
    expect((await fake.recognizeLines(PHOTO)).map((entry) => entry.text)).toEqual([
      'Dim-Glow Pendulum Dragon',
      'ZUEA-EN004',
    ]);
    expect((await fake.recognizeLines(PHOTO, { rotation: 90 }))[0]?.text).toBe('sideways');
    expect(await fake.recognizeLines(PHOTO, { rotation: 180 })).toEqual([]);
    expect(fake.callsFor(PHOTO.uri).map((call) => call.method)).toEqual([
      'recognizeName',
      'recognizeSetCode',
      'recognizeSetCode',
      'recognizeLines',
      'recognizeLines',
      'recognizeLines',
    ]);
  });

  it('reads nothing on an unknown photo and throws the error a test gives', async () => {
    const fake = new FakeOcrProvider();
    expect(await fake.recognizeName(PHOTO, BOX)).toEqual({ text: '', confidence: null, lines: [] });
    fake.setCard(PHOTO.uri, { whole: new Error('engine failed') });
    await expect(fake.recognizeLines(PHOTO)).rejects.toThrow('engine failed');
  });

  it('stacks text lines as full-width rows', () => {
    const [first, second] = linesOf(['A', 'B']);
    expect(first?.box.y).toBeLessThan(second?.box.y ?? 0);
    expect(rowsOf(linesOf(['A', 'B'])).map((row) => row.text)).toEqual(['A', 'B']);
  });
});
