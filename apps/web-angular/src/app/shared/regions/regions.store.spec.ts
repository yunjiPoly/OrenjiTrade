import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { RegionsService } from '@orenji/api-client';
import { of, throwError } from 'rxjs';
import { REGIONS_FIXTURE } from './testing/regions-fixtures';
import { RegionsStore, subdivisionLabel } from './regions.store';

describe('RegionsStore', () => {
  let store: RegionsStore;
  let listRegions: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listRegions = vi.fn(() => of(REGIONS_FIXTURE));
    TestBed.configureTestingModule({
      providers: [{ provide: RegionsService, useValue: { listRegions } }],
    });
    store = TestBed.inject(RegionsStore);
  });

  it('names the regions before and after GET /regions answers', async () => {
    expect(store.loaded()).toBe(false);
    expect(store.regionName('europe')).toBe('Europe');
    expect(store.regionName(null)).toBe('Americas (North)');
    expect(await store.load()).toBe(true);
    expect(store.regions().map((region) => region.code)).toEqual([
      'americas-north',
      'americas-south',
      'europe',
    ]);
  });

  it('loads once even when several components ask at the same time', async () => {
    await Promise.all([store.load(), store.load(), store.load()]);
    await store.load();
    expect(listRegions).toHaveBeenCalledTimes(1);
  });

  it('looks up countries and subdivisions with their labels', async () => {
    await store.load();
    expect(store.country('FR')?.regionCode).toBe('europe');
    const quebec = store.subdivision('CA-QC')!;
    expect(quebec.country.code).toBe('CA');
    expect(subdivisionLabel(quebec)).toBe('Quebec, Canada');
    expect(subdivisionLabel(store.subdivision('PR')!)).toBe('Puerto Rico');
    expect(store.subdivision('ZZ-99')).toBeNull();
    expect(store.subdivisionsOf('americas-north').map((entry) => entry.subdivision.code)).toEqual([
      'CA-ON',
      'CA-QC',
      'PR',
      'US-NY',
    ]);
    expect(store.subdivisionsOf('unknown')).toEqual([]);
  });

  it('keeps the error and loads again on retry', async () => {
    listRegions.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })));
    expect(await store.load()).toBe(false);
    expect(store.error()?.status).toBe(503);
    expect(await store.load()).toBe(true);
    expect(store.error()).toBeNull();
    expect(listRegions).toHaveBeenCalledTimes(2);
  });
});
