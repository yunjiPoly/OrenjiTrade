import { cropsUnderFrame } from '@/src/features/scan/frameMapping';
import { FakeOcrProvider, type FakeCardText } from '@/src/features/scan/ocr/fakeOcrProvider';
import { turnLines } from '@/src/features/scan/orientation';
import { readCardText } from '@/src/features/scan/readCardText';
import {
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
