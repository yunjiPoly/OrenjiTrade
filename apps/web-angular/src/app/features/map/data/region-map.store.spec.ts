import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MapService, PublicBinderSummary } from '@orenji/api-client';
import { Subject, of, throwError } from 'rxjs';
import { RegionMapStore, SUBDIVISION_PAGE_SIZE } from './region-map.store';

function binder(id: string): PublicBinderSummary {
  return { id, name: `Binder ${id}` } as PublicBinderSummary;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('RegionMapStore', () => {
  let store: RegionMapStore;
  let api: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    api = {
      getRegionBinderCounts: vi.fn(({ region }) =>
        of({
          region,
          total: 3,
          subdivisions: [
            { code: 'CA-QC', binderCount: 2 },
            { code: 'CA-ON', binderCount: 1 },
          ],
        }),
      ),
      listSubdivisionBinders: vi.fn(({ cursor }) =>
        of(
          cursor
            ? { items: [binder('b3')], hasMore: false, nextCursor: null }
            : { items: [binder('b1'), binder('b2')], hasMore: true, nextCursor: 'next' },
        ),
      ),
    };
    TestBed.configureTestingModule({
      providers: [RegionMapStore, { provide: MapService, useValue: api }],
    });
    store = TestBed.inject(RegionMapStore);
  });

  it('loads the binder counts of a region by subdivision code', async () => {
    store.setRegion('americas-north');
    await settle();
    expect(api['getRegionBinderCounts']).toHaveBeenCalledWith(
      { region: 'americas-north' },
      'body',
      false,
      expect.anything(),
    );
    expect(store.total()).toBe(3);
    expect(store.countByCode().get('CA-QC')).toBe(2);
    expect(store.countByCode().get('CA-NU')).toBeUndefined();
    store.setRegion('americas-north');
    expect(api['getRegionBinderCounts']).toHaveBeenCalledTimes(1);
  });

  it('pages through the binders of a state with the cursor', async () => {
    store.setRegion('americas-north');
    store.openSubdivision('CA-QC');
    expect(store.binders()?.loading).toBe(true);
    await settle();
    expect(api['listSubdivisionBinders']).toHaveBeenCalledWith(
      { region: 'americas-north', code: 'CA-QC', limit: SUBDIVISION_PAGE_SIZE },
      'body',
      false,
      expect.anything(),
    );
    expect(store.binders()?.items.map((item) => item.id)).toEqual(['b1', 'b2']);
    expect(store.binders()?.nextCursor).toBe('next');
    store.loadMore();
    await settle();
    expect(api['listSubdivisionBinders']).toHaveBeenLastCalledWith(
      { region: 'americas-north', code: 'CA-QC', limit: SUBDIVISION_PAGE_SIZE, cursor: 'next' },
      'body',
      false,
      expect.anything(),
    );
    expect(store.binders()?.items.map((item) => item.id)).toEqual(['b1', 'b2', 'b3']);
    expect(store.binders()?.nextCursor).toBeNull();
  });

  it('keeps an error with the loaded page and retries the failed page', async () => {
    store.setRegion('europe');
    store.openSubdivision('FR-IDF');
    await settle();
    api['listSubdivisionBinders'].mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    store.loadMore();
    await settle();
    expect(store.binders()?.error?.status).toBe(500);
    expect(store.binders()?.items).toHaveLength(2);
    store.retryBinders();
    await settle();
    expect(store.binders()?.error).toBeNull();
    expect(store.binders()?.items).toHaveLength(3);
  });

  it('drops answers of a state that is no longer open, and closes it on a region change', async () => {
    const slow = new Subject<unknown>();
    api['listSubdivisionBinders'].mockReturnValueOnce(slow);
    store.setRegion('americas-north');
    store.openSubdivision('CA-QC');
    store.openSubdivision('CA-ON');
    await settle();
    slow.next({ items: [binder('late')], hasMore: false });
    slow.complete();
    await settle();
    expect(store.binders()?.code).toBe('CA-ON');
    expect(store.binders()?.items.map((item) => item.id)).toEqual(['b1', 'b2']);
    store.setRegion('europe');
    expect(store.binders()).toBeNull();
  });
});
