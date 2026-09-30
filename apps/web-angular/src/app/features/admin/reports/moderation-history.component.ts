import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { ModerationHistory } from '@orenji/api-client';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import {
  reportReasonLabel,
  reportStatusLabel,
  resolutionActionLabel,
} from '../../../shared/reports/report-labels';
import { StarRatingComponent } from '../../../shared/ratings/star-rating.component';
import { flagReasonLabel } from '../community/admin-community-labels';
import { AdminChipComponent } from '../shared/admin-chip.component';
import { auditActionLabel, summarizeDetails } from '../shared/admin-labels';
import { reportStatusTone } from './report-tones';

const PAUSE_SOURCE_LABELS: Record<string, string> = {
  UNRESPONSIVE: 'unanswered conversations',
  REPORT_THRESHOLD: 'report threshold (pending review)',
  MODERATION: 'moderation decision',
  ADMIN: 'administrator',
};

/**
 * A collector's moderation history (`ModerationHistory` of the report detail and
 * `GET /admin/users/{id}/history`): current listing status and strikes, open flags, recent
 * reports, ratings received, removed community content, suspensions and listing pauses. Never
 * private messages.
 */
@Component({
  selector: 'app-moderation-history',
  imports: [
    DatePipe,
    RouterLink,
    MatIconModule,
    AdminChipComponent,
    RelativeTimePipe,
    StarRatingComponent,
  ],
  template: `
    @let h = history();
    <div class="history">
      <ul class="facts" aria-label="Current standing">
        <li>
          <span class="facts__value">{{ h.openReports }}</span>
          <span class="facts__label">open {{ h.openReports === 1 ? 'report' : 'reports' }}</span>
        </li>
        <li>
          <span class="facts__value">{{ h.listingStatus.strikes }}</span>
          <span class="facts__label">strikes</span>
        </li>
        <li>
          <span class="facts__value">{{ h.openFlags.length }}</span>
          <span class="facts__label">open flags</span>
        </li>
        <li [class.facts--alert]="h.listingStatus.paused">
          <span class="facts__value">
            <mat-icon aria-hidden="true">{{
              h.listingStatus.paused ? 'pause_circle' : 'play_circle'
            }}</mat-icon>
          </span>
          <span class="facts__label">
            {{ h.listingStatus.paused ? 'Listings paused' : 'Listings live' }}
            @if (h.listingStatus.paused && h.listingStatus.source) {
              ({{ pauseSource(h.listingStatus.source) }})
            }
          </span>
        </li>
      </ul>

      <h3 class="history__title">Recent reports</h3>
      @if (h.recentReports.length === 0) {
        <p class="admin-muted">No reports.</p>
      } @else {
        <ul class="rows">
          @for (report of h.recentReports; track report.id) {
            <li class="row">
              <a [routerLink]="['/admin/reports', report.id]">{{ reason(report.reason) }}</a>
              <app-admin-chip [tone]="tone(report.status)">{{
                status(report.status)
              }}</app-admin-chip>
              @if (report.resolutionAction && report.resolutionAction !== 'NONE') {
                <span class="admin-muted">{{ action(report.resolutionAction) }}</span>
              }
              <span class="row__when">{{ report.createdAt | relativeTime }}</span>
            </li>
          }
        </ul>
      }

      <h3 class="history__title">Ratings received</h3>
      @if (h.recentRatings.length === 0) {
        <p class="admin-muted">No ratings.</p>
      } @else {
        <ul class="rows">
          @for (rating of h.recentRatings; track rating.id) {
            <li class="row">
              <app-star-rating [value]="rating.overall" size="sm" />
              <span>&#64;{{ rating.raterHandle }}</span>
              @if (rating.moderationState === 'HIDDEN') {
                <app-admin-chip tone="neutral">Hidden</app-admin-chip>
              }
              @if (rating.comment) {
                <span class="row__quote">“{{ rating.comment }}”</span>
              }
              <span class="row__when">{{ rating.createdAt | relativeTime }}</span>
            </li>
          }
        </ul>
      }

      @if (h.openFlags.length) {
        <h3 class="history__title">Open flags</h3>
        <ul class="rows">
          @for (flag of h.openFlags; track flag.id) {
            <li class="row">
              {{ flagReason(flag.reason) }}
              <span class="row__when">{{ flag.createdAt | relativeTime }}</span>
            </li>
          }
        </ul>
      }

      <h3 class="history__title">Removed community content</h3>
      @if (h.recentPostsRemoved.length === 0) {
        <p class="admin-muted">Nothing removed.</p>
      } @else {
        <ul class="rows">
          @for (item of h.recentPostsRemoved; track item.id) {
            <li class="row">
              {{ item.kind === 'POST' ? 'Post' : 'Reply' }} in {{ item.channelSlug }}
              @if (item.reason) {
                <span class="row__quote">“{{ item.reason }}”</span>
              }
              @if (item.removedAt) {
                <span class="row__when">{{ item.removedAt | relativeTime }}</span>
              }
            </li>
          }
        </ul>
      }

      <h3 class="history__title">Suspensions and listing pauses</h3>
      @if (events().length === 0) {
        <p class="admin-muted">None.</p>
      } @else {
        <ol class="rows">
          @for (entry of events(); track entry.id) {
            <li class="row">
              <strong>{{ auditLabel(entry.action) }}</strong>
              <span class="admin-muted">
                by
                {{ entry.actor.handle ? '@' + entry.actor.handle : entry.actor.type.toLowerCase() }}
              </span>
              @if (summarize(entry.details); as summary) {
                <span class="row__quote">{{ summary }}</span>
              }
              <span class="row__when" [title]="entry.occurredAt | date: 'medium'">{{
                entry.occurredAt | relativeTime
              }}</span>
            </li>
          }
        </ol>
      }
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .history {
      display: flex;
      flex-direction: column;
    }
    .facts {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
      gap: var(--spacing-2);
      margin: 0 0 var(--spacing-3);
      padding: 0;
      list-style: none;
    }
    .facts li {
      display: flex;
      flex-direction: column;
      padding: var(--spacing-2) var(--spacing-3);
      border-radius: var(--radius-md);
      background: var(--color-surface-variant);
    }
    .facts .facts--alert {
      background: color-mix(in srgb, var(--color-danger) 12%, var(--color-surface));
    }
    .facts__value {
      font-family: var(--font-display);
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-semibold);
      line-height: 1.2;
    }
    .facts__label {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .history__title {
      margin: var(--spacing-3) 0 var(--spacing-1);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--color-text-muted);
    }
    .rows {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px var(--spacing-2);
      padding: var(--spacing-1) 0;
      border-bottom: 1px solid var(--color-border);
      font-size: var(--font-size-sm);
    }
    .row:last-child {
      border-bottom: 0;
    }
    .row__quote {
      flex-basis: 100%;
      color: var(--color-text-muted);
      overflow-wrap: anywhere;
    }
    .row__when {
      margin-left: auto;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModerationHistoryComponent {
  readonly history = input.required<ModerationHistory>();

  protected readonly events = computed(() =>
    [...this.history().suspensions, ...this.history().listingsPaused].sort((a, b) =>
      b.occurredAt.localeCompare(a.occurredAt),
    ),
  );
  protected readonly reason = reportReasonLabel;
  protected readonly status = reportStatusLabel;
  protected readonly action = resolutionActionLabel;
  protected readonly tone = reportStatusTone;
  protected readonly flagReason = flagReasonLabel;
  protected readonly auditLabel = auditActionLabel;
  protected readonly summarize = summarizeDetails;

  protected pauseSource(source: string): string {
    return PAUSE_SOURCE_LABELS[source] ?? source.toLowerCase();
  }
}
