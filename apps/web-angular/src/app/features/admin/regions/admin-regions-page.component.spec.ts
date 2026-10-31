import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { AdminRegionsService } from '@orenji/api-client';
import { of } from 'rxjs';
import { REGIONS_FIXTURE } from '../../../shared/regions/testing/regions-fixtures';
import { ToastService } from '../../../core/feedback/toast.service';
import { AdminRegionsPageComponent, subdivisionWords } from './admin-regions-page.component';

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('AdminRegionsPageComponent', () => {
  let fixture: ComponentFixture<AdminRegionsPageComponent>;
  let element: HTMLElement;
  let api: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    api = {
      listAdminRegions: vi.fn(() => of(REGIONS_FIXTURE)),
      updateAdminRegionCountry: vi.fn(() => of({})),
    };
    TestBed.configureTestingModule({
      imports: [AdminRegionsPageComponent],
      providers: [
        { provide: AdminRegionsService, useValue: api },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: MatDialog, useValue: { open: vi.fn(() => ({ afterClosed: () => of(true) })) } },
      ],
    });
    fixture = TestBed.createComponent(AdminRegionsPageComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
  });

  it('lists every region with its countries and marks the default one', () => {
    const headings = Array.from(element.querySelectorAll('h2'), (h) =>
      h.textContent!.replace(/\s+/g, ' ').trim(),
    );
    // Regions are named, never shown by code (spec 15.2).
    expect(headings).toEqual(['Americas (North) Default', 'Americas (South)', 'Europe']);
    expect(element.textContent).not.toContain('americas-north');
    expect(element.querySelectorAll('[data-country]')).toHaveLength(5);
  });

  it('moves a country to another region and saves it (audited by the API)', async () => {
    const row = element.querySelector('[data-country="PR"]')!;
    const save = () =>
      Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.includes('Save'))!;
    expect(save().disabled).toBe(true);
    const select = row.querySelector<HTMLSelectElement>('select')!;
    select.value = 'americas-south';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(save().disabled).toBe(false);
    save().click();
    await settle();
    expect(api['updateAdminRegionCountry']).toHaveBeenCalledWith(
      { code: 'PR', countryRegionRequest: { regionCode: 'americas-south', active: true } },
      'body',
      false,
      expect.anything(),
    );
    expect(api['listAdminRegions']).toHaveBeenCalledTimes(2);
    // Moving a country confirmed first.
    expect(TestBed.inject(MatDialog).open).toHaveBeenCalled();
  });

  it('reads subdivision counts as board A19 does', () => {
    expect(subdivisionWords('CA', 13)).toBe('13 provinces and territories');
    expect(subdivisionWords('US', 51)).toBe('50 states and DC');
    expect(subdivisionWords('MX', 32)).toBe('32 states');
    expect(subdivisionWords('BZ', 6)).toBe('6 subdivisions');
    expect(subdivisionWords('XX', 1)).toBe('1 subdivision');
  });
});
