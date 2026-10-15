import { cropsUnderFrame } from '@/src/features/scan/frameMapping';
import { FakeOcrProvider, type FakeCardText } from '@/src/features/scan/ocr/fakeOcrProvider';
import { turnLines } from '@/src/features/scan/orientation';
import type { OcrLine } from '@/src/features/scan/ocr/types';
import { readCardText } from '@/src/features/scan/readCardText';
import {
  PENDULUM_NO_PASSCODE_PHOTO,
  PENDULUM_NO_PASSCODE_READ,
  PENDULUM_NO_PASSCODE_READ_TURNED_180,
  SIDEWAYS_PHOTO,
  SIDEWAYS_READ,
  SIDEWAYS_READ_TURNED_90,
  UPRIGHT_READ,
  UPSIDE_DOWN_PHOTO,
  UPSIDE_DOWN_READ,
} from '@/__tests__/support/visionReads';

const PHOTO = { uri: 'file:///cache/scan/photo-1.jpg', width: 3000, height: 4000 };
const CROPS = cropsUnderFrame(
  { x: 32, y: 228, width: 236, height: 344 },
  { width: 300, height: 800 },
  PHOTO
);

/** A line where the reader saw it, in fractions of the image read. */
function at(
  text: string,
  x: number,
  y: number,
  width: number,
  height = 0.025,
  confidence: number | null = 0.9
): OcrLine {
  return { text, confidence, box: { x, y, width, height } };
}

/** A fictional card read upright, its code cut short after the region ("ZR04-EN"). */
const CODE_CUT_SHORT: OcrLine[] = [
  at('QUILLFEATHER MAGE', 0.21, 0.197, 0.41, 0.045),
  at('ZR04-EN', 0.72, 0.75, 0.09, 0.013),
  at('[Spellcaster/Normal]', 0.198, 0.782, 0.385, 0.022),
  at('A quiet scholar who writes the winds into old books.', 0.2, 0.804, 0.56, 0.019),
  at('12345678 1st Edition', 0.178, 0.955, 0.236, 0.02),
];

function reader(card: FakeCardText) {
  return new FakeOcrProvider({ [PHOTO.uri]: card });
}

function methods(fake: FakeOcrProvider) {
  return fake.calls.map((call) =>
    call.method === 'recognizeLines' ? `${call.method}@${call.rotation}` : call.method
  );
}

