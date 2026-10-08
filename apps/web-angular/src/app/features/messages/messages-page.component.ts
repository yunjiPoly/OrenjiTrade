import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { MessengerComponent } from './messenger/messenger.component';
import { RealtimeStatusComponent } from './realtime-status/realtime-status.component';

/** From this width the list and the thread sit side by side. */
const SPLIT_QUERY = '(min-width: 840px)';

/**
 * `/messages` and `/messages/:id`: the full-page messenger (same components as the map panel).
 * Wide screens show the list beside the thread; narrow screens show one at a time, like the
 * mobile app. The open conversation lives in the URL. Offers and trades are one click away (the
 * mobile app keeps them under Messages).
 */
@Component({
  selector: 'app-messages-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    EmptyStateComponent,
    MessengerComponent,
    RealtimeStatusComponent,
  ],
  template: `
    <div class="page messages-page">
      @if (auth.isAuthenticated()) {
        <header class="messages-page__header">
          <h1 class="messages-page__title">Messages</h1>
          <app-realtime-status />
          <nav class="messages-page__links" aria-label="Deals">
            <a matButton routerLink="/offers">
              <mat-icon aria-hidden="true">local_offer</mat-icon>
              Offers
            </a>
            <a matButton routerLink="/trades">
              <mat-icon aria-hidden="true">sync_alt</mat-icon>
              Trades
            </a>
          </nav>
        </header>
        <app-messenger
          class="messages-page__box"
          [split]="split()"
          [conversationId]="id() ?? null"
          (openedChange)="onOpened($event)"
        />
      } @else {
        <app-empty-state
          icon="lock_person"
          title="Messages are for members"
          description="Sign in to talk privately with collectors."
        >
          <a
            actions
            matButton="filled"
            routerLink="/auth/sign-in"
            [queryParams]="{ returnUrl: '/messages' }"
          >
            Sign in
          </a>
        </app-empty-state>
      }
    </div>
  `,
  styles: `
    .messages-page {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-4);
    }
    .messages-page__header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-3);
    }
    .messages-page__title {
      font-size: var(--font-size-3xl);
    }
    .messages-page__links {
      display: flex;
      gap: var(--spacing-1);
      margin-left: auto;
    }
    .messages-page__box {
      height: max(480px, calc(100dvh - 64px - 180px));
      overflow: hidden;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      box-shadow: var(--elevation-menu);
    }
    @media (max-width: 959px) {
      .messages-page__box {
        height: max(420px, calc(100dvh - 64px - 64px - 150px));
      }
    }
    @media (max-width: 599px) {
      .messages-page__title {
        font-size: var(--font-size-2xl);
      }
      .messages-page__box {
        margin: 0 calc(-1 * var(--spacing-4));
        border-right: 0;
        border-left: 0;
        border-radius: 0;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessagesPageComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly breakpoints = inject(BreakpointObserver);

  /** `:id` route parameter (withComponentInputBinding). */
  readonly id = input<string | undefined>();

  protected readonly split = toSignal(
    this.breakpoints.observe(SPLIT_QUERY).pipe(map((state) => state.matches)),
    { initialValue: this.breakpoints.isMatched(SPLIT_QUERY) },
  );

  protected onOpened(id: string | null): void {
    void this.router.navigate(id ? ['/messages', id] : ['/messages']);
  }
}
