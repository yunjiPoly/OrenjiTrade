import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MeResponse, RegionsService } from '@orenji/api-client';
import { of } from 'rxjs';
import { REGIONS_FIXTURE } from '../../../shared/regions/testing/regions-fixtures';
import { SessionService, SessionStatus } from '../../auth/session.service';
import { REGION_STORAGE_KEY, RegionContext } from '../../region/region-context.service';
import { RegionSwitcherComponent } from './region-switcher.component';

describe('RegionSwitcherComponent', () => {
  const status = signal<SessionStatus>('anonymous');
  const me = signal<Partial<MeResponse> | null>(null);
  let fixture: ComponentFixture<RegionSwitcherComponent>;
  let element: HTMLElement;
  let context: RegionContext;

  beforeEach(async () => {
    localStorage.clear();
    status.set('anonymous');
    me.set(null);
    await TestBed.configureTestingModule({
      imports: [RegionSwitcherComponent],
      providers: [
        { provide: SessionService, useValue: { status, me } },
        { provide: RegionsService, useValue: { listRegions: vi.fn(() => of(REGIONS_FIXTURE)) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(RegionSwitcherComponent);
    element = fixture.nativeElement as HTMLElement;
    context = TestBed.inject(RegionContext);
    await fixture.whenStable();
  });

  function trigger(): HTMLButtonElement {
    return element.querySelector<HTMLButtonElement>('[data-testid="region-switcher"]')!;
  }

  async function openMenu(): Promise<HTMLButtonElement[]> {
    trigger().click();
    await fixture.whenStable();
    return Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
  }

  it('names the browsed region and offers the three platform regions', async () => {
    expect(trigger().textContent).toContain('Americas (North)');
    expect(trigger().getAttribute('aria-label')).toBe('Region: Americas (North). Change region');

    const options = await openMenu();
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      expect.stringContaining('Americas (North)'),
      expect.stringContaining('Americas (South)'),
      expect.stringContaining('Europe'),
    ]);
    expect(options.map((option) => option.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    // Nobody is signed in: no option is marked as "your region".
    expect(document.body.textContent).not.toContain('your region');
  });

  it('lets a signed-out visitor pick another region, remembered on this browser', async () => {
    const options = await openMenu();
    options.find((option) => option.textContent?.includes('Europe'))!.click();
    await fixture.whenStable();

    expect(context.current()).toBe('europe');
    expect(localStorage.getItem(REGION_STORAGE_KEY)).toBe('europe');
    expect(trigger().textContent).toContain('Europe');
    expect(trigger().getAttribute('aria-label')).toBe('Region: Europe. Change region');
  });

  it('starts a signed-in collector in their home region and marks it in the menu', async () => {
    localStorage.setItem(REGION_STORAGE_KEY, 'europe');
    status.set('ready');
    me.set({ id: 'u-1', homeRegion: 'americas-south' });
    await fixture.whenStable();
    expect(trigger().textContent).toContain('Americas (South)');

    const options = await openMenu();
    const home = options.find((option) => option.textContent?.includes('Americas (South)'))!;
    expect(home.getAttribute('aria-checked')).toBe('true');
    expect(home.textContent).toContain('your region');

    // Browsing another region while signed in does not replace the browser's own choice.
    options.find((option) => option.textContent?.includes('Americas (North)'))!.click();
    await fixture.whenStable();
    expect(context.current()).toBe('americas-north');
    expect(context.browsingAway()).toBe(true);
    expect(localStorage.getItem(REGION_STORAGE_KEY)).toBe('europe');
    expect(trigger().textContent).toContain('Americas (North)');
  });
});
