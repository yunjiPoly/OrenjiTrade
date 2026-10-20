import { addPhoto } from '@/src/features/scan/scanSession';
import { useScanStore } from '@/src/features/scan/scanStore';

/**
 * The scan shared by its screens (`scanStore.ts`): one scan at a time, in memory only. A new scan
 * starts empty, with nothing of the one before it (the tiles, the tries under way).
 */

beforeEach(() => {
  useScanStore.getState().reset();
});

describe('the scan store', () => {
  it('marks the waiting tiles being tried again, once each', () => {
    const { setTrying } = useScanStore.getState();
    setTrying('scan-1', true);
    setTrying('scan-1', true);
    setTrying('scan-2', true);
    expect(useScanStore.getState().trying).toEqual(['scan-1', 'scan-2']);
    setTrying('scan-1', false);
    expect(useScanStore.getState().trying).toEqual(['scan-2']);
  });

  it('starts the next scan empty: no tile, no try under way, no add sent or on its way', () => {
    const store = useScanStore.getState();
    store.apply(
      (session) =>
        addPhoto(session, { uri: 'file:///a.jpg', width: 1, height: 1, owned: true }).session
    );
    // A scan left while its tile "scan-1" was tried again and an add was on its way: the next
    // scan's "scan-1" is not tried, and nothing of it is being added.
    store.setTrying('scan-1', true);
    store.setAdding(true);
    expect(useScanStore.getState().adding).toBe(true);
    const generation = useScanStore.getState().generation;
    useScanStore.getState().reset();
    const next = useScanStore.getState();
    expect(next.generation).toBe(generation + 1);
    expect(next.session.tiles).toEqual([]);
    expect(next.session.pendingAdd).toBeNull();
    expect(next.trying).toEqual([]);
    expect(next.adding).toBe(false);
  });
});
