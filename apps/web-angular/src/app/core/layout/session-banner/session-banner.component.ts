import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { SessionService } from '../../auth/session.service';
import { friendlyMessage } from '../../http/api-error-messages';
import { ShellIconComponent } from '../shell-icon/shell-icon.component';

/**
 * The session banner (spec 4.1): an amber strip 40 tall under the top bar while the signed-in
 * collector's account could not be loaded (API unreachable, server error, rejected token):
 * "We could not load your account." with "Try again" (and Sign out when the API no longer accepts
 * the session). Focus returns to the strip after a retry, so a keyboard user hears the outcome.
 */
@Component({
  selector: 'app-session-banner',
  imports: [ShellIconComponent],
  template: `
    @if (session.status() === 'error' && session.error(); as error) {
      <div class="banner" role="alert" tabindex="-1" #strip data-testid="session-banner">
        <app-shell-icon class="banner__icon" name="alert" [size]="18" />
        <p class="banner__text">
          <strong>We could not load your account.</strong>
          <span class="banner__detail">{{ message() }}</span>
        </p>
        <button
          type="button"
          class="banner__action"
          [disabled]="session.refreshing()"
          (click)="retry()"
        >
          Try again
        </button>
        @if (error.status === 401) {
          <button type="button" class="banner__action" (click)="signOut()">Sign out</button>
        }
      </div>
    }
  `,
  styles: `
    .banner {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      min-height: 40px;
      padding: 4px var(--spacing-4) 4px var(--spacing-6);
      border-bottom: 1px solid color-mix(in srgb, var(--color-warning) 45%, transparent);
      background: color-mix(in srgb, var(--color-warning) 16%, var(--color-background));
      color: var(--color-ink);
      font-size: var(--font-size-sm);
    }
    .banner:focus-visible {
      outline-offset: -2px;
    }
    .banner__icon {
      color: var(--color-warning);
    }
    .banner__text {
      flex: 1 1 auto;
      min-width: 0;
      margin: 0;
    }
    .banner__detail {
      margin-left: var(--spacing-2);
      color: var(--color-text-secondary);
    }
    .banner__action {
      flex: none;
      height: 32px;
      padding: 0 12px;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: var(--color-ink);
      font: inherit;
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .banner__action:hover:not(:disabled) {
      background: var(--color-surface-variant);
    }
    .banner__action:disabled {
      opacity: 0.6;
      cursor: default;
    }
    @media (max-width: 599.98px) {
      .banner {
        flex-wrap: wrap;
        padding-left: var(--spacing-4);
      }
      .banner__detail {
        display: block;
        margin-left: 0;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionBannerComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly session = inject(SessionService);
  private readonly strip = viewChild<ElementRef<HTMLElement>>('strip');
  protected readonly message = computed(() => {
    const error = this.session.error();
    return error ? friendlyMessage(error) : '';
  });

  protected async retry(): Promise<void> {
    await this.session.load();
    // Back on the strip when it is still there, otherwise on the page.
    queueMicrotask(() => {
      const strip = this.strip()?.nativeElement;
      if (strip) {
        strip.focus();
      } else {
        this.host.nativeElement.ownerDocument.getElementById('main-content')?.focus();
      }
    });
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/auth/sign-in');
  }
}
