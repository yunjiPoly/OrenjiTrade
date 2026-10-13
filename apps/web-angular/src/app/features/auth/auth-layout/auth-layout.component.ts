import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CardArtComponent } from '../../../shared/ui/card-art/card-art.component';

/**
 * Two-column frame of the authentication pages: a brand panel with card art on the left (a slim
 * banner on phones) and the page's form on the right.
 */
@Component({
  selector: 'app-auth-layout',
  imports: [MatIconModule, CardArtComponent],
  template: `
    <div class="auth">
      <aside class="auth__hero" aria-hidden="true">
        <div class="auth__fan">
          <app-card-art class="auth__card auth__card--left" game="pokemon" />
          <app-card-art class="auth__card auth__card--mid" game="mtg" />
          <app-card-art class="auth__card auth__card--right" game="yugioh" />
        </div>
        <p class="auth__tagline">Who in my region has this card?</p>
        <ul class="auth__points">
          <li><mat-icon>public</mat-icon>Find collectors and binders of your state or province</li>
          <li><mat-icon>style</mat-icon>Publish binders for Pokémon, Magic, Yu-Gi-Oh! and more</li>
          <li><mat-icon>shield_person</mat-icon>No GPS, no exact location: you choose your area</li>
        </ul>
      </aside>
      <section class="auth__panel">
        <div class="auth__form">
          <header class="auth__header">
            <h1 class="auth__title">{{ heading() }}</h1>
            @if (subheading()) {
              <p class="auth__subtitle">{{ subheading() }}</p>
            }
          </header>
          <ng-content />
        </div>
      </section>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .auth {
      display: grid;
      grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
      min-height: calc(100dvh - 64px);
    }
    .auth__hero {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: var(--spacing-6);
      padding: var(--spacing-10) var(--spacing-8);
      color: #fff;
      background:
        radial-gradient(circle at 20% 15%, rgb(255 255 255 / 0.18), transparent 40%),
        linear-gradient(150deg, #f4761a 0%, #c2410c 55%, #7c2d12 100%);
    }
    .auth__fan {
      position: relative;
      height: 200px;
      --card-width: 112px;
    }
    .auth__card {
      position: absolute;
      top: 10px;
      left: 50%;
      transition: transform var(--motion-duration-slow) var(--motion-easing-standard);
    }
    .auth__card--left {
      transform: translateX(-130%) rotate(-12deg);
    }
    .auth__card--mid {
      transform: translateX(-50%) translateY(-12px);
      z-index: 1;
    }
    .auth__card--right {
      transform: translateX(30%) rotate(12deg);
    }
    .auth__tagline {
      margin: 0;
      font-family: var(--font-display);
      font-size: var(--font-size-3xl);
      font-weight: var(--font-weight-bold);
      line-height: var(--line-height-heading);
      text-align: center;
    }
    .auth__points {
      display: grid;
      gap: var(--spacing-3);
      margin: 0 auto;
      padding: 0;
      list-style: none;
      max-width: 36ch;
    }
    .auth__points li {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
    }
    .auth__panel {
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: var(--spacing-10) var(--spacing-4);
      background: var(--color-background);
    }
    .auth__form {
      width: min(440px, 100%);
    }
    .auth__header {
      margin-bottom: var(--spacing-6);
    }
    .auth__title {
      font-size: var(--font-size-3xl);
    }
    .auth__subtitle {
      margin: var(--spacing-2) 0 0;
      color: var(--color-text-muted);
    }
    @media (max-width: 959px) {
      .auth {
        grid-template-columns: 1fr;
        min-height: 0;
      }
      .auth__hero {
        flex-direction: row;
        align-items: center;
        gap: var(--spacing-4);
        padding: var(--spacing-4);
      }
      .auth__fan {
        height: 72px;
        width: 88px;
        flex: 0 0 auto;
        --card-width: 44px;
      }
      .auth__card {
        top: 6px;
      }
      .auth__tagline {
        font-size: var(--font-size-lg);
        text-align: left;
      }
      .auth__points {
        display: none;
      }
      .auth__panel {
        padding: var(--spacing-6) var(--spacing-4) var(--spacing-10);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthLayoutComponent {
  readonly heading = input.required<string>();
  readonly subheading = input('');
}
