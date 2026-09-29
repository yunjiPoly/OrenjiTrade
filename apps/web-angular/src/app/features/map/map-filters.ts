export interface MapFilter {
  id: 'game' | 'distance' | 'availability' | 'freshness';
  label: string;
  icon: string;
}

/** Filter chips on the map page. Disabled until the geographic search lands (Phase 4). */
export const MAP_FILTERS: readonly MapFilter[] = [
  { id: 'game', label: 'Game', icon: 'playing_cards' },
  { id: 'distance', label: 'Distance', icon: 'near_me' },
  { id: 'availability', label: 'Availability', icon: 'sell' },
  { id: 'freshness', label: 'Freshness', icon: 'schedule' },
];
