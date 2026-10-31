import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MeResponse, RegionsService } from '@orenji/api-client';
import { of } from 'rxjs';
import { REGIONS_FIXTURE } from '../../../shared/regions/testing/regions-fixtures';
import { SessionService, SessionStatus } from '../../auth/session.service';
import { REGION_STORAGE_KEY, RegionContext } from '../../region/region-context.service';
import { ShellLayout } from '../shell-layout.service';
import { RegionPillComponent } from './region-pill.component';

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

describe('the region pill and "Choose a region" (spec 4.5)', () => {
  const status = signal<SessionStatus>('anonymous');
  const me = signal<Partial<MeResponse> | null>(null);
  let fixture: ComponentFixture<RegionPillComponent>;
  let element: HTMLElement;
  let context: RegionContext;

  afterEach(() => {
    localStorage.removeItem(REGION_STORAGE_KEY);
    document.querySelectorAll('.cdk-overlay-container').forEach((node) => (node.innerHTML = ''));
  });

  beforeEach(async () => {
    localStorage.removeItem(REGION_STORAGE_KEY);
    status.set('anonymous');
    me.set(null);
    await TestBed.configureTestingModule({
      imports: [RegionPillComponent],
      providers: [
        { provide: SessionService, useValue: { status, me } },
        { provide: RegionsService, useValue: { listRegions: vi.fn(() => of(REGIONS_FIXTURE)) } },
        { provide: ShellLayout, useValue: { narrow: signal(false) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(RegionPillComponent);
    element = fixture.nativeElement as HTMLElement;
    context = TestBed.inject(RegionContext);
    await fixture.whenStable();
  });

  function pill(): HTMLButtonElement {
    return element.querySelector<HTMLButtonElement>('[data-testid="region-pill"]')!;
  }

  async function open(): Promise<HTMLButtonElement[]> {
    pill().click();
    // The popover is a lazy chunk: wait until it is on screen.
    for (let i = 0; i < 50 && !document.querySelector('.app-popover [role="radio"]'); i++) {
      await settle(fixture);
    }
    return Array.from(document.querySelectorAll<HTMLButtonElement>('.app-popover [role="radio"]'));
  }

  it('its lead names every place the region scopes, the community rooms too (WF leftover U12)', async () => {
    await open();
    expect(document.querySelector('#region-pop-lead')?.textContent?.trim()).toBe(
      'Home, Search, the map and the community rooms show one region at a time. Cards ship within a region.',
    );
  });

  it('names the browsed region and opens the three regions as radio rows', async () => {
    expect(pill().textContent).toContain('Americas (North)');
    expect(pill().getAttribute('aria-label')).toBe('Region: Americas (North). Change region');
    expect(pill().getAttribute('aria-haspopup')).toBe('dialog');
    const rows = await open();
    expect(pill().getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('.app-popover [role="dialog"] h2')?.textContent).toBe(
      'Choose a region',
    );
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'Americas (North), Canada, United States, Mexico',
      'Americas (South), Brazil, Argentina, Chile and more',
      'Europe, France, Germany, Spain and more',
    ]);
    expect(rows.map((row) => row.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    expect(document.activeElement).toBe(rows[0]);
    // Nobody is signed in: no row is "Your region".
    expect(document.body.textContent).not.toContain('Your region');
  });

  it('moves with the arrow keys, picks with Enter, closes, and focus returns to the pill', async () => {
    const rows = await open();
    rows[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(rows[1]);
    rows[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(rows[0]);
    rows[2].click();
    await settle(fixture);
    expect(context.current()).toBe('europe');
    expect(localStorage.getItem(REGION_STORAGE_KEY)).toBe('europe');
    expect(document.querySelector('.app-popover')).toBeNull();
    expect(document.activeElement).toBe(pill());
    expect(pill().getAttribute('aria-label')).toBe('Region: Europe. Change region');
  });

  it('keeps the focus inside while it is open (a modal popover or bottom sheet)', async () => {
    await open();
    const dialog = document.querySelector('.app-popover [role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    // The CDK focus trap's anchors wrap Tab and Shift+Tab around the popover.
    const anchors = document.querySelectorAll('.app-popover .cdk-focus-trap-anchor');
    expect(anchors.length).toBe(2);
    // Tab itself is walked in the browser (e2e/shell.spec.ts): jsdom has no layout.
  });

  it('closes on Esc', async () => {
    await open();
    document
      .querySelector('.app-popover')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle(fixture);
    expect(document.querySelector('.app-popover')).toBeNull();
    expect(pill().getAttribute('aria-expanded')).toBe('false');
  });

  it('marks the home region, and while browsing away turns orange with the way back', async () => {
    localStorage.setItem(REGION_STORAGE_KEY, 'europe');
    status.set('ready');
    me.set({ id: 'u-1', homeRegion: 'americas-south' });
    await settle(fixture);
    expect(pill().textContent).toContain('Americas (South)');
    const rows = await open();
    expect(rows[1].textContent).toContain('Your region · Brazil, Argentina, Chile and more');
    expect(document.querySelector('[data-testid="region-away"]')).toBeNull();
    rows[0].click();
    await settle(fixture);
    expect(context.browsingAway()).toBe(true);
    expect(pill().classList).toContain('pill--away');
    // Said in words too, never by the orange border alone (WCAG 1.4.1).
    expect(pill().getAttribute('aria-label')).toBe(
      'Region: Americas (North), not your region. Change region',
    );
    expect(pill().getAttribute('title')).toBe('Americas (North) · Not your region');
    // Browsing another region while signed in does not replace the browser's own choice.
    expect(localStorage.getItem(REGION_STORAGE_KEY)).toBe('europe');
    expect(await open()).toHaveLength(3);
    const away = document.querySelector('[data-testid="region-away"]')!;
    expect(away.textContent).toContain('Not your region.');
    away.querySelector('button')!.click();
    await settle(fixture);
    expect(context.current()).toBe('americas-south');
    expect(pill().classList).not.toContain('pill--away');
    expect(pill().getAttribute('aria-label')).toBe('Region: Americas (South). Change region');
  });
});
