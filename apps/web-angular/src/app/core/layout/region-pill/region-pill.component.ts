import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RegionsStore } from '../../../shared/regions/regions.store';
import { RegionContext } from '../../region/region-context.service';
import { PopoverRef, Popovers } from '../popover/popover.service';
import { ShellIconComponent } from '../shell-icon/shell-icon.component';

/** "Region: Americas (North). Change region" (the pill's name, the phone's wording). */
export function regionPillLabel(name: string): string {
  return `Region: ${name}. Change region`;
}

/**
 * The top bar's region pill (spec 4.2 and 2.4): a teal globe, the browsed region and a chevron,
 * 36 tall; compact at md (globe and chevron, the name in the tooltip and the popover). Its border
 * turns orange while another region than the collector's own is browsed. Opens "Choose a region"
 * (a lazy chunk).
 */
@Component({
  selector: 'app-region-pill',
  imports: [ShellIconComponent],
  template: `
    <button
      #pill
      type="button"
      class="pill"
      data-testid="region-pill"
      [class.pill--away]="context.browsingAway()"
      aria-haspopup="dialog"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="label()"
      [attr.title]="name()"
      (click)="toggle()"
    >
      <app-shell-icon class="pill__globe" name="globe" [size]="18" />
      <span class="pill__name">{{ name() }}</span>
      <app-shell-icon
        class="pill__chevron"
        [class.pill__chevron--open]="open()"
        name="chevronDown"
        [size]="16"
        [stroke]="2"
      />
    </button>
  `,
  styleUrl: '../top-bar/pill.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegionPillComponent {
  protected readonly context = inject(RegionContext);
  private readonly regions = inject(RegionsStore);
  private readonly popovers = inject(Popovers);
  private readonly pill = viewChild.required<ElementRef<HTMLButtonElement>>('pill');
  protected readonly open = signal(false);
  private ref: PopoverRef | null = null;

  protected readonly name = computed(() => this.regions.regionName(this.context.current()));
  protected readonly label = computed(() => regionPillLabel(this.name()));

  protected async toggle(): Promise<void> {
    if (this.ref) {
      this.ref.close();
      return;
    }
    this.open.set(true);
    try {
      const { RegionPopoverComponent } = await import('./region-popover.component');
      const ref = this.popovers.open(this.pill().nativeElement, RegionPopoverComponent);
      this.ref = ref;
      ref.closed$.subscribe(() => {
        this.ref = null;
        this.open.set(false);
      });
    } catch {
      this.open.set(false);
    }
  }
}
