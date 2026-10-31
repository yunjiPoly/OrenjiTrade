import type { RegionOutline } from './regionOutline';

/**
 * Where the drawings of the region map come from in the native apps: files of the bundle
 * (`assets/boundaries`, made by `npm run sync:boundaries`). A `require` inside a function is only
 * evaluated when it is called, so a region's drawing is built the first time that region is shown
 * and the two others never are unless the collector switches to them. The web build has its own
 * file (`outlineFiles.web.ts`): one downloaded chunk per region.
 */
export const OUTLINE_FILES: Readonly<Record<string, () => Promise<RegionOutline>>> = {
  'americas-north': async () => require('@/assets/boundaries/americas-north.json') as RegionOutline,
  'americas-south': async () => require('@/assets/boundaries/americas-south.json') as RegionOutline,
  europe: async () => require('@/assets/boundaries/europe.json') as RegionOutline,
};
