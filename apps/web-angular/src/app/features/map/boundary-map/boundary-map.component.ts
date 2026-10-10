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
import { DOCUMENT } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import type * as Leaflet from 'leaflet';
import { ThemeService } from '../../../core/theme/theme.service';
import {
  BoundaryAssets,
  BoundaryCollection,
  BoundaryFeature,
  REGION_VIEW,
  SHADE_OPACITY,
  binderCountLabel,
  shadeLevel,
} from '../data/boundaries';

type LeafletModule = typeof Leaflet;
type GeoJsonInput = Parameters<LeafletModule['geoJSON']>[0];

/** Non-injected global style bundle emitted by angular.json (`bundleName: leaflet`). */
const LEAFLET_CSS_HREF = 'leaflet.css';
const CSS_MARKER_ATTR = 'data-orenji-leaflet-css';
const NATURAL_EARTH_CREDIT =
  'Made with <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>';

async function loadLeaflet(): Promise<LeafletModule> {
  const mod = (await import('leaflet')) as unknown as LeafletModule & { default?: LeafletModule };
  return mod.default ?? mod;
}

/** Adds Leaflet's stylesheet once; resolves when loaded (or after a short grace period). */
function ensureLeafletCss(doc: Document): Promise<void> {
  if (doc.querySelector(`link[${CSS_MARKER_ATTR}]`)) {
    return Promise.resolve();
  }
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = LEAFLET_CSS_HREF;
  link.setAttribute(CSS_MARKER_ATTR, '');
  return new Promise((resolve) => {
    const done = () => resolve();
    link.addEventListener('load', done, { once: true });
    link.addEventListener('error', done, { once: true });
    setTimeout(done, 1500);
    doc.head.appendChild(link);
  });
}

interface Palette {
  fill: string;
  empty: string;
  line: string;
  outline: string;
  selected: string;
}

/**
 * The region map (ADR 0017): Leaflet (lazy chunk) drawing the region's bundled boundary file with
 * no tile layer, states and provinces shaded by their number of public binders. Clicking one emits
 * its code; the page's accessible list offers the same choice by keyboard. No coordinates are
 * read from or sent to anyone: the shapes are static assets.
 */
