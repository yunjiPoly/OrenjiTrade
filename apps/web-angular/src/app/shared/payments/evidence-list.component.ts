import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { DisputeEvidence } from '@orenji/api-client';
import { EvidenceFilesService } from './evidence-files.service';
import { evidenceKindInfo, fileSize } from './payment-labels';

interface EvidenceView {
  item: DisputeEvidence;
  icon: string;
  kind: string;
  who: string;
  mine: boolean;
  link: string | null;
}

/**
 * Evidence of both parties, oldest first: statements and tracking as text (tracking links only
 * when https), photos as previews loaded through the authenticated file route, PDF documents as
 * downloads. Files are never public URLs.
 */
@Component({
  selector: 'app-evidence-list',
  imports: [DatePipe, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  providers: [EvidenceFilesService],
  template: `
    @if (views().length === 0) {
      <p class="ev__empty">No evidence yet.</p>
    } @else {
      <ul class="ev" aria-label="Evidence">
        @for (view of views(); track view.item.id) {
          <li class="ev__item" [class.ev__item--mine]="view.mine" data-testid="evidence-item">
            <header class="ev__head">
              <span class="ev__kind">
                <mat-icon aria-hidden="true">{{ view.icon }}</mat-icon>
                {{ view.kind }}
              </span>
              <span class="ev__who">
                {{ view.who }} ·
                <time [attr.datetime]="view.item.createdAt">{{
                  view.item.createdAt | date: 'MMM d, h:mm a'
                }}</time>
              </span>
            </header>
            @switch (view.item.kind) {
              @case ('IMAGE') {
                @let preview = previewOf(view.item)();
                <div class="ev__image">
                  @if (preview.state === 'ready') {
                    <a [href]="preview.url" target="_blank" rel="noopener">
                      <img
                        [src]="preview.url"
                        [alt]="'Photo from ' + view.who"
                        loading="lazy"
                        data-testid="evidence-image"
                      />
                    </a>
                  } @else if (preview.state === 'error') {
                    <p class="ev__muted">The photo could not load.</p>
                  } @else {
                    <mat-spinner diameter="24" aria-label="Loading the photo" />
                  }
                </div>
              }
              @case ('DOCUMENT') {
                <button
                  matButton="tonal"
                  type="button"
                  class="ev__doc"
                  [disabled]="downloading() === view.item.id"
                  (click)="download(view.item)"
                >
                  <mat-icon aria-hidden="true">download</mat-icon>
                  Download PDF
                  @if (view.item.sizeBytes) {
                    ({{ size(view.item.sizeBytes) }})
                  }
                </button>
              }
            }
            @if (view.item.body) {
              <p class="ev__body">{{ view.item.body }}</p>
            }
            @if (view.link) {
              <a class="ev__link" [href]="view.link" target="_blank" rel="noopener noreferrer">
                <mat-icon aria-hidden="true">open_in_new</mat-icon>
                Follow the tracking
              </a>
            }
          </li>
        }
      </ul>
    }
  `,
  styles: `
    .ev {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: var(--spacing-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .ev__empty,
    .ev__muted {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .ev__item {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      padding: var(--spacing-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      animation: ev-in var(--motion-duration-base) var(--motion-easing-standard);
    }
    .ev__item--mine {
      border-color: color-mix(in srgb, var(--color-primary) 35%, var(--color-border));
    }
    .ev__head {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .ev__kind {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .ev__kind mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .ev__who {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .ev__image {
      display: grid;
      place-items: center;
      min-height: 120px;
      overflow: hidden;
      border-radius: var(--radius-sm);
      background: var(--color-surface-variant);
    }
    .ev__image img {
      display: block;
      width: 100%;
      max-height: 220px;
      object-fit: cover;
    }
    .ev__body {
      margin: 0;
      font-size: var(--font-size-sm);
      white-space: pre-line;
      overflow-wrap: anywhere;
    }
    .ev__doc {
      align-self: flex-start;
    }
    .ev__link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: var(--font-size-sm);
    }
    .ev__link mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    @keyframes ev-in {
      from {
        opacity: 0;
        transform: translateY(4px);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvidenceListComponent {
  private readonly files = inject(EvidenceFilesService);

  readonly disputeId = input.required<string>();
  readonly evidence = input.required<readonly DisputeEvidence[]>();
  /** The reader's side (`null` for admins). */
  readonly viewer = input<string | null>(null);
  readonly buyerName = input.required<string>();
  readonly sellerName = input.required<string>();

  protected readonly downloading = signal<string | null>(null);
  protected readonly size = fileSize;
  protected readonly views = computed<EvidenceView[]>(() =>
    this.evidence().map((item) => {
      const info = evidenceKindInfo(item.kind);
      const mine = !!this.viewer() && item.role === this.viewer();
      const who = mine
        ? 'You'
        : item.role === 'BUYER'
          ? this.buyerName()
          : item.role === 'SELLER'
            ? this.sellerName()
            : 'OrenjiTrade';
      const link = item.url && /^https:\/\//i.test(item.url) ? item.url : null;
      return { item, icon: info.icon, kind: info.label, who, mine, link };
    }),
  );

  protected previewOf(item: DisputeEvidence) {
    return this.files.preview(this.disputeId(), item);
  }

  protected async download(item: DisputeEvidence): Promise<void> {
    this.downloading.set(item.id);
    await this.files.download(this.disputeId(), item);
    this.downloading.set(null);
  }
}
