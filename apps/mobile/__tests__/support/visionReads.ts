import type { OcrLine } from '@/src/features/scan/ocr/types';

/**
 * Whole-photo reads Apple Vision gave on the iPhone 17 simulator (batch B1, 2026-10-15), of
 * synthetic photos of FICTIONAL cards: the text and the boxes (fractions of the image read, origin
 * top left) as the reader's test screen recorded them, rounded to 3 decimals. Their card text was
 * since reworded into other fictional words of the same lengths.
 */
function line(text: string, x: number, y: number, width: number, height: number): OcrLine {
  return { text, confidence: 1, box: { x, y, width, height } };
}

/** A photo 3024 × 4032, the card upright. */
export const UPRIGHT_PHOTO = { uri: 'file:///cache/scan/upright.jpg', width: 3024, height: 4032 };
export const UPRIGHT_READ: OcrLine[] = [
  line('Crimson Lantern Dragon', 0.319, 0.116, 0.259, 0.018),
  line('********', 0.466, 0.147, 0.216, 0.019),
  line('ZRA1-EN075', 0.578, 0.422, 0.092, 0.011),
  line('[Dragon/Effect]', 0.33, 0.444, 0.072, 0.011),
  line('arces unice moothr at opponent command:; shroud ls', 0.333, 0.452, 0.207, 0.018),
  line('ATK/2800 DEF/2400', 0.58, 0.509, 0.092, 0.011),
  line('0096397', 0.319, 0.53, 0.034, 0.004),
];

/** A Pendulum card upright: the code at the left, under the pendulum text. */
export const PENDULUM_READ: OcrLine[] = [
  line('Odd-Glass Pendulum Magician', 0.319, 0.119, 0.256, 0.015),
  line('****', 0.575, 0.149, 0.106, 0.017),
  line('Once per dusk: you can kindle the silver candle you draw', 0.353, 0.364, 0.198, 0.009),
  line('rom an amulet enclosing a Pendulum Monster to C', 0.353, 0.371, 0.17, 0.011),
  line('4', 0.319, 0.377, 0.02, 0.013),
  line('ZPEN-EN015', 0.319, 0.42, 0.095, 0.011),
  line('[Spellcaster/Pendulum/Effect]', 0.33, 0.444, 0.141, 0.011),
  line('this lamp is Pendulum Summoned: you may set 1 Pendulu', 0.336, 0.452, 0.205, 0.014),
  line('ATK/1500 DEF/1300', 0.58, 0.509, 0.092, 0.011),
  line('50240865', 0.313, 0.53, 0.04, 0.004),
];

/** A photo 4032 × 3024 holding the card on its side, its top on the right. */
export const SIDEWAYS_PHOTO = { uri: 'file:///cache/scan/sideways.jpg', width: 4032, height: 3024 };
/** Read as it is: Vision reads the text in place, in tall boxes. */
export const SIDEWAYS_READ: OcrLine[] = [
  line('Crimson Lantern Dragon', 0.863, 0.324, 0.022, 0.254),
  line('ZRA1-EN075', 0.567, 0.578, 0.011, 0.092),
  line('[Dragon/Effect]', 0.545, 0.328, 0.011, 0.075),
  line('Select lone monster that opponent commands; shroud is', 0.527, 0.327, 0.021, 0.216),
  line('10096397', 0.461, 0.31, 0.011, 0.046),
  line('ATK/2800 DEF/2400', 0.478, 0.578, 0.011, 0.095),
  line('92026 ORENJI FICTION', 0.463, 0.586, 0.006, 0.083),
];
/** The same photo turned 90° clockwise: upside down, the name the last row. */
export const SIDEWAYS_READ_TURNED_90: OcrLine[] = [
  line('Crimson Lantern Dragon', 0.422, 0.864, 0.253, 0.019),
  line('*', 0.371, 0.838, 0.026, 0.011),
  line('*', 0.345, 0.836, 0.026, 0.013),
  line('ZRA1-EN075', 0.33, 0.565, 0.092, 0.011),
  line('[Dragon/Effect]', 0.595, 0.543, 0.078, 0.013),
  line('cts until the eve of this', 0.575, 0.53, 0.083, 0.009),
  line('10096397', 0.644, 0.461, 0.049, 0.011),
  line('ATK/2800 DEF/2400', 0.328, 0.478, 0.095, 0.011),
  line('©2026 ORENJI FICTION', 0.328, 0.466, 0.089, 0.004),
];

/** A photo 3024 × 4032 holding the card upside down, read as it is. */
export const UPSIDE_DOWN_PHOTO = {
  uri: 'file:///cache/scan/upside-down.jpg',
  width: 3024,
  height: 4032,
};
export const UPSIDE_DOWN_READ: OcrLine[] = [
  line('Marble Roc Drake', 0.471, 0.866, 0.207, 0.017),
  line('ZMD-E001', 0.333, 0.565, 0.075, 0.011),
  line('[Winged Beast]', 0.598, 0.545, 0.075, 0.011),
  line('heread araor white marble that nests on the difs above', 0.468, 0.527, 0.205, 0.021),
  line('20481937', 0.644, 0.461, 0.049, 0.011),
  line('ATK/2200 DEF/1500', 0.328, 0.478, 0.095, 0.011),
  line('©2026 ORENJI FICTION', 0.328, 0.466, 0.086, 0.006),
];
