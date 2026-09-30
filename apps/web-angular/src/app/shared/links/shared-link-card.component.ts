import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { BinderLink, CardLink } from '@orenji/api-client';
import { CardImageComponent } from '../catalog/card-image/card-image.component';

/**
 * A card or binder shared in a message or a community post: thumbnail, name and a link to the
 * card page (with the shared printing selected) or the public binder.
 */
@Component({
  selector: 'app-shared-link-card',
  imports: [RouterLink, MatIconModule, CardImageComponent],
  template: `
    @if (card(); as c) {
      <a
        class="link"
        [routerLink]="['/cards', c.cardId]"
        [queryParams]="{ printing: c.id }"
        [attr.aria-label]="'Card: ' + c.name + (c.printingCode ? ', ' + c.printingCode : '')"
      >
        <app-card-image class="link__thumb" [src]="c.imageUrl" alt="" />
        <span class="link__text">
          <span class="link__eyebrow">Card</span>
          <span class="link__name">{{ c.name }}</span>
          @if (c.printingCode) {
            <span class="link__meta mono">{{ c.printingCode }}</span>
          }
        </span>
        <mat-icon class="link__go" aria-hidden="true">chevron_right</mat-icon>
      </a>
    } @else if (binder(); as b) {
      <a
        class="link"
        [routerLink]="['/binders', b.id]"
        [attr.aria-label]="'Binder: ' + b.name + ' by @' + b.ownerHandle"
      >
        <span class="link__binder" aria-hidden="true"><mat-icon>menu_book</mat-icon></span>
        <span class="link__text">
          <span class="link__eyebrow">Public binder</span>
          <span class="link__name">{{ b.name }}</span>
          <span class="link__meta">by &#64;{{ b.ownerHandle }}</span>
        </span>
        <mat-icon class="link__go" aria-hidden="true">chevron_right</mat-icon>
      </a>
    }
  `,
  styles: `
    :host {
      display: block;
      max-width: 320px;
    }
    .link {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      padding: var(--spacing-2) var(--spacing-3) var(--spacing-2) var(--spacing-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      color: var(--color-ink);
      text-decoration: none;
      transition:
        border-color var(--motion-duration-fast) var(--motion-easing-standard),
        box-shadow var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .link:hover {
      border-color: var(--color-primary);
      box-shadow: var(--elevation-menu);
    }
    .link__thumb {
      --card-image-shadow: none;
      flex: 0 0 auto;
      width: 44px;
    }
    .link__binder {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: var(--radius-sm);
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
    }
    .link__text {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 0;
      line-height: 1.3;
    }
    .link__eyebrow {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .link__name {
      overflow: hidden;
      font-weight: var(--font-weight-semibold);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .link__meta {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .link__go {
      flex: 0 0 auto;
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharedLinkCardComponent {
  readonly card = input<CardLink | null | undefined>(null);
  readonly binder = input<BinderLink | null | undefined>(null);
}
