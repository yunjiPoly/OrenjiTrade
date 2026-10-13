import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  BoundaryAssets,
  REGION_VIEW,
  SHADE_LEGEND,
  binderCountLabel,
  boundaryUrl,
  shadeLevel,
} from './boundaries';

describe('region map boundaries', () => {
  it('shades states by their number of public binders', () => {
    expect([0, 1, 2, 4, 5, 9, 10, 250].map((count) => shadeLevel(count))).toEqual([
      0, 1, 2, 2, 3, 3, 4, 4,
    ]);
    expect(shadeLevel(undefined)).toBe(0);
    expect(SHADE_LEGEND.map((step) => step.label)).toEqual(['None', '1', '2–4', '5–9', '10+']);
    expect(binderCountLabel(undefined)).toBe('No public binders');
    expect(binderCountLabel(1)).toBe('1 public binder');
    expect(binderCountLabel(12)).toBe('12 public binders');
  });

  it('frames each platform region and serves its boundaries from the web build', () => {
    expect(Object.keys(REGION_VIEW)).toEqual(['americas-north', 'americas-south', 'europe']);
    expect(boundaryUrl('europe')).toBe('boundaries/europe.json');
    expect(boundaryUrl('a/b')).toBe('boundaries/a%2Fb.json');
  });

  it('downloads a region once and retries after a failure', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const assets = TestBed.inject(BoundaryAssets);
    const backend = TestBed.inject(HttpTestingController);
    const collection = { type: 'FeatureCollection', features: [] };

    const first = assets.load('europe');
    const second = assets.load('europe');
    const request = backend.expectOne('boundaries/europe.json');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush(collection);
    await expect(first).resolves.toEqual(collection);
    await expect(second).resolves.toEqual(collection);
    backend.expectNone('boundaries/europe.json');

    const failed = assets.load('americas-south');
    backend
      .expectOne('boundaries/americas-south.json')
      .flush('gone', { status: 404, statusText: 'Not Found' });
    await expect(failed).rejects.toBeTruthy();
    const retried = assets.load('americas-south');
    backend.expectOne('boundaries/americas-south.json').flush(collection);
    await expect(retried).resolves.toEqual(collection);
    backend.verify();
  });
});
