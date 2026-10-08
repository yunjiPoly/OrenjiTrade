import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSelect, MatSelectChange } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { By } from '@angular/platform-browser';
import { AdminRegionsService } from '@orenji/api-client';
import { of } from 'rxjs';
import { REGIONS_FIXTURE } from '../../../shared/regions/testing/regions-fixtures';
import { AdminRegionsPageComponent } from './admin-regions-page.component';

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
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
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
    expect(headings).toEqual([
      'Americas (North) americas-northDefault',
      'Americas (South) americas-south',
      'Europe europe',
    ]);
    expect(element.querySelectorAll('[data-country]')).toHaveLength(5);
  });

  it('moves a country to another region and saves it (audited by the API)', async () => {
    const row = element.querySelector('[data-country="PR"]')!;
    const save = () =>
      Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.includes('Save'))!;
    expect(save().disabled).toBe(true);
    const select = fixture.debugElement
      .queryAll(By.directive(MatSelect))
      .map((debug) => debug.componentInstance as MatSelect)[1];
    select.selectionChange.emit(new MatSelectChange(select, 'americas-south'));
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
  });
});
