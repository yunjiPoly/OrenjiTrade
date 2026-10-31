import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import {
  ShellIconComponent,
  ShellIconName,
} from '../../core/layout/shell-icon/shell-icon.component';

export type GuestPageKind = 'inventory' | 'messages' | 'profile' | 'collector' | 'notifications';

/** The words of the guest pages (spec 14; the phone's R15 screens 72 to 75). English only. */
export const GUEST_PAGES: Readonly<
  Record<GuestPageKind, { tab: string; icon: ShellIconName; title: string; text: string }>
> = {
  inventory: {
    tab: 'Inventory',
    icon: 'inventory',
    title: 'Your cards, in one place',
    text: 'Add cards in seconds, sort them into binders, and let collectors in your region find the ones you sell or trade.',
  },
  messages: {
    tab: 'Messages',
    icon: 'messages',
    title: 'Talk to collectors',
    text: 'Message a collector about a card, agree on the deal, and join your game’s room for your region.',
  },
  profile: {
    tab: 'Profile',
    icon: 'profile',
    title: 'Your collector profile',
    text: 'Show your cards, binders and wishes, and build trust with ratings from the collectors you deal with.',
  },
  // A collector's profile and the notifications, in place, as the guest pages and the sign-in
  // dialog say it (WG review U5: [Create account] first, curly quotes).
  collector: {
    tab: 'Profile',
    icon: 'profile',
    title: 'Sign in to see collector profiles',
    text: 'It’s free. When you’re done, you come right back here.',
  },
  notifications: {
    tab: 'Notifications',
    icon: 'bell',
    title: 'Notifications are for members',
    text: 'Sign in to get wishlist alerts, sales and ratings in one place.',
  },
};

/** Profile's rows for a guest (spec 14: "also listing Appearance, Trading safely and Legal"). */
export const GUEST_PROFILE_ROWS: readonly {
  label: string;
  line: string | null;
  link: string;
  icon: ShellIconName;
}[] = [
  { label: 'Appearance', line: null, link: '/settings/appearance', icon: 'moon' },
  { label: 'Trading safely', line: null, link: '/legal/trading-safely', icon: 'shieldCheck' },
  { label: 'Legal', line: 'Terms, privacy, guidelines', link: '/legal', icon: 'fileText' },
];

/**
 * The page a guest gets in place of Inventory, Messages or Profile (spec 14; the phone's R15), and
 * in place of a collector's profile or the notifications: a
 * 520 column, a 64 icon tile, the title (Sora 30) and what an account gives, [Create account]
 * (orange) and [Sign in] (outline), both back to this very page after (its full address, a
 * community room's too: WF leftover U13). Profile also lists Appearance, Trading safely and
 * Legal, which a guest can open.
 */
@Component({
  selector: 'app-guest-page',
  imports: [RouterLink, ShellIconComponent],
  template: `
    @let page = copy();
    <div class="guest" [attr.data-testid]="'guest-page-' + kind()">
      <span class="guest__tile" aria-hidden="true">
        <app-shell-icon [name]="page.icon" [size]="30" />
      </span>
      <h1 class="guest__title">{{ page.title }}</h1>
      <p class="guest__text">{{ page.text }}</p>
      <div class="guest__buttons">
        <a
          class="guest__btn guest__btn--primary"
          routerLink="/auth/sign-up"
          [queryParams]="{ returnUrl: returnUrl() }"
          >Create account</a
        >
        <a
          class="guest__btn guest__btn--outline"
          routerLink="/auth/sign-in"
          [queryParams]="{ returnUrl: returnUrl() }"
          >Sign in</a
        >
      </div>
      @if (kind() === 'profile') {
        <h2 class="guest__label" id="guest-settings">Settings</h2>
        <ul class="guest__rows" aria-labelledby="guest-settings">
          @for (row of rows; track row.link) {
            <li>
              <a class="guest__row" [routerLink]="row.link">
                <span class="guest__row-icon" aria-hidden="true">
                  <app-shell-icon [name]="row.icon" [size]="20" />
                </span>
                <span class="guest__row-text">
                  <span class="guest__row-label">{{ row.label }}</span>
                  @if (row.line) {
                    <span class="guest__row-line">{{ row.line }}</span>
                  }
                </span>
                <app-shell-icon name="chevronRight" [size]="18" />
              </a>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .guest {
      display: flex;
      flex-direction: column;
      align-items: center;
      box-sizing: border-box;
      width: 100%;
      max-width: 520px;
      margin: 0 auto;
      padding: 72px 16px 48px;
      text-align: center;
    }
    .guest__tile {
      display: grid;
      place-items: center;
      width: 64px;
      height: 64px;
      border-radius: 18px;
      background: var(--color-primary-tint);
      color: var(--app-primary-text, var(--color-primary));
    }
    .guest__title {
      margin: 24px 0 0;
      font-family: var(--font-display);
      font-size: 30px;
      font-weight: var(--font-weight-bold);
      line-height: 36px;
      letter-spacing: -0.5px;
    }
    .guest__text {
      margin: 12px 0 0;
      color: var(--color-text-muted);
      font-size: 15px;
      line-height: 24px;
    }
    .guest__buttons {
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: 100%;
      max-width: 360px;
      margin-top: 32px;
    }
    .guest__btn {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 52px;
      border-radius: var(--radius-pill);
      font-size: 16px;
      font-weight: var(--font-weight-bold);
      text-decoration: none;
    }
    .guest__btn--primary {
      background: var(--color-primary);
      color: var(--color-on-primary);
    }
    .guest__btn--primary:hover {
      background: var(--color-primary-hover);
    }
    .guest__btn--outline {
      border: 1px solid var(--color-border-strong);
      color: var(--color-ink);
      font-size: 15px;
      font-weight: var(--font-weight-semibold);
    }
    .guest__btn--outline:hover {
      background: var(--color-surface-variant);
    }
    .guest__label {
      align-self: stretch;
      margin: 48px 0 8px;
      color: var(--color-text-muted);
      font-family: var(--font-body);
      font-size: 12px;
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.06em;
      text-align: left;
      text-transform: uppercase;
    }
    .guest__rows {
      align-self: stretch;
      margin: 0;
      padding: 0;
      overflow: hidden;
      border: 1px solid var(--color-border);
      border-radius: 16px;
      background: var(--color-surface);
      list-style: none;
    }
    .guest__rows li + li {
      border-top: 1px solid var(--color-border);
    }
    .guest__row {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 56px;
      padding: 8px 16px;
      color: var(--color-text-muted);
      text-align: left;
      text-decoration: none;
    }
    .guest__row:hover {
      background: var(--color-surface-variant);
    }
    .guest__row-icon {
      display: grid;
      place-items: center;
      color: var(--color-text-secondary);
    }
    .guest__row-text {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 0;
    }
    .guest__row-label {
      color: var(--color-ink);
      font-size: 15px;
      font-weight: var(--font-weight-semibold);
    }
    .guest__row-line {
      font-size: 13px;
    }
    .guest__btn:focus-visible,
    .guest__row:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: var(--focus-offset);
    }
    @media (max-width: 959.98px) {
      .guest {
        padding-top: 32px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuestPageComponent {
  private readonly router = inject(Router);

  readonly kind = input.required<GuestPageKind>();

  protected readonly copy = computed(() => GUEST_PAGES[this.kind()]);
  protected readonly rows = GUEST_PROFILE_ROWS;
  /** The page's full address (a room's, a filtered list's): signing in comes back to it. */
  protected readonly returnUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
}
