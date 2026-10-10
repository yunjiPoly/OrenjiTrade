import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { MeResponse } from '@orenji/api-client';
import { SessionService, SessionStatus } from '../auth/session.service';
import { REGION_STORAGE_KEY, RegionContext } from './region-context.service';

describe('RegionContext', () => {
  const status = signal<SessionStatus>('anonymous');
  const me = signal<Partial<MeResponse> | null>(null);

  function create(): RegionContext {
    TestBed.configureTestingModule({
      providers: [{ provide: SessionService, useValue: { status, me } }],
    });
    const context = TestBed.inject(RegionContext);
    TestBed.tick();
    return context;
  }

  beforeEach(() => {
    localStorage.clear();
    status.set('anonymous');
    me.set(null);
  });

  it('starts signed-out visitors in americas-north and remembers their choice', () => {
    const context = create();
    expect(context.current()).toBe('americas-north');
    context.select('europe');
    expect(context.current()).toBe('europe');
    expect(localStorage.getItem(REGION_STORAGE_KEY)).toBe('europe');
  });

  it('restores the stored region and ignores malformed codes', () => {
    localStorage.setItem(REGION_STORAGE_KEY, 'americas-south');
    const context = create();
    expect(context.current()).toBe('americas-south');
    context.select('Europe; DROP');
    context.select('45.5,-73.5');
    expect(context.current()).toBe('americas-south');
  });

  it('follows the home region of a signed-in collector without overwriting the stored choice', () => {
    localStorage.setItem(REGION_STORAGE_KEY, 'americas-south');
    const context = create();
    status.set('ready');
    me.set({ id: 'u-1', homeRegion: 'europe' });
    TestBed.tick();
    expect(context.current()).toBe('europe');
    expect(context.home()).toBe('europe');
    // Browsing another region while signed in is not remembered for signed-out visits.
    context.select('americas-north');
    expect(context.browsingAway()).toBe(true);
    expect(localStorage.getItem(REGION_STORAGE_KEY)).toBe('americas-south');
    // A session refresh with the same home region keeps the browsed region.
    me.set({ id: 'u-1', homeRegion: 'europe' });
    TestBed.tick();
    expect(context.current()).toBe('americas-north');
    // Signing out returns to the browser's own choice.
    status.set('anonymous');
    me.set(null);
    TestBed.tick();
    expect(context.current()).toBe('americas-south');
    expect(context.home()).toBeNull();
  });

  it('keeps the browsed region for a collector without a location, and follows a new one', () => {
    const context = create();
    status.set('ready');
    me.set({ id: 'u-2', homeRegion: null });
    TestBed.tick();
    expect(context.current()).toBe('americas-north');
    expect(context.home()).toBeNull();
    context.applyHome('americas-south');
    expect(context.current()).toBe('americas-south');
  });
});