@Component({
  selector: 'app-boundary-map',
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <div
      #canvas
      class="bmap__canvas"
      data-testid="boundary-map"
      [attr.aria-label]="label()"
      aria-describedby="boundary-map-hint"
    ></div>
    <p id="boundary-map-hint" class="visually-hidden">
      Use the list of states and provinces to choose one with the keyboard.
    </p>
    @if (status() === 'loading') {
      <mat-progress-bar class="bmap__progress" mode="indeterminate" aria-label="Loading the map" />
    } @else if (status() === 'error') {
      <div class="bmap__error" role="alert">
        <mat-icon aria-hidden="true">cloud_off</mat-icon>
        <span>The map could not be drawn. The list still works.</span>
        <button matButton type="button" (click)="retry()">Retry</button>
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      min-height: 240px;
    }
    .bmap__canvas {
      position: absolute;
      inset: 0;
    }
    .bmap__progress {
      position: absolute;
      inset: 0 0 auto;
      z-index: 500;
    }
    .bmap__error {
      position: absolute;
      inset: auto var(--spacing-3) var(--spacing-3);
      z-index: 500;
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      padding: var(--spacing-2) var(--spacing-3);
      border-radius: var(--radius-lg);
      background: var(--color-surface-elevated);
      box-shadow: var(--elevation-menu);
      color: var(--color-ink);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoundaryMapComponent {
  private readonly document = inject(DOCUMENT);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly assets = inject(BoundaryAssets);
  private readonly theme = inject(ThemeService);
  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');

  /** Platform region whose boundaries are drawn. */
  readonly region = input.required<string>();
  /** Public binders per subdivision code. */
  readonly counts = input<ReadonlyMap<string, number>>(new Map());
  /** Display label per subdivision code ("Quebec, Canada"). */
  readonly names = input<ReadonlyMap<string, string>>(new Map());
  readonly selected = input<string | null>(null);
  readonly label = input('Map of states and provinces');
  readonly subdivisionSelected = output<string>();

  protected readonly status = signal<'loading' | 'ready' | 'error'>('loading');

  private L: LeafletModule | null = null;
  private map: Leaflet.Map | null = null;
  private outlines: Leaflet.GeoJSON | null = null;
  private shapes: Leaflet.GeoJSON | null = null;
  private readonly layers = new Map<string, Leaflet.Path[]>();
  private drawnRegion: string | null = null;
  private drawRequest = 0;
  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;

  constructor() {
    afterNextRender(() => void this.init());
    effect(() => {
      const region = this.region();
      untracked(() => {
        if (this.map && region !== this.drawnRegion) {
          void this.draw(region);
        }
      });
    });
    effect(() => {
      this.counts();
      this.names();
      this.selected();
      this.theme.resolved();
      untracked(() => this.restyle());
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.resizeObserver?.disconnect();
      this.map?.remove();
      this.map = null;
    });
  }

  protected retry(): void {
    if (this.map) {
      void this.draw(this.region());
    } else {
      void this.init();
    }
  }

  private async init(): Promise<void> {
    this.status.set('loading');
    try {
      const [L] = await Promise.all([loadLeaflet(), ensureLeafletCss(this.document)]);
      if (this.destroyed) {
        return;
      }
      this.L = L;
      const map = L.map(this.canvas().nativeElement, {
        zoomControl: true,
        attributionControl: true,
        minZoom: 1,
        maxZoom: 9,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        worldCopyJump: false,
        keyboard: true,
      });
      map.attributionControl.setPrefix(false);
      map.attributionControl.addAttribution(NATURAL_EARTH_CREDIT);
      this.map = map;
      this.fitRegion(this.region());
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.map?.invalidateSize());
        this.resizeObserver.observe(this.host.nativeElement);
      }
      await this.draw(this.region());
    } catch {
      if (!this.destroyed) {
        this.status.set('error');
      }
    }
  }

  private async draw(region: string): Promise<void> {
    const L = this.L;
    const map = this.map;
    if (!L || !map) {
      return;
    }
    const request = ++this.drawRequest;
    this.status.set('loading');
    let collection: BoundaryCollection;
    try {
      collection = await this.assets.load(region);
    } catch {
      if (request === this.drawRequest && !this.destroyed) {
        this.status.set('error');
      }
      return;
    }
    if (request !== this.drawRequest || this.destroyed) {
      return;
    }
    this.shapes?.remove();
    this.outlines?.remove();
    this.layers.clear();
    const subdivisions = collection.features.filter(
      (feature) => feature.properties.kind === 'subdivision' && feature.properties.code,
    );
    const countries = collection.features.filter(
      (feature) => feature.properties.kind === 'country',
    );
    this.shapes = L.geoJSON(subdivisions as unknown as GeoJsonInput, {
      onEachFeature: (feature, layer) => this.bind(feature as unknown as BoundaryFeature, layer),
    }).addTo(map);
    this.outlines = L.geoJSON(countries as unknown as GeoJsonInput, {
      interactive: false,
    }).addTo(map);
    this.drawnRegion = region;
    this.fitRegion(region);
    this.restyle();
    this.status.set('ready');
  }

  private bind(feature: BoundaryFeature, layer: Leaflet.Layer): void {
    const code = feature.properties.code;
    if (!code) {
      return;
    }
    const path = layer as Leaflet.Path;
    const list = this.layers.get(code) ?? [];
    list.push(path);
    this.layers.set(code, list);
    path.bindTooltip(() => this.tooltip(code), {
      sticky: true,
      direction: 'top',
      className: 'orenji-boundary-tooltip',
    });
    path.on('click', () => this.subdivisionSelected.emit(code));
    path.on('mouseover', () => path.setStyle({ weight: 2 }));
    path.on('mouseout', () => this.restyleCode(code));
    // The subdivision code (never a coordinate) identifies the shape for styles and tests.
    path.on('add', () => {
      const element = path.getElement();
      element?.classList.add('orenji-boundary');
      element?.setAttribute('data-code', code);
    });
  }

  private tooltip(code: string): string {
    const name = this.names().get(code) ?? code;
    const escaped = name.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    return `<strong>${escaped}</strong><br>${binderCountLabel(this.counts().get(code))}`;
  }

  private fitRegion(region: string): void {
    const view = REGION_VIEW[region];
    if (this.map && view) {
      this.map.fitBounds(view, { animate: false });
    }
  }

  private palette(): Palette {
    const styles = getComputedStyle(this.host.nativeElement);
    const token = (name: string, fallback: string) =>
      styles.getPropertyValue(name).trim() || fallback;
    return {
      fill: token('--color-primary', '#e8590c'),
      empty: token('--color-surface', '#ffffff'),
      line: token('--color-border', '#d0d0d0'),
      outline: token('--color-border-strong', '#808080'),
      selected: token('--color-ink', '#111111'),
    };
  }

  private restyle(): void {
    if (!this.shapes) {
      return;
    }
    const palette = this.palette();
    for (const code of this.layers.keys()) {
      this.restyleCode(code, palette);
    }
    this.outlines?.setStyle({ color: palette.outline, weight: 1.2, fill: false, opacity: 0.9 });
  }

  private restyleCode(code: string, palette = this.palette()): void {
    const level = shadeLevel(this.counts().get(code));
    const selected = this.selected() === code;
    for (const path of this.layers.get(code) ?? []) {
      path.setStyle({
        color: selected ? palette.selected : palette.line,
        weight: selected ? 2.5 : 0.6,
        opacity: 1,
        fillColor: level === 0 ? palette.empty : palette.fill,
        fillOpacity: level === 0 ? 1 : SHADE_OPACITY[level],
      });
      if (selected) {
        path.bringToFront();
      }
    }
  }
}
