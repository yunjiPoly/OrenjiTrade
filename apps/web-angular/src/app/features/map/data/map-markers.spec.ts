import type { CollectorMarker } from '@orenji/api-client';
import { buildCollectorMarkers, collectorMarkerId, handleFromMarkerId } from './map-markers';
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
});
