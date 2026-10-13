import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { PLATFORM_REGION_NAMES, RegionsStore } from '../../../shared/regions/regions.store';
import { RegionContext } from '../../region/region-context.service';

interface RegionOption {
  code: string;
  name: string;
}

/**
 * Top-left platform region switcher (ADR 0017): shows the region the app browses and lets the
 * visitor pick another one. Signed-in collectors start in their home region; signed-out visitors
 * keep their last choice on this browser. Every region-scoped page follows the change.
 */
@Component({
  selector: 'app-region-switcher',
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  template: `
    <button
      matButton
      type="button"
      class="region-switcher"
      data-testid="region-switcher"
      [matMenuTriggerFor]="menu"
      [attr.aria-label]="'Region: ' + currentName() + '. Change region'"
    >
      <mat-icon aria-hidden="true">public</mat-icon>
      <span class="region-switcher__name">{{ currentName() }}</span>
      <mat-icon class="region-switcher__caret" aria-hidden="true">arrow_drop_down</mat-icon>
    </button>
    <mat-menu #menu="matMenu" xPosition="after">
      @for (option of options(); track option.code) {
        <button
          mat-menu-item
          type="button"
          role="menuitemradio"
          [attr.aria-checked]="option.code === context.current()"
          (click)="context.select(option.code)"
        >
          <mat-icon aria-hidden="true">{{
            option.code === context.current() ? 'radio_button_checked' : 'radio_button_unchecked'
          }}</mat-icon>
          <span>{{ option.name }}</span>
          @if (option.code === context.home()) {
            <span class="region-switcher__home">· your region</span>
          }
        </button>
      }
    </mat-menu>
  `,
  styles: `
    .region-switcher {
      color: var(--color-ink);
      font-weight: var(--font-weight-medium);
      min-width: 0;
      padding-inline: var(--spacing-2);
    }
    .region-switcher mat-icon {
      margin-right: var(--spacing-1);
    }
    .region-switcher__caret {
      margin: 0 0 0 calc(var(--spacing-1) * -1);
    }
    .region-switcher__name {
      max-width: 9.5rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .region-switcher__home {
      color: var(--color-text-muted);
      margin-left: var(--spacing-1);
      font-size: var(--font-size-sm);
    }
    @media (max-width: 419px) {
      .region-switcher__name {
        display: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegionSwitcherComponent {
  protected readonly context = inject(RegionContext);
  private readonly regions = inject(RegionsStore);

  /** The three regions: the server's names once loaded, the built-in names before. */
  protected readonly options = computed<RegionOption[]>(() => {
    const loaded = this.regions.regions();
    if (loaded.length > 0) {
      return loaded.map((region) => ({ code: region.code, name: region.name }));
    }
    return Object.entries(PLATFORM_REGION_NAMES).map(([code, name]) => ({ code, name }));
  });

  protected readonly currentName = computed(() => this.regions.regionName(this.context.current()));
}
