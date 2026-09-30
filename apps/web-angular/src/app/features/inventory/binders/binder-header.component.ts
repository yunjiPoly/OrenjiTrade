import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import type { BinderResponse } from '@orenji/api-client';
import {
  BINDER_KIND_INFO,
  BinderKind,
  PublishMode,
  badgeFreshness,
} from '../../../shared/inventory/inventory-labels';
import { FreshnessBadgeComponent } from '../../../shared/ui/freshness-badge/freshness-badge.component';
import { GameChipComponent } from '../../../shared/ui/game-chip/game-chip.component';
import { VisibilityBadgeComponent } from '../../../shared/ui/visibility-badge/visibility-badge.component';
import { VisibilityStatus } from '../data/visibility-status';
import { BinderPublishMenuComponent } from './binder-publish-menu.component';

/** Header of the selected binder: details, visibility, freshness and its actions. */
@Component({
  selector: 'app-binder-header',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    BinderPublishMenuComponent,
    FreshnessBadgeComponent,
    GameChipComponent,
    VisibilityBadgeComponent,
  ],
  template: `
    @let b = binder();
    <section class="bh" [attr.aria-labelledby]="'binder-title-' + b.id">
      <div class="bh__text">
        <p class="bh__kind">
          <mat-icon aria-hidden="true">{{ kind().icon }}</mat-icon>
          {{ kind().label }}
        </p>
        <h2 class="bh__title" [id]="'binder-title-' + b.id">{{ b.name }}</h2>
        @if (b.description) {
          <p class="bh__description">{{ b.description }}</p>
        }
        <div class="bh__facts">
          <app-visibility-badge
            showLabel
            data-testid="binder-visibility"
            [visibility]="status().visibility"
            [pending]="status().pending"
            [label]="status().label"
            [note]="status().note"
          />
          <span class="bh__count">
            {{ b.itemCount }} {{ b.itemCount === 1 ? 'card' : 'cards' }} ·
            {{ b.publicItemCount }} public
          </span>
          <app-freshness-badge [state]="freshness()" [label]="b.freshness.label" />
          @for (game of b.games; track game) {
            <app-game-chip [slug]="game" />
          }
        </div>
        @if (status().pending) {
          <p class="bh__note">{{ status().note }}</p>
        }
      </div>
      <div class="bh__actions">
        <app-binder-publish-menu
          [binder]="b"
          [disabled]="busy()"
          (publish)="publish.emit($event)"
          (unpublish)="unpublish.emit()"
        />
        @if (b.effectivePublic) {
          <a matButton="outlined" [routerLink]="['/binders', b.id]">
            <mat-icon aria-hidden="true">open_in_new</mat-icon>
            View public page
          </a>
        }
        <button
          matIconButton
          type="button"
          [matMenuTriggerFor]="more"
          [attr.aria-label]="'More actions for ' + b.name"
        >
          <mat-icon>more_vert</mat-icon>
        </button>
        <mat-menu #more="matMenu">
          <button mat-menu-item type="button" (click)="edit.emit()">
            <mat-icon aria-hidden="true">edit</mat-icon>
            Edit details
          </button>
          <button mat-menu-item type="button" (click)="confirm.emit()">
            <mat-icon aria-hidden="true">task_alt</mat-icon>
            Confirm still available
          </button>
          <button mat-menu-item type="button" (click)="remove.emit()">
            <mat-icon aria-hidden="true">delete</mat-icon>
            Delete binder
          </button>
        </mat-menu>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .bh {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--spacing-3) var(--spacing-5);
      padding: var(--spacing-4) var(--spacing-5);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background:
        radial-gradient(
          circle at 100% 0%,
          color-mix(in srgb, var(--color-primary) 12%, transparent),
          transparent 55%
        ),
        var(--color-surface);
    }
    .bh__text {
      display: flex;
      flex: 1 1 320px;
      flex-direction: column;
      gap: var(--spacing-1);
      min-width: 0;
    }
    .bh__kind {
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
    .bh__kind mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .bh__title {
      font-size: var(--font-size-2xl);
    }
    .bh__description {
      margin: 0;
      color: var(--color-text-muted);
    }
    .bh__facts {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2);
      margin-top: var(--spacing-2);
    }
    .bh__count {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .bh__note {
      margin: var(--spacing-2) 0 0;
      color: color-mix(in srgb, var(--color-warning) 60%, var(--color-ink));
      font-size: var(--font-size-sm);
    }
    .bh__actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BinderHeaderComponent {
  readonly binder = input.required<BinderResponse>();
  readonly status = input.required<VisibilityStatus>();
  readonly busy = input(false, { transform: booleanAttribute });
  readonly publish = output<PublishMode>();
  readonly unpublish = output<void>();
  readonly confirm = output<void>();
  readonly edit = output<void>();
  readonly remove = output<void>();

  protected readonly kind = computed(
    () => BINDER_KIND_INFO[this.binder().kind as BinderKind] ?? BINDER_KIND_INFO.CUSTOM,
  );
  protected readonly freshness = computed(() => badgeFreshness(this.binder().freshness.state));
}
