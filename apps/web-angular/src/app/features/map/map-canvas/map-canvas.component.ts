import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import {
  LatLng,
  MapAdapter,
  MapCircle,
  MapMarker,
  MapViewport,
} from '../../../shared/map/map-adapter';
import { MapAdapterFactory } from '../../../shared/map/map-adapter.factory';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import type { MapViewRequest } from '../data/map-discovery.store';

/**
 * The discovery map itself: a MapAdapter (Leaflet/OpenStreetMap unless a Google key is
 * configured) that draws the given markers and circle, follows view requests and reports
 * viewport changes and marker activations (click, Enter or Space on a focused marker).
 */
@Component({
  selector: 'app-map-canvas',
  imports: [MatButtonModule, MatIconModule, SkeletonComponent],
  template: `
    <div
      #host
      class="canvas__map"
      data-testid="discovery-map"
      [class.canvas__map--hidden]="state() === 'error'"
    ></div>
    @if (state() === 'loading') {
      <div class="canvas__overlay">
        <span class="visually-hidden">Loading the map</span>
        <app-skeleton width="100%" height="100%" />
      </div>
    } @else if (state() === 'error') {
      <div class="canvas__overlay canvas__overlay--error" role="alert">
        <mat-icon aria-hidden="true">map</mat-icon>
        <p>The map could not load. The list view still works.</p>
        <button matButton="tonal" type="button" (click)="reload()">Try again</button>
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      background: var(--color-surface-variant);
    }
    .canvas__map {
      position: absolute;
      inset: 0;
      z-index: 0;
    }
    .canvas__map--hidden {
      visibility: hidden;
    }
    .canvas__overlay {
      position: absolute;
      inset: 0;
      z-index: 400;
      display: grid;
    }
    .canvas__overlay--error {
      place-content: center;
      justify-items: center;
      gap: var(--spacing-2);
      color: var(--color-text-muted);
      text-align: center;
    }
    .canvas__overlay--error mat-icon {
      width: 40px;
      height: 40px;
      font-size: 40px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapCanvasComponent {
  private readonly factory = inject(MapAdapterFactory);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');

  readonly markers = input<readonly MapMarker[]>([]);
  readonly circle = input<MapCircle | null>(null);
  /** Where to move (a new `seq` moves again). */
  readonly view = input<MapViewRequest | null>(null);
  /** Initial centre until a view request arrives. */
  readonly fallbackCentre = input.required<LatLng>();
  readonly fallbackZoom = input(11);
  readonly label = input('Map of collectors near you');

  readonly viewportChange = output<MapViewport>();
  readonly markerActivate = output<string>();

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  private adapter: MapAdapter | null = null;
  private appliedSeq = 0;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    afterNextRender(() => void this.init());
    effect(() => {
      const markers = this.markers();
      untracked(() => this.adapter?.setMarkers(markers));
    });
    effect(() => {
      const circle = this.circle();
      untracked(() => this.adapter?.setCircles(circle ? [circle] : []));
    });
    effect(() => {
      const view = this.view();
      untracked(() => this.apply(view));
    });
    inject(DestroyRef).onDestroy(() => {
      this.resizeObserver?.disconnect();
      this.adapter?.destroy();
      this.adapter = null;
    });
  }

  protected reload(): void {
    this.state.set('loading');
    void this.init();
  }

  private async init(): Promise<void> {
    const view = this.view();
    try {
      const container = this.host().nativeElement;
      container.replaceChildren();
      this.adapter = await this.factory.create(container, {
        center: view?.centre ?? this.fallbackCentre(),
        zoom: view?.zoom ?? this.fallbackZoom(),
        ariaLabel: this.label(),
        scrollWheelZoom: true,
        zoomControlPosition: 'bottomright',
      });
    } catch (error) {
      console.warn('[OrenjiTrade] Map failed to load.', error);
      this.state.set('error');
      return;
    }
    const adapter = this.adapter;
    this.state.set('ready');
    this.appliedSeq = view?.centre && !view.bounds ? view.seq : 0;
    adapter.onViewportChange((viewport) => this.viewportChange.emit(viewport));
    adapter.onMarkerClick((id) => this.markerActivate.emit(id));
    adapter.setMarkers(this.markers());
    const circle = this.circle();
    adapter.setCircles(circle ? [circle] : []);
    this.apply(this.view());
    this.viewportChange.emit(adapter.getViewport());
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => adapter.invalidateSize());
      this.resizeObserver.observe(this.host().nativeElement);
    }
  }

  private apply(view: MapViewRequest | null): void {
    if (!this.adapter || !view || view.seq === this.appliedSeq) {
      return;
    }
    this.appliedSeq = view.seq;
    if (view.bounds) {
      this.adapter.fitBounds(view.bounds, 32);
    } else if (view.centre) {
      this.adapter.setView(view.centre, view.zoom);
    }
  }
}
