/** What a collector is willing to do with an inventory item. */
export type Availability =
  | 'COLLECTION_ONLY'
  | 'TRADE'
  | 'SALE'
  | 'TRADE_OR_SALE'
  | 'ACCEPTING_OFFERS'
  | 'NOT_AVAILABLE';

export interface AvailabilityInfo {
  label: string;
  icon: string;
  /** CSS modifier, maps to `--color-availability-<modifier>` in the design tokens. */
  modifier: 'collection' | 'trade' | 'sale' | 'trade-or-sale' | 'offers' | 'not-available';
}

export const AVAILABILITIES: Record<Availability, AvailabilityInfo> = {
  COLLECTION_ONLY: { label: 'Collection only', icon: 'collections_bookmark', modifier: 'collection' },
  TRADE: { label: 'Trade', icon: 'swap_horiz', modifier: 'trade' },
  SALE: { label: 'Sale', icon: 'sell', modifier: 'sale' },
  TRADE_OR_SALE: { label: 'Trade or sale', icon: 'sync_alt', modifier: 'trade-or-sale' },
  ACCEPTING_OFFERS: { label: 'Accepting offers', icon: 'local_offer', modifier: 'offers' },
  NOT_AVAILABLE: { label: 'Not available', icon: 'block', modifier: 'not-available' },
};
