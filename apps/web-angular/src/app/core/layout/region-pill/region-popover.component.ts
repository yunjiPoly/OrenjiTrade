import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
} from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { PLATFORM_REGION_NAMES, RegionsStore } from '../../../shared/regions/regions.store';
import { RegionContext } from '../../region/region-context.service';
import { PopoverRef } from '../popover/popover.service';
import { ShellIconComponent } from '../shell-icon/shell-icon.component';

/** The second line of each region (board W3's wording). */
export const REGION_LINES: Readonly<Record<string, string>> = {
  'americas-north': 'Canada, United States, Mexico',
  'americas-south': 'Brazil, Argentina, Chile and more',
  europe: 'France, Germany, Spain and more',
};

/**
 * The popover's lead: every place that follows the region, Community's rooms included (WF leftover
 * U12: the rooms follow the region too, from the top bar's pill or Community's own).
 */
export const REGION_LEAD =
  'Home, Search, the map and the community rooms show one region at a time. Cards ship within a region.';

export interface RegionRow {
  code: string;
  name: string;
  line: string;
  checked: boolean;
}

/**
 * "Choose a region" (spec 4.5, board W3): the three platform regions as radio rows, the
 * collector's own region marked "Your region"; arrow keys move, Enter or Space picks and closes,
 * Esc closes, and focus returns to the pill. Browsing another region than the home one shows
 * "Not your region" with the way back. Lazy chunk of the region pill.
 */
@Component({
  selector: 'app-region-popover',
  imports: [CdkTrapFocus, ShellIconComponent],
  template: `
    <div
      class="pop"
      role="dialog"
      aria-modal="true"
      cdkTrapFocus
      aria-labelledby="region-pop-title"
      aria-describedby="region-pop-lead"
    >
      <h2 class="pop__title" id="region-pop-title">Choose a region</h2>
      <p class="pop__lead" id="region-pop-lead">
        {{ lead }}
      </p>
      @if (away(); as home) {
        <p class="pop__away" data-testid="region-away">
          Not your region.
          <button type="button" class="pop__back" (click)="pick(home.code)">
            Back to {{ home.name }}
          </button>
        </p>
      }
      <div class="pop__rows" role="radiogroup" aria-labelledby="region-pop-title">
        @for (row of rows(); track row.code) {
          <button
            type="button"
            role="radio"
            class="pop__row"
            [attr.aria-checked]="row.checked"
            [attr.tabindex]="row.checked ? 0 : -1"
            [attr.data-code]="row.code"
            [attr.aria-label]="row.name + ', ' + row.line"
            (click)="pick(row.code)"
          >
            <span class="pop__text">
              <span class="pop__name">{{ row.name }}</span>
              <span class="pop__line">{{ row.line }}</span>
            </span>
            <span class="pop__radio" [class.pop__radio--on]="row.checked" aria-hidden="true"></span>
          </button>
        }
      </div>
      <p class="pop__foot">
        Your own region comes from Settings › Location. Browsing another one changes nothing on your
        profile.
      </p>
      <button type="button" class="pop__close" aria-label="Close" (click)="ref.close()">
        <app-shell-icon name="close" [size]="18" />
      </button>
    </div>
  `,
  styleUrl: '../popover/popover-rows.scss',
  host: { '(keydown)': 'onKeydown($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegionPopoverComponent {
  protected readonly ref = inject(PopoverRef);
  protected readonly lead = REGION_LEAD;
  private readonly context = inject(RegionContext);
  private readonly regions = inject(RegionsStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly rows = computed<RegionRow[]>(() => {
    const loaded = this.regions.regions();
    const codes =
      loaded.length > 0 ? loaded.map((r) => r.code) : Object.keys(PLATFORM_REGION_NAMES);
    const home = this.context.home();
    return codes.map((code) => {
      const line = REGION_LINES[code] ?? '';
      return {
        code,
        name: this.regions.regionName(code),
        line: code === home ? `Your region · ${line}` : line,
        checked: code === this.context.current(),
      };
    });
  });

  /** The home region while another one is browsed. */
  protected readonly away = computed(() => {
    const home = this.context.home();
    return home && this.context.browsingAway()
      ? { code: home, name: this.regions.regionName(home) }
      : null;
  });

  constructor() {
    void this.regions.load();
    afterNextRender(() =>
      this.host.nativeElement
        .querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')
        ?.focus(),
    );
  }

  protected pick(code: string): void {
    this.context.select(code);
    this.ref.close();
  }

  /** Arrow keys move between the rows (a radio group, one tab stop). */
  protected onKeydown(event: KeyboardEvent): void {
    const keys = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(event.key)) {
      return;
    }
    event.preventDefault();
    const radios = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>(
        '[role="radio"]:not([aria-disabled="true"])',
      ),
    );
    const index = radios.indexOf(
      this.host.nativeElement.ownerDocument.activeElement as HTMLElement,
    );
    const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? radios.length - 1
          : (index + step + radios.length) % radios.length;
    radios.forEach((radio, i) => radio.setAttribute('tabindex', i === next ? '0' : '-1'));
    radios[next]?.focus();
  }
}
