import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SkeletonComponent } from '../../ui/skeleton/skeleton.component';
import {
  APPROXIMATE_AREA_RADIUS_M,
  COLLECTOR_MAP_MAX_ZOOM,
  approximateAreaCircle,
} from '../approximate-area';
import { LatLng, MapAdapter, circleBounds } from '../map-adapter';
import { MapAdapterFactory } from '../map-adapter.factory';

/**
 * Small map showing a collector's public point as an approximate area about 2 km wide (the shared
 * {@link APPROXIMATE_AREA_RADIUS_M} disc, never a pin on an address), never zoomed closer than
 * {@link COLLECTOR_MAP_MAX_ZOOM}. Uses the MapAdapter (Leaflet/OpenStreetMap unless a Google key
 * is configured).
 */
@Component({
  selector: 'app-approximate-area-map',
  imports: [MatIconModule, SkeletonComponent],
  template: `
    <div class="area-map">
      <div
        #host
        class="area-map__canvas"
        [class.area-map__canvas--hidden]="state() === 'error'"
      ></div>
      @if (state() === 'loading') {
        <div class="area-map__overlay">
          <span class="visually-hidden">Loading the map</span>
          <app-skeleton width="100%" height="100%" />
        </div>
      } @else if (state() === 'error') {
        <div class="area-map__overlay area-map__overlay--error">
          <mat-icon aria-hidden="true">map</mat-icon>
          <span>Map unavailable</span>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .area-map {
      position: relative;
      height: 200px;
      border-radius: var(--radius-md);
      overflow: hidden;
      border: 1px solid var(--color-border);
      background: var(--color-surface-variant);
    }
    .area-map__canvas {
      position: absolute;
      inset: 0;
      z-index: 0;
    }
    .area-map__canvas--hidden {
      visibility: hidden;
    }
    .area-map__overlay {
      position: absolute;
      inset: 0;
      z-index: 500;
      display: grid;
    }
    .area-map__overlay--error {
      place-content: center;
      justify-items: center;
      gap: var(--spacing-1);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApproximateAreaMapComponent {
  private readonly factory = inject(MapAdapterFactory);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');

  readonly point = input.required<LatLng>();
  readonly label = input('Approximate area');

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  private adapter: MapAdapter | null = null;

  constructor() {
    afterNextRender(() => void this.init());
    effect(() => this.render(this.point()));
    inject(DestroyRef).onDestroy(() => this.adapter?.destroy());
  }

  private async init(): Promise<void> {
    try {
      this.adapter = await this.factory.create(this.host().nativeElement, {
        center: this.point(),
        zoom: 12,
        ariaLabel: `Map of the approximate area: ${this.label()}`,
        scrollWheelZoom: false,
        maxZoom: COLLECTOR_MAP_MAX_ZOOM,
      });
      this.state.set('ready');
      this.render(this.point());
    } catch (error) {
      console.warn('[OrenjiTrade] Map failed to load.', error);
      this.state.set('error');
    }
  }

  private render(point: LatLng): void {
    if (!this.adapter) {
      return;
    }
    this.adapter.setCircles([approximateAreaCircle('approx', point, true)]);
    this.adapter.fitBounds(circleBounds(point, APPROXIMATE_AREA_RADIUS_M * 2.5), 8);
  }
}
