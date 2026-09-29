import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  booleanAttribute,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { roundCoordinate } from '../../domain/location-labels';
import { ErrorStateComponent } from '../../ui/error-state/error-state.component';
import { SkeletonComponent } from '../../ui/skeleton/skeleton.component';
import { LatLng, MapAdapter, circleBounds } from '../../map/map-adapter';
import { MapAdapterFactory } from '../../map/map-adapter.factory';
import {
  CITY_PRESETS,
  CityPreset,
  MAX_RADIUS_KM,
  MIN_RADIUS_KM,
  zoomForRadius,
} from '../city-presets';

export type TradingAreaSource = 'MANUAL' | 'DEVICE';

/** What the picker edits: an approximate centre (3 decimals max) and a radius in km. */
export interface TradingAreaValue {
  lat: number;
  lng: number;
  radiusKm: number;
  source: TradingAreaSource;
}

type MapState = 'loading' | 'ready' | 'error';
type GeoState = 'idle' | 'locating' | 'done' | 'denied' | 'unavailable';

let nextId = 0;

/**
 * Trading-area picker on the MapAdapter (Leaflet/OpenStreetMap by default): click the map or
 * drag the pin to move the centre, slide the radius (1–50 km), jump to a city, or use the
 * browser's location. Coordinates are rounded to 3 decimals before they leave the component; the
 * server snaps them further and derives the public point (ADR 0004).
 */
@Component({
  selector: 'app-trading-area-picker',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatSliderModule,
    SkeletonComponent,
    ErrorStateComponent,
  ],
  templateUrl: './trading-area-picker.component.html',
  styleUrl: './trading-area-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TradingAreaPickerComponent {
  private readonly factory = inject(MapAdapterFactory);
  private readonly doc = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly mapHost = viewChild.required<ElementRef<HTMLElement>>('mapHost');

  readonly value = input.required<TradingAreaValue>();
  /** Region label the server derived for the saved area (e.g. "Plateau-Mont-Royal, Montréal"). */
  readonly publicLabel = input<string | null | undefined>(null);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly valueChange = output<TradingAreaValue>();

  protected readonly id = `trading-area-${nextId++}`;
  protected readonly presets = CITY_PRESETS;
  protected readonly minRadius = MIN_RADIUS_KM;
  protected readonly maxRadius = MAX_RADIUS_KM;
  protected readonly current = linkedSignal(() => this.value());
  protected readonly mapState = signal<MapState>('loading');
  protected readonly geoState = signal<GeoState>('idle');
  protected readonly formatKm = (value: number): string => `${value} km`;

  private adapter: MapAdapter | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    afterNextRender(() => void this.initMap());
    effect(() => this.render(this.current()));
    this.destroyRef.onDestroy(() => this.teardown());
  }

  /** (Re)creates the map; also the retry action of the error state. */
  async initMap(): Promise<void> {
    this.teardown();
    this.mapState.set('loading');
    const area = this.current();
    try {
      const adapter = await this.factory.create(this.mapHost().nativeElement, {
        center: { lat: area.lat, lng: area.lng },
        zoom: zoomForRadius(area.radiusKm),
        ariaLabel: 'Trading area map. Click to move the centre of your trading area.',
        scrollWheelZoom: false,
      });
      this.adapter = adapter;
      adapter.onMapClick((position) => this.moveCentre(position, 'MANUAL', false));
      adapter.onMarkerDragEnd((_id, position) => this.moveCentre(position, 'MANUAL', false));
      this.observeResize();
      this.mapState.set('ready');
      this.render(this.current());
      adapter.fitBounds(circleBounds(area, area.radiusKm * 1000));
    } catch (error) {
      console.warn('[OrenjiTrade] Map failed to load.', error);
      this.mapState.set('error');
    }
  }

  protected setRadius(radiusKm: number): void {
    const radius = Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, Math.round(radiusKm)));
    this.update({ ...this.current(), radiusKm: radius });
  }

  protected choosePreset(preset: CityPreset): void {
    this.update({
      lat: preset.center.lat,
      lng: preset.center.lng,
      radiusKm: preset.radiusKm,
      source: 'MANUAL',
    });
    this.focusMap();
  }

  protected useMapCentre(): void {
    if (this.adapter) {
      this.moveCentre(this.adapter.getViewport().center, 'MANUAL', false);
    }
  }

  protected useMyLocation(): void {
    const geolocation = this.doc.defaultView?.navigator?.geolocation;
    if (!geolocation) {
      this.geoState.set('unavailable');
      return;
    }
    this.geoState.set('locating');
    geolocation.getCurrentPosition(
      (position) => {
        this.geoState.set('done');
        this.moveCentre(
          { lat: position.coords.latitude, lng: position.coords.longitude },
          'DEVICE',
          true,
        );
      },
      (error) =>
        this.geoState.set(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  }

  private moveCentre(position: LatLng, source: TradingAreaSource, recentre: boolean): void {
    this.update({ ...this.current(), lat: position.lat, lng: position.lng, source });
    if (recentre) {
      this.focusMap();
    }
  }

  private update(next: TradingAreaValue): void {
    if (this.disabled()) {
      return;
    }
    const value: TradingAreaValue = {
      ...next,
      lat: roundCoordinate(next.lat),
      lng: roundCoordinate(next.lng),
    };
    this.current.set(value);
    this.valueChange.emit(value);
  }

  private focusMap(): void {
    const area = this.current();
    this.adapter?.fitBounds(circleBounds(area, area.radiusKm * 1000));
  }

  private render(area: TradingAreaValue): void {
    if (!this.adapter) {
      return;
    }
    const center = { lat: area.lat, lng: area.lng };
    this.adapter.setMarkers([
      {
        id: 'centre',
        position: center,
        title: 'Centre of your trading area (drag to move)',
        variant: 'centre',
        draggable: !this.disabled(),
      },
    ]);
    this.adapter.setCircles([{ id: 'area', center, radiusMeters: area.radiusKm * 1000 }]);
  }

  private observeResize(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    this.resizeObserver = new ResizeObserver(() => this.adapter?.invalidateSize());
    this.resizeObserver.observe(this.mapHost().nativeElement);
  }

  private teardown(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.adapter?.destroy();
    this.adapter = null;
  }
}
