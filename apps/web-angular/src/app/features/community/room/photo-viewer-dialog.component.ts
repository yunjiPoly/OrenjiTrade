import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import type { PostPhoto } from '@orenji/api-client';
import { ShellIconComponent } from '../../../core/layout/shell-icon/shell-icon.component';
import { MediaUrlPipe } from '../../../shared/pipes/media-url.pipe';
import { ROOM_COPY } from '../data/community-copy';

export interface PhotoViewerData {
  photos: readonly PostPhoto[];
  index: number;
  handle: string;
  /** "Quebec · 9:12 AM" (the province only, never a city). */
  meta: string;
}

/**
 * A larger view of the photos a phone added to a post (board W22's viewer): "Photo 1 of 2", the
 * author and when, the photo within 540, Previous and Next (also ← and →), Close or Esc. Read
 * only: the web adds no photo to a post (community photos are stage S4).
 */
@Component({
  selector: 'app-photo-viewer-dialog',
  imports: [MatDialogModule, MediaUrlPipe, ShellIconComponent],
  template: `
    <div class="pv" tabindex="-1" (keydown.arrowleft)="move(-1)" (keydown.arrowright)="move(1)">
      <div class="pv__head">
        <div>
          <h2 class="pv__title" mat-dialog-title id="photo-viewer-title">
            {{ copy.photoTitle(index() + 1, data.photos.length) }}
          </h2>
          <p class="pv__sub" id="photo-viewer-sub">{{ data.handle }} · {{ data.meta }}</p>
        </div>
        <button type="button" class="pv__icon" [attr.aria-label]="copy.close" mat-dialog-close>
          <app-shell-icon name="close" [size]="20" [stroke]="2" />
        </button>
      </div>
      <div class="pv__stage">
        <button
          type="button"
          class="pv__nav"
          [attr.aria-label]="copy.previousPhoto"
          [attr.aria-disabled]="index() === 0 ? 'true' : null"
          (click)="move(-1)"
        >
          <app-shell-icon name="chevronLeft" [size]="20" [stroke]="2" />
        </button>
        @if (photo(); as p) {
          <img class="pv__img" [src]="p.url | mediaUrl" [alt]="copy.photoAlt(data.handle)" />
        }
        <button
          type="button"
          class="pv__nav"
          [attr.aria-label]="copy.nextPhoto"
          [attr.aria-disabled]="index() >= data.photos.length - 1 ? 'true' : null"
          (click)="move(1)"
        >
          <app-shell-icon name="chevronRight" [size]="20" [stroke]="2" />
        </button>
      </div>
      <p class="visually-hidden" aria-live="polite">{{ announcement() }}</p>
    </div>
  `,
  styles: `
    .pv {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 20px 24px 24px;
    }
    .pv__head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .pv__title {
      margin: 0;
      padding: 0;
      font-size: var(--font-size-lg);
    }
    .pv__title::before {
      display: none;
    }
    .pv__sub {
      margin: 2px 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-meta);
    }
    .pv__stage {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .pv__img {
      flex: 1 1 auto;
      min-width: 0;
      max-width: min(540px, 100%);
      max-height: min(540px, 60dvh);
      margin: 0 auto;
      border-radius: 12px;
      object-fit: contain;
      background: var(--color-surface-variant);
    }
    .pv__icon,
    .pv__nav {
      display: grid;
      flex: none;
      place-items: center;
      width: 40px;
      height: 40px;
      padding: 0;
      border: 1px solid var(--color-border-strong);
      border-radius: 50%;
      background: transparent;
      color: var(--color-ink);
      cursor: pointer;
    }
    .pv__icon {
      border-color: transparent;
    }
    .pv__nav[aria-disabled='true'] {
      color: var(--color-text-muted);
      cursor: default;
    }
    .pv__icon:focus-visible,
    .pv__nav:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: var(--focus-offset);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhotoViewerDialogComponent {
  protected readonly data = inject<PhotoViewerData>(MAT_DIALOG_DATA);
  protected readonly copy = ROOM_COPY;
  protected readonly index = signal(
    Math.min(Math.max(this.data.index, 0), Math.max(this.data.photos.length - 1, 0)),
  );
  protected readonly photo = computed(() => this.data.photos[this.index()] ?? null);
  protected readonly announcement = signal('');

  protected move(delta: number): void {
    const next = this.index() + delta;
    if (next < 0 || next >= this.data.photos.length) {
      return;
    }
    this.index.set(next);
    this.announcement.set(ROOM_COPY.photoTitle(next + 1, this.data.photos.length));
  }
}
