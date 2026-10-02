import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  booleanAttribute,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { AppConfigService } from '../../../core/config/app-config.service';
import { resolveMediaUrl } from '../../pipes/media-url.pipe';
import { CardArtComponent } from '../card-art/card-art.component';

/**
 * Rendered sizes of a card picture. `fill` takes the width of its container (grids, heroes,
 * parents that size the host themselves); the others are fixed widths for lists and thumbnails.
 */
export type CardImageSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'fill';

/** Width and height (CSS pixels, trading-card ratio 5:7) of each size; `fill` is the cache rendition. */
export const CARD_IMAGE_DIMENSIONS: Readonly<
  Record<CardImageSize, { width: number; height: number }>
> = {
  xs: { width: 36, height: 50 },
  sm: { width: 56, height: 78 },
  md: { width: 120, height: 168 },
  lg: { width: 240, height: 336 },
  xl: { width: 360, height: 504 },
  fill: { width: 320, height: 448 },
};

/**
 * A card picture for every game (ADR 0015), in a fixed trading-card frame (5:7) so nothing moves
 * while it loads. `src` is always a URL the API sent (`primaryImageUrl`, printing images, card
 * links, suggestions...): OrenjiTrade's own cached artwork or placeholder, or a provider URL only
 * for providers that allow hotlinking. API-relative paths (realtime payloads) are resolved
 * against the API origin. Never build provider image URLs in the client.
 *
 * - lazy (`eager` for the above-the-fold hero) and asynchronously decoded, with explicit width
 *   and height;
 * - a shimmer skeleton until the picture has loaded (static under reduced motion);
 * - on a missing URL or a load error, the game's placeholder card art, still announced with `alt`;
 * - `alt` is the card name; pass `''` only where the same control already names the card (an
 *   autocomplete option), which makes the picture decorative.
 */
@Component({
  selector: 'app-card-image',
  imports: [CardArtComponent],
  template: `
    @if (url() && !failed()) {
      @if (!loaded()) {
        <span class="ci__skeleton" data-testid="card-image-skeleton" aria-hidden="true"></span>
      }
      <!-- loading, decoding and the size come before src so the browser sees them first. -->
      <img
        class="ci__img"
        decoding="async"
        [attr.loading]="eager() ? 'eager' : 'lazy'"
        [attr.fetchpriority]="eager() ? 'high' : null"
        [attr.width]="dimensions().width"
        [attr.height]="dimensions().height"
        [class.ci__img--loaded]="loaded()"
        [alt]="alt()"
        [src]="url()"
        (load)="loaded.set(true)"
        (error)="failed.set(true)"
      />
    } @else {
      <span
        class="ci__fallback"
        data-testid="card-image-fallback"
        [attr.role]="alt() ? 'img' : null"
        [attr.aria-label]="alt() || null"
      >
        <app-card-art class="ci__art" [game]="game() ?? ''" />
      </span>
    }
  `,
  styles: `
    /* Parents size and style the frame through --card-image-width / -radius / -shadow / -fit
       (or width on a fill-size host); the size variants only set the fallbacks. */
    :host {
      position: relative;
      display: block;
      flex: 0 0 auto;
      width: var(--card-image-width, var(--ci-width, 100%));
      max-width: 100%;
      aspect-ratio: 5 / 7;
      overflow: hidden;
      border-radius: var(--card-image-radius, var(--ci-radius, 4.5% / 3.2%));
      background: var(--color-surface-variant);
      box-shadow: var(--card-image-shadow, var(--ci-shadow, 0 10px 24px -16px rgb(0 0 0 / 0.55)));
    }
    :host([data-size='xs']) {
      --ci-width: 36px;
      --ci-radius: 3px;
      --ci-shadow: 0 2px 6px rgb(0 0 0 / 0.2);
    }
    :host([data-size='sm']) {
      --ci-width: 56px;
      --ci-radius: 4px;
      --ci-shadow: 0 3px 8px -2px rgb(0 0 0 / 0.3);
    }
    :host([data-size='md']) {
      --ci-width: 120px;
    }
    :host([data-size='lg']) {
      --ci-width: 240px;
    }
    :host([data-size='xl']) {
      --ci-width: 360px;
    }
    .ci__img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: var(--card-image-fit, cover);
      opacity: 0;
      transition: opacity var(--motion-duration-base) var(--motion-easing-standard);
    }
    .ci__img--loaded {
      opacity: 1;
    }
    .ci__skeleton {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        100deg,
        var(--color-surface-variant) 20%,
        var(--color-border) 50%,
        var(--color-surface-variant) 80%
      );
      background-size: 220% 100%;
      animation: ci-shimmer 1.4s ease-in-out infinite;
    }
    .ci__fallback {
      display: block;
      width: 100%;
      height: 100%;
    }
    .ci__art {
      --card-width: 100%;
      display: block;
      width: 100%;
      height: 100%;
    }
    @keyframes ci-shimmer {
      from {
        background-position: 110% 0;
      }
      to {
        background-position: -110% 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .ci__skeleton {
        animation: none;
        background: var(--color-surface-variant);
      }
      .ci__img {
        transition: none;
      }
    }
  `,
  host: {
    '[attr.data-size]': 'size()',
    '[attr.data-state]': 'state()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardImageComponent {
  private readonly injector = inject(Injector);

  /** Picture URL sent by the API; `null`/`undefined` shows the placeholder art. */
  readonly src = input<string | null | undefined>(null);
  /** The card's name (accessible text); `''` makes the picture decorative. */
  readonly alt = input('');
  readonly size = input<CardImageSize>('fill');
  /** Game slug tinting the placeholder art. */
  readonly game = input<string | null | undefined>('');
  /** Above-the-fold pictures (card detail hero) load eagerly with high priority. */
  readonly eager = input(false, { transform: booleanAttribute });

  protected readonly url = computed(() => this.resolve(this.src()));
  protected readonly dimensions = computed(() => CARD_IMAGE_DIMENSIONS[this.size()]);
  /** Reset whenever the URL changes. */
  protected readonly loaded = linkedSignal({ source: this.url, computation: () => false });
  protected readonly failed = linkedSignal({ source: this.url, computation: () => false });
  /**
   * `loading`, `loaded`, `placeholder` (no URL) or `error` (the URL failed to load): styling hooks,
   * unit and end-to-end tests.
   */
  protected readonly state = computed(() => {
    if (!this.url()) {
      return 'placeholder';
    }
    if (this.failed()) {
      return 'error';
    }
    return this.loaded() ? 'loaded' : 'loading';
  });

  private resolve(src: string | null | undefined): string | null {
    const url = src?.trim();
    if (!url) {
      return null;
    }
    // API-relative paths (payloads pushed over the realtime channel) point at the API origin;
    // the configuration is only looked up for them.
    if (url.startsWith('/') && !url.startsWith('//')) {
      return resolveMediaUrl(url, this.injector.get(AppConfigService).apiBaseUrl());
    }
    return url;
  }
}