describe('reading a camera photo', () => {
  it('reads the Name and set code areas, and nothing more when both hold something', async () => {
    const fake = reader({ name: ['Yew Flowers & Velvet Breeze'], setCode: ['ZACR-EN036'] });
    await expect(
      readCardText(fake, { photo: PHOTO, source: 'CAMERA', crops: CROPS })
    ).resolves.toEqual({
      codes: ['ZACR-EN036'],
      names: ['Yew Flowers & Velvet Breeze'],
    });
    expect(methods(fake)).toEqual(['recognizeName', 'recognizeSetCode']);
    expect(fake.calls[0]?.box).toEqual(CROPS?.name);
    expect(fake.calls[1]?.box).toEqual(CROPS?.setCode);
  });

  it('reads the Pendulum spot when the set code area holds no code', async () => {
    const fake = reader({
      name: ['Dim-Glow Pendulum Dragon'],
      setCode: ['you draw from an amulet enclosing a Pendulum'],
      pendulum: ['ZUEA-EN004'],
    });
    await expect(
      readCardText(fake, { photo: PHOTO, source: 'CAMERA', crops: CROPS })
    ).resolves.toEqual({
      codes: ['ZUEA-EN004'],
      names: ['Dim-Glow Pendulum Dragon'],
    });
    expect(methods(fake)).toEqual(['recognizeName', 'recognizeSetCode', 'recognizeSetCode']);
    expect(fake.calls[2]?.box).toEqual(CROPS?.pendulumSetCode);
  });

  it('reads the whole photo for what the areas missed, once and never turned', async () => {
    const fake = reader({
      name: ['Yew Flowers & Velvet Breeze'],
      setCode: ['~~'],
      pendulum: [],
      whole: ['Something Else', 'ZACR-EN036'],
    });
    await expect(
      readCardText(fake, { photo: PHOTO, source: 'CAMERA', crops: CROPS })
    ).resolves.toEqual({
      codes: ['ZACR-EN036'],
      // The name area's name is kept: the whole photo only fills what is missing.
      names: ['Yew Flowers & Velvet Breeze'],
    });
    expect(methods(fake)).toEqual([
      'recognizeName',
      'recognizeSetCode',
      'recognizeSetCode',
      'recognizeLines@0',
    ]);
  });

  it('takes the names of the whole photo when the Name area held none', async () => {
    const fake = reader({
      name: ['DARK'],
      setCode: ['ZOB-EN005'],
      whole: ['Dark Moonseer', 'ZOB-EN005'],
    });
    await expect(
      readCardText(fake, { photo: PHOTO, source: 'CAMERA', crops: CROPS })
    ).resolves.toEqual({
      codes: ['ZOB-EN005'],
      names: ['Dark Moonseer'],
    });
  });

  it("takes the whole photo's names when the Name area's text starts at its left edge", async () => {
    // The card was not under the frame: the area holds the end of a name, cut at its left.
    const fake = reader({
      name: [at('THERWING MAGE', 0.0, 0.3, 0.7, 0.4, 1)],
      setCode: ['ZR04-EN015'],
      whole: ['Quillfeather Mage', 'ZR04-EN015'],
    });
    await expect(
      readCardText(fake, { photo: PHOTO, source: 'CAMERA', crops: CROPS })
    ).resolves.toEqual({ codes: ['ZR04-EN015'], names: ['Quillfeather Mage'] });
    expect(methods(fake)).toEqual(['recognizeName', 'recognizeSetCode', 'recognizeLines@0']);
  });

  it("takes the whole photo's names when the reader doubts every line of the Name area", async () => {
    const fake = reader({
      name: [
        at('Quilfeathcr Magc', 0.1, 0.3, 0.7, 0.4, 0.3),
        at('SPELL', 0.85, 0.3, 0.1, 0.4, 0.3),
      ],
      setCode: ['ZR04-EN015'],
      whole: ['Quillfeather Mage', 'ZR04-EN015'],
    });
    await expect(
      readCardText(fake, { photo: PHOTO, source: 'CAMERA', crops: CROPS })
    ).resolves.toEqual({ codes: ['ZR04-EN015'], names: ['Quillfeather Mage'] });
    // A line at 0.5 or more, or lines without a confidence (ML Kit): the area's name is kept.
    for (const confidences of [
      [0.5, 0.3],
      [null, null],
    ]) {
      const kept = reader({
        name: [
          at('Quillfeather Mage', 0.1, 0.3, 0.7, 0.4, confidences[0]),
          at('SPELL', 0.85, 0.3, 0.1, 0.4, confidences[1]),
        ],
        setCode: ['ZR04-EN015'],
      });
      await expect(
        readCardText(kept, { photo: PHOTO, source: 'CAMERA', crops: CROPS })
      ).resolves.toEqual({ codes: ['ZR04-EN015'], names: ['Quillfeather Mage'] });
    }
  });

  it('reads a photo the frame cannot be placed on whole, and not turned', async () => {
    const fake = reader({ whole: [] });
    await expect(
      readCardText(fake, { photo: PHOTO, source: 'CAMERA', crops: null })
    ).resolves.toEqual({
      codes: [],
      names: [],
    });
    expect(methods(fake)).toEqual(['recognizeLines@0']);
  });

  it('picks the names of an upside-down card in the whole photo name first, without turning it', async () => {
    const fake = new FakeOcrProvider({
      [UPSIDE_DOWN_PHOTO.uri]: { name: [], setCode: [], pendulum: [], whole: UPSIDE_DOWN_READ },
    });
    const crops = cropsUnderFrame(
      { x: 32, y: 228, width: 236, height: 344 },
      { width: 300, height: 800 },
      UPSIDE_DOWN_PHOTO
    );
    const read = await readCardText(fake, { photo: UPSIDE_DOWN_PHOTO, source: 'CAMERA', crops });
    expect(read.codes).toEqual(['ZMD-E001']);
    expect(read.names[0]).toBe('Marble Roc Drake');
    expect(methods(fake)).toEqual([
      'recognizeName',
      'recognizeSetCode',
      'recognizeSetCode',
      'recognizeLines@0',
    ]);
  });

  it('passes a failure of the reader on', async () => {
    const fake = reader({ name: new Error('engine failed'), setCode: ['ZACR-EN036'] });
    await expect(
      readCardText(fake, { photo: PHOTO, source: 'CAMERA', crops: CROPS })
    ).rejects.toThrow('engine failed');
  });
});

