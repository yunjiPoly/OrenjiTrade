import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { SessionService } from '../../../core/auth/session.service';
import { AuthLayoutComponent } from '../auth-layout/auth-layout.component';
import { routeAfterSignIn } from '../auth-navigation';
import { unavailableContent } from './unavailable-content';

/**
 * `/auth/unavailable`, "We could not load your account" (spec 14, an account state: a centred 480
 * card): `GET /me` failed right after a sign-in or on an account page. [Try again] reads the
 * account again and goes on where the collector was going; Sign out ends the session. Public pages
 * keep the shell's amber session banner instead (spec 4.1).
 */
@Component({
  selector: 'app-unavailable-page',
  imports: [AuthLayoutComponent],
  template: `
    <app-auth-layout card [heading]="content().title" icon="alert" tone="warning">
      <p class="state__text" data-testid="account-error">{{ content().text }}</p>
      @if (content().reference; as reference) {
        <p class="state__ref">{{ reference }}</p>
      }
      <div class="state__actions">
        @if (!content().expired) {
          <button
            type="button"
            class="btn btn--primary"
            [attr.aria-disabled]="session.refreshing() ? 'true' : null"
            (click)="session.refreshing() || retry()"
          >
            {{ session.refreshing() ? 'Retrying…' : 'Try again' }}
          </button>
        }
        <button
          type="button"
          [class]="content().expired ? 'btn btn--primary' : 'link link--center'"
          (click)="signOut()"
        >
          Sign out
        </button>
      </div>
    </app-auth-layout>
  `,
  styleUrl: '../auth-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnavailablePageComponent {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  protected readonly session = inject(SessionService);

  /** Where the collector was going (`?returnUrl=`). */
  readonly returnUrl = input<string | undefined>();

  protected readonly content = computed(() => unavailableContent(this.session.error()));

  protected async retry(): Promise<void> {
    const status = await this.session.load();
    if (status !== 'error') {
      await routeAfterSignIn(this.session, this.router, this.returnUrl());
    }
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/auth/sign-in');
  }
}
