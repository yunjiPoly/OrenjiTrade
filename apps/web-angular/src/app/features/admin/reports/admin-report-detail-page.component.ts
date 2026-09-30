import { DatePipe } from '@angular/common';
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
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { AdminReportsService, ReportDetail, ResolveReportRequest } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import {
  contextSourceLabel,
  isOpenReport,
  reportReasonLabel,
  reportStatusLabel,
  resolutionActionLabel,
} from '../../../shared/reports/report-labels';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AdminChipComponent } from '../shared/admin-chip.component';
import { runAdminAction } from '../shared/admin-actions';
import { StatusChipComponent } from '../shared/status-chip.component';
import { ModerationHistoryComponent } from './moderation-history.component';
import { ModeratorNotesComponent } from './moderator-notes.component';
import { reportStatusTone, resolutionTone } from './report-tones';
import {
  ResolveReportDialogComponent,
  ResolveReportDialogData,
} from './resolve-report-dialog.component';

/**
 * `/admin/reports/:id` (moderators and admins): the report (reason, details, context), the
 * reporter and the reported collector, the reported collector's moderation history, the reported
 * conversation when the report came from one (its viewing is audited), moderator notes, "Assign
 * to me" and "Resolve". Every write is audited by the API.
 */
@Component({
  selector: 'app-admin-report-detail-page',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    AdminChipComponent,
    AvatarComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    ModerationHistoryComponent,
    ModeratorNotesComponent,
    RelativeTimePipe,
    SkeletonComponent,
    StatusChipComponent,
  ],
  templateUrl: './admin-report-detail-page.component.html',
  styleUrls: ['../shared/admin-page.scss', './admin-report-detail-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminReportDetailPageComponent {
  private readonly api = inject(AdminReportsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly notesView = viewChild(ModeratorNotesComponent);
  protected readonly session = inject(SessionService);

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
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });

  protected readonly reasonLabel = reportReasonLabel;
  protected readonly statusLabel = reportStatusLabel;
  protected readonly contextLabel = contextSourceLabel;
  protected readonly actionLabel = resolutionActionLabel;
  protected readonly statusTone = reportStatusTone;
  protected readonly actionTone = resolutionTone;

  constructor() {
    effect(() => {
      this.id();
      untracked(() => void this.load());
    });
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.report.set(
        await firstValueFrom(
          this.api.getReport({ id: this.id() }, 'body', false, { context: silentErrors() }),
        ),
      );
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.loading.set(false);
    }
  }

  /** Who wrote a message of the reported conversation. */
  protected senderLabel(senderId: string | null | undefined): string {
    const report = this.report();
    if (!senderId) {
      return 'System';
    }
    if (senderId === report?.reportedUser.id) {
      return `@${report.reportedUser.handle} (reported)`;
    }
    if (senderId === report?.reporter.id) {
      return `@${report.reporter.handle} (reporter)`;
    }
    return 'Participant';
  }

  protected isReported(senderId: string | null | undefined): boolean {
    return !!senderId && senderId === this.report()?.reportedUser.id;
  }

  protected async assignToMe(): Promise<void> {
    const report = this.report();
    if (!report) {
      return;
    }
    this.busy.set('assign');
    const done = await runAdminAction(
      this.snackBar,
      this.api.assignReport({ id: report.id, assignReportRequest: {} }, 'body', false, {
        context: silentErrors(),
      }),
      'The report is assigned to you.',
      'This report was already decided.',
    );
    this.busy.set(null);
    if (done) {
      await this.load();
    }
  }

  protected async addNote(body: string): Promise<void> {
    const report = this.report();
    if (!report) {
      return;
    }
    this.busy.set('note');
    const note = await runAdminAction(
      this.snackBar,
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
    if (!report) {
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
            },
            panelClass: 'app-dialog--md',
          },
        )
        .afterClosed(),
    );
    if (!request) {
      return;
    }
    this.busy.set('resolve');
    const done = await runAdminAction(
      this.snackBar,
      this.api.resolveReport({ id: report.id, resolveReportRequest: request }, 'body', false, {
        context: silentErrors(),
      }),
      request.status === 'DISMISSED' ? 'Report dismissed.' : 'Report resolved.',
      'This report was already decided.',
    );
    this.busy.set(null);
    if (done) {
      await this.load();
    }
  }
}
