import type { CollectorMarker } from '@orenji/api-client';
import {
  APPROXIMATE_AREA_RADIUS_M,
  COLLECTOR_MAP_MAX_ZOOM,
} from '../../../shared/map/approximate-area';
import {
  buildCollectorMarkers,
  collectorAreaId,
  collectorMarkerId,
  handleFromMarkerId,
} from './map-markers';
import { CLUSTER_MAX_ZOOM } from './marker-clusters';
import { collector } from './testing/collector-fixtures';

describe('collector markers', () => {
  it('maps handles to marker ids and back', () => {
    expect(collectorMarkerId('maika')).toBe('collector:maika');
    expect(handleFromMarkerId('collector:maika')).toBe('maika');
    expect(handleFromMarkerId('cluster:12:1:2')).toBeNull();
  });

  it('draws avatar markers at the public point with an accessible name', () => {
    const { markers, clusters } = buildCollectorMarkers(
      [collector('maika', { binderFreshness: 'AGING' as CollectorMarker['binderFreshness'] })],
      12,
      'maika',
      null,
    );
    expect(clusters.size).toBe(0);
    expect(markers).toEqual([
      expect.objectContaining({
        id: 'collector:maika',
        position: { lat: 45.523, lng: -73.583 },
        variant: 'avatar',
        title: 'Collector maika, Plateau-Mont-Royal, Montréal',
        label: 'CM',
        tone: 'aging',
        selected: true,
      }),
    ]);
  });

  it('labels the viewer own marker', () => {
    const { markers } = buildCollectorMarkers([collector('me')], 12, null, 'id-me');
    expect(markers[0].title).toBe('You (Collector me), Plateau-Mont-Royal, Montréal');
  });

  it('clusters crowds but never hides the selected collector', () => {
    const crowd = Array.from({ length: 70 }, (_, i) => collector(`c${i}`));
    const { markers, clusters } = buildCollectorMarkers(crowd, 12, 'c5', null);
    expect(clusters.size).toBe(1);
    const cluster = markers.find((marker) => marker.variant === 'cluster');
    expect(cluster?.label).toBe('69');
    expect(cluster?.title).toBe('69 collectors here. Zoom in');
    expect(markers.find((marker) => marker.id === 'collector:c5')?.selected).toBe(true);
  });

  it('draws a 3 km approximate-area zone (1500 m radius) under every collector', () => {
    const { areas } = buildCollectorMarkers(
      [collector('maika'), collector('noah', { publicPoint: { lat: 45.5, lng: -73.6 } })],
      12,
      'noah',
      null,
    );
    expect(areas).toEqual([
      {
        id: collectorAreaId('maika'),
        center: { lat: 45.523, lng: -73.583 },
        radiusMeters: APPROXIMATE_AREA_RADIUS_M,
        variant: 'approximate',
      },
      // The selected collector's disc is emphasised.
      {
        id: collectorAreaId('noah'),
        center: { lat: 45.5, lng: -73.6 },
        radiusMeters: APPROXIMATE_AREA_RADIUS_M,
        variant: 'area',
      },
    ]);
    expect(APPROXIMATE_AREA_RADIUS_M).toBe(1500);
  });

  it('gives clustered collectors no disc but keeps the selected one', () => {
    const crowd = Array.from({ length: 70 }, (_, i) => collector(`c${i}`));
    const { areas } = buildCollectorMarkers(crowd, 12, 'c5', null);
    expect(areas.map((area) => area.id)).toEqual([collectorAreaId('c5')]);
  });

  it('draws every collector on their own, with a disc, at the zoom cap', () => {
    const crowd = Array.from({ length: 70 }, (_, i) => collector(`c${i}`));
    const { markers, areas, clusters } = buildCollectorMarkers(
      crowd,
      COLLECTOR_MAP_MAX_ZOOM,
      null,
      null,
    );
    expect(CLUSTER_MAX_ZOOM).toBeLessThanOrEqual(COLLECTOR_MAP_MAX_ZOOM);
    expect(clusters.size).toBe(0);
    expect(markers).toHaveLength(70);
    expect(areas).toHaveLength(70);
    expect(areas.every((area) => area.radiusMeters === APPROXIMATE_AREA_RADIUS_M)).toBe(true);
  });
});
