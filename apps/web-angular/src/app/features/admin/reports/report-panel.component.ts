import { LiveAnnouncer } from '@angular/cdk/a11y';
import { DOCUMENT, DatePipe, formatDate } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import {
  AdminReportsService,
  ReportDetail,
  ReportedConversationMessage,
  ResolveReportRequest,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { ToastService } from '../../../core/feedback/toast.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { ShellLayout } from '../../../core/layout/shell-layout.service';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import {
  isOpenReport,
  reportReasonLabel,
  reportStatusLabel,
  resolutionActionLabel,
} from '../../../shared/reports/report-labels';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AdminCounts } from '../console/admin-counts.service';
import { AdminIconComponent } from '../console/admin-icon.component';
import { runConsoleAction } from '../console/console-actions';
import {
  chipClass,
  contextPhrase,
  messageKindLabel,
  moderationStateLabel,
  sharedDetailLine,
} from '../console/console-labels';
import { reportNumberLabel } from '../console/staff-search';
import { statusLabel as accountStatusLabel } from '../shared/admin-labels';
import { ModeratorNotesComponent } from './moderator-notes.component';
import { ReportHistoryComponent } from './report-history.component';
import { reportStatusTone, resolutionTone } from './report-tones';
import {
  ResolveReportDialogComponent,
  ResolveReportDialogData,
} from './resolve-report-dialog.component';
import { ReportsSync } from './reports-sync.service';

/** A day of the conversation with its messages, oldest first. */
interface ConversationDay {
  day: string;
  messages: ReportedConversationMessage[];
}

/**
 * Groups the newest-first messages into days, oldest first (as a chat reads). A day is the local
 * calendar day, as the times beside the messages are local (review fix 1: the UTC date put an
 * evening message of the Americas under the next day).
 */
export function conversationDays(
  messages: readonly ReportedConversationMessage[],
): ConversationDay[] {
  const days: ConversationDay[] = [];
  for (const message of [...messages].reverse()) {
    const day = formatDate(message.createdAt, 'yyyy-MM-dd', 'en-US');
    const last = days.at(-1);
    if (last && last.day === day) {
      last.messages.push(message);
    } else {
      days.push({ day, messages: [message] });
    }
  }
  return days;
}

/**
 * The open report of the Reports split view (`/admin/reports/:id`; spec 15.4, boards A2 and A3):
 * what was reported, the conversation it came from (a shipping address or an e-Transfer email
 * reads only as "shared · hidden from staff"; kinds and states as words), the resolution once
 * decided, moderator notes, the reported collector with their standing, the reporter ("Never
 * reveal who filed a report…") and the five history sections, collapsible. "Assign to me" and
 * "Resolve…" (the resolve dialog) while it is open; every write ends with a toast.
 */
