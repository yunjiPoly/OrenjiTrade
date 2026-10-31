import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PublicBinderSummary } from '@orenji/api-client';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import { MediaUrlPipe } from '../../../shared/pipes/media-url.pipe';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';

/**
 * A binder on a profile (spec 11, boards W23 and W23b: three cards, 229 wide, 120 covers): a deck
 * core's first photo or a fan of its cards' pictures (never wider than 52 px here), the "Deck core"
 * tag and the photo count, the name, the price, the cards and the freshness. It opens the binder.
 */
@Component({
  selector: 'app-profile-binder-card',
  imports: [RouterLink, CardImageComponent, MediaUrlPipe, ShellIconComponent],
  template: `
    @let b = binder();
    <a class="cp__binder" [routerLink]="['/binders', b.id]">
      <span class="cp__cover" aria-hidden="true">
        @if (cover(); as photo) {
          <img class="cp__cover-photo" [src]="photo | mediaUrl" alt="" loading="lazy" />
        } @else {
          <span class="cp__fan">
            @for (art of arts(); track $index) {
              <app-card-image class="cp__fan-card" [src]="art" [game]="b.games[0]" alt="" />
            }
          </span>
        }
        @if (b.sellsAsCore) {
          <span class="cp__core-tag"><app-shell-icon name="layers" [size]="12" /> Deck core</span>
        }
        @if ((b.photos?.length ?? 0) > 0) {
          <span class="cp__photos"
            ><app-shell-icon name="camera" [size]="12" /> {{ b.photos!.length }}
            {{ b.photos!.length === 1 ? 'photo' : 'photos' }}</span
          >
        }
      </span>
      <span class="cp__binder-row">
        <span class="cp__binder-name">{{ b.name }}</span>
        @if (b.askingPriceText) {
          <span class="cp__binder-price">{{ b.askingPriceText }}</span>
        }
      </span>
      <span class="cp__binder-line">{{ line() }}</span>
    </a>
  `,
  styles: `
    :host {
      display: block;
    }
    .cp__binder {
      display: block;
      overflow: hidden;
      border: 1px solid var(--color-border);
      border-radius: 14px;
      background: var(--color-surface);
      color: var(--color-ink);
      text-decoration: none;
    }

    .cp__binder:hover {
      border-color: var(--color-border-strong);
    }

    .cp__cover {
      position: relative;
      display: block;
      height: 120px;
      overflow: hidden;
      background: var(--color-surface-variant);
    }

    .cp__cover-photo {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .cp__fan {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
    }

    .cp__fan-card {
      width: 52px;
      max-width: 52px;
      margin: 0 -6px;
      border-radius: 4px;
      overflow: hidden;
      box-shadow: var(--elevation-menu);
    }

    .cp__fan-card:nth-child(1) {
      transform: rotate(-8deg);
    }

    .cp__fan-card:nth-child(3) {
      transform: rotate(8deg);
    }

    .cp__core-tag,
    .cp__photos {
      position: absolute;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: var(--font-weight-semibold);
    }

    .cp__core-tag {
      top: 10px;
      left: 10px;
      background: var(--color-deck-core-tag-background);
      color: var(--color-deck-core-tag-text);
    }

    .cp__photos {
      right: 10px;
      bottom: 10px;
      border-radius: var(--radius-pill);
      background: rgb(0 0 0 / 0.65);
      color: #fff;
    }

    /* A long price ("Trade only") never squeezes the name: the name takes up to two lines and
       the price moves under it when they do not fit side by side (WE review U16). */
    .cp__binder-row {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: 2px 8px;
      padding: 14px 16px 0;
      font-weight: var(--font-weight-semibold);
    }

    .cp__binder-name {
      display: -webkit-box;
      flex: 1 1 12ch;
      min-width: 0;
      overflow: hidden;
      overflow-wrap: anywhere;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
    }

    .cp__binder-price {
      flex: none;
      margin-left: auto;
      white-space: nowrap;
    }

    .cp__binder-line {
      display: block;
      padding: 4px 16px 14px;
      color: var(--color-text-secondary);
      font-size: 13px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileBinderCardComponent {
  readonly binder = input.required<PublicBinderSummary>();
  protected readonly cover = computed(() => this.binder().photos?.[0]?.url ?? null);
  protected readonly arts = computed(() => (this.binder().previewImages ?? []).slice(0, 3));
  protected readonly line = computed(() => {
    const b = this.binder();
    const count = `${b.itemCount} ${b.itemCount === 1 ? 'card' : 'cards'}`;
    return b.freshness?.label ? `${count} · ${b.freshness.label}` : count;
  });
}
