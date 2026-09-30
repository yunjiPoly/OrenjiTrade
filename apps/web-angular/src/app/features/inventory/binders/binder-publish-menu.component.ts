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
import type { BinderResponse } from '@orenji/api-client';
import { PUBLISH_OPTIONS, PublishMode } from '../../../shared/inventory/inventory-labels';

/**
 * Publish control of a binder: "Publish" opens the durations (1 hour, 24 hours, until disabled);
 * a public binder offers the other durations and "Make private".
 */
@Component({
  selector: 'app-binder-publish-menu',
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  template: `
    @if (isPrivate()) {
      <button
        [matButton]="compact() ? 'text' : 'filled'"
        type="button"
        [disabled]="disabled()"
        [matMenuTriggerFor]="menu"
        [attr.aria-label]="'Publish ' + binder().name"
      >
        <mat-icon aria-hidden="true">public</mat-icon>
        Publish
      </button>
    } @else {
      <button
        matButton="outlined"
        type="button"
        [disabled]="disabled()"
        [matMenuTriggerFor]="menu"
        [attr.aria-label]="'Change publication of ' + binder().name"
      >
        <mat-icon aria-hidden="true">tune</mat-icon>
        Publication
      </button>
    }
    <mat-menu #menu="matMenu">
      @for (option of options; track option.mode) {
        <button mat-menu-item type="button" (click)="publish.emit(option.mode)">
          <mat-icon aria-hidden="true">{{ option.icon }}</mat-icon>
          {{ option.label }}
        </button>
      }
      @if (!isPrivate()) {
        <button mat-menu-item type="button" (click)="unpublish.emit()">
          <mat-icon aria-hidden="true">lock</mat-icon>
          Make private
        </button>
      }
    </mat-menu>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BinderPublishMenuComponent {
  readonly binder = input.required<BinderResponse>();
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Text button (binder manager rows). */
  readonly compact = input(false, { transform: booleanAttribute });
  readonly publish = output<PublishMode>();
  readonly unpublish = output<void>();

  protected readonly options = PUBLISH_OPTIONS;
  protected readonly isPrivate = computed(() => this.binder().visibility === 'PRIVATE');
}
