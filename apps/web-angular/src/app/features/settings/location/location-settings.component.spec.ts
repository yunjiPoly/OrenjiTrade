import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { MyLocationResponse, RegionsService } from '@orenji/api-client';
import { of } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { LocationFieldsComponent } from '../../../shared/location/location-fields/location-fields.component';
import { ApiError } from '../../../core/http/api-error';
import { MyLocationStore } from '../../../shared/location/my-location.store';
import { REGIONS_FIXTURE } from '../../../shared/regions/testing/regions-fixtures';
import { LocationSettingsComponent } from './location-settings.component';

const SAVED: MyLocationResponse = {
  discoverable: true,
  location: {
    regionCode: 'americas-north',
    regionName: 'Americas (North)',
    countryCode: 'CA',
    countryName: 'Canada',
    subdivisionCode: 'CA-QC',
    subdivisionName: 'Quebec',
    label: 'Quebec, Canada',
    city: 'Montréal',
    showCity: true,
  },
};

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('LocationSettingsComponent', () => {
  let fixture: ComponentFixture<LocationSettingsComponent>;
  let element: HTMLElement;
  let store: {
    location: ReturnType<typeof signal<MyLocationResponse | null>>;
    error: ReturnType<typeof signal<ApiError | null>>;
    load: ReturnType<typeof vi.fn>;
    saveLocation: ReturnType<typeof vi.fn>;
    removeLocation: ReturnType<typeof vi.fn>;
    privacy: ReturnType<typeof signal<Record<string, unknown> | null>>;
    savePrivacy: ReturnType<typeof vi.fn>;
  };
  let confirm: boolean;

  async function mount(saved: MyLocationResponse, failure: ApiError | null = null): Promise<void> {
    store = {
      location: signal<MyLocationResponse | null>(failure ? null : saved),
      error: signal<ApiError | null>(failure),
      load: vi.fn(async () => !failure),
      saveLocation: vi.fn(async () => saved),
      removeLocation: vi.fn(async () => store.location.set({ discoverable: false })),
      privacy: signal<Record<string, unknown> | null>({ discoverable: true }),
      savePrivacy: vi.fn(async (settings: Record<string, unknown>) => settings),
    };
    TestBed.configureTestingModule({
      imports: [LocationSettingsComponent],
      providers: [
        provideRouter([]),
        { provide: MyLocationStore, useValue: store },
        { provide: RegionsService, useValue: { listRegions: vi.fn(() => of(REGIONS_FIXTURE)) } },
        {
          provide: SessionService,
          useValue: {
            status: signal('ready'),
            me: signal(null),
            handle: signal('sam_trades'),
            displayName: signal('Sam Tremblay'),
          },
        },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        {
          provide: MatDialog,
          useValue: { open: vi.fn(() => ({ afterClosed: () => of(confirm) })) },
        },
      ],
    });
    fixture = TestBed.createComponent(LocationSettingsComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
  }

  function fields(): LocationFieldsComponent {
    return fixture.debugElement.query((debug) => debug.name === 'app-location-fields')
      .componentInstance as LocationFieldsComponent;
  }

  function saveButton(): HTMLButtonElement {
    return element.querySelector<HTMLButtonElement>('[data-testid="location-save"]')!;
  }

  it('a load error reads in plain words with "Try again", never the server\'s text (WE review F9)', async () => {
    await mount(
      { discoverable: false },
      new ApiError({
        status: 500,
        errorCode: 'INTERNAL_ERROR',
        message: 'relation "user_location" does not exist',
        requestId: 'req-f9',
        fieldErrors: {},
      }),
    );
    const text = element.textContent ?? '';
    expect(text).toContain('We could not load your location');
    expect(text).not.toContain('user_location');
    const buttons = [...element.querySelectorAll('button')].map((b) => b.textContent ?? '');
    expect(buttons.some((label) => label.includes('Try again'))).toBe(true);
  });

  it('shows what others see, without any coordinate', async () => {
    await mount(SAVED);
    expect(element.querySelector('[data-testid="location-label"]')?.textContent).toContain(
      'Quebec, Canada',
    );
    expect(element.textContent).toContain('Americas (North)');
    expect(element.textContent).toContain('Visible on the map');
    // Nothing to save: aria-disabled (it keeps the focus, A4), never a native disabled.
    expect(saveButton().getAttribute('aria-disabled')).toBe('true');
    expect(element.textContent).not.toMatch(/\d+\.\d{3,}|\bkm\b/);
  });

  it('says what others see: the handle and the province, the city on the profile only (W25)', async () => {
    await mount(SAVED);
    const rows = [...element.querySelectorAll('.loc__others li')].map((row) =>
      [...row.querySelectorAll('.loc__name, .loc__place')]
        .map((part) => part.textContent?.trim())
        .join(' '),
    );
    expect(rows[0]).toContain('sam_trades Quebec');
    expect(rows[0]).not.toContain('Montréal');
    expect(rows[1]).toContain('Sam Tremblay Montréal, Quebec');
    expect(rows[2]).toContain('A collector Quebec');
    expect(rows[2]).not.toContain('Montréal');
  });

  it('answers 409 LOCATION_REQUIRED in place and puts the switch back', async () => {
    await mount({ discoverable: false });
    store.savePrivacy.mockRejectedValueOnce(
      new ApiError({
        status: 409,
        errorCode: 'LOCATION_REQUIRED',
        message: 'Location required',
        requestId: 'r1',
        fieldErrors: {},
      }),
    );
    const toggle = element.querySelector<HTMLButtonElement>(
      '[data-testid="location-discoverable"] button[role="switch"]',
    )!;
    toggle.click();
    await settle();
    fixture.detectChanges();
    expect(store.savePrivacy).toHaveBeenCalledWith({ discoverable: true });
    expect(element.textContent).toContain(
      'Choose your country and your state or province first, then turn this on.',
    );
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('saves an edited location', async () => {
    await mount(SAVED);
    fields().valueChange.emit({
      countryCode: 'CA',
      subdivisionCode: 'CA-ON',
      city: '',
      showCity: false,
    });
    fixture.detectChanges();
    expect(saveButton().getAttribute('aria-disabled')).toBeNull();
    saveButton().click();
    await settle();
    expect(store.saveLocation).toHaveBeenCalledWith({
      countryCode: 'CA',
      subdivisionCode: 'CA-ON',
      city: '',
      showCity: false,
    });
  });

  it('does not save without a state or province', async () => {
    await mount({ discoverable: false });
    expect(element.querySelector('[data-testid="location-none"]')).not.toBeNull();
    fields().valueChange.emit({ countryCode: 'CA', subdivisionCode: '', city: '', showCity: true });
    fixture.detectChanges();
    saveButton().click();
    await settle();
    fixture.detectChanges();
    expect(store.saveLocation).not.toHaveBeenCalled();
  });

  it('removes the location after a confirmation', async () => {
    await mount(SAVED);
    confirm = true;
    Array.from(element.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Remove my location'))!
      .click();
    await settle();
    fixture.detectChanges();
    expect(store.removeLocation).toHaveBeenCalled();
    expect(element.querySelector('[data-testid="location-none"]')).not.toBeNull();
  });

  function othersRows(): string[] {
    return [...element.querySelectorAll('.loc__others li')].map((row) =>
      [...row.querySelectorAll('.loc__name, .loc__place')]
        .map((part) => part.textContent?.trim())
        .join(' '),
    );
  }

  it('with "Show my city" off, your profile shows the province only (F2, M22)', async () => {
    await mount({ ...SAVED, location: { ...SAVED.location!, showCity: false } });
    const rows = othersRows();
    expect(rows[1]).toBe('Sam Tremblay Quebec');
    expect(element.querySelector('.loc__others')?.textContent).not.toContain('Montréal');
  });

  it('follows the form: an unsaved state and city switch show what saving them would show (U9)', async () => {
    await mount(SAVED);
    fields().valueChange.emit({
      countryCode: 'CA',
      subdivisionCode: 'CA-ON',
      city: 'Ottawa',
      showCity: true,
    });
    fixture.detectChanges();
    expect(othersRows()).toEqual([
      'sam_trades Ontario',
      'Sam Tremblay Ottawa, Ontario',
      'A collector Ontario',
    ]);
    fields().valueChange.emit({
      countryCode: 'CA',
      subdivisionCode: 'CA-ON',
      city: 'Ottawa',
      showCity: false,
    });
    fixture.detectChanges();
    expect(othersRows()[1]).toBe('Sam Tremblay Ontario');
  });

  it('hidden from the map: one line says nobody sees your place, no rows (P3)', async () => {
    await mount({ ...SAVED, discoverable: false });
    expect(element.querySelector('.loc__others')).toBeNull();
    expect(element.querySelector('[data-testid="location-others-hidden"]')?.textContent).toContain(
      'While you are hidden from the map, nobody sees your state, province or city.',
    );
    expect(element.textContent).not.toContain('Montréal, Quebec');
    expect(element.querySelector('[data-testid="location-show-city-line"]')?.textContent).toContain(
      'While you are hidden from the map, your profile shows no place.',
    );
  });

  it('without a location, "Show me on the map" says to choose one first (board W25)', async () => {
    await mount({ discoverable: false });
    expect(element.querySelector('#location-map-line')?.textContent).toContain(
      'Choose your country and state or province first. You need a location to show on the map.',
    );
  });

  it('the map switch keeps the focus while it saves (aria-disabled, never disabled; A4)', async () => {
    await mount(SAVED);
    let finish: () => void = () => undefined;
    store.savePrivacy.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    const toggle = element.querySelector<HTMLButtonElement>(
      '[data-testid="location-discoverable"] button[role="switch"]',
    )!;
    toggle.focus();
    toggle.click();
    fixture.detectChanges();
    expect(toggle.disabled).toBe(false);
    expect(toggle.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(toggle);
    finish();
    await settle();
  });

  it('the city switch says what each place shows (board W25)', async () => {
    await mount(SAVED);
    expect(element.querySelector('[data-testid="location-show-city-line"]')?.textContent).toContain(
      'Your profile shows Montréal, Quebec. Everywhere else shows Quebec only.',
    );
    expect(element.textContent).toContain(
      'Only on your profile, and only if you show it. Never used to locate you.',
    );
    expect(element.textContent).toContain(
      'Cards ship within a region. Home, Search and the map open on it.',
    );
  });
});
