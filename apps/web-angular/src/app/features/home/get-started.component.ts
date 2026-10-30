import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ShellIconComponent } from '../../core/layout/shell-icon/shell-icon.component';
import { GetStartedSteps } from './home-rules';

/**
 * Get started (spec 5.3, board W2; the phone's R7 card): "Do these once to sell and find cards in
 * your region.", a 3-part bar with "1 of 3" and "Hide these steps", and the three steps: choose
 * your province (done: "Quebec, Canada"; hidden from the map: "Turn on"), list your first card
 * ([Add cards], the view's one orange) and add a card you want ([Add a wish]).
 */
@Component({
  selector: 'app-get-started',
  imports: [RouterLink, ShellIconComponent],
  template: `
    @let s = steps();
    <section class="gs" aria-labelledby="get-started-title" data-testid="get-started">
      <div class="gs__head">
        <h2 class="gs__title" id="get-started-title">Get started</h2>
        <button
          type="button"
          class="gs__close"
          aria-label="Hide these steps"
          data-testid="get-started-hide"
          (click)="hide.emit()"
        >
          <app-shell-icon name="close" [size]="18" />
        </button>
      </div>
      <p class="gs__intro">Do these once to sell and find cards in your region.</p>
      <div
        class="gs__bar"
        role="progressbar"
        aria-label="Get started"
        aria-valuemin="0"
        aria-valuemax="3"
        [attr.aria-valuenow]="s.done"
        [attr.aria-valuetext]="s.done + ' of 3 done'"
      >
        @for (part of parts; track part) {
          <span class="gs__part" [class.gs__part--done]="part < s.done"></span>
        }
        <span class="gs__count" aria-hidden="true">{{ s.done }} of 3</span>
      </div>
      <ol class="gs__steps">
        <li class="gs__step" [class.gs__step--done]="s.province.state === 'done'">
          <span class="gs__mark" aria-hidden="true">
            @if (s.province.state === 'done') {
              <app-shell-icon name="check" [size]="14" />
            } @else {
              1
            }
          </span>
          <div class="gs__body">
            <p class="gs__name">
              Choose your province
              @if (s.province.state === 'done') {
                <span class="visually-hidden">, done</span>
              }
            </p>
            @switch (s.province.state) {
              @case ('done') {
                <p class="gs__sub">{{ placeOf() }}</p>
              }
              @case ('hidden') {
                <p class="gs__sub">Turn on Show me on the map</p>
                <a class="gs__action" routerLink="/settings/location">Turn on</a>
              }
              @default {
                <p class="gs__sub">So collectors in your region can find your cards</p>
                <a class="gs__action" routerLink="/settings/location">Choose</a>
              }
            }
          </div>
        </li>
        <li class="gs__step" [class.gs__step--done]="s.card">
          <span class="gs__mark" aria-hidden="true">
            @if (s.card) {
              <app-shell-icon name="check" [size]="14" />
            } @else {
              2
            }
          </span>
          <div class="gs__body">
            <p class="gs__name">
              List your first card
              @if (s.card) {
                <span class="visually-hidden">, done</span>
              }
            </p>
            <p class="gs__sub">Add a card and set it to Public</p>
            @if (!s.card) {
              <a class="gs__action gs__action--primary" routerLink="/inventory" [queryParams]="{ add: 'new' }"
                >Add cards</a
              >
            }
          </div>
        </li>
        <li class="gs__step" [class.gs__step--done]="s.wish">
          <span class="gs__mark" aria-hidden="true">
            @if (s.wish) {
              <app-shell-icon name="check" [size]="14" />
            } @else {
              3
            }
          </span>
          <div class="gs__body">
            <p class="gs__name">
              Add a card you want
              @if (s.wish) {
                <span class="visually-hidden">, done</span>
              }
            </p>
            <p class="gs__sub">We'll tell you when someone lists it</p>
            @if (!s.wish) {
              <a class="gs__action" routerLink="/search" [queryParams]="{ tab: 'wishlist' }"
                >Add a wish</a
              >
            }
          </div>
        </li>
      </ol>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .gs {
      padding: 20px;
      border: 1px solid var(--color-border);
      border-radius: 16px;
      background: var(--color-surface);
    }
    .gs__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .gs__title {
      margin: 0;
      font-family: var(--font-display);
      font-size: 17px;
      font-weight: var(--font-weight-bold);
    }
    .gs__close {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--color-text-muted);
      cursor: pointer;
    }
    .gs__close:hover {
      background: var(--color-surface-variant);
      color: var(--color-ink);
    }
    .gs__intro {
      margin: 6px 0 0;
      color: var(--color-text-secondary);
      font-size: 13px;
    }
    .gs__bar {
      display: flex;
      align-items: center;
      gap: 4px;
      margin: 16px 0 4px;
    }
    .gs__part {
      flex: 1;
      height: 4px;
      border-radius: 2px;
      background: var(--color-surface-variant);
    }
    .gs__part--done {
      background: var(--color-primary);
    }
    .gs__count {
      margin-left: 8px;
      color: var(--color-text-secondary);
      font-size: 12px;
      font-weight: var(--font-weight-semibold);
    }
    .gs__steps {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .gs__step {
      display: flex;
      gap: 12px;
      padding: 14px 0;
      border-top: 1px solid var(--color-border);
    }
    .gs__mark {
      display: grid;
      flex: none;
      place-items: center;
      width: 28px;
      height: 28px;
      border: 1px solid var(--color-border-strong);
      border-radius: 50%;
      color: var(--color-ink);
      font-size: 12px;
      font-weight: var(--font-weight-semibold);
    }
    .gs__step--done .gs__mark {
      border-color: transparent;
      background: var(--color-accent-tint);
      color: var(--color-accent);
    }
    .gs__body {
      min-width: 0;
    }
    .gs__name {
      margin: 3px 0 0;
      font-weight: var(--font-weight-semibold);
    }
    .gs__step--done .gs__name {
      color: var(--color-text-secondary);
    }
    .gs__sub {
      margin: 2px 0 0;
      color: var(--color-text-secondary);
      font-size: 13px;
    }
    .gs__action {
      display: inline-flex;
      align-items: center;
      min-height: 40px;
      margin-top: 12px;
      padding: 0 16px;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-pill);
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
      text-decoration: none;
    }
    .gs__action:hover {
      background: var(--color-surface-variant);
    }
    .gs__action--primary {
      border-color: transparent;
      background: var(--color-primary);
      color: var(--color-on-primary);
    }
    .gs__action--primary:hover {
      background: var(--color-primary-hover);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GetStartedComponent {
  readonly steps = input.required<GetStartedSteps>();
  readonly hide = output<void>();
  protected readonly parts = [0, 1, 2];
  protected readonly placeOf = computed(() => {
    const province = this.steps().province;
    return province.state === 'done' ? province.place : '';
  });
}
