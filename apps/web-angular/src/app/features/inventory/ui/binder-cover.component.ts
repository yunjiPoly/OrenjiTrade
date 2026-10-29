import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { BinderResponse } from '@orenji/api-client';
import { MediaUrlPipe } from '../../../shared/pipes/media-url.pipe';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { binderGame } from '../data/binder-games';

/**
 * A binder's picture (spec 9.2 and 9.12): a deck core's first photo, else a fan of its cards' art
 * (from `/public/card-images`, never wider than 96 px here), else an empty frame. `pane` is the
 * pane's 24 px thumbnail, `card` the Binders tab's 180 tall cover.
 */
@Component({
  selector: 'app-binder-cover',
  imports: [CardImageComponent, MatIconModule, MediaUrlPipe],
  template: `
    @if (photo(); as url) {
      <img class="bc__photo" [src]="url | mediaUrl" alt="" loading="lazy" />
      @if (variant() === 'card') {
        <span class="bc__count">
          <mat-icon aria-hidden="true">photo_camera</mat-icon>
          {{ photoCount() }} {{ photoCount() === 1 ? 'photo' : 'photos' }}
        </span>
      }
    } @else if (arts().length > 0) {
      <span class="bc__fan" [attr.data-cards]="arts().length">
        @for (art of arts(); track $index) {
          <app-card-image class="bc__art" size="fill" [src]="art" [game]="game()" />
        }
      </span>
    } @else {
      <mat-icon class="bc__empty" aria-hidden="true">style</mat-icon>
    }
  `,
  host: {
    class: 'bc',
    '[class.bc--pane]': "variant() === 'pane'",
    '[class.bc--card]': "variant() === 'card'",
    'aria-hidden': 'true',
  },
  styles: `
    :host {
      position: relative;
      display: grid;
      flex: none;
      place-items: center;
      overflow: hidden;
      background: var(--color-surface-variant);
    }
    :host(.bc--pane) {
      width: 24px;
      height: 24px;
      border-radius: 6px;
    }
    :host(.bc--card) {
      width: 100%;
      height: 180px;
    }
    .bc__photo {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .bc__count {
      position: absolute;
      right: 10px;
      bottom: 10px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 999px;
      background: rgb(0 0 0 / 0.62);
      color: #fff;
      font-size: var(--font-size-meta);
      font-weight: var(--font-weight-semibold);
    }
    .bc__count mat-icon {
      width: 14px;
      height: 14px;
      font-size: 14px;
    }
    .bc__fan {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .bc__art {
      --card-image-shadow: 0 6px 16px -8px rgb(0 0 0 / 0.6);
    }
    :host(.bc--pane) .bc__art {
      --card-image-width: 12px;
      --card-image-radius: 2px;
      --card-image-shadow: none;
      margin: 0 -2px;
    }
    :host(.bc--pane) .bc__art:nth-child(1) {
      transform: rotate(-10deg);
    }
    :host(.bc--pane) .bc__art:nth-child(2) {
      transform: rotate(8deg);
    }
    :host(.bc--pane) .bc__art:nth-child(3) {
      display: none;
    }
    :host(.bc--card) .bc__art {
      --card-image-width: 96px;
      margin: 0 -22px;
    }
    :host(.bc--card) [data-cards='3'] .bc__art:nth-child(1) {
      transform: translateY(8px) rotate(-12deg);
    }
    :host(.bc--card) [data-cards='3'] .bc__art:nth-child(2) {
      z-index: 1;
    }
    :host(.bc--card) [data-cards='3'] .bc__art:nth-child(3),
    :host(.bc--card) [data-cards='2'] .bc__art:nth-child(2) {
      transform: translateY(8px) rotate(12deg);
    }
    :host(.bc--card) [data-cards='2'] .bc__art:nth-child(1) {
      transform: translateY(6px) rotate(-8deg);
    }
    .bc__empty {
      color: var(--color-text-faint);
    }
    :host(.bc--pane) .bc__empty {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    :host(.bc--card) .bc__empty {
      width: 40px;
      height: 40px;
      font-size: 40px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BinderCoverComponent {
  readonly binder = input.required<BinderResponse>();
  readonly variant = input<'pane' | 'card'>('pane');

  protected readonly game = computed(() => binderGame(this.binder()) ?? '');
  protected readonly photos = computed(() =>
    [...(this.binder().photos ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
  );
  protected readonly photoCount = computed(() => this.photos().length);
  /** A deck core shows its first photo (the cover). */
  protected readonly photo = computed(() =>
    this.binder().sellsAsCore ? (this.photos()[0]?.url ?? null) : null,
  );
  protected readonly arts = computed(() => {
    const binder = this.binder();
    const images = binder.previewImages?.length
      ? binder.previewImages
      : binder.coverImageUrl
        ? [binder.coverImageUrl]
        : [];
    return images.slice(0, 3);
  });
}
