import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ShellIconComponent,
  ShellIconName,
} from '../../../core/layout/shell-icon/shell-icon.component';
import { RULES_COPY } from '../data/community-copy';

/** A collector blocked from this page (their posts left every room; "Unblock" brings them back). */
export interface BlockedAuthor {
  id: string;
  handle: string;
}

const RULE_ICONS: readonly ShellIconName[] = ['heart', 'messageSquare', 'star', 'flag'];

/**
 * "Room rules" (spec 10.7, board W22): the third pane at 1280 and wider, a 360 drawer at md and a
 * sheet below 960. The four rules with their icons, "You can post up to 10 times an hour in each
 * room.", "What others see" (the handle, the province and the post; never the city; blocked
 * collectors' posts hidden in every room) with an "Unblock" row for each collector blocked from
 * this page, and "Trading safely".
 */
@Component({
  selector: 'app-room-rules',
  imports: [RouterLink, ShellIconComponent],
  template: `
    <div class="rr">
      <div class="rr__head">
        <h2 class="rr__title" [id]="titleId()">{{ copy.title }}</h2>
        <button
          type="button"
          class="rr__close"
          data-testid="room-rules-close"
          [attr.aria-label]="copy.hide"
          (click)="closed.emit()"
        >
          <app-shell-icon name="close" [size]="20" [stroke]="2" />
        </button>
      </div>
      <ul class="rr__rules">
        @for (rule of copy.rules; track rule; let i = $index) {
          <li class="rr__rule">
            <span class="rr__icon" aria-hidden="true">
              <app-shell-icon [name]="icons[i]" [size]="17" [stroke]="2" />
            </span>
            <span>{{ rule }}</span>
          </li>
        }
      </ul>
      <p class="rr__rate">
        <app-shell-icon name="clock" [size]="16" />
        <span>{{ copy.rateRule }}</span>
      </p>
      <section class="rr__others" [attr.aria-labelledby]="titleId() + '-others'">
        <h3 class="rr__h3" [id]="titleId() + '-others'">{{ copy.othersTitle }}</h3>
        <p class="rr__text">{{ copy.others }}</p>
        <p class="rr__text">{{ copy.blocks }}</p>
        @for (author of blocked(); track author.id) {
          <div class="rr__blocked">
            <span>{{ copy.blocked(author.handle) }}</span>
            <button
              type="button"
              class="rr__unblock"
              [attr.aria-label]="copy.unblockLabel(author.handle)"
              (click)="unblock.emit(author)"
            >
              {{ copy.unblock }}
            </button>
          </div>
        }
      </section>
      <a class="rr__link" routerLink="/legal/trading-safely">
        {{ copy.tradingSafely }}
        <app-shell-icon name="arrowRight" [size]="16" [stroke]="2" />
      </a>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .rr {
      display: flex;
      flex-direction: column;
      gap: 20px;
      padding: 24px 20px 32px;
    }
    .rr__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .rr__title {
      margin: 0;
      font-family: var(--font-display);
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-semibold);
      line-height: 28px;
    }
    .rr__close {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      margin-right: -8px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--color-text-secondary);
      cursor: pointer;
    }
    .rr__close:hover {
      background: var(--color-surface-variant);
    }
    .rr__rules {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .rr__rule {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      line-height: 20px;
    }
    .rr__icon {
      display: grid;
      flex: none;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--color-accent-tint);
      color: var(--color-accent);
    }
    .rr__rate {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin: 0;
      padding: 12px 14px;
      border: 1px solid var(--color-border);
      border-radius: 14px;
      background: var(--color-background);
      color: var(--color-text-secondary);
      font-size: var(--font-size-meta);
      line-height: 18px;
    }
    .rr__rate app-shell-icon {
      flex: none;
      margin-top: 1px;
    }
    .rr__others {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-top: 20px;
      border-top: 1px solid var(--color-border);
    }
    .rr__h3 {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .rr__text {
      margin: 0;
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
      line-height: 20px;
    }
    .rr__blocked {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 10px;
      background: var(--color-surface-variant);
      font-size: var(--font-size-sm);
    }
    .rr__unblock {
      height: 32px;
      padding: 0 12px;
      border: 0;
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--color-accent);
      font: inherit;
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .rr__unblock:hover {
      background: var(--color-surface);
    }
    .rr__link {
      display: inline-flex;
      align-self: flex-start;
      align-items: center;
      gap: 6px;
      color: var(--color-accent);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      text-decoration: none;
    }
    .rr__link:hover {
      text-decoration: underline;
    }
    .rr__close:focus-visible,
    .rr__unblock:focus-visible,
    .rr__link:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: var(--focus-offset);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomRulesComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The heading's id (the pane or the drawer is named by it). */
  readonly titleId = input('room-rules-title');
  readonly blocked = input<readonly BlockedAuthor[]>([]);
  readonly closed = output<void>();
  readonly unblock = output<BlockedAuthor>();

  protected readonly copy = RULES_COPY;
  protected readonly icons = RULE_ICONS;

  /**
   * After an "Unblock" left (WF review U7): the focus on the Unblock now at `index` (the next one),
   * else the one before, else the rules' close button.
   */
  focusAfterUnblock(index: number): void {
    const element = this.host.nativeElement;
    const buttons = [...element.querySelectorAll<HTMLElement>('.rr__unblock')];
    const target =
      buttons[Math.min(index, buttons.length - 1)] ??
      element.querySelector<HTMLElement>('[data-testid="room-rules-close"]');
    target?.focus();
  }
}
