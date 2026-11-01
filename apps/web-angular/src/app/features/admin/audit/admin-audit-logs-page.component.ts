import { DatePipe, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { Router, RouterLink } from '@angular/router';
import {
  AdminAuditService,
  AdminUsersService,
  AdminUserSummary,
  AuditLogEntry,
  ListAuditLogsRequestParams,
  PageResponseAuditLogEntry,
} from '@orenji/api-client';
import { Subscription, catchError, forkJoin, map, of } from 'rxjs';
import { FEATURE, FeatureFlagsService } from '../../../core/feature-flags/feature-flags.service';
import { ShellLayout } from '../../../core/layout/shell-layout.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AdminIconComponent } from '../console/admin-icon.component';
import {
  AUDIT_ACTION_GROUPS,
  PAYMENT_ACTION_GROUP,
  auditLabel,
  auditWho,
  detailSummary,
  staffJson,
  targetLink,
  targetName,
  targetTypeLabel,
} from './audit-entries';

const PAGE_SIZE = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Start of a local day (yyyy-mm-dd) as ISO, or undefined. */
export function dayStart(value: string | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
}

/** Start of the day after (the API's `to` is exclusive), or undefined. */
export function dayAfter(value: string | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d + 1).toISOString();
}

/** The "Who" filter (board A23): staff by account, the system, or collectors. */
export function whoParams(
  who: string | undefined,
): Pick<ListAuditLogsRequestParams, 'actorId' | 'actorType'> {
  if (who === 'system') {
    return { actorType: 'SYSTEM' };
  }
  if (who === 'collectors') {
    return { actorType: 'USER' };
  }
  return UUID.test(who ?? '') ? { actorId: who } : {};
}

/** A staff member in the Who filter. */
interface StaffOption {
  id: string;
  label: string;
}

/**
 * `/admin/audit-logs` (spec 15.5, board A23): every staff and account action, newest first.
 * Filters (in the URL): Action grouped by area, Who (staff, System, Collectors), a Target search
 * (a handle, a report number or a setting key), From and To; today's links from an account or a
 * report keep their `targetType` and `targetId`. Rows name who acted, the action with its code
 * and a readable target; details expand to the JSON and the request id.
 */
