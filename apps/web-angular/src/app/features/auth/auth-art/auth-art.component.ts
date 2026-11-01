import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  ShellIconComponent,
  ShellIconName,
} from '../../../core/layout/shell-icon/shell-icon.component';
import { BoundaryAssets, BoundaryCollection, ShadeLevel } from '../../map/data/boundaries';
import { DrawingSize, staticMap } from '../../home/static-map';

/** The picture's drawing size: North America, portrait (board W27's right panel). */
export const AUTH_ART_SIZE: DrawingSize = { width: 600, height: 640 };

/** The part of Americas (North) the picture frames: Canada, the United States and Mexico. */
export const AUTH_ART_FRAME = [
  [14, -142],
  [78, -50],
] as const;

/**
 * The picture's states and provinces in the map's five steps: a fixed pattern, never live data
 * (spec 14: "a decorative choropleth of Americas (North) in the five steps, a fixed pattern with
 * no live data"). The numbers only pick a step; nothing here counts anyone's binders.
 */
export const AUTH_ART_PATTERN: ReadonlyMap<string, number> = new Map<string, number>([
  ['CA-QC', 12],
  ['CA-ON', 7],
  ['CA-BC', 3],
  ['CA-AB', 1],
  ['CA-MB', 1],
  ['CA-NS', 3],
  ['US-CA', 3],
  ['US-WA', 1],
  ['US-OR', 3],
  ['US-TX', 3],
  ['US-AZ', 1],
  ['US-CO', 1],
  ['US-IL', 7],
  ['US-MI', 3],
  ['US-NY', 3],
  ['US-PA', 1],
  ['US-FL', 3],
  ['US-GA', 1],
  ['MX-JAL', 3],
  ['MX-CMX', 1],
]);

/** The three lines beside the picture (board W27). */
export const AUTH_ART_POINTS: readonly { icon: ShellIconName; text: string }[] = [
  {
    icon: 'map',
    text: 'Collectors find binders by state or province. You choose yours; the app never locates you.',
  },
  {
    icon: 'messageSquare',
    text: 'Deals happen in the chat. Cards ship by mail, and the buyer pays by e-Transfer outside the app.',
  },
  {
    icon: 'eyeOff',
    text: 'Your binders join the map only when you turn on “Show me on the map”. It’s free for every collector.',
  },
];

const LEGEND: readonly ShadeLevel[] = [0, 1, 2, 3, 4];

/**
 * The right panel of the sign-in pages at 960 and wider (spec 14, board W27): "Who in my region
 * has this card?" (Sora 30), three lines about how OrenjiTrade works, and a decorative choropleth
 * of Americas (North) drawn from the bundled boundaries in the map's five steps with a fixed
 * pattern (hidden from screen readers, as its legend). No live data, no request to the API.
 */
@Component({
  selector: 'app-auth-art',
  imports: [ShellIconComponent],
  template: `
    <div class="art" data-testid="auth-art">
      <div class="art__words">
        <h2 class="art__title">Who in my region has this card?</h2>
        <ul class="art__points">
          @for (point of points; track point.icon) {
            <li class="art__point">
              <span class="art__icon" aria-hidden="true">
                <app-shell-icon [name]="point.icon" [size]="18" />
              </span>
              <span>{{ point.text }}</span>
            </li>
          }
        </ul>
      </div>
      <div class="art__map" aria-hidden="true">
        @if (drawing(); as map) {
          <svg
            class="art__svg"
            [attr.viewBox]="viewBox"
            preserveAspectRatio="xMidYMid meet"
            focusable="false"
          >
            @for (shape of map.shapes; track $index) {
              <path class="art__shape" [attr.data-level]="shape.level" [attr.d]="shape.d" />
            }
          </svg>
        }
      </div>
      <div class="art__legend" aria-hidden="true">
        <span>Binders by state and province</span>
        <span class="art__scale">
          Fewer
          <span class="art__steps">
            @for (level of legend; track level) {
              <span class="art__step" [attr.data-level]="level"></span>
            }
          </span>
          More
        </span>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .art {
      position: sticky;
      top: 0;
      display: flex;
      flex-direction: column;
      gap: 32px;
      box-sizing: border-box;
      height: 100dvh;
      min-height: 720px;
      padding: 72px 64px 40px;
      overflow: hidden;
      background: var(--color-surface-variant);
    }
    @media (max-width: 1279.98px) {
      .art {
        padding: 56px 40px 32px;
      }
    }
    .art__words {
      display: flex;
      flex-direction: column;
      gap: 24px;
      max-width: 540px;
    }
    .art__title {
      margin: 0;
      font-family: var(--font-display);
      font-size: 30px;
      font-weight: var(--font-weight-bold);
      line-height: 36px;
      letter-spacing: -0.5px;
    }
    .art__points {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .art__point {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      color: var(--color-text-secondary);
      font-size: 15px;
      line-height: 24px;
    }
    .art__icon {
      display: grid;
      flex: none;
      place-items: center;
      width: 36px;
      height: 36px;
      margin-top: -6px;
      border-radius: 50%;
      background: var(--color-accent-tint);
      color: var(--color-accent);
    }
    .art__map {
      position: relative;
      flex: 1 1 auto;
      min-height: 0;
    }
    .art__svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    .art__shape {
      fill: var(--color-map-step0);
      /* Lines between the shapes: the canvas in dark (board W27), the panel's colour in light. */
      stroke: light-dark(var(--color-surface-variant), var(--color-background));
      stroke-width: 0.8;
      stroke-linejoin: round;
    }
    .art__shape[data-level='1'],
    .art__step[data-level='1'] {
      fill: var(--color-map-step1);
      background: var(--color-map-step1);
    }
    .art__shape[data-level='2'],
    .art__step[data-level='2'] {
      fill: var(--color-map-step2);
      background: var(--color-map-step2);
    }
    .art__shape[data-level='3'],
    .art__step[data-level='3'] {
      fill: var(--color-map-step3);
      background: var(--color-map-step3);
    }
    .art__shape[data-level='4'],
    .art__step[data-level='4'] {
      fill: var(--color-map-step4);
      background: var(--color-map-step4);
    }
    .art__legend {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
      color: var(--color-text-muted);
      font-size: 12px;
      line-height: 16px;
    }
    .art__scale {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .art__steps {
      display: flex;
      gap: 3px;
    }
    .art__step {
      box-sizing: border-box;
      width: 18px;
      height: 10px;
      border-radius: 3px;
      background: var(--color-map-step0);
      border: 1px solid var(--color-border-strong);
    }
    .art__step[data-level='1'],
    .art__step[data-level='2'],
    .art__step[data-level='3'],
    .art__step[data-level='4'] {
      border: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthArtComponent {
  private readonly boundaries = inject(BoundaryAssets);

  protected readonly points = AUTH_ART_POINTS;
  protected readonly legend = LEGEND;
  protected readonly viewBox = `0 0 ${AUTH_ART_SIZE.width} ${AUTH_ART_SIZE.height}`;
  private readonly collection = signal<BoundaryCollection | null>(null);
  protected readonly drawing = computed(() => {
    const collection = this.collection();
    return collection
      ? staticMap(
          collection,
          'americas-north',
          AUTH_ART_PATTERN,
          null,
          AUTH_ART_SIZE,
          AUTH_ART_FRAME,
        )
      : null;
  });

  constructor() {
    // The bundled boundaries (a static file of the app); without them the words stay alone.
    this.boundaries.load('americas-north').then(
      (collection) => this.collection.set(collection),
      () => this.collection.set(null),
    );
  }
}
