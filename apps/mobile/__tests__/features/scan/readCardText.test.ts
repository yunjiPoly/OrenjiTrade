import { cropsUnderFrame } from '@/src/features/scan/frameMapping';
import { FakeOcrProvider, type FakeCardText } from '@/src/features/scan/ocr/fakeOcrProvider';
import { readCardText } from '@/src/features/scan/readCardText';

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
