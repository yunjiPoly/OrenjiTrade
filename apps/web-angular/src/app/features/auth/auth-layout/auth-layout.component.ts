import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  inject,
  input,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { safeReturnUrl } from '../../../core/auth/auth.guards';
import { GuestActions } from '../../../core/guest/guest-actions.service';
import {
  ShellIconComponent,
  ShellIconName,
} from '../../../core/layout/shell-icon/shell-icon.component';
import { ShellLayout } from '../../../core/layout/shell-layout.service';
import { AuthArtComponent } from '../auth-art/auth-art.component';

/**
 * The split page of the sign-in steps (spec 14, board W27), without the rail or the top bar: the
 * form panel (560 at 1440, a 400 column) with "Not now, keep browsing" at the top (back to the
 * page the visitor came from), the wordmark (Sora 32), the page's title and lead, the form, and
 * "Terms, privacy and community guidelines" at the bottom; beside it, at 960 and wider, the right
 * panel (`surfaceVariant`) with "Who in my region has this card?" and its decorative map. Below
 * 960 the form only. An account state (`card`) is the same frame without the right panel, its
 * words in a centred 480 card (spec 14, "Account states").
 */
@Component({
  selector: 'app-auth-layout',
  imports: [RouterLink, ShellIconComponent, AuthArtComponent],
  template: `
    <div class="auth" [class.auth--card]="card()">
      <div class="auth__main">
        <div class="auth__top">
          @if (closeTarget(); as target) {
            <a
              class="auth__close"
              [routerLink]="target"
              data-testid="auth-close"
              (click)="guest.forget()"
            >
              <app-shell-icon name="close" [size]="20" [stroke]="2" />
              Not now, keep browsing
            </a>
          }
        </div>
        <div class="auth__middle">
          <div class="auth__column">
            <p class="auth__wordmark">Orenji<span class="auth__trade">Trade</span></p>
            @if (icon(); as name) {
              <span class="auth__tile" [attr.data-tone]="tone()" aria-hidden="true">
                <app-shell-icon [name]="name" [size]="28" />
              </span>
            }
            <h1
              class="auth__title"
              [class.visually-hidden]="hideHeading()"
              [class.auth__title--after-tile]="!!icon()"
            >
              {{ heading() }}
            </h1>
            @if (lead()) {
              <p class="auth__lead" [class.auth__lead--first]="hideHeading()">{{ lead() }}</p>
            }
            <ng-content />
          </div>
        </div>
        <p class="auth__legal">
          <a routerLink="/legal">Terms, privacy and community guidelines</a>
        </p>
      </div>
      @if (!card() && !layout.narrow()) {
        <app-auth-art class="auth__art" />
      }
    </div>
  `,
  styleUrl: './auth-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthLayoutComponent {
  protected readonly layout = inject(ShellLayout);
  /** "Not now, keep browsing" forgets what the guest tried to do (as the phone's Sign in close). */
  protected readonly guest = inject(GuestActions);
  private readonly router = inject(Router);

  /** The page's h1 (Sign in's is read by screen readers only, the wordmark leading the page). */
  readonly heading = input.required<string>();
  readonly hideHeading = input(false, { transform: booleanAttribute });
  /** The line under the title. */
  readonly lead = input('');
  /** The 56 tile above the title (the mail of Check your inbox, an account state's sign). */
  readonly icon = input<ShellIconName | null>(null);
  readonly tone = input<'accent' | 'warning' | 'danger'>('accent');
  /**
   * "Not now, keep browsing": shown for a visitor who may go back to browsing (sign in, create
   * account, reset password), never on a step of a signed-in account.
   */
  readonly closable = input(false, { transform: booleanAttribute });
  /** Where "Not now" goes: the page the visitor came from (`?returnUrl=`), else Home. */
  readonly returnUrl = input<string | null | undefined>(null);
  /** An account state: a centred 480 card, no right panel. */
  readonly card = input(false, { transform: booleanAttribute });

  protected readonly closeTarget = computed(() =>
    this.closable() ? this.router.parseUrl(safeReturnUrl(this.returnUrl())) : null,
  );
}
