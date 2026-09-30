import type { MapRegion } from '@/src/store/useAppStore';

/** Montréal, the launch city. A neighbourhood-scale viewport, not anyone's location. */
export const MONTREAL_REGION: MapRegion = {
  latitude: 45.5017,
  longitude: -73.5673,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

export const MAP_OVERLAY_MESSAGE = 'Collectors appear here in Phase 4';
