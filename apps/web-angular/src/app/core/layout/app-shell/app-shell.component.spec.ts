import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideApiClient } from '../../api/provide-api-client';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { AppShellComponent } from './app-shell.component';

describe('AppShellComponent', () => {
  let fixture: ComponentFixture<AppShellComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppShellComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClient(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppShellComponent);
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  });

  it('renders the wordmark linking home', () => {
    const wordmark = element.querySelector<HTMLAnchorElement>('a[aria-label="OrenjiTrade home"]');
    expect(wordmark).not.toBeNull();
    expect(wordmark?.textContent?.replace(/\s+/g, '')).toBe('OrenjiTrade');
    expect(wordmark?.getAttribute('href')).toBe('/map');
  });

  function primaryLinks(): (string | undefined)[] {
    return Array.from(element.querySelectorAll('nav[aria-label="Primary"] a'), (a) =>
      a.textContent?.replace(/\s+/g, ' ').trim(),
    );
  }

  it('renders the primary navigation links, hiding flag-gated ones until the flags allow them', () => {
    expect(primaryLinks()).toEqual([
      expect.stringContaining('Map'),
      expect.stringContaining('Cards'),
      expect.stringContaining('Inventory'),
      expect.stringContaining('Wishlist'),
    ]);
  });

  it('shows Community once the publicChat flag is on', async () => {
    TestBed.inject(FeatureFlagsService).set({ publicChat: true });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(primaryLinks()).toEqual([
      expect.stringContaining('Map'),
      expect.stringContaining('Cards'),
      expect.stringContaining('Inventory'),
      expect.stringContaining('Community'),
      expect.stringContaining('Wishlist'),
    ]);
  });

  it('renders the mobile bottom navigation with the six mobile tabs', () => {
    const labels = Array.from(
      element.querySelectorAll('nav[aria-label="Mobile navigation"] .bottom-nav__label'),
      (el) => el.textContent?.trim(),
    );
    expect(labels).toEqual(['Map', 'Inventory', 'Search', 'Messages', 'Wishlist', 'Profile']);
  });

  it('exposes landmarks, a skip link and labelled icon buttons', () => {
    expect(element.querySelector('a.skip-link')?.getAttribute('href')).toBe('#main-content');
    expect(element.querySelector('main#main-content')).not.toBeNull();
    expect(element.querySelector('header')).not.toBeNull();
    expect(element.querySelector('footer')).not.toBeNull();
    for (const button of Array.from(element.querySelectorAll('button[matIconButton]'))) {
      expect(button.getAttribute('aria-label')).toBeTruthy();
    }
    expect(element.querySelector('button[aria-label="Notifications"]')).not.toBeNull();
    expect(element.querySelector('button[aria-label="Change theme"]')).not.toBeNull();
  });

  it('shows the copyright line in the footer', () => {
    expect(element.querySelector('footer')?.textContent).toContain('(c) 2026 OrenjiTrade');
  });
});
