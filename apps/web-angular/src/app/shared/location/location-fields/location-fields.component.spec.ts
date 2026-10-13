import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSelect, MatSelectChange } from '@angular/material/select';
import { By } from '@angular/platform-browser';
import { RegionsService } from '@orenji/api-client';
import { of } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { REGIONS_FIXTURE } from '../../regions/testing/regions-fixtures';
import { LocationDraft } from '../my-location.store';
import { LocationFieldsComponent } from './location-fields.component';

async function settle(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('LocationFieldsComponent', () => {
  let fixture: ComponentFixture<LocationFieldsComponent>;
  let element: HTMLElement;
  let emitted: LocationDraft[];

  async function mount(value: LocationDraft | null): Promise<void> {
    TestBed.configureTestingModule({
      imports: [LocationFieldsComponent],
      providers: [
        { provide: RegionsService, useValue: { listRegions: vi.fn(() => of(REGIONS_FIXTURE)) } },
        { provide: SessionService, useValue: { status: signal('ready'), me: signal(null) } },
      ],
    });
    fixture = TestBed.createComponent(LocationFieldsComponent);
    fixture.componentRef.setInput('value', value);
    emitted = [];
    fixture.componentInstance.valueChange.subscribe((draft) => emitted.push(draft));
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  }

  function selects(): MatSelect[] {
    return fixture.debugElement
      .queryAll(By.directive(MatSelect))
      .map((debug) => debug.componentInstance as MatSelect);
  }

  function choose(select: MatSelect, value: string): void {
    select.selectionChange.emit(new MatSelectChange(select, value));
    fixture.detectChanges();
  }

  it('offers region, country and state pickers fed by GET /regions, never a map or GPS', async () => {
    await mount(null);
    expect(element.querySelector('[data-testid="location-region"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="location-country"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="location-subdivision"]')).not.toBeNull();
    expect(element.querySelector('.leaflet-container')).toBeNull();
    expect(element.textContent).toContain('Only shown on your profile, never used to locate you.');
    const [region, country] = selects();
    expect(region.value).toBe('americas-north');
    expect(country.value).toBeNull();
  });

  it('emits the chosen country and state, resets the state with the country', async () => {
    await mount(null);
    const [, country] = selects();
    choose(country, 'CA');
    expect(emitted.at(-1)).toEqual({
      countryCode: 'CA',
      subdivisionCode: '',
      city: '',
      showCity: true,
    });
    choose(selects()[2], 'CA-QC');
    expect(emitted.at(-1)?.subdivisionCode).toBe('CA-QC');
    choose(selects()[1], 'US');
    expect(emitted.at(-1)).toMatchObject({ countryCode: 'US', subdivisionCode: '' });
  });

  it('picks the single pseudo-subdivision of a territory with its country', async () => {
    await mount(null);
    choose(selects()[1], 'PR');
    expect(emitted.at(-1)).toMatchObject({ countryCode: 'PR', subdivisionCode: 'PR' });
    expect(element.querySelector('[data-testid="location-subdivision"]')).toBeNull();
  });

  it('lists the countries of another region and clears a country of the old one', async () => {
    await mount({ countryCode: 'CA', subdivisionCode: 'CA-QC', city: 'Montréal', showCity: true });
    const [region] = selects();
    expect(region.value).toBe('americas-north');
    choose(region, 'europe');
    expect(emitted.at(-1)).toEqual({
      countryCode: '',
      subdivisionCode: '',
      city: 'Montréal',
      showCity: true,
    });
    const options = selects()[1].options.map((option) => option.value);
    expect(options).toEqual(['FR']);
  });

  it('caps the city at 80 characters and toggles "show my city"', async () => {
    await mount({ countryCode: 'CA', subdivisionCode: 'CA-QC', city: '', showCity: true });
    const city = element.querySelector<HTMLInputElement>('[data-testid="location-city"]')!;
    city.value = 'x'.repeat(95);
    city.dispatchEvent(new Event('input'));
    expect(emitted.at(-1)?.city).toHaveLength(80);
    const toggle = element.querySelector<HTMLButtonElement>(
      '[data-testid="location-show-city"] button',
    )!;
    toggle.click();
    fixture.detectChanges();
    expect(emitted.at(-1)?.showCity).toBe(false);
  });

  it('explains what is missing once errors are shown', async () => {
    await mount({ countryCode: 'CA', subdivisionCode: '', city: '', showCity: true });
    expect(element.querySelector('[role="alert"]')).toBeNull();
    fixture.componentRef.setInput('showErrors', true);
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Choose your state or province.',
    );
  });
});
