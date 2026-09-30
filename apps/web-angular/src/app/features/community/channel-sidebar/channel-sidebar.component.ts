import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { CommunityChannel } from '@orenji/api-client';
import { GAMES } from '../../../shared/domain/games';
import { channelIcon, groupChannels } from '../data/community-helpers';

/**
 * Channel navigation of `/community`: a game filter, then channels grouped by region, game-wide and
 * topics, each with its activity of the last 24 hours. Links, so channels are shareable and the
 * browser history works; the current channel carries `aria-current`.
 */
@Component({
  selector: 'app-channel-sidebar',
  imports: [RouterLink, MatIconModule],
  template: `
    <nav class="sidebar" aria-label="Community channels">
      <div class="filters" role="group" aria-label="Filter channels by game">
        <button
          type="button"
          class="filter"
          [class.filter--on]="game() === null"
          [attr.aria-pressed]="game() === null"
          (click)="game.set(null)"
        >
          All games
        </button>
        @for (g of games; track g.slug) {
          <button
            type="button"
            class="filter"
            [class.filter--on]="game() === g.slug"
            [attr.aria-pressed]="game() === g.slug"
            (click)="game.set(g.slug)"
          >
            {{ g.shortLabel }}
          </button>
        }
      </div>
      @for (group of groups(); track group.key) {
        <section class="group" [attr.aria-labelledby]="'group-' + $index">
          <h2 class="group__title" [id]="'group-' + $index">{{ group.label }}</h2>
          <ul class="group__list">
            @for (channel of group.channels; track channel.id) {
              <li>
                <a
                  class="channel"
                  [class.channel--active]="channel.slug === selected()"
                  [routerLink]="['/community', channel.slug]"
                  [attr.aria-current]="channel.slug === selected() ? 'page' : null"
                >
                  <mat-icon class="channel__icon" aria-hidden="true">{{ icon(channel) }}</mat-icon>
                  <span class="channel__name">{{ channel.name }}</span>
                  @if (channel.postCount24h > 0) {
                    <span
                      class="channel__count"
                      [attr.aria-label]="channel.postCount24h + ' posts today'"
                    >
                      {{ channel.postCount24h }}
                    </span>
                  }
                </a>
              </li>
            }
          </ul>
        </section>
      }
    </nav>
  `,
  styles: `
    :host {
      display: block;
    }
    .sidebar {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-4);
    }
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-1);
    }
    .filter {
      padding: 4px var(--spacing-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: var(--color-text-muted);
      font: inherit;
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      cursor: pointer;
    }
    .filter--on {
      border-color: var(--color-primary);
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
    }
    .filter:focus-visible,
    .channel:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: var(--focus-offset);
    }
    .group__title {
      margin: 0 0 var(--spacing-1);
      padding: 0 var(--spacing-3);
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .group__list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .channel {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      padding: var(--spacing-2) var(--spacing-3);
      border-radius: var(--radius-pill);
      color: var(--color-ink);
      text-decoration: none;
      transition: background var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .channel:hover {
      background: var(--color-surface-variant);
    }
    .channel--active {
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
      font-weight: var(--font-weight-semibold);
    }
    .channel__icon {
      width: 20px;
      height: 20px;
      font-size: 20px;
      opacity: 0.8;
    }
    .channel__name {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .channel__count {
      min-width: 20px;
      padding: 0 6px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      font-size: var(--font-size-xs);
      text-align: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelSidebarComponent {
  readonly channels = input.required<readonly CommunityChannel[]>();
  readonly selected = input<string | null>(null);
  /** Chosen game filter (null: every game). */
  protected readonly game = signal<string | null>(null);

  protected readonly games = GAMES;
  protected readonly groups = computed(() => groupChannels(this.channels(), this.game()));

  protected icon(channel: CommunityChannel): string {
    return channelIcon(channel.kind);
  }
}
