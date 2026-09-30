import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import type { DonationCheckoutRequest } from '@orenji/api-client';
import { AuthService } from '../../core/auth/auth.service';
import { isApiError } from '../../core/http/api-error';
import { friendlyMessage } from '../../core/http/api-error-messages';
import {
  DONATION_NOTE,
  checkoutTarget,
  donationProblem,
} from '../../shared/billing/billing-labels';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import { SupportStore } from './data/support.store';
import { DonationFieldErrors, DonationFormComponent } from './donation-form.component';
import { MyDonationsComponent } from './my-donations.component';
import { SupportersListComponent } from './supporters-list.component';

/**
 * `/support` (`donations` flag; footer "Support OrenjiTrade"): clearly labelled voluntary support.
 * Members pick a preset or custom amount, add an optional private message and opt in to public
 * thanks, then pay on the provider's checkout (the local fake checkout
 * `/checkout/fake-donation/:ref`). Everybody sees the supporters who asked to be thanked;
 * donations never change ratings, ranking or trust.
 */
@Component({
  selector: 'app-support-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    DonationFormComponent,
    ErrorStateComponent,
    MyDonationsComponent,
    PageHeaderComponent,
    SkeletonComponent,
    SupportersListComponent,
  ],
  providers: [SupportStore],
  template: `
    <div class="page support">
      <app-page-header
        title="Support OrenjiTrade"
        subtitle="OrenjiTrade is built by collectors for collectors. If it helps you trade, you can chip in."
      />

      @if (thanks()) {
        <p class="support__thanks" role="status" data-testid="donation-thanks">
          <mat-icon aria-hidden="true">favorite</mat-icon>
          <span><strong>Thank you!</strong> Your donation went through.</span>
        </p>
      }

      <div class="support__layout">
        <section class="support__card" aria-labelledby="donate-title">
          <p class="support__badge" data-testid="voluntary-label">
            <mat-icon aria-hidden="true">volunteer_activism</mat-icon>
            Voluntary support
          </p>
          <h2 id="donate-title" class="support__title">Make a donation</h2>
          <p class="support__note">{{ note }}</p>
          @if (auth.isAuthenticated()) {
            @if (problem(); as message) {
              <p class="support__problem" role="alert">
                <mat-icon aria-hidden="true">error</mat-icon>
                {{ message }}
              </p>
            }
            <app-donation-form
              [busy]="busy()"
              [serverErrors]="fieldErrors()"
              (donate)="donate($event)"
            />
          } @else {
            <p class="support__signin">
              Sign in to donate: your donation history stays in your account.
            </p>
            <div class="support__actions">
              <a
                matButton="filled"
                routerLink="/auth/sign-in"
                [queryParams]="{ returnUrl: '/support' }"
                >Sign in</a
              >
              <a
                matButton="outlined"
                routerLink="/auth/sign-up"
                [queryParams]="{ returnUrl: '/support' }"
                >Create account</a
              >
            </div>
          }
        </section>

        <section class="support__card" aria-labelledby="supporters-title">
          <h2 id="supporters-title" class="support__title">
            <mat-icon aria-hidden="true">diversity_1</mat-icon>
            Thank you, supporters
          </h2>
          @if (store.supportersError(); as error) {
            <app-error-state
              compact
              title="The supporters could not load"
              [message]="message(error)"
              (retry)="store.loadSupporters()"
            />
          } @else if (store.supporters(); as supporters) {
            <app-supporters-list [supporters]="supporters.supporters ?? []" />
            @if (supporters.note) {
              <p class="support__fine">{{ supporters.note }}</p>
            }
          } @else {
            <app-skeleton variant="list" lines="3" />
          }
        </section>
      </div>

      @if (auth.isAuthenticated()) {
        <section aria-labelledby="mine-title">
          <h2 id="mine-title" class="support__title">Your donations</h2>
          @if (store.mineError(); as error) {
            <app-error-state
              compact
              title="Your donations could not load"
              [message]="message(error)"
              (retry)="store.loadMine()"
            />
          } @else if (store.mine(); as mine) {
            <app-my-donations [donations]="mine" />
          } @else {
            <app-skeleton variant="list" lines="2" />
          }
        </section>
      }
    </div>
  `,
  styles: `
    .support {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-6);
    }
    .support > * {
      max-width: 1040px;
    }
    .support__layout {
      display: grid;
      grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
      gap: var(--spacing-5);
      align-items: start;
    }
    .support__card {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
      padding: var(--spacing-6);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .support__badge {
      display: inline-flex;
      align-self: flex-start;
      align-items: center;
      gap: var(--spacing-1);
      margin: 0;
      padding: 2px var(--spacing-3);
      border-radius: var(--radius-pill);
      background: var(--color-accent-container);
      color: var(--color-on-accent-container);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }
    .support__badge mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .support__title {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      margin: 0 0 var(--spacing-2);
      font-size: var(--font-size-xl);
    }
    .support__note,
    .support__signin,
    .support__fine {
      margin: 0;
      color: var(--color-text-muted);
    }
    .support__fine {
      font-size: var(--font-size-xs);
    }
    .support__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2);
    }
    .support__thanks,
    .support__problem {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      margin: 0;
      padding: var(--spacing-3) var(--spacing-4);
      border-radius: var(--radius-md);
    }
    .support__thanks {
      border: 1px solid color-mix(in srgb, var(--color-success) 40%, transparent);
      background: color-mix(in srgb, var(--color-success) 12%, var(--color-surface));
    }
    .support__thanks mat-icon {
      color: var(--color-danger);
    }
    .support__problem {
      background: color-mix(in srgb, var(--color-danger) 10%, var(--color-surface));
      color: var(--color-danger);
    }
    @media (max-width: 839px) {
      .support__layout {
        grid-template-columns: 1fr;
      }
      .support__card {
        padding: var(--spacing-4);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupportPageComponent {
  protected readonly store = inject(SupportStore);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** `?donation=thanks` after a successful checkout. */
  readonly donation = input<string | undefined>();

  protected readonly note = DONATION_NOTE;
  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly fieldErrors = signal<DonationFieldErrors | null>(null);
  protected readonly thanks = computed(() => this.donation() === 'thanks');

  constructor() {
    void this.store.loadSupporters();
    effect(() => {
      if (this.auth.isAuthenticated()) {
        untracked(() => void this.store.loadMine());
      } else {
        untracked(() => this.store.clearMine());
      }
    });
  }

  protected message(error: Parameters<typeof friendlyMessage>[0]): string {
    return friendlyMessage(error);
  }

  protected async donate(request: DonationCheckoutRequest): Promise<void> {
    this.problem.set(null);
    this.fieldErrors.set(null);
    this.busy.set(true);
    const result = await this.store.startCheckout(request);
    this.busy.set(false);
    if (isApiError(result)) {
      const problem = donationProblem(result);
      this.problem.set(problem.message);
      this.fieldErrors.set({ amount: problem.amount, currency: problem.currency });
      return;
    }
    const target = checkoutTarget(result.url ?? result.donation?.checkoutUrl);
    if (!target) {
      this.problem.set('The payment provider did not return a checkout page. Please try again.');
    } else if (target.kind === 'app') {
      await this.router.navigateByUrl(target.path);
    } else {
      window.location.assign(target.url);
    }
  }
}
