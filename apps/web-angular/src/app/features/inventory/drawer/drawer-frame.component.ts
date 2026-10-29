import { CdkTrapFocus } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, booleanAttribute, input, output } from '@angular/core';

/**
 * A 440 drawer of Inventory (spec 4.8): beside the list from the top bar down; it pushes the list
 * at lg and xl and lies over it with a scrim at md; a full-screen sheet below 960. Focus is
 * trapped and Esc asks to close; the opener gets the focus back (the page).
 */
@Component({
  selector: 'app-drawer-frame',
  imports: [CdkTrapFocus],
  template: `
    <section
      class="dr"
      role="dialog"
      [attr.aria-modal]="modal() ? 'true' : null"
      [attr.aria-labelledby]="titleId()"
      cdkTrapFocus
      [cdkTrapFocusAutoCapture]="true"
      (keydown.escape)="onEscape($event)"
    >
      <header class="dr__head"><ng-content select="[drawerHead]" /></header>
      <div class="dr__body"><ng-content /></div>
      <footer class="dr__foot"><ng-content select="[drawerFoot]" /></footer>
    </section>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .dr {
      display: flex;
      flex-direction: column;
      height: 100%;
      border-left: 1px solid var(--color-border);
      background: var(--color-surface);
      box-shadow: var(--elevation-sheet);
    }
    .dr__head {
      flex: none;
      padding: 20px 24px 16px;
      border-bottom: 1px solid var(--color-border);
    }
    .dr__body {
      flex: 1 1 auto;
      min-height: 0;
      padding: 24px;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .dr__foot {
      display: flex;
      flex: none;
      align-items: center;
      gap: 12px;
      min-height: 72px;
      padding: 0 24px;
      border-top: 1px solid var(--color-border);
      background: var(--color-surface);
    }
    .dr__foot:empty {
      display: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DrawerFrameComponent {
  readonly titleId = input.required<string>();
  /** Lies over the list (md and below): `aria-modal`. */
  readonly modal = input(false, { transform: booleanAttribute });
  readonly closeRequest = output<void>();

  protected onEscape(event: Event): void {
    event.stopPropagation();
    this.closeRequest.emit();
  }
}
