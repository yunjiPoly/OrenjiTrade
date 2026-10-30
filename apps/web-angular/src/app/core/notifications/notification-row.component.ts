import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EnvironmentInjector,
  afterNextRender,
  booleanAttribute,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { NotificationResponse } from '@orenji/api-client';
import { SessionService } from '../auth/session.service';
import { ShellIconComponent } from '../layout/shell-icon/shell-icon.component';
import { CardImageComponent } from '../../shared/ui/card-image/card-image.component';
import { isHistoryNotification, notificationCard } from './notification-kinds';
import {
  isFreshnessRow,
  isReminder,
  rowTarget,
  rowText,
  rowTime,
  rowVisual,
} from './notification-rows';
import { ReminderAnswers } from './reminder-answers.service';

/**
 * One notification (spec 12, board W24): a 36 kind tile, the sentence with its bold subject, the
 * muted line, the time and an unread dot; on the page a card's picture on the right. A row with a
 * target is a link (it is marked read when opened); a freshness reminder answers in place ("Still
 * have them", "Review the binder", then "Confirmed. They stay in search."); old offer, trade,
 * payment and dispute notices read as history and open nothing.
 */
@Component({
  selector: 'app-notification-row',
  imports: [NgTemplateOutlet, RouterLink, CardImageComponent, ShellIconComponent],
  template: `
    @let n = notification();
    @let words = text();
    <div
      class="nr"
      [class.nr--unread]="!n.readAt"
      [class.nr--page]="page()"
      [attr.data-notification-id]="n.id"
      data-testid="notification-row"
    >
      <span class="nr__tile" [attr.data-tone]="visual().tone" aria-hidden="true">
        <app-shell-icon [name]="visual().icon" [size]="18" />
      </span>
      <div class="nr__text">
        @if (target(); as link) {
          <a
            class="nr__link"
            [routerLink]="link.path"
            [queryParams]="link.query"
            (click)="opened.emit(n)"
          >
            <ng-container *ngTemplateOutlet="sentence" />
          </a>
        } @else {
          <p class="nr__plain" [attr.data-testid]="history() ? 'notification-history' : null">
            <ng-container *ngTemplateOutlet="sentence" />
          </p>
        }
        <p class="nr__sub">{{ words.sub }}</p>
        @if (!page()) {
          <p class="nr__time">{{ time() }}</p>
        }
        @if (freshness()) {
          @switch (reminderState()) {
            @case ('confirmed') {
              <p class="nr__confirmed" role="status" tabindex="-1">
                <app-shell-icon name="check" [size]="14" /> Confirmed. They stay in search.
              </p>
            }
            @case ('gone') {
              <!-- The binder is gone: nothing to answer. -->
            }
            @default {
              <div class="nr__answers">
                @if (reminder() && reminderState() !== 'unfiled') {
                  <button
                    type="button"
                    class="nr__still"
                    [disabled]="answers.confirming() === n.id"
                    (click)="confirm()"
                  >
                    {{ answers.confirming() === n.id ? 'Confirming…' : 'Still have them' }}
                  </button>
                }
                <a
                  class="nr__review"
                  [routerLink]="review().path"
                  [queryParams]="review().query"
                  (click)="opened.emit(n)"
                >
                  {{ reminderState() === 'unfiled' ? 'Review the cards' : 'Review the binder' }}
                </a>
              </div>
            }
          }
        }
      </div>
      @if (page() && card(); as c) {
        <span class="nr__card" aria-hidden="true">
          <app-card-image [src]="c.imageUrl" [game]="c.game" size="xs" alt="" />
        </span>
      }
      <div class="nr__side">
        @if (page()) {
          <span class="nr__time nr__time--side">{{ time() }}</span>
        }
        @if (!n.readAt) {
          <span class="nr__dot" data-testid="notification-unread-dot" aria-hidden="true"></span>
          <span class="visually-hidden">Unread</span>
          @if (page()) {
            <button
              type="button"
              class="nr__read"
              [attr.aria-label]="
                'Mark as read: ' + words.strong + (words.rest ? ' ' + words.rest : '')
              "
              title="Mark as read"
              (click)="markRead.emit(n)"
            >
              <app-shell-icon name="check" [size]="16" />
            </button>
          }
        }
      </div>
    </div>
    <ng-template #sentence>
      <strong>{{ words.strong }}</strong>
      @if (words.rest) {
        {{ ' ' + words.rest }}
      }
    </ng-template>
  `,
  styleUrl: './notification-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationRowComponent {
  readonly notification = input.required<NotificationResponse>();
  /** The page's row (the picture on the right, the time beside it); the bell's otherwise. */
  readonly page = input(false, { transform: booleanAttribute });
  readonly now = input<Date>(new Date());
  /** The row's link or an answer was followed: the list marks it read (and the bell closes). */
  readonly opened = output<NotificationResponse>();
  /** The page's "Mark as read" of an unread row. */
  readonly markRead = output<NotificationResponse>();

  protected readonly answers = inject(ReminderAnswers);
  private readonly session = inject(SessionService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** The app's: the row itself moves from New to Earlier (read) while it answers. */
  private readonly environment = inject(EnvironmentInjector);

  protected readonly text = computed(() => rowText(this.notification()));
  protected readonly visual = computed(() => rowVisual(this.notification()));
  protected readonly time = computed(() => rowTime(this.notification().createdAt, this.now()));
  protected readonly history = computed(() => isHistoryNotification(this.notification()));
  protected readonly freshness = computed(() => isFreshnessRow(this.notification()));
  protected readonly reminder = computed(() => isReminder(this.notification()));
  protected readonly reminderState = computed(() => this.answers.state(this.notification()));
  protected readonly card = computed(() => notificationCard(this.notification()));
  protected readonly review = computed(() => this.answers.reviewLink(this.notification()));
  protected readonly target = computed(() => {
    const link = rowTarget(this.notification(), this.session.handle());
    if (!link) {
      return null;
    }
    const [path, query = ''] = link.split('?');
    return { path, query: Object.fromEntries(new URLSearchParams(query)) };
  });

  /**
   * "Still have them": the button goes away with the answer, and the row, marked read, moves from
   * New to Earlier (a new row element), so the focus moves to that row's "Confirmed. They stay in
   * search." (or back to its button when it failed), never to the page (A4).
   */
  protected async confirm(): Promise<void> {
    const id = this.notification().id;
    const doc = this.host.nativeElement.ownerDocument;
    await this.answers.confirm(this.notification());
    afterNextRender(
      () => {
        const row = doc.querySelector(`[data-notification-id="${id}"]`);
        row
          ?.querySelector<HTMLElement>('.nr__confirmed, .nr__still')
          ?.focus({ preventScroll: true });
      },
      { injector: this.environment },
    );
  }
}
