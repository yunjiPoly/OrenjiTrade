import { TestBed } from '@angular/core/testing';
import { THEME_STORAGE_KEY, ThemeService } from './theme.service';

describe('ThemeService', () => {
  const root = () => document.documentElement;

  beforeEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    delete root().dataset['theme'];
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    delete root().dataset['theme'];
  });

  it('defaults to the system preference and leaves html[data-theme] unset', () => {
    const service = TestBed.inject(ThemeService);
    TestBed.tick();
    expect(service.preference()).toBe('system');
    expect(root().dataset['theme']).toBeUndefined();
    expect(['light', 'dark']).toContain(service.resolved());
  });

  it('sets html[data-theme] and persists the choice when a theme is picked', () => {
    const service = TestBed.inject(ThemeService);

    service.setPreference('dark');
    TestBed.tick();
    expect(root().dataset['theme']).toBe('dark');
    expect(service.resolved()).toBe('dark');
    expect(service.isDark()).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    service.setPreference('light');
    TestBed.tick();
    expect(root().dataset['theme']).toBe('light');
    expect(service.resolved()).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('removes the attribute again when switching back to system', () => {
    const service = TestBed.inject(ThemeService);
    service.setPreference('dark');
    TestBed.tick();
    service.setPreference('system');
    TestBed.tick();
    expect(root().dataset['theme']).toBeUndefined();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
  });

  it('toggle() flips between light and dark', () => {
    const service = TestBed.inject(ThemeService);
    service.setPreference('light');
    service.toggle();
    expect(service.preference()).toBe('dark');
    service.toggle();
    expect(service.preference()).toBe('light');
  });

  it('restores a persisted preference on startup and ignores garbage', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const restored = TestBed.inject(ThemeService);
    TestBed.tick();
    expect(restored.preference()).toBe('dark');
    expect(root().dataset['theme']).toBe('dark');

    TestBed.resetTestingModule();
    localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    const fallback = TestBed.inject(ThemeService);
    expect(fallback.preference()).toBe('system');
  });
});
