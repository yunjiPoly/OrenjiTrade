import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Surface card for settings-style sections: heading, optional description, projected content
 * and an optional `[actions]` footer.
 */
@Component({
  selector: 'app-section-card',
  template: `
    <section class="section" [attr.aria-labelledby]="headingId()">
      <header class="section__header">
        <h2 class="section__title" [id]="headingId()">{{ heading() }}</h2>
        @if (description()) {
          <p class="section__description">{{ description() }}</p>
        }
      </header>
      <div class="section__body">
        <ng-content />
      </div>
      <footer class="section__actions">
        <ng-content select="[actions]" />
      </footer>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .section {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      padding: var(--spacing-5);
    }
    .section__header {
      margin-bottom: var(--spacing-4);
    }
    .section__title {
      font-size: var(--font-size-lg);
    }
    .section__description {
      margin: var(--spacing-1) 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .section__actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--spacing-2);
      margin-top: var(--spacing-4);
    }
    .section__actions:empty {
      display: none;
    }
    @media (max-width: 599px) {
      .section {
        padding: var(--spacing-4);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionCardComponent {
  readonly heading = input.required<string>();
  readonly description = input('');
  readonly headingId = input.required<string>();
}
