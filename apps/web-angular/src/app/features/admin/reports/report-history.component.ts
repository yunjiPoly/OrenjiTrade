import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuditLogEntry, ModerationHistory } from '@orenji/api-client';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import {
  reportReasonLabel,
  reportStatusLabel,
  resolutionActionLabel,
} from '../../../shared/reports/report-labels';
import { flagReasonLabel } from '../community/admin-community-labels';
import { AdminIconComponent } from '../console/admin-icon.component';
import { roomNameOfSlug } from '../console/console-labels';
import { reportNumberLabel } from '../console/staff-search';
import { auditActionLabel } from '../shared/admin-labels';

type SectionId = 'reports' | 'ratings' | 'flags' | 'removed' | 'suspensions';

/**
 * The reported collector's history in the report panel (spec 15.4: the five history sections,
 * collapsible; board A2): recent reports, ratings received, open flags, removed community
 * content, suspensions and listing pauses. Recent reports opens first. Never private messages.
 */
@Component({
  selector: 'app-report-history',
  imports: [DatePipe, RouterLink, AdminIconComponent, RelativeTimePipe],
  template: `
    @let h = history();
    @for (section of sections(); track section.id) {
      @let expanded = isOpen(section.id);
      <div class="hs">
        <h4 class="hs__head">
          <button
            type="button"
            class="hs__toggle"
            [attr.aria-expanded]="expanded"
            [attr.aria-controls]="'history-' + section.id"
            (click)="toggle(section.id)"
          >
            <span class="hs__label">{{ section.label }}</span>
            <span class="hs__count">{{ section.count }}</span>
            <app-admin-icon [name]="expanded ? 'chevronDown' : 'chevronRight'" [size]="16" />
          </button>
        </h4>
        <div class="hs__body" [id]="'history-' + section.id" [hidden]="!expanded">
          @if (section.count === 0) {
            <p class="hs__empty">None.</p>
          } @else {
            <ul class="hs__list">
              @switch (section.id) {
                @case ('reports') {
                  @for (report of h.recentReports; track report.id) {
                    <li>
                      <a class="hs__link" [routerLink]="['/admin/reports', report.id]"
                        >{{ number(report.number) }} · {{ reason(report.reason) }}</a
                      >
                      <span class="hs__line">
                        @if (report.id === currentId()) {
                          This report ·
                        }
                        {{ status(report.status) }}
                        @if (report.resolutionAction && report.resolutionAction !== 'NONE') {
                          · {{ action(report.resolutionAction) }}
                        }
                        · {{ report.createdAt | relativeTime }}
                      </span>
                    </li>
                  }
                }
                @case ('ratings') {
                  @for (rating of h.recentRatings; track rating.id) {
                    <li>
                      <span class="hs__title"
                        >{{ rating.overall }} / 5 from &#64;{{ rating.raterHandle }}</span
                      >
                      <span class="hs__line">
                        @if (rating.comment) {
                          “{{ rating.comment }}” ·
                        }
                        @if (rating.moderationState === 'HIDDEN') {
                          Hidden ·
                        }
                        {{ rating.createdAt | relativeTime }}
                      </span>
                    </li>
                  }
                }
                @case ('flags') {
                  @for (flag of h.openFlags; track flag.id) {
                    <li>
                      <span class="hs__title">{{ flagReason(flag.reason) }}</span>
                      <span class="hs__line">{{ flag.createdAt | relativeTime }}</span>
                    </li>
                  }
                }
                @case ('removed') {
                  @for (content of h.recentPostsRemoved; track content.id) {
                    <li>
                      <span class="hs__title"
                        >{{ content.kind === 'REPLY' ? 'A reply' : 'A post' }} in
                        {{ room(content.channelSlug) }}</span
                      >
                      <span class="hs__line">
                        @if (content.reason) {
                          “{{ content.reason }}” ·
                        }
                        @if (content.removedAt) {
                          {{ content.removedAt | relativeTime }}
                        }
                      </span>
                    </li>
                  }
                }
                @case ('suspensions') {
                  @for (entry of standing(); track entry.id) {
                    <li>
                      <span class="hs__title">{{ audit(entry.action) }}</span>
                      <span class="hs__line">
                        @if (entry.details['reason']) {
                          “{{ entry.details['reason'] }}” ·
                        }
                        {{ entry.occurredAt | date: 'mediumDate' }}
                      </span>
                    </li>
                  }
                }
              }
            </ul>
          }
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .hs + .hs {
      border-top: 1px solid var(--color-border);
    }
    .hs__head {
      margin: 0;
    }
    .hs__toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: 44px;
      padding: 0;
      border: 0;
      background: none;
      color: var(--color-ink);
      font: inherit;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      text-align: left;
      cursor: pointer;
    }
    .hs__toggle:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 2px;
    }
    .hs__label {
      flex: 1 1 auto;
    }
    .hs__count {
      display: inline-grid;
      place-items: center;
      min-width: 22px;
      height: 22px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
    }
    .hs__body {
      padding: 0 0 12px;
    }
    .hs__list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .hs__list li {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .hs__link,
    .hs__title {
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }
    /* 24 px tall (WCAG 2.5.8; review fix 1): it sits right under its section's toggle. */
    .hs__link {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      color: var(--color-accent);
      text-decoration: none;
    }
    .hs__link:hover {
      text-decoration: underline;
    }
    .hs__line,
    .hs__empty {
      margin: 0;
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
      overflow-wrap: anywhere;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportHistoryComponent {
  readonly history = input.required<ModerationHistory>();
  /** The report the panel shows ("This report"). */
  readonly currentId = input<string | null>(null);

  private readonly opened = signal<ReadonlySet<SectionId>>(new Set<SectionId>(['reports']));

  protected readonly standing = computed<AuditLogEntry[]>(() =>
    [...this.history().suspensions, ...this.history().listingsPaused].sort((a, b) =>
      b.occurredAt.localeCompare(a.occurredAt),
    ),
  );
  protected readonly sections = computed(() => {
    const h = this.history();
    return [
      { id: 'reports' as const, label: 'Recent reports', count: h.recentReports.length },
      { id: 'ratings' as const, label: 'Ratings received', count: h.recentRatings.length },
      { id: 'flags' as const, label: 'Open flags', count: h.openFlags.length },
      {
        id: 'removed' as const,
        label: 'Removed community content',
        count: h.recentPostsRemoved.length,
      },
      {
        id: 'suspensions' as const,
        label: 'Suspensions and listing pauses',
        count: this.standing().length,
      },
    ];
  });

  protected readonly number = reportNumberLabel;
  protected readonly reason = reportReasonLabel;
  protected readonly status = reportStatusLabel;
  protected readonly action = resolutionActionLabel;
  protected readonly flagReason = flagReasonLabel;
  protected readonly room = roomNameOfSlug;
  protected readonly audit = auditActionLabel;

  protected isOpen(id: SectionId): boolean {
    return this.opened().has(id);
  }

  protected toggle(id: SectionId): void {
    const next = new Set(this.opened());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.opened.set(next);
  }
}
