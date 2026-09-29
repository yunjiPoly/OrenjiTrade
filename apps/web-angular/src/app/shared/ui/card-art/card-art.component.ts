import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { gameInfo } from '../../domain/games';

/**
 * Decorative trading-card illustration (frame, art window, text lines) tinted with a game's
 * accent colour. Purely visual: hidden from assistive technology.
 */
@Component({
  selector: 'app-card-art',
  imports: [MatIconModule],
  template: `
    <span class="card" [style.--card-accent]="accent()">
      <span class="card__title"></span>
      <span class="card__window">
        <mat-icon class="card__glyph">{{ info().glyph }}</mat-icon>
      </span>
      <span class="card__line"></span>
      <span class="card__line card__line--short"></span>
      <span class="card__foil"></span>
    </span>
  `,
  styles: `
    :host {
      display: inline-block;
      width: var(--card-width, 96px);
      aspect-ratio: 5 / 7;
    }
    .card {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 6%;
      width: 100%;
      height: 100%;
      padding: 8%;
      border-radius: 8% / 6%;
      background: linear-gradient(
        160deg,
        color-mix(in srgb, var(--card-accent) 80%, #fff) 0%,
        var(--card-accent) 55%,
        color-mix(in srgb, var(--card-accent) 70%, #000) 100%
      );
      box-shadow:
        0 1px 0 rgb(255 255 255 / 0.35) inset,
        0 12px 28px -14px rgb(0 0 0 / 0.5);
      overflow: hidden;
    }
    .card__title,
    .card__line {
      display: block;
      flex: 0 0 7%;
      border-radius: 999px;
      background: rgb(255 255 255 / 0.75);
    }
    .card__title {
      width: 70%;
    }
    .card__line--short {
      width: 55%;
    }
    .card__window {
      display: grid;
      place-items: center;
      flex: 1 1 auto;
      border-radius: 6%;
      background: rgb(255 255 255 / 0.92);
      border: 2px solid rgb(0 0 0 / 0.08);
    }
    .card__glyph {
      width: auto;
      height: auto;
      font-size: calc(var(--card-width, 96px) * 0.34);
      color: var(--card-accent);
    }
    .card__foil {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        115deg,
        transparent 30%,
        rgb(255 255 255 / 0.28) 45%,
        transparent 60%
      );
      pointer-events: none;
    }
  `,
  host: { 'aria-hidden': 'true' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardArtComponent {
  /** Game slug (`pokemon`, `yugioh`, `mtg`, `riftbound`). */
  readonly game = input.required<string>();
  protected readonly info = computed(() => gameInfo(this.game()));
  protected readonly accent = computed(() => `var(${this.info().colorVar})`);
}
