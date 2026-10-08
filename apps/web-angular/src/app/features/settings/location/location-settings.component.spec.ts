import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { MyLocationResponse, RegionsService } from '@orenji/api-client';
import { of } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { LocationFieldsComponent } from '../../../shared/location/location-fields/location-fields.component';
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
    error: ReturnType<typeof signal<null>>;
    load: ReturnType<typeof vi.fn>;
    saveLocation: ReturnType<typeof vi.fn>;
    removeLocation: ReturnType<typeof vi.fn>;
  };
  let confirm: boolean;

  async function mount(saved: MyLocationResponse): Promise<void> {
    store = {
      location: signal<MyLocationResponse | null>(saved),
      error: signal(null),
      load: vi.fn(async () => true),
      saveLocation: vi.fn(async () => saved),
      removeLocation: vi.fn(async () => store.location.set({ discoverable: false })),
    };
    TestBed.configureTestingModule({
      imports: [LocationSettingsComponent],
      providers: [
        provideRouter([]),
        { provide: MyLocationStore, useValue: store },
        { provide: RegionsService, useValue: { listRegions: vi.fn(() => of(REGIONS_FIXTURE)) } },
        { provide: SessionService, useValue: { status: signal('ready'), me: signal(null) } },
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

  it('shows what others see, without any coordinate', async () => {
    await mount(SAVED);
    expect(element.querySelector('[data-testid="location-label"]')?.textContent).toContain(
      'Quebec, Canada',
    );
    expect(element.textContent).toContain('Americas (North)');
    expect(element.textContent).toContain('Visible on the map');
    expect(saveButton().disabled).toBe(true);
    expect(element.textContent).not.toMatch(/\d+\.\d{3,}|\bkm\b/);
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
    expect(saveButton().disabled).toBe(false);
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
      .find((button) => button.textContent?.includes('Remove location'))!
      .click();
    await settle();
    fixture.detectChanges();
    expect(store.removeLocation).toHaveBeenCalled();
    expect(element.querySelector('[data-testid="location-none"]')).not.toBeNull();
  });
});
