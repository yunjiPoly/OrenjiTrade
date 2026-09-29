import { ChangeDetectionStrategy, Component, input, linkedSignal } from '@angular/core';
import { CardArtComponent } from '../../ui/card-art/card-art.component';

/**
 * A card picture (5:7) from the catalog (`primaryImageUrl`, printing images; the API serves
 * placeholder SVGs locally). Lazy by default; when the image is missing or fails to load, the
 * game's decorative card art takes its place and the alt text stays available to screen readers.
 */
@Component({
  selector: 'app-card-image',
  imports: [CardArtComponent],
  template: `
    @if (src() && !failed()) {
      <img
        class="card-image__img"
        [src]="src()"
        [alt]="alt()"
        [attr.loading]="eager() ? 'eager' : 'lazy'"
        [attr.fetchpriority]="eager() ? 'high' : null"
        decoding="async"
        width="488"
        height="680"
        (error)="failed.set(true)"
      />
    } @else {
      <app-card-art class="card-image__art" [game]="game()" />
      @if (alt()) {
        <span class="visually-hidden">{{ alt() }}</span>
      }
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      aspect-ratio: 5 / 7;
      width: 100%;
      overflow: hidden;
      border-radius: var(--card-image-radius, 4.5% / 3.2%);
      background: var(--color-surface-variant);
      box-shadow: var(--card-image-shadow, 0 10px 24px -16px rgb(0 0 0 / 0.55));
    }
    .card-image__img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .card-image__art {
      --card-width: 100%;
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardImageComponent {
  readonly src = input<string | null | undefined>(null);
  readonly alt = input('');
  /** Game slug for the fallback art. */
  readonly game = input('');
  /** Above-the-fold images (card detail hero) load eagerly with high priority. */
  readonly eager = input(false);

  /** Reset whenever the source changes. */
  protected readonly failed = linkedSignal({ source: this.src, computation: () => false });
}