describe('reading a library photo', () => {
  it('reads it whole, upright first', async () => {
    const fake = reader({ whole: ['Inkshade Interference', 'ZA01-EN075'] });
    await expect(readCardText(fake, { photo: PHOTO, source: 'LIBRARY' })).resolves.toEqual({
      codes: ['ZA01-EN075'],
      names: ['Inkshade Interference'],
    });
    expect(methods(fake)).toEqual(['recognizeLines@0']);
  });

  it('never reads areas, even with crops', async () => {
    const fake = reader({ name: ['x'], whole: ['Inkshade Interference', 'ZA01-EN075'] });
    await readCardText(fake, { photo: PHOTO, source: 'LIBRARY', crops: CROPS });
    expect(methods(fake)).toEqual(['recognizeLines@0']);
  });

  it('turns a photo whose upright read holds no code, and keeps the first turn with one', async () => {
    const fake = reader({
      whole: ['ʎɐɹ ʇɐǝɹƃ'],
      turned: { 90: [], 180: ['Inkshade Interference', 'ZA01-EN075'], 270: ['ZOB-EN001'] },
    });
    await expect(readCardText(fake, { photo: PHOTO, source: 'LIBRARY' })).resolves.toEqual({
      codes: ['ZA01-EN075'],
      names: ['Inkshade Interference'],
    });
    expect(methods(fake)).toEqual(['recognizeLines@0', 'recognizeLines@90', 'recognizeLines@180']);
  });

  it('turns a photo whose upright read holds a code but no name, and keeps the turn with both', async () => {
    // Vision reads a sideways card's lines without turning it: tall boxes side by side make one
    // row that holds the code, so no name comes out of the upright read.
    const fake = reader({
      whole: ['Crimson Lantern Dragon ZRA1-EN075 [Dragon/Effect]'],
      turned: { 90: ['Crimson Lantern Dragon', 'ZRA1-EN075'], 180: [], 270: [] },
    });
    await expect(readCardText(fake, { photo: PHOTO, source: 'LIBRARY' })).resolves.toEqual({
      codes: ['ZRA1-EN075'],
      names: ['Crimson Lantern Dragon'],
    });
    expect(methods(fake)).toEqual(['recognizeLines@0', 'recognizeLines@90']);
  });

  it('keeps the first code with the first names when no turn holds both', async () => {
    const fake = reader({
      whole: ['ZRA1-EN075'],
      turned: { 90: [], 180: ['Crimson Lantern Dragon'], 270: ['ZOB-EN001'] },
    });
    await expect(readCardText(fake, { photo: PHOTO, source: 'LIBRARY' })).resolves.toEqual({
      codes: ['ZRA1-EN075'],
      names: ['Crimson Lantern Dragon'],
    });
    expect(methods(fake)).toHaveLength(4);
  });

  it('keeps the upright names when no turn holds a code', async () => {
    const fake = reader({
      whole: ['Yew Flowers & Velvet Breeze'],
      turned: { 90: ['Sideways Words'], 180: [], 270: [] },
    });
    await expect(readCardText(fake, { photo: PHOTO, source: 'LIBRARY' })).resolves.toEqual({
      codes: [],
      names: ['Yew Flowers & Velvet Breeze'],
    });
    expect(methods(fake)).toHaveLength(4);
  });

  it('takes the names of a turn when the upright read held nothing', async () => {
    const fake = reader({ whole: [], turned: { 90: [], 180: ['Hushed by the Tides'], 270: [] } });
    await expect(readCardText(fake, { photo: PHOTO, source: 'LIBRARY' })).resolves.toEqual({
      codes: [],
      names: ['Hushed by the Tides'],
    });
  });

  it('reads an upside-down card again turned 180° and keeps that upright read', async () => {
    // Vision reads the upside-down card in place, its name the last row; turned, it stands.
    const fake = new FakeOcrProvider({
      [UPSIDE_DOWN_PHOTO.uri]: {
        whole: UPSIDE_DOWN_READ,
        turned: { 180: turnLines(UPSIDE_DOWN_READ, 180).map((line) => ({ ...line })) },
      },
    });
    const read = await readCardText(fake, { photo: UPSIDE_DOWN_PHOTO, source: 'LIBRARY' });
    expect(read).toEqual({
      codes: ['ZMD-E001'],
      names: ['Marble Roc Drake', 'heread araor white marble that nests on the difs above'],
    });
    expect(methods(fake)).toEqual(['recognizeLines@0', 'recognizeLines@180']);
  });

  it('keeps an upside-down read, name first, when its 180° turn reads worse', async () => {
    const fake = new FakeOcrProvider({
      [UPSIDE_DOWN_PHOTO.uri]: { whole: UPSIDE_DOWN_READ, turned: { 180: ['~~'] } },
    });
    const read = await readCardText(fake, { photo: UPSIDE_DOWN_PHOTO, source: 'LIBRARY' });
    expect(read.codes).toEqual(['ZMD-E001']);
    expect(read.names[0]).toBe('Marble Roc Drake');
    expect(methods(fake)).toEqual(['recognizeLines@0', 'recognizeLines@180']);
  });

  it('turns a card lying with its top on the right 270° first, never upside down', async () => {
    // Batch B1 turned it 90° first: upside down, the names came bottom first.
    const fake = new FakeOcrProvider({
      [SIDEWAYS_PHOTO.uri]: {
        whole: SIDEWAYS_READ,
        turned: { 90: SIDEWAYS_READ_TURNED_90, 270: turnLines(SIDEWAYS_READ, 270) },
      },
    });
    const read = await readCardText(fake, { photo: SIDEWAYS_PHOTO, source: 'LIBRARY' });
    expect(read.codes).toEqual(['ZRA1-EN075']);
    expect(read.names[0]).toBe('Crimson Lantern Dragon');
    expect(methods(fake)).toEqual(['recognizeLines@0', 'recognizeLines@270']);
  });

  it('reads an upright Pendulum card without a passcode once, name first', async () => {
    // Batch B1 judged it upside down, read it again turned 180° and kept that read: the code
    // misread (LPEN-EN015) and the names its bottom rows.
    const fake = new FakeOcrProvider({
      [PENDULUM_NO_PASSCODE_PHOTO.uri]: {
        whole: PENDULUM_NO_PASSCODE_READ,
        turned: { 180: PENDULUM_NO_PASSCODE_READ_TURNED_180 },
      },
    });
    const read = await readCardText(fake, { photo: PENDULUM_NO_PASSCODE_PHOTO, source: 'LIBRARY' });
    expect(read.codes).toEqual(['ZPEN-EN015']);
    expect(read.names[0]).toBe('Odd-Glass Pendulum Magician');
    expect(methods(fake)).toEqual(['recognizeLines@0']);
  });

  it('keeps the first read when the turn it asked for still reads the card upside down', async () => {
    // The 180° read stands no better (the reader gave the card as it was): the first read, picked
    // name first, is kept over it, and no other turn is tried.
    const stillUpsideDown = UPSIDE_DOWN_READ.map((entry) =>
      entry.text === 'ZMD-E001' ? { ...entry, text: 'ZMD-E007' } : entry
    );
    const fake = new FakeOcrProvider({
      [UPSIDE_DOWN_PHOTO.uri]: { whole: UPSIDE_DOWN_READ, turned: { 180: stillUpsideDown } },
    });
    const read = await readCardText(fake, { photo: UPSIDE_DOWN_PHOTO, source: 'LIBRARY' });
    expect(read.codes).toEqual(['ZMD-E001']);
    expect(read.names[0]).toBe('Marble Roc Drake');
    expect(methods(fake)).toEqual(['recognizeLines@0', 'recognizeLines@180']);
  });

  it('reads an upright card once', async () => {
    const fake = new FakeOcrProvider({ [PHOTO.uri]: { whole: UPRIGHT_READ } });
    const read = await readCardText(fake, { photo: PHOTO, source: 'LIBRARY' });
    expect(read.codes).toEqual(['ZRA1-EN075']);
    // The name first; the type line is no name.
    expect(read.names).toEqual([
      'Crimson Lantern Dragon',
      'arces unice moothr at opponent command:; shroud ls',
    ]);
    expect(methods(fake)).toEqual(['recognizeLines@0']);
  });

  it('sends a code cut short after its region when no read, its code band included, holds a code', async () => {
    const fake = new FakeOcrProvider({ [PHOTO.uri]: { whole: CODE_CUT_SHORT, setCode: ['~~'] } });
    const read = await readCardText(fake, { photo: PHOTO, source: 'LIBRARY' });
    expect(read).toEqual({
      codes: ['ZR04-EN'],
      names: ['QUILLFEATHER MAGE', 'A quiet scholar who writes the winds into old books'],
    });
    expect(methods(fake)).toEqual([
      'recognizeLines@0',
      'recognizeLines@90',
      'recognizeLines@180',
      'recognizeLines@270',
      'recognizeSetCode',
    ]);
  });

  it('reads the code band of a read without a code, like the set code area, and keeps its code', async () => {
    const fake = new FakeOcrProvider({
      [PHOTO.uri]: { whole: CODE_CUT_SHORT, setCode: ['ZR04-EN015'] },
    });
    const read = await readCardText(fake, { photo: PHOTO, source: 'LIBRARY' });
    expect(read.codes).toEqual(['ZR04-EN015']);
    expect(read.names[0]).toBe('QUILLFEATHER MAGE');
    // Around the code cut short (0.72, 0.75, 0.09 × 0.013 of the photo), with room around it.
    const band = fake.calls[4];
    expect(band?.method).toBe('recognizeSetCode');
    expect(band?.rotation).toBeUndefined();
    expect(band?.box).toEqual({ x: 1741, y: 2714, width: 1215, height: 624 });
  });

  it('turns the code band the way the read it was placed on stood', async () => {
    // Nothing upright; the photo read turned 90° gives the card standing: its band is cut from
    // the photo where the turned read saw it, and read turned 90° too.
    const fake = new FakeOcrProvider({
      [PHOTO.uri]: { whole: [], turned: { 90: CODE_CUT_SHORT }, setCode: ['ZR04-EN015'] },
    });
    const read = await readCardText(fake, { photo: PHOTO, source: 'LIBRARY' });
    expect(read.codes).toEqual(['ZR04-EN015']);
    const band = fake.calls.find((call) => call.method === 'recognizeSetCode');
    expect(band?.rotation).toBe(90);
    expect(band?.box).toEqual({ x: 2036, y: 58, width: 468, height: 1620 });
  });

  it('turns the code band the way the lines of the read it was placed on asked', async () => {
    // A card lying on its side in a landscape photo, its top on the left: read in place, its
    // lines are tall boxes that ask for a 90° turn. No read holds a code: the band is placed on
    // that first read as if the card stood (the photo turned 90°), cut from the photo where the
    // read saw it, and read turned 90°.
    const sideways = { uri: 'file:///cache/scan/photo-2.jpg', width: 4000, height: 3000 };
    const fake = new FakeOcrProvider({
      [sideways.uri]: {
        whole: turnLines(CODE_CUT_SHORT, 270),
        turned: { 90: CODE_CUT_SHORT, 180: [], 270: [] },
        setCode: ['ZR04-EN015'],
      },
    });
    const read = await readCardText(fake, { photo: sideways, source: 'LIBRARY' });
    expect(read).toEqual({
      codes: ['ZR04-EN015'],
      names: ['QUILLFEATHER MAGE', 'A quiet scholar who writes the winds into old books'],
    });
    expect(methods(fake)).toEqual([
      'recognizeLines@0',
      'recognizeLines@90',
      'recognizeLines@180',
      'recognizeLines@270',
      'recognizeSetCode',
    ]);
    // The band of the upright card (0.5805, 0.6785, 0.405 × 0.156 of it) in the landscape photo.
    const band = fake.calls[4];
    expect(band?.rotation).toBe(90);
    expect(band?.box).toEqual({ x: 2714, y: 44, width: 624, height: 1215 });
  });

  it('reads no code band when a read holds a code but no name, all turns read', async () => {
    // The code band's marks are there (the type line on the column of the type line and the
    // passcode), but the first read's code is kept: no band.
    const fake = new FakeOcrProvider({
      [PHOTO.uri]: {
        whole: [
          at('ZR04-EN015', 0.72, 0.75, 0.13, 0.013),
          at('[Spellcaster/Normal]', 0.198, 0.782, 0.385, 0.022),
          at('12345678 1st Edition', 0.178, 0.955, 0.236, 0.02),
        ],
        turned: { 90: [], 180: [], 270: [] },
      },
    });
    await expect(readCardText(fake, { photo: PHOTO, source: 'LIBRARY' })).resolves.toEqual({
      codes: ['ZR04-EN015'],
      names: [],
    });
    expect(methods(fake)).toEqual([
      'recognizeLines@0',
      'recognizeLines@90',
      'recognizeLines@180',
      'recognizeLines@270',
    ]);
  });

  it('reads no code band when a read holds a code, or for a camera photo', async () => {
    const withCode = new FakeOcrProvider({
      [PHOTO.uri]: { whole: [...CODE_CUT_SHORT, at('ZR04-EN015', 0.72, 0.75, 0.13, 0.013)] },
    });
    await readCardText(withCode, { photo: PHOTO, source: 'LIBRARY' });
    expect(methods(withCode)).toEqual(['recognizeLines@0']);
    const camera = reader({
      name: ['Quillfeather Mage'],
      setCode: [],
      pendulum: [],
      whole: CODE_CUT_SHORT,
    });
    await readCardText(camera, { photo: PHOTO, source: 'CAMERA', crops: CROPS });
    expect(methods(camera)).toEqual([
      'recognizeName',
      'recognizeSetCode',
      'recognizeSetCode',
      'recognizeLines@0',
    ]);
  });

  it('keeps the whole code a turned read found over a code cut short', async () => {
    const fake = new FakeOcrProvider({
      [PHOTO.uri]: {
        whole: CODE_CUT_SHORT,
        turned: { 90: [], 180: ['Quillfeather Mage', 'ZR04-EN015'] },
      },
    });
    const read = await readCardText(fake, { photo: PHOTO, source: 'LIBRARY' });
    expect(read.codes).toEqual(['ZR04-EN015']);
    expect(methods(fake)).toEqual(['recognizeLines@0', 'recognizeLines@90', 'recognizeLines@180']);
  });

  it("sends a camera photo's code cut short when neither the areas nor the whole photo hold a code", async () => {
    const fake = reader({
      name: ['Quillfeather Mage'],
      setCode: [],
      pendulum: [],
      whole: CODE_CUT_SHORT,
    });
    await expect(
      readCardText(fake, { photo: PHOTO, source: 'CAMERA', crops: CROPS })
    ).resolves.toEqual({ codes: ['ZR04-EN'], names: ['Quillfeather Mage'] });
  });

  it('reads nothing from a photo without text', async () => {
    const fake = reader({});
    await expect(readCardText(fake, { photo: PHOTO, source: 'LIBRARY' })).resolves.toEqual({
      codes: [],
      names: [],
    });
    expect(methods(fake)).toEqual([
      'recognizeLines@0',
      'recognizeLines@90',
      'recognizeLines@180',
      'recognizeLines@270',
    ]);
  });
});
