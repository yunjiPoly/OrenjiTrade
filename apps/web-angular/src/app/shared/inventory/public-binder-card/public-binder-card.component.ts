import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { PublicBinderSummary } from '@orenji/api-client';
import { CardImageComponent } from '../../catalog/card-image/card-image.component';
import { FreshnessBadgeComponent } from '../../ui/freshness-badge/freshness-badge.component';
import { GameChipComponent } from '../../ui/game-chip/game-chip.component';
import { BINDER_KIND_INFO, BinderKind, badgeFreshness, endsLabel } from '../inventory-labels';

/** A public binder of a collector: cover, name (the link), kind, games, count and freshness. */
@Component({
  selector: 'app-public-binder-card',
  imports: [
    RouterLink,
    MatIconModule,
    CardImageComponent,
    FreshnessBadgeComponent,
    GameChipComponent,
  ],
  template: `
    @let b = binder();
    <article class="pbc">
      <div class="pbc__cover" aria-hidden="true">
        <app-card-image class="pbc__card pbc__card--back" [game]="firstGame()" />
        <app-card-image class="pbc__card" [src]="b.coverImageUrl" [game]="firstGame()" />
      </div>
      <div class="pbc__body">
        <p class="pbc__kind">
          <mat-icon aria-hidden="true">{{ kind().icon }}</mat-icon>
          {{ kind().label }}
        </p>
        <h3 class="pbc__name">
          <a class="pbc__link" [routerLink]="['/binders', b.id]">{{ b.name }}</a>
        </h3>
        <p class="pbc__count">
          {{ b.itemCount }} {{ b.itemCount === 1 ? 'card' : 'cards' }}
          @if (endsIn(); as ends) {
            · <span class="pbc__ends">Public, {{ ends }}</span>
          }
        </p>
        @if (b.games.length) {
          <div class="pbc__games">
            @for (game of b.games; track game) {
              <app-game-chip [slug]="game" />
            }
          </div>
        }
        <app-freshness-badge class="pbc__fresh" [state]="freshness()" [label]="b.freshness.label" />
      </div>
    </article>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .pbc {
      position: relative;
      display: flex;
      gap: var(--spacing-4);
      height: 100%;
      padding: var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      transition: box-shadow var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .pbc:hover,
    .pbc:focus-within {
      box-shadow: var(--elevation-menu);
    }
    .pbc__cover {
      position: relative;
      flex: 0 0 84px;
      height: 118px;
    }
    .pbc__card {
      position: absolute;
      inset: 0 auto auto 0;
      width: 76px;
    }
    .pbc__card--back {
      transform: translate(10px, 6px) rotate(8deg);
      opacity: 0.55;
    }
    .pbc__body {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .pbc__kind {
      display: flex;
      align-items: center;
      gap: 4px;
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .pbc__kind mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .pbc__name {
      font-size: var(--font-size-lg);
    }
    .pbc__link {
      color: var(--color-ink);
      text-decoration: none;
    }
    .pbc__link::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: var(--radius-lg);
    }
    .pbc__link:focus-visible {
      outline: none;
    }
    .pbc__link:focus-visible::after {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: var(--focus-offset);
    }
    .pbc__count {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .pbc__ends {
      color: var(--color-primary);
    }
    .pbc__games {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .pbc__fresh {
      margin-top: auto;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicBinderCardComponent {
  readonly binder = input.required<PublicBinderSummary>();

  protected readonly kind = computed(
    () => BINDER_KIND_INFO[this.binder().kind as BinderKind] ?? BINDER_KIND_INFO.CUSTOM,
  );
  protected readonly freshness = computed(() => badgeFreshness(this.binder().freshness.state));
  protected readonly endsIn = computed(() => endsLabel(this.binder().publicUntil));
  protected readonly firstGame = computed(() => this.binder().games.at(0) ?? '');
}
