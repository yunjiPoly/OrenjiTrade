import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { PublicBinderSummary } from '@orenji/api-client';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';

/** "maya_k · Quebec · 120 cards" (a binder) or "duelist.jp · Quebec" (a deck core). */
export function binderRowLine(binder: PublicBinderSummary): string {
  const handle = binder.owner?.handle || 'A collector';
  const place = binder.owner?.place?.subdivisionName ?? null;
  if (binder.sellsAsCore) {
    return [handle, place].filter(Boolean).join(' · ');
  }
  const cards = `${binder.itemCount} ${binder.itemCount === 1 ? 'card' : 'cards'}`;
  return [handle, place, cards].filter(Boolean).join(' · ');
}

/**
 * A row of Search › Binders (spec 6.3, board W4), 72 tall: a deck core with a 56 photo (radius
 * 10), its name, "duelist.jp · Quebec" and its price on the right; a binder with a 56 two-card fan,
 * its name and "maya_k · Quebec · 120 cards" ("Yours" on one's own). A click or Enter opens it
 * (the only thing that spends a binder view); hovering or focusing it outlines its province on the
 * map, and fetches nothing.
 */
@Component({
  selector: 'app-binder-row',
  imports: [ShellIconComponent],
  template: `
    @let b = binder();
    <button
      type="button"
      class="br"
      data-testid="binder-row"
      [attr.data-binder]="b.id"
      [attr.aria-current]="active() ? 'true' : null"
      (click)="opened.emit({ binder: b, opener: $event.currentTarget })"
      (mouseenter)="hovered.emit(code())"
      (mouseleave)="hovered.emit(null)"
      (focus)="hovered.emit(code())"
      (blur)="hovered.emit(null)"
    >
      @if (b.sellsAsCore) {
        <span class="br__photo" aria-hidden="true">
          @if (b.photos?.[0]?.url; as url) {
            <img [src]="url" alt="" loading="lazy" decoding="async" />
          } @else {
            <app-shell-icon name="layers" [size]="22" />
          }
        </span>
      } @else {
        <span class="br__fan" aria-hidden="true">
          @for (url of fan(); track $index) {
            <span class="br__card" [class.br__card--back]="$index === 0">
              @if (url) {
                <img [src]="url" alt="" loading="lazy" decoding="async" />
              }
            </span>
          }
        </span>
      }
      <span class="br__text">
        <span class="br__name">{{ b.name }}</span>
        <span class="br__line">{{ line() }}</span>
      </span>
      @if (own()) {
        <span class="br__yours">Yours</span>
      }
      @if (b.sellsAsCore && b.askingPriceText) {
        <span class="br__price">{{ b.askingPriceText }}</span>
      }
      <app-shell-icon class="br__chevron" name="chevronRight" [size]="18" />
    </button>
  `,
  styles: `
    :host {
      display: block;
    }
    .br {
      display: flex;
      align-items: center;
      gap: 14px;
      width: 100%;
      min-height: 72px;
      padding: 8px 12px;
      border: 0;
      border-radius: var(--radius-row);
      background: transparent;
      color: var(--color-ink);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .br:hover,
    .br[aria-current='true'] {
      background: var(--color-primary-tint-subtle);
    }
    .br:focus-visible {
      outline: none;
      box-shadow: inset 0 0 0 2px var(--color-accent);
    }
    .br__photo {
      display: grid;
      flex: none;
      place-items: center;
      width: 56px;
      height: 56px;
      overflow: hidden;
      border-radius: var(--radius-md);
      background: var(--color-deck-core-tag-background);
      color: var(--color-deck-core-tag-text);
    }
    .br__photo img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .br__fan {
      position: relative;
      flex: none;
      width: 56px;
      height: 56px;
    }
    .br__card {
      position: absolute;
      top: 2px;
      left: 14px;
      width: 36px;
      height: 52px;
      overflow: hidden;
      border: 1px solid var(--color-border);
      border-radius: 6px;
      background: var(--color-surface-variant);
    }
    .br__card--back {
      left: 4px;
      transform: rotate(-8deg);
    }
    .br__card img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .br__text {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .br__name {
      overflow: hidden;
      font-size: var(--font-size-body);
      font-weight: var(--font-weight-semibold);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .br__line {
      overflow: hidden;
      color: var(--color-text-muted);
      font-size: var(--font-size-meta);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .br__yours {
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
    }
    .br__price {
      font-size: var(--font-size-body);
      font-weight: var(--font-weight-semibold);
      white-space: nowrap;
    }
    .br__chevron {
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BinderRowComponent {
  readonly binder = input.required<PublicBinderSummary>();
  readonly own = input(false);
  readonly active = input(false);
  readonly opened = output<{ binder: PublicBinderSummary; opener: EventTarget | null }>();
  readonly hovered = output<string | null>();

  protected readonly line = computed(() => binderRowLine(this.binder()));
  protected readonly code = computed(() => this.binder().owner?.place?.subdivisionCode ?? null);
  protected readonly fan = computed(() => {
    const images = this.binder().previewImages ?? [];
    const cover = this.binder().coverImageUrl ?? null;
    const first = images[0] ?? cover;
    const second = images[1] ?? first;
    return [second ?? null, first ?? null];
  });
}
