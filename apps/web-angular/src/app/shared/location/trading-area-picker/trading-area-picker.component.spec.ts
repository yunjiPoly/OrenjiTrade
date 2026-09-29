import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MapAdapterFactory } from '../../map/map-adapter.factory';
import { FakeMapAdapter } from '../../map/testing/fake-map-adapter';
import { TradingAreaPickerComponent, TradingAreaValue } from './trading-area-picker.component';

describe('TradingAreaPickerComponent', () => {
  let fixture: ComponentFixture<TradingAreaPickerComponent>;
  let adapter: FakeMapAdapter;
  let emitted: TradingAreaValue[];

  beforeEach(async () => {
    adapter = new FakeMapAdapter();
    emitted = [];
    TestBed.configureTestingModule({
      imports: [TradingAreaPickerComponent],
      providers: [{ provide: MapAdapterFactory, useValue: { create: async () => adapter } }],
    });
    fixture = TestBed.createComponent(TradingAreaPickerComponent);
    fixture.componentRef.setInput('value', {
      lat: 45.522,
      lng: -73.581,
      radiusKm: 5,
      source: 'MANUAL',
    } satisfies TradingAreaValue);
    fixture.componentRef.setInput('publicLabel', 'Plateau-Mont-Royal, Montréal');
    fixture.componentInstance.valueChange.subscribe((value) => emitted.push(value));
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  });

  it('draws the centre pin and the radius circle on the map', () => {
    expect(adapter.markers).toEqual([
      expect.objectContaining({
        id: 'centre',
        position: { lat: 45.522, lng: -73.581 },
        draggable: true,
      }),
    ]);
    expect(adapter.circles).toEqual([
      { id: 'area', center: { lat: 45.522, lng: -73.581 }, radiusMeters: 5000 },
    ]);
  });

  it('moves the centre on map clicks and rounds it to 3 decimals', async () => {
    adapter.click({ lat: 45.5012345, lng: -73.5678912 });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(emitted.at(-1)).toEqual({ lat: 45.501, lng: -73.568, radiusKm: 5, source: 'MANUAL' });
    expect(adapter.markers[0]?.position).toEqual({ lat: 45.501, lng: -73.568 });
  });

  it('moves the centre when the pin is dragged', () => {
    adapter.drag('centre', { lat: 45.53, lng: -73.6 });
    expect(emitted.at(-1)).toMatchObject({ lat: 45.53, lng: -73.6 });
  });

  it('jumps to a city preset with its suggested radius', () => {
    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.picker__preset'),
    ).find((b) => b.textContent?.trim() === 'Laval');
    button?.click();
    expect(emitted.at(-1)).toEqual({ lat: 45.606, lng: -73.712, radiusKm: 10, source: 'MANUAL' });
    expect(adapter.fitted.length).toBeGreaterThan(1);
  });

  it('uses the device position (source DEVICE) and explains the approximation', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({ coords: { latitude: 45.4987654, longitude: -73.5712345 } } as GeolocationPosition),
    );
    const nav = document.defaultView!.navigator;
    Object.defineProperty(nav, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    });
    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ).find((b) => b.textContent?.includes('Use my location'));
    button?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(emitted.at(-1)).toEqual({ lat: 45.499, lng: -73.571, radiusKm: 5, source: 'DEVICE' });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "We used your device's position only to centre the picker",
    );
    Reflect.deleteProperty(nav, 'geolocation');
  });

  it('shows the public label in the privacy explanation', () => {
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Others currently see: Plateau-Mont-Royal, Montréal',
    );
  });
});
