import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SectionCardComponent } from '../../../shared/ui/section-card/section-card.component';

/**
 * Settings › Shipping details on the web (spec 13, decision 9): nothing to fill in. The web never
 * saves an address or an e-Transfer email, because browsers have no secure storage; they are
 * typed each time in a chat with "+ › Send my address" (or "Send my e-Transfer email") and go only
 * into that chat. The phone app can keep them on that phone only.
 */
@Component({
  selector: 'app-shipping-settings',
  imports: [MatIconModule, SectionCardComponent],
  template: `
    <app-section-card
      heading="Shipping details"
      headingId="shipping-heading"
      description="On the web, OrenjiTrade doesn't save your address or e-Transfer email. Type them in the chat when you need them, with + › Send my address. The phone app can keep them on that phone only."
    >
      <ul class="ship__list" data-testid="shipping-web-note">
        <li>
          <mat-icon aria-hidden="true">package_2</mat-icon>
          <span
            ><strong>Send my address</strong>: when you buy, so the seller can ship with
            tracking.</span
          >
        </li>
        <li>
          <mat-icon aria-hidden="true">mail</mat-icon>
          <span
            ><strong>Send my e-Transfer email</strong>: when you sell, so the buyer can pay you
            outside OrenjiTrade.</span
          >
        </li>
        <li>
          <mat-icon aria-hidden="true">lock</mat-icon>
          <span>They go only into that chat, where you and the other collector can see them.</span>
        </li>
      </ul>
    </app-section-card>
  `,
  styleUrl: '../settings-section.scss',
  styles: `
    .ship__list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .ship__list li {
      display: flex;
      gap: var(--spacing-3);
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    .ship__list mat-icon {
      flex: 0 0 auto;
      width: 20px;
      height: 20px;
      color: var(--color-accent);
      font-size: 20px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShippingSettingsComponent {}
