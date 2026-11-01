import type { RegionOutline } from './regionOutline';

/**
 * Where the drawings of the region map come from on the web: one `import()` per region, which the
 * web export turns into one chunk per region, downloaded from the app's own origin the first time
 * that region is shown (never from a map provider).
 */
export const OUTLINE_FILES: Readonly<Record<string, () => Promise<RegionOutline>>> = {
  'americas-north': () =>
    import('@/assets/boundaries/americas-north.json').then((file) => file.default),
  'americas-south': () =>
    import('@/assets/boundaries/americas-south.json').then((file) => file.default),
  europe: () => import('@/assets/boundaries/europe.json').then((file) => file.default),
};
