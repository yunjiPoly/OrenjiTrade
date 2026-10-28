import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import {
  RECENT_SEARCHES_MAX,
  RECENT_SEARCHES_STORAGE_KEY,
  RecentSearches,
  rememberSearch,
} from './recent-searches.service';

describe('RecentSearches (spec 4.4)', () => {
  const user = signal<{ uid: string } | null>({ uid: 'u-1' });

  function create(): RecentSearches {
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { user } }] });
    return TestBed.inject(RecentSearches);
  }

  beforeEach(() => {
    localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
    user.set({ uid: 'u-1' });
  });
  afterEach(() => localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY));

  it('keeps the newest first, without duplicates, at most eight, from two characters', () => {
    let list: string[] = [];
    for (const text of ['Maxx "C"', 'yubel', 'a', 'LAVD-EN008', 'Yubel']) {
      list = rememberSearch(list, text);
    }
    expect(list).toEqual(['Yubel', 'LAVD-EN008', 'Maxx "C"']);
    for (let i = 0; i < 12; i++) {
      list = rememberSearch(list, `card ${i}`);
    }
    expect(list).toHaveLength(RECENT_SEARCHES_MAX);
    expect(list[0]).toBe('card 11');
  });

  it('remembers per account in this browser only, and forgets one or all', () => {
    const recent = create();
    recent.remember('Ash Blossom');
    recent.remember('LAVD-EN008');
    expect(recent.list()).toEqual(['LAVD-EN008', 'Ash Blossom']);
    expect(JSON.parse(localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY)!).byUser['u-1']).toEqual([
      'LAVD-EN008',
      'Ash Blossom',
    ]);
    user.set({ uid: 'u-2' });
    expect(recent.list()).toEqual([]);
    user.set({ uid: 'u-1' });
    recent.forget('Ash Blossom');
    expect(recent.list()).toEqual(['LAVD-EN008']);
    recent.clear();
    expect(recent.list()).toEqual([]);
  });

  it('stores nothing while "Remember my searches" is off, and clears the list when turned off', () => {
    const recent = create();
    recent.remember('Yubel');
    recent.setRemembering(false);
    expect(recent.remembering()).toBe(false);
    expect(recent.list()).toEqual([]);
    recent.remember('Maxx');
    expect(recent.list()).toEqual([]);
    expect(localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY)).not.toContain('Maxx');
    recent.setRemembering(true);
    recent.remember('Maxx');
    expect(recent.list()).toEqual(['Maxx']);
  });

  it('keeps a guest’s list apart and survives a broken or blocked storage', () => {
    localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, '{not json');
    user.set(null);
    const recent = create();
    expect(recent.list()).toEqual([]);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    recent.remember('Pot of Greed');
    expect(recent.list()).toEqual(['Pot of Greed']);
    setItem.mockRestore();
  });
});
