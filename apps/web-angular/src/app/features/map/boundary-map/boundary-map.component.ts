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
  mapCountLine,
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
  steps: [string, string, string, string, string];
  line: string;
  outline: string;
  hover: string;
  selected: string;
  home: string;
}

/**
 * The region map (ADR 0017): Leaflet (lazy chunk) drawing the region's bundled boundary file with
 * no tile layer, states and provinces shaded by their number of public binders (`map.step0–4`,
 * spec 6.4; never by a card's holders). Hover: a 1.5 ink stroke and the tooltip "Ontario, Canada"
 * / "4 binders · 1 deck core"; the selected state a 2 px orange outline; the viewer's own province
 * always a 1.5 teal dashed outline; a state highlighted from the list an ink outline. Clicking one
 * emits its code; the page's accessible list offers the same choice by keyboard (the map itself
 * is focusable: arrows pan, + and − zoom). No coordinates are read from or sent to anyone: the
 * shapes are static assets.
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
  /** Public deck cores per subdivision code (among `counts`; the tooltip names them apart). */
  readonly deckCores = input<ReadonlyMap<string, number>>(new Map());
  readonly selected = input<string | null>(null);
  /** The viewer's declared province: a teal dashed outline, and the first view fits it. */
  readonly home = input<string | null>(null);
  /** A state hovered or focused in the list: an ink outline (nothing is fetched). */
  readonly highlight = input<string | null>(null);
  readonly label = input('Map of states and provinces');
  /** Leaflet's own zoom buttons and credit (Home); Search draws its own overlays instead. */
  readonly controls = input(true);
  readonly subdivisionSelected = output<string>();

  protected readonly status = signal<'loading' | 'ready' | 'error'>('loading');

  private L: LeafletModule | null = null;
  private map: Leaflet.Map | null = null;
  private outlines: Leaflet.GeoJSON | null = null;
  private shapes: Leaflet.GeoJSON | null = null;
  private homeLayer: Leaflet.GeoJSON | null = null;
  private subdivisionFeatures: BoundaryFeature[] = [];
  private hovered: string | null = null;
  private fittedHome = false;
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
      this.highlight();
      this.theme.resolved();
      untracked(() => this.restyle());
    });
    effect(() => {
      const home = this.home();
      untracked(() => {
        this.drawHome(home);
        if (home && this.map && !this.fittedHome && this.layers.has(home)) {
          this.fittedHome = true;
          this.fitHome(home);
        }
      });
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
        zoomControl: this.controls(),
        attributionControl: this.controls(),
        minZoom: 1,
        maxZoom: 9,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        worldCopyJump: false,
        keyboard: true,
      });
      if (this.controls()) {
        map.attributionControl.setPrefix(false);
        map.attributionControl.addAttribution(NATURAL_EARTH_CREDIT);
      }
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
    this.subdivisionFeatures = subdivisions;
    this.drawnRegion = region;
    const home = this.home();
    if (home && this.layers.has(home)) {
      this.fittedHome = true;
      this.fitHome(home);
    } else {
      this.fitRegion(region);
    }
    this.restyle();
    this.drawHome(home);
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
    path.on('mouseover', () => {
      this.hovered = code;
      this.restyleCode(code);
    });
    path.on('mouseout', () => {
      this.hovered = null;
      this.restyleCode(code);
    });
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
    const line = mapCountLine(this.counts().get(code), this.deckCores().get(code));
    const level = shadeLevel(this.counts().get(code));
    return `<strong>${escaped}</strong><br><span class="orenji-boundary-tooltip__swatch" data-level="${level}"></span>${line}`;
  }

  /** Zoom one step in or out (Search's own + and − buttons). */
  zoomIn(): void {
    this.map?.zoomIn();
  }

  zoomOut(): void {
    this.map?.zoomOut();
  }

  /** "Show my province": centres a declared province (never a device position) and its neighbours. */
  showCode(code: string | null): void {
    if (code && this.layers.has(code)) {
      this.fitHome(code);
    } else {
      this.fitRegion(this.region());
    }
  }

  private fitHome(code: string): void {
    const L = this.L;
    const map = this.map;
    const paths = this.layers.get(code);
    if (!L || !map || !paths?.length) {
      return;
    }
    let bounds: Leaflet.LatLngBounds | null = null;
    for (const path of paths) {
      const own = (path as unknown as Leaflet.Polygon).getBounds?.();
      if (own) {
        bounds = bounds
          ? bounds.extend(own)
          : L.latLngBounds(own.getSouthWest(), own.getNorthEast());
      }
    }
    if (bounds) {
      // The province and its neighbours (spec 6.4).
      map.fitBounds(bounds.pad(0.9), { animate: false });
    }
  }

  /** The teal dashed outline of the viewer's province, above every shape and not clickable. */
  private drawHome(code: string | null): void {
    this.homeLayer?.remove();
    this.homeLayer = null;
    const L = this.L;
    const map = this.map;
    if (!L || !map || !code) {
      return;
    }
    const features = this.subdivisionFeatures.filter((feature) => feature.properties.code === code);
    if (features.length === 0) {
      return;
    }
    const palette = this.palette();
    this.homeLayer = L.geoJSON(features as unknown as GeoJsonInput, {
      interactive: false,
      style: () => ({
        color: palette.home,
        weight: 1.5,
        dashArray: '4 3',
        fill: false,
        opacity: 1,
      }),
    }).addTo(map);
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
      steps: [
        token('--color-map-step0', '#2c2724'),
        token('--color-map-step1', '#5c3418'),
        token('--color-map-step2', '#8f4a1b'),
        token('--color-map-step3', '#c9661f'),
        token('--color-map-step4', '#ff8f3d'),
      ],
      line: token('--color-background', '#141210'),
      outline: token('--color-border-strong', '#808080'),
      hover: token('--color-ink', '#111111'),
      selected: token('--color-primary', '#f4761a'),
      home: token('--color-accent', '#2dd4bf'),
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
    this.outlines?.setStyle({ color: palette.outline, weight: 1, fill: false, opacity: 0.6 });
    this.drawHome(this.home());
  }

  private restyleCode(code: string, palette = this.palette()): void {
    const level = shadeLevel(this.counts().get(code));
    const selected = this.selected() === code;
    const traced = this.hovered === code || this.highlight() === code;
    for (const path of this.layers.get(code) ?? []) {
      path.setStyle({
        color: selected ? palette.selected : traced ? palette.hover : palette.line,
        weight: selected ? 2 : traced ? 1.5 : 0.8,
        opacity: 1,
        fillColor: palette.steps[level],
        fillOpacity: 1,
      });
      if (selected || traced) {
        path.bringToFront();
      }
    }
    this.homeLayer?.bringToFront();
  }
}
