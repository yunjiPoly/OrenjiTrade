import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import { BoundaryMapComponent } from '../../map/boundary-map/boundary-map.component';
import { SHADE_LEGEND, mapCountLine } from '../../map/data/boundaries';

/** "Map of public Yu-Gi-Oh! binders by state or province in Americas (North)" (spec 6.4). */
export function searchMapLabel(game: string, region: string): string {
  return `Map of public ${game} binders by state or province in ${region}`;
}

/**
 * Search's map pane (spec 6.4, boards W4 and W5): the region's bundled boundaries on the page's
 * background, no tiles, shaded by public binder count of the browsed game; "Show my province"
 * (the declared one, never a device) and zoom + and − at the top right, the legend "Public
 * binders · Yu-Gi-Oh!" at the bottom left, "Made with Natural Earth" at the bottom right. Wheel
 * zoom is on (the pane never scrolls the page); the map is focusable (arrows pan, + and − zoom).
 * Clicking a state lands in its binders (decision 15); below 960 it shows the phone's state card
 * with "See binders" instead (spec 16). No pins, no people.
 */
@Component({
  selector: 'app-search-map',
  imports: [BoundaryMapComponent, ShellIconComponent],
  template: `
    <app-boundary-map
      #map
      class="sm__map"
      [region]="region()"
      [counts]="counts()"
      [deckCores]="deckCores()"
      [names]="names()"
      [selected]="selected()"
      [home]="home()"
      [highlight]="highlight()"
      [controls]="false"
      [label]="label()"
      (subdivisionSelected)="onPick($event)"
    />
    <div class="sm__top">
      @if (home()) {
        <button type="button" class="sm__pill" (click)="map.showCode(home())">
          <app-shell-icon name="home" [size]="18" />
          Show my province
        </button>
      }
      <div class="sm__zoom" role="group" aria-label="Zoom">
        <button type="button" class="sm__zoom-btn" aria-label="Zoom in" (click)="map.zoomIn()">
          <app-shell-icon name="plus" [size]="20" />
        </button>
        <button type="button" class="sm__zoom-btn" aria-label="Zoom out" (click)="map.zoomOut()">
          <app-shell-icon name="minus" [size]="20" />
        </button>
      </div>
    </div>
    @if (card(); as code) {
      <div class="sm__card" role="region" aria-label="Chosen state or province">
        <div class="sm__card-text">
          <p class="sm__card-title">{{ names().get(code) ?? code }}</p>
          <p class="sm__card-line">{{ line(code) }}</p>
        </div>
        <button type="button" class="sm__card-go" (click)="seeBinders(code)">See binders</button>
        <button type="button" class="sm__card-close" aria-label="Close" (click)="card.set(null)">
          <app-shell-icon name="close" [size]="18" />
        </button>
      </div>
    } @else {
      <div class="sm__legend" aria-hidden="true">
        <p class="sm__legend-title">Public binders · {{ gameName() }}</p>
        <p class="sm__legend-scale">
          @for (step of legend; track step.level) {
            <span class="sm__legend-step"
              ><span class="sm__swatch" [attr.data-level]="step.level"></span>{{ step.label }}</span
            >
          }
        </p>
        @if (home()) {
          <p class="sm__legend-home"><span class="sm__dash"></span>Your province</p>
        }
      </div>
    }
    <p class="sm__credit">
      Made with
      <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>
    </p>
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      min-height: 320px;
      overflow: hidden;
      background: var(--color-background);
    }
    .sm__map {
      position: absolute;
      inset: 0;
    }
    .sm__top {
      position: absolute;
      top: 20px;
      right: 20px;
      z-index: 600;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 12px;
    }
    .sm__pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 36px;
      padding: 0 14px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-surface-elevated);
      color: var(--color-ink);
      font: inherit;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .sm__pill app-shell-icon {
      color: var(--color-accent);
    }
    .sm__zoom {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-input);
      background: var(--color-surface-elevated);
    }
    .sm__zoom-btn {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border: 0;
      background: transparent;
      color: var(--color-ink);
      cursor: pointer;
    }
    .sm__zoom-btn + .sm__zoom-btn {
      border-top: 1px solid var(--color-border);
    }
    .sm__legend {
      position: absolute;
      bottom: 20px;
      left: 20px;
      z-index: 600;
      padding: 12px 14px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-row);
      background: var(--color-surface-elevated);
      font-size: var(--font-size-meta);
    }
    .sm__legend p {
      margin: 0;
    }
    .sm__legend-title {
      margin-bottom: 8px !important;
      font-weight: var(--font-weight-semibold);
    }
    .sm__legend-scale {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      color: var(--color-text-secondary);
    }
    .sm__legend-step {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .sm__swatch {
      width: 12px;
      height: 12px;
      border: 1px solid var(--color-border);
      border-radius: 3px;
      background: var(--color-map-step0);
    }
    .sm__swatch[data-level='1'] {
      background: var(--color-map-step1);
    }
    .sm__swatch[data-level='2'] {
      background: var(--color-map-step2);
    }
    .sm__swatch[data-level='3'] {
      background: var(--color-map-step3);
    }
    .sm__swatch[data-level='4'] {
      background: var(--color-map-step4);
    }
    .sm__legend-home {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px !important;
      color: var(--color-text-secondary);
    }
    .sm__dash {
      width: 16px;
      border-top: 2px dashed var(--color-accent);
    }
    .sm__credit {
      position: absolute;
      right: 20px;
      bottom: 16px;
      z-index: 600;
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-tag);
    }
    .sm__credit a {
      color: inherit;
    }
    .sm__card {
      position: absolute;
      right: 12px;
      bottom: 40px;
      left: 12px;
      z-index: 650;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 12px 14px 16px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface-elevated);
      box-shadow: var(--elevation-menu);
    }
    .sm__card-text {
      flex: 1;
      min-width: 0;
    }
    .sm__card-title {
      margin: 0;
      font-weight: var(--font-weight-semibold);
    }
    .sm__card-line {
      margin: 2px 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-meta);
    }
    .sm__card-go {
      min-height: 40px;
      padding: 0 16px;
      border: 0;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: var(--color-on-primary);
      font: inherit;
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .sm__card-close {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--color-text-muted);
      cursor: pointer;
    }
    @media (max-width: 959.98px) {
      .sm__top {
        top: 12px;
        right: 12px;
      }
      /* One compact line at the bottom (board W29), off most of the map. */
      .sm__legend {
        right: 8px;
        bottom: 26px;
        left: 8px;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 10px;
        padding: 6px 10px;
      }
      .sm__legend-title,
      .sm__legend-home {
        margin: 0 !important;
      }
      .sm__legend-scale {
        gap: 8px;
      }
      .sm__credit {
        right: 10px;
        bottom: 6px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchMapComponent {
  readonly region = input.required<string>();
  readonly regionName = input('');
  readonly gameName = input('');
  readonly counts = input<ReadonlyMap<string, number>>(new Map());
  readonly deckCores = input<ReadonlyMap<string, number>>(new Map());
  readonly names = input<ReadonlyMap<string, string>>(new Map());
  readonly selected = input<string | null>(null);
  readonly home = input<string | null>(null);
  readonly highlight = input<string | null>(null);
  /** Below 960: a click shows the state card first (spec 16, the phone's way). */
  readonly stateCard = input(false);
  readonly picked = output<string>();

  protected readonly legend = SHADE_LEGEND;
  protected readonly card = signal<string | null>(null);
  protected readonly label = computed(() => searchMapLabel(this.gameName(), this.regionName()));
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected line(code: string): string {
    return mapCountLine(this.counts().get(code), this.deckCores().get(code));
  }

  protected onPick(code: string): void {
    if (this.stateCard()) {
      this.card.set(code);
      return;
    }
    this.picked.emit(code);
  }

  protected seeBinders(code: string): void {
    this.card.set(null);
    this.picked.emit(code);
  }

  /** Focus the map (the "Pick on the map" button): arrows pan, + and − zoom. */
  focus(): void {
    this.host.nativeElement.querySelector<HTMLElement>('.leaflet-container')?.focus();
  }
}