@Component({
  selector: 'app-admin-audit-logs-page',
  imports: [
    NgTemplateOutlet,
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatPaginatorModule,
    AdminIconComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  templateUrl: './admin-audit-logs-page.component.html',
  styleUrls: [
    '../console/console-page.scss',
    '../console/console-controls.scss',
    '../console/console-table.scss',
    './admin-audit-logs-page.component.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAuditLogsPageComponent {
  private readonly auditApi = inject(AdminAuditService);
  private readonly usersApi = inject(AdminUsersService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly flags = inject(FeatureFlagsService);
  private readonly shell = inject(ShellLayout);

  /**
   * The table's columns by width (web stage WH2 review fix 2, R1-5): every column at lg; at md the
   * target sits under the action; below 960 one Entry column (who, when, action, target) beside
   * Details, so the summary and its toggle never sit outside the window.
   */
  protected readonly columns = computed<'lg' | 'md' | 'sm'>(() =>
    this.shell.narrow() ? 'sm' : this.shell.medium() ? 'md' : 'lg',
  );
  protected readonly columnCount = computed(() =>
    this.columns() === 'lg' ? 5 : this.columns() === 'md' ? 4 : 2,
  );

  readonly action = input<string | undefined>();
  readonly who = input<string | undefined>();
  readonly target = input<string | undefined>();
  readonly targetType = input<string | undefined>();
  readonly targetId = input<string | undefined>();
  readonly actorId = input<string | undefined>();
  readonly from = input<string | undefined>();
  readonly to = input<string | undefined>();
  readonly page = input<string | undefined>();

  private readonly paymentsOn = this.flags.enabled(FEATURE.protectedPayments);
  protected readonly groups = computed(() =>
    this.paymentsOn() ? [...AUDIT_ACTION_GROUPS, PAYMENT_ACTION_GROUP] : AUDIT_ACTION_GROUPS,
  );
  protected readonly auditLabel = auditLabel;
  protected readonly who$ = auditWho;
  protected readonly targetName = targetName;
  protected readonly targetTypeLabel = targetTypeLabel;
  protected readonly targetLink = targetLink;
  protected readonly detailSummary = detailSummary;
  protected readonly staffJson = staffJson;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly staff = signal<StaffOption[]>([]);
  protected readonly form = this.fb.group({
    action: [''],
    who: [''],
    target: [''],
    from: [''],
    to: [''],
  });
  protected readonly result = signal<PageResponseAuditLogEntry | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });
  protected readonly expanded = signal<string | null>(null);
  /** The legacy target of an account's or a report's "Audit log" link. */
  protected readonly linkedTarget = computed(() =>
    this.targetId() ? { type: this.targetType() ?? '', id: this.targetId() as string } : null,
  );
  protected readonly params = computed<ListAuditLogsRequestParams>(() => {
    const who = this.who() ?? (UUID.test(this.actorId() ?? '') ? this.actorId() : undefined);
    return {
      action: this.action() || undefined,
      ...whoParams(who),
      target: this.target()?.trim() || undefined,
      targetType: this.targetType() || undefined,
      targetId: this.targetId() || undefined,
      from: dayStart(this.from()),
      to: dayAfter(this.to()),
      page: Math.max(0, Number.parseInt(this.page() ?? '0', 10) || 0),
      size: PAGE_SIZE,
    };
  });
  protected readonly hasFilters = computed(() =>
    [
      this.action(),
      this.who(),
      this.target(),
      this.targetType(),
      this.targetId(),
      this.actorId(),
      this.from(),
      this.to(),
    ].some(Boolean),
  );
  protected readonly range = computed(() => {
    const page = this.result();
    if (!page || !page.totalItems) {
      return '';
    }
    const start = (page.page ?? 0) * (page.size ?? PAGE_SIZE) + 1;
    const end = Math.min(page.totalItems, start + (page.items ?? []).length - 1);
    return `${start}–${end} of ${page.totalItems.toLocaleString('en-US')}`;
  });

  private subscription: Subscription | null = null;

  constructor() {
    effect(() => {
      const params = this.params();
      untracked(() => {
        this.form.reset({
          action: this.action() ?? '',
          who: this.who() ?? (UUID.test(this.actorId() ?? '') ? (this.actorId() as string) : ''),
          target: this.target() ?? '',
          from: this.from() ?? '',
          to: this.to() ?? '',
        });
        this.load(params);
      });
    });
    this.loadStaff();
    inject(DestroyRef).onDestroy(() => this.subscription?.unsubscribe());
  }

  protected applyFilters(): void {
    const value = this.form.getRawValue();
    const queryParams: Record<string, string | null> = {
      page: null,
      actorId: null,
      // The target search replaces a linked target once applied.
      targetType: value.target.trim() ? null : (this.targetType() ?? null),
      targetId: value.target.trim() ? null : (this.targetId() ?? null),
    };
    for (const [key, raw] of Object.entries(value)) {
      queryParams[key] = raw.trim() || null;
    }
    void this.router.navigate([], { queryParams });
  }

  protected clearTarget(): void {
    void this.router.navigate([], {
      queryParams: { targetType: null, targetId: null, page: null },
      queryParamsHandling: 'merge',
    });
  }

  protected clearFilters(): void {
    void this.router.navigate([], { queryParams: {} });
  }

  protected onPage(event: PageEvent): void {
    void this.router.navigate([], {
      queryParams: { page: event.pageIndex || null },
      queryParamsHandling: 'merge',
    });
  }

  protected reload(): void {
    this.load(this.params());
  }

  protected toggle(entry: AuditLogEntry): void {
    this.expanded.update((id) => (id === entry.id ? null : entry.id));
  }

  /** "Same request as 1 other entry" (board A23). */
  protected sameRequest(entry: AuditLogEntry): number {
    if (!entry.requestId) {
      return 0;
    }
    return (this.result()?.items ?? []).filter(
      (other) => other.id !== entry.id && other.requestId === entry.requestId,
    ).length;
  }

  protected async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard refused: the id stays selectable on the page.
    }
  }

  private loadStaff(): void {
    const roles = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR'] as const;
    forkJoin(
      roles.map((role) =>
        this.usersApi
          .listUsers({ role, size: 100 }, 'body', false, { context: silentErrors() })
          .pipe(
            map((page) => page.items ?? []),
            catchError(() => of([] as AdminUserSummary[])),
          ),
      ),
    ).subscribe((lists) => {
      const seen = new Map<string, StaffOption>();
      for (const user of lists.flat()) {
        if (!seen.has(user.id)) {
          seen.set(user.id, {
            id: user.id,
            label: user.displayName ? `${user.displayName} (@${user.handle})` : `@${user.handle}`,
          });
        }
      }
      this.staff.set([...seen.values()].sort((a, b) => a.label.localeCompare(b.label)));
    });
  }

  private load(params: ListAuditLogsRequestParams): void {
    this.subscription?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.subscription = this.auditApi
      .listAuditLogs(params, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (result) => {
          this.result.set(result);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(toApiError(error));
          this.loading.set(false);
        },
      });
  }
}
