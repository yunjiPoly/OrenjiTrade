import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { avatarColor } from '../../discovery/discovery-labels';
import { initialsOf } from '../../domain/location-labels';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/**
 * Round avatar: the uploaded picture, or coloured initials when there is none (or it fails to
 * load). The colour is derived from the name so it stays stable for a collector.
 */
@Component({
  selector: 'app-avatar',
  template: `
    @if (src() && !failed()) {
      <img class="avatar__img" [src]="src()" [alt]="altText()" (error)="failed.set(true)" />
    } @else {
      <span class="avatar__initials" [style.background]="color()">
        @if (!decorative()) {
          <span class="visually-hidden">{{ altText() }}</span>
        }
        <span aria-hidden="true">{{ initials() }}</span>
      </span>
    }
  `,
  styles: `
    :host {
      --avatar-size: 40px;
      display: inline-flex;
      flex: 0 0 auto;
      width: var(--avatar-size);
      height: var(--avatar-size);
      border-radius: 50%;
      overflow: hidden;
      background: var(--color-surface-variant);
    }
    :host([data-size='xs']) {
      --avatar-size: 28px;
    }
    :host([data-size='sm']) {
      --avatar-size: 32px;
    }
    :host([data-size='lg']) {
      --avatar-size: 72px;
    }
    :host([data-size='xl']) {
      --avatar-size: 112px;
    }
    .avatar__img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .avatar__initials {
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
      color: #fff;
      font-family: var(--font-display);
      font-weight: var(--font-weight-semibold);
      font-size: calc(var(--avatar-size) * 0.4);
      letter-spacing: 0.02em;
      user-select: none;
    }
  `,
  host: { '[attr.data-size]': 'size()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarComponent {
  readonly src = input<string | null | undefined>(null);
  readonly name = input<string | null | undefined>('');
  readonly size = input<AvatarSize>('md');
  /** Hide from assistive technology when the name is already written next to the avatar. */
  readonly decorative = input(false);

  protected readonly failed = signal(false);
  protected readonly initials = computed(() => initialsOf(this.name()));
  protected readonly altText = computed(() =>
    this.decorative() ? '' : `Avatar of ${this.name() || 'collector'}`,
  );
  protected readonly color = computed(() => avatarColor(this.name()));
}