@Component({
  selector: 'app-report-panel',
  imports: [
    DatePipe,
    RouterLink,
    AdminIconComponent,
    AvatarComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    ModeratorNotesComponent,
    RelativeTimePipe,
    ReportHistoryComponent,
    SkeletonComponent,
  ],
  templateUrl: './report-panel.component.html',
  styleUrls: [
    '../console/console-page.scss',
    '../console/console-controls.scss',
    './report-panel.component.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportPanelComponent {
  private readonly api = inject(AdminReportsService);
  private readonly dialog = inject(MatDialog);
  private readonly toasts = inject(ToastService);
  private readonly sync = inject(ReportsSync, { optional: true });
  private readonly counts = inject(AdminCounts, { optional: true });
  private readonly notesView = viewChild(ModeratorNotesComponent);
  private readonly title = inject(Title);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly document = inject(DOCUMENT);
  protected readonly session = inject(SessionService);
  protected readonly layout = inject(ShellLayout);

  /** Bound from the `:id` route parameter. */
  readonly id = input.required<string>();

  protected readonly report = signal<ReportDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly busy = signal<'assign' | 'note' | 'resolve' | null>(null);

  protected readonly open = computed(() => isOpenReport(this.report()?.status));
  protected readonly assignedToMe = computed(
    () => !!this.report()?.assignee && this.report()?.assignee?.id === this.session.me()?.id,
  );
  protected readonly aboutMe = computed(
    () => this.report()?.reportedUser.id === this.session.me()?.id,
  );
  protected readonly days = computed(() =>
    conversationDays(this.report()?.conversation?.messages ?? []),
  );
  protected readonly otherOpen = computed(() => {
    const report = this.report();
    if (!report) {
      return [];
    }
    return report.history.recentReports
      .filter(
        (entry) =>
          entry.id !== report.id && (entry.status === 'OPEN' || entry.status === 'UNDER_REVIEW'),
      )
      .map((entry) => reportNumberLabel(entry.number));
  });
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });
  protected readonly onePane = computed(() => this.layout.narrow() || this.layout.medium());

  protected readonly reasonLabel = reportReasonLabel;
  protected readonly statusLabel = reportStatusLabel;
  protected readonly actionLabel = resolutionActionLabel;
  protected readonly accountStatus = accountStatusLabel;
  protected readonly context = contextPhrase;
  protected readonly number = reportNumberLabel;
  protected readonly kindLabel = messageKindLabel;
  protected readonly stateLabel = moderationStateLabel;
  protected readonly sharedLine = sharedDetailLine;
  protected readonly statusChip = (status: string) => chipClass(reportStatusTone(status));
  protected readonly actionChip = (action: string) => chipClass(resolutionTone(action));

  constructor() {
    effect(() => {
      this.id();
      untracked(() => void this.openReport());
    });
  }

  /**
   * A report opened from the list (review fix 1, WCAG 2.4.3): in one pane (below 1280) the list
   * went away, so the focus moves to the report's heading; beside the list it stays on the row and
   * the opening is announced. The document title names the report.
   */
  private async openReport(): Promise<void> {
    await this.load();
    const report = this.report();
    if (!report) {
      return;
    }
    if (this.onePane()) {
      this.focusTitle();
    } else {
      void this.announcer.announce(`Report ${reportNumberLabel(report.number)} opened`);
    }
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const report = await firstValueFrom(
        this.api.getReport({ id: this.id() }, 'body', false, { context: silentErrors() }),
      );
      this.report.set(report);
      this.title.setTitle(`Report ${reportNumberLabel(report.number)} · Admin · OrenjiTrade`);
    } catch (error) {
      this.report.set(null);
      this.error.set(toApiError(error));
    } finally {
      this.loading.set(false);
    }
  }

  /** The heading of the report, once drawn (after a write its buttons may be gone). */
  private focusTitle(): void {
    setTimeout(() => this.document.getElementById('report-title')?.focus());
  }

  /** "Their conversation with @lucas.tcg", "Their public binder"... */
  protected where(report: ReportDetail): string {
    switch (report.context.source) {
      case 'CONVERSATION':
        return `Their conversation with @${report.reporter.handle}`;
      case 'POST':
        return 'A community post';
      case 'BINDER':
        return 'Their public binder';
      default:
        return 'Their profile';
    }
  }

  /** Who wrote a message of the reported conversation. */
  protected sender(message: ReportedConversationMessage): {
    handle: string;
    role: 'reported' | 'reporter' | 'system' | 'other';
  } {
    const report = this.report();
    if (!message.senderId) {
      return { handle: 'OrenjiTrade', role: 'system' };
    }
    if (message.senderId === report?.reportedUser.id) {
      return { handle: `@${report.reportedUser.handle}`, role: 'reported' };
    }
    if (message.senderId === report?.reporter.id) {
      return { handle: `@${report.reporter.handle}`, role: 'reporter' };
    }
    return { handle: 'A participant', role: 'other' };
  }

  private changed(): void {
    this.sync?.changed();
    void this.counts?.refresh();
  }

  protected async assignToMe(): Promise<void> {
    const report = this.report();
    if (!report) {
      return;
    }
    this.busy.set('assign');
    const done = await runConsoleAction(
      this.toasts,
      this.api.assignReport({ id: report.id, assignReportRequest: {} }, 'body', false, {
        context: silentErrors(),
      }),
      `Report ${reportNumberLabel(report.number)} is assigned to you.`,
      'This report was already decided.',
    );
    this.busy.set(null);
    if (done) {
      await this.load();
      this.changed();
      this.focusTitle();
    }
  }

  protected async addNote(body: string): Promise<void> {
    const report = this.report();
    if (!report) {
      return;
    }
    this.busy.set('note');
    const note = await runConsoleAction(
      this.toasts,
      this.api.addReportNote({ id: report.id, addReportNoteRequest: { body } }, 'body', false, {
        context: silentErrors(),
      }),
      'Note added.',
    );
    this.busy.set(null);
    if (note) {
      this.notesView()?.reset();
      this.report.update((current) =>
        current ? { ...current, moderatorNotes: [...current.moderatorNotes, note] } : current,
      );
    }
  }

  protected async resolve(): Promise<void> {
    const report = this.report();
    if (!report || this.aboutMe()) {
      return;
    }
    const request = await firstValueFrom(
      this.dialog
        .open<ResolveReportDialogComponent, ResolveReportDialogData, ResolveReportRequest>(
          ResolveReportDialogComponent,
          {
            data: {
              reportedName: report.reportedUser.displayName,
              reportedHandle: report.reportedUser.handle,
              canSuspend: this.session.isAdmin(),
              number: reportNumberLabel(report.number),
              subtitle: `${reportReasonLabel(report.reason)} · ${contextPhrase(report.context.source)}`,
              otherOpen: this.otherOpen(),
            },
            panelClass: 'app-dialog--md',
            ariaLabelledBy: 'resolve-title',
            autoFocus: 'first-tabbable',
          },
        )
        .afterClosed(),
    );
    if (!request) {
      return;
    }
    this.busy.set('resolve');
    const done = await runConsoleAction(
      this.toasts,
      this.api.resolveReport({ id: report.id, resolveReportRequest: request }, 'body', false, {
        context: silentErrors(),
      }),
      request.status === 'DISMISSED'
        ? `Report ${reportNumberLabel(report.number)} dismissed.`
        : `Report ${reportNumberLabel(report.number)} resolved: ${resolutionActionLabel(request.action).toLowerCase()}.`,
      'This report was already decided.',
    );
    this.busy.set(null);
    if (done) {
      await this.load();
      this.changed();
      this.focusTitle();
    }
  }
}
