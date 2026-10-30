import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { BoundaryAssets, BoundaryCollection, mapCountLine } from '../map/data/boundaries';
import { MAP_CARD_SIZE, staticMap } from './static-map';

/**
 * Home's map card (spec 5.3, boards W1 and W2): a static SVG choropleth (280×168) of the browsed
 * region and game drawn from the bundled boundaries and the binder counts, without Leaflet; your
 * province with a teal dashed outline; "Quebec · your province" over "7 binders · 5 deck cores";
 * [Explore the map] (Search); the caption "Public Yu-Gi-Oh! binders in Americas (North)". No
 * pins, no people: states shaded by their binder counts only.
 */
@Component({
  selector: 'app-map-card',
  imports: [RouterLink],
  template: `
    <section class="mc" aria-labelledby="map-card-title" data-testid="home-map-card">
      <div class="mc__map">
        @if (drawing(); as map) {
          <svg
            class="mc__svg"
            [attr.viewBox]="viewBox"
            role="img"
            [attr.aria-label]="caption()"
            preserveAspectRatio="xMidYMid slice"
          >
            @for (shape of map.shapes; track $index) {
              <path class="mc__shape" [attr.data-level]="shape.level" [attr.d]="shape.d" />
            }
            @if (map.home) {
              <path class="mc__home" [attr.d]="map.home" />
            }
          </svg>
        } @else if (failed()) {
          <p class="mc__failed">
            The map could not load.
            <button type="button" class="mc__retry" (click)="retry()">Try again</button>
          </p>
        } @else {
          <span class="mc__bone" aria-hidden="true"></span>
        }
      </div>
      <h2 class="mc__title" id="map-card-title">
        @if (homeName(); as home) {
          {{ home }} · your province
        } @else {
          {{ regionName() }}
        }
      </h2>
      <p class="mc__line">{{ line() }}</p>
      <a class="mc__explore" routerLink="/search" [queryParams]="searchQuery()">Explore the map</a>
      <p class="mc__caption">{{ caption() }}</p>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .mc {
      padding: 20px;
      border: 1px solid var(--color-border);
      border-radius: 16px;
      background: var(--color-surface);
    }
    .mc__map {
      height: 168px;
      overflow: hidden;
      border-radius: 12px;
      background: var(--color-background);
    }
    .mc__svg {
      display: block;
      width: 100%;
      height: 168px;
    }
    .mc__shape {
      fill: var(--color-map-step0);
      stroke: var(--color-border-strong);
      stroke-width: 0.5;
    }
    .mc__shape[data-level='1'] {
      fill: var(--color-map-step1);
    }
    .mc__shape[data-level='2'] {
      fill: var(--color-map-step2);
    }
    .mc__shape[data-level='3'] {
      fill: var(--color-map-step3);
    }
    .mc__shape[data-level='4'] {
      fill: var(--color-map-step4);
    }
    .mc__home {
      fill: none;
      stroke: var(--color-accent);
      stroke-width: 1.5;
      stroke-dasharray: 4 3;
    }
    .mc__bone {
      display: block;
      height: 100%;
      background: var(--color-surface-variant);
    }
    .mc__failed {
      display: grid;
      place-content: center;
      gap: 8px;
      height: 100%;
      margin: 0;
      color: var(--color-text-muted);
      font-size: 13px;
      text-align: center;
    }
    .mc__retry {
      border: 0;
      background: none;
      color: var(--color-accent);
      font: inherit;
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .mc__title {
      margin: 16px 0 0;
      font-family: var(--font-body);
      font-size: 15px;
      font-weight: var(--font-weight-semibold);
    }
    .mc__line {
      margin: 2px 0 0;
      color: var(--color-text-secondary);
      font-size: 13px;
    }
    .mc__explore {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 40px;
      margin-top: 14px;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-pill);
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
      text-decoration: none;
    }
    .mc__explore:hover {
      background: var(--color-surface-variant);
    }
    .mc__caption {
      margin: 12px 0 0;
      color: var(--color-text-muted);
      font-size: 12px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapCardComponent {
  readonly region = input.required<string>();
  readonly regionName = input('');
  readonly gameName = input('');
  /** The viewer's state or province when it is in the browsed region (code and name). */
  readonly homeCode = input<string | null>(null);
  readonly homeName = input<string | null>(null);
  readonly counts = input<ReadonlyMap<string, number>>(new Map());
  readonly deckCores = input<ReadonlyMap<string, number>>(new Map());

  private readonly assets = inject(BoundaryAssets);
  private readonly collection = signal<{ region: string; data: BoundaryCollection } | null>(null);
  protected readonly failed = signal(false);
  protected readonly viewBox = `0 0 ${MAP_CARD_SIZE.width} ${MAP_CARD_SIZE.height}`;

  protected readonly drawing = computed(() => {
    const loaded = this.collection();
    if (!loaded || loaded.region !== this.region()) {
      return null;
    }
    return staticMap(loaded.data, loaded.region, this.counts(), this.homeCode());
  });
  protected readonly line = computed(() => {
    const home = this.homeCode();
    if (home) {
      return mapCountLine(this.counts().get(home), this.deckCores().get(home));
    }
    let total = 0;
    let cores = 0;
    this.counts().forEach((count) => (total += count));
    this.deckCores().forEach((count) => (cores += count));
    return mapCountLine(total, cores);
  });
  protected readonly caption = computed(
    () => `Public ${this.gameName()} binders in ${this.regionName()}`,
  );
  protected readonly searchQuery = computed(() => ({
    tab: 'binders',
    ...(this.homeCode() ? { state: this.homeCode() } : {}),
  }));

  constructor() {
    effect(() => {
      const region = this.region();
      untracked(() => void this.load(region));
    });
  }

  protected retry(): void {
    void this.load(this.region());
  }

  private async load(region: string): Promise<void> {
    this.failed.set(false);
    try {
      const data = await this.assets.load(region);
      if (region === this.region()) {
        this.collection.set({ region, data });
      }
    } catch {
      if (region === this.region()) {
        this.failed.set(true);
      }
    }
  }
}
