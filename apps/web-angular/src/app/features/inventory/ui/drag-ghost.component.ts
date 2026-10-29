import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';

/** The drag ghost (spec 9.7): up to three fanned thumbnails and "3 cards". */
@Component({
  selector: 'app-drag-ghost',
  imports: [CardImageComponent],
  template: `
    <span class="fan">
      @for (art of arts().slice(0, 3); track $index) {
        <app-card-image size="fill" [src]="art" />
      }
    </span>
    <span class="label">{{ label() }}</span>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px 8px 8px;
      border: 1px solid var(--color-border-strong);
      border-radius: 12px;
      background: var(--color-surface-elevated);
      box-shadow: var(--elevation-menu);
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .fan {
      display: inline-flex;
    }
    .fan app-card-image {
      --card-image-width: 30px;
      --card-image-radius: 3px;
      margin-right: -14px;
    }
    .fan app-card-image:nth-child(1) {
      transform: rotate(-8deg);
    }
    .fan app-card-image:nth-child(3) {
      transform: rotate(8deg);
    }
    .label {
      margin-left: 16px;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--color-primary);
      color: var(--color-on-primary);
      font-size: var(--font-size-meta);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DragGhostComponent {
  readonly arts = input<readonly (string | null)[]>([]);
  readonly count = input(1);
  protected readonly label = computed(
    () => `${this.count()} ${this.count() === 1 ? 'card' : 'cards'}`,
  );
}
