import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Supporter } from '@orenji/api-client';
import { AvatarComponent } from '../../shared/ui/avatar/avatar.component';

/** "Month YYYY" for a supporter's `2026-09` month. */
export function supporterMonth(month: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month ?? '');
  if (!match) {
    return '';
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return date.toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** The public thank-you wall: display names (and month) of members who opted in. */
@Component({
  selector: 'app-supporters-list',
  imports: [AvatarComponent],
  template: `
    @if (supporters().length) {
      <ul class="wall" aria-label="Supporters">
        @for (supporter of supporters(); track $index) {
          <li class="wall__item" data-testid="supporter">
            <app-avatar size="sm" [name]="supporter.displayName ?? ''" [decorative]="true" />
            <span class="wall__who">
              <span class="wall__name">{{ supporter.displayName }}</span>
              <span class="wall__month">{{ month(supporter.month) }}</span>
            </span>
          </li>
        }
      </ul>
    } @else {
      <p class="wall__none">
        Be the first name on the wall: tick “Thank me publicly” when you give.
      </p>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .wall {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: var(--spacing-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .wall__item {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      padding: var(--spacing-2) var(--spacing-3);
      border-radius: var(--radius-md);
      background: var(--color-surface-variant);
    }
    .wall__who {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .wall__name {
      overflow: hidden;
      font-weight: var(--font-weight-medium);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .wall__month,
    .wall__none {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .wall__none {
      margin: 0;
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupportersListComponent {
  readonly supporters = input.required<readonly Supporter[]>();
  protected readonly month = supporterMonth;
}
