import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router, RouterLink } from '@angular/router';
import { AdminModerationService, ModerationFlag, ModerationRule } from '@orenji/api-client';
import { Subscription, firstValueFrom } from 'rxjs';
import { ToastService } from '../../../core/feedback/toast.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AdminCounts } from '../console/admin-counts.service';
import { AdminIconComponent } from '../console/admin-icon.component';
import { RECORDED } from '../console/console-actions';
import { gameName, regionName } from '../console/console-labels';
import { pageRangeLine } from '../reports/report-filters';
import { describeRate, ruleActionLabel, ruleKindLabel } from '../moderation/moderation-rule-labels';
import {
  FLAG_STATE_FILTERS,
  FlagStateFilter,
  flagReasonLabel,
  flagSubjectLabel,
} from './admin-community-labels';
import { ResolveFlagDialogComponent, ResolveFlagDialogData } from './resolve-flag-dialog.component';

const PAGE_SIZE = 20;

/** The Subject filter (the API's `subjectType`; spec 15.4). */
export const FLAG_SUBJECT_FILTERS = [
  { value: '', label: 'Any subject' },
  { value: 'MESSAGE', label: 'Private messages' },
  { value: 'COMMUNITY_POST', label: 'Community posts' },
  { value: 'COMMUNITY_REPLY', label: 'Community replies' },
  { value: 'USER', label: 'Member activity' },
] as const;

type SubjectFilter = '' | 'MESSAGE' | 'COMMUNITY_POST' | 'COMMUNITY_REPLY' | 'USER';

/** The URL's flag state (Open by default). */
export function flagStateOf(value: string | undefined): FlagStateFilter {
  return value === 'RESOLVED' || value === 'ALL' ? value : 'OPEN';
}

/** The URL's subject, or `''` for any. */
export function flagSubjectOf(value: string | undefined): SubjectFilter {
  return (FLAG_SUBJECT_FILTERS.find((filter) => filter.value === value)?.value ??
    '') as SubjectFilter;
}

/** "Americas (North) · Yu-Gi-Oh!": a flagged post's room, never its codes. */
export function flagRoomLine(flag: Pick<ModerationFlag, 'community'>): string | null {
  const content = flag.community;
  if (!content) {
    return null;
  }
  return [regionName(content.regionCode), gameName(content.game) ?? content.roomName]
    .filter((part): part is string => !!part)
    .join(' · ');
}

/**
 * The Flags tab of Flags and rules (spec 15.4, board A4): the automatic moderation flags, newest
 * first, with the state (Open, Resolved, All) and the Subject in the URL. A flag names the rule
 * that fired; a community post or reply shows its room and text with "Open the post"; a private
 * message's text is never shown here ("Its text is shown only inside a report about this
 * collector."). Resolve asks for an optional note; a flag never bans anyone by itself.
 */
@Component({
  selector: 'app-admin-flags',
  imports: [
    RouterLink,
    AdminIconComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    RelativeTimePipe,
    SkeletonComponent,
  ],
  template: `
    <div class="cp-filters" role="search" aria-label="Filter flags">
      <div class="cp-seg" role="group" aria-label="Flag state">
        @for (filter of filters; track filter.value) {
          <button
            type="button"
            class="cp-seg__btn"
            [attr.aria-pressed]="state() === filter.value"
            (click)="setState(filter.value)"
          >
            {{ filter.label }}
            @if (filter.value === 'OPEN' && openCount() !== null) {
              <span class="cp-badge">{{ openCount() }}</span>
            }
          </button>
        }
      </div>
      <label class="fl__select">
        <span class="cp-field__label fl__select-label">Subject</span>
        <select class="cp-select" (change)="setSubject($event)">
          @for (option of subjects; track option.value) {
            <option [value]="option.value" [selected]="subject() === option.value">
              {{ option.label }}
            </option>
          }
        </select>
      </label>
    </div>

    @if (error(); as error) {
      <app-error-state
        title="Flags could not load"
        [message]="message(error)"
        [requestId]="error.requestId"
        (retry)="load()"
      />
    } @else if (flags(); as list) {
      <p class="cp-count" aria-live="polite">{{ countLine() }}</p>
      @if (list.length === 0) {
        <app-empty-state
          icon="verified"
          [title]="state() === 'OPEN' ? 'No open flags' : 'No flags'"
          description="Flags appear when the automatic rules notice banned terms, repeated content or unusual posting rates."
        />
      } @else {
        <ul class="flags" aria-label="Moderation flags">
          @for (flag of list; track flag.id) {
            @let open = flag.state === 'OPEN';
            @let rule = ruleOf(flag);
            <li class="cp-card flag" [attr.data-flag]="flag.id">
              <span class="flag__icon" [class.flag__icon--done]="!open" aria-hidden="true">
                <app-admin-icon [name]="open ? 'shieldCheck' : 'checkCircle'" [size]="18" />
              </span>
              <div class="flag__body">
                <div class="flag__top">
                  <p class="flag__title">
                    <strong>{{ reason(flag.reason) }}</strong>
                    <span>
                      {{ subject_(flag.subjectType) }}
                      @if (flag.authorHandle) {
                        by
                        <a class="flag__who" [routerLink]="['/collectors', flag.authorHandle]"
                          >&#64;{{ flag.authorHandle }}</a
                        >
                      }
                    </span>
                    @if (!open) {
                      <span class="cp-chip cp-chip--success">Resolved</span>
                    }
                  </p>
                  <p class="flag__when">
                    @if (roomLine(flag); as room) {
                      {{ room }} ·
                    }
                    <time [attr.datetime]="flag.createdAt">{{
                      flag.createdAt | relativeTime
                    }}</time>
                  </p>
                </div>

                @if (flag.subjectType === 'MESSAGE') {
                  <p class="flag__locked">
                    <app-admin-icon name="lock" [size]="14" />
                    Private message. Its text is shown only inside a report about this collector.
                  </p>
                } @else if (flag.community; as content) {
                  <blockquote class="flag__quote">
                    “{{ content.text }}”
                    @if (content.removed) {
                      <span class="cp-chip">Removed</span>
                    }
                  </blockquote>
                }

                @if (rule) {
                  <p class="flag__rule">
                    <span class="cp-muted">Rule</span>
                    <a
                      class="flag__pattern"
                      routerLink="."
                      [queryParams]="{ tab: 'rules', rule: rule.id }"
                      [attr.aria-label]="'Rule ' + rule.pattern + ', open it in Rules'"
                    >
                      <span class="cp-mono">{{ rule.pattern }}</span>
                      <app-admin-icon name="arrowRight" [size]="14" />
                    </a>
                    <span class="cp-muted">{{ ruleLine(rule) }}</span>
                  </p>
                } @else if (flag.ruleId === null || flag.ruleId === undefined) {
                  <p class="flag__rule cp-muted">The rule that raised it was deleted.</p>
                }

                @if (!open) {
                  <p class="flag__resolved cp-muted">
                    Resolved
                    @if (flag.resolvedByHandle) {
                      by &#64;{{ flag.resolvedByHandle }}
                    }
                    @if (flag.resolvedAt) {
                      {{ flag.resolvedAt | relativeTime }}
                    }
                    @if (flag.resolutionNote) {
                      · “{{ flag.resolutionNote }}”
                    }
                  </p>
                }

                <div class="flag__foot">
                  @if (flag.community; as content) {
                    <a
                      class="cp-link"
                      [routerLink]="['/messages/community', content.roomSlug]"
                      target="_blank"
                      rel="noopener"
                      [attr.aria-label]="'Open the post in its room, opens in a new tab'"
                    >
                      Open the post <app-admin-icon name="external" [size]="14" />
                    </a>
                  } @else if (flag.authorId && flag.authorHandle) {
                    <a
                      class="cp-link"
                      routerLink="/admin/reports"
                      [queryParams]="{ reportedUserId: flag.authorId, status: 'ALL' }"
                    >
                      Reports about &#64;{{ flag.authorHandle }}
                      <app-admin-icon name="arrowRight" [size]="14" />
                    </a>
                  }
                  @if (open) {
                    <button
                      type="button"
                      class="cb cb--outline cb--small flag__resolve"
                      [attr.aria-disabled]="busy() === flag.id ? 'true' : null"
                      [attr.aria-label]="
                        'Resolve the flag: ' +
                        reason(flag.reason) +
                        ', ' +
                        subject_(flag.subjectType)
                      "
                      (click)="busy() === flag.id || resolve(flag)"
                    >
                      Resolve
                    </button>
                  }
                </div>
              </div>
            </li>
          }
        </ul>
        @if (total() > pageSize) {
          <div class="fl__pages">
            <span>{{ range() }}</span>
            <span class="fl__arrows">
              <button
                type="button"
                class="cb cb--quiet cb--small"
                [attr.aria-disabled]="page() === 0 ? 'true' : null"
                (click)="page() === 0 || goPage(-1)"
              >
                Previous
              </button>
              <button
                type="button"
                class="cb cb--quiet cb--small"
                [attr.aria-disabled]="(page() + 1) * pageSize >= total() ? 'true' : null"
                (click)="(page() + 1) * pageSize >= total() || goPage(1)"
              >
                Next
              </button>
            </span>
          </div>
        }
      }
    } @else {
      <div aria-busy="true">
        <span class="visually-hidden">Loading flags</span>
        <app-skeleton variant="list" lines="4" />
      </div>
    }
  `,
  styleUrls: ['../console/console-page.scss', '../console/console-controls.scss'],
  styles: `
    .fl__select {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .flags {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .flag {
      display: flex;
      gap: 16px;
      padding: 18px 20px;
    }
    .flag__icon {
      display: grid;
      flex: none;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--color-warning) 16%, transparent);
      color: var(--color-warning);
    }
    .flag__icon--done {
      background: color-mix(in srgb, var(--color-success) 16%, transparent);
      color: var(--color-success);
    }
    .flag__body {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
    }
    .flag__top {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: 4px 16px;
    }
    .flag__title {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 10px;
      margin: 0;
      color: var(--color-ink);
      font-size: var(--font-size-sm);
    }
    .flag__title strong {
      font-size: 15px;
    }
    .flag__who {
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .flag__when {
      margin: 0;
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    .flag__locked {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      padding: 10px 14px;
      border: 1px dashed var(--color-border-strong);
      border-radius: 12px;
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    .flag__quote {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin: 0;
      padding: 10px 14px;
      border-left: 3px solid var(--color-border-strong);
      border-radius: 0 12px 12px 0;
      background: var(--color-background);
      color: var(--color-ink);
      font-size: 15px;
      overflow-wrap: anywhere;
    }
    .flag__rule {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin: 0;
      font-size: var(--font-size-sm);
    }
    .flag__pattern {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 28px;
      padding: 0 10px;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-pill);
      color: var(--color-ink);
      font-size: var(--font-size-xs);
      text-decoration: none;
    }
    .flag__pattern:hover {
      background: var(--color-surface-variant);
    }
    .flag__pattern:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 2px;
    }
    .flag__resolved {
      margin: 0;
      font-size: var(--font-size-sm);
    }
    .flag__foot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .flag__resolve {
      margin-left: auto;
    }
    .fl__pages {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 12px;
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    @media (max-width: 599.98px) {
      .flag {
        padding: 14px;
      }
      .flag__icon {
        display: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminFlagsComponent {
  private readonly api = inject(AdminModerationService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly counts = inject(AdminCounts, { optional: true });

  /** `?state=` and `?subject=` (the page passes the URL's values). */
  readonly stateParam = input<string | undefined>();
  readonly subjectParam = input<string | undefined>();
  /** The rules (from the Rules tab's list), to name the rule that fired. */
  readonly rules = input<readonly ModerationRule[]>([]);
  /** A flag was resolved: the page reads the counts again. */
  readonly resolved = output<void>();

  protected readonly filters = FLAG_STATE_FILTERS;
  protected readonly subjects = FLAG_SUBJECT_FILTERS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly state = computed(() => flagStateOf(this.stateParam()));
  protected readonly subject = computed(() => flagSubjectOf(this.subjectParam()));
  protected readonly page = signal(0);
  protected readonly flags = signal<ModerationFlag[] | null>(null);
  protected readonly total = signal(0);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly busy = signal<string | null>(null);
  protected readonly openCount = computed(() => this.counts?.counts()?.flags ?? null);
  protected readonly countLine = computed(() => {
    const total = this.total();
    const flags = `${total} ${total === 1 ? 'flag' : 'flags'}`;
    return this.state() === 'OPEN'
      ? `${total} open ${total === 1 ? 'flag' : 'flags'}`
      : this.state() === 'RESOLVED'
        ? `${flags} resolved`
        : flags;
  });
  protected readonly range = computed(() => pageRangeLine(this.page(), PAGE_SIZE, this.total()));
  protected readonly reason = flagReasonLabel;
  protected readonly subject_ = flagSubjectLabel;
  protected readonly roomLine = flagRoomLine;

  private subscription: Subscription | null = null;

  constructor() {
    effect(() => {
      this.state();
      this.subject();
      untracked(() => {
        this.page.set(0);
        this.load();
      });
    });
    inject(DestroyRef).onDestroy(() => this.subscription?.unsubscribe());
  }

  protected ruleOf(flag: ModerationFlag): ModerationRule | null {
    return flag.ruleId ? (this.rules().find((rule) => rule.id === flag.ruleId) ?? null) : null;
  }

  /** "Repeated content · 5 identical in 10 minutes · Flag for review" */
  protected ruleLine(rule: ModerationRule): string {
    const rate = describeRate(rule.pattern);
    return [ruleKindLabel(rule.kind), rate, ruleActionLabel(rule.action)]
      .filter((part): part is string => !!part)
      .join(' · ');
  }

  protected setState(state: FlagStateFilter): void {
    void this.router.navigate([], {
      queryParams: { state: state === 'OPEN' ? null : state },
      queryParamsHandling: 'merge',
    });
  }

  protected setSubject(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    void this.router.navigate([], {
      queryParams: { subject: value || null },
      queryParamsHandling: 'merge',
    });
  }

  protected goPage(delta: number): void {
    this.page.update((page) => Math.max(0, page + delta));
    this.load();
  }

  protected load(): void {
    this.subscription?.unsubscribe();
    this.error.set(null);
    this.flags.set(null);
    const subject = this.subject();
    this.subscription = this.api
      .listModerationFlags(
        {
          state: this.state(),
          subjectType: subject || undefined,
          page: this.page(),
          size: PAGE_SIZE,
        },
        'body',
        false,
        { context: silentErrors() },
      )
      .subscribe({
        next: (page) => {
          this.flags.set(page.items ?? []);
          this.total.set(page.totalItems ?? page.items?.length ?? 0);
        },
        error: (error: unknown) => this.error.set(toApiError(error)),
      });
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected async resolve(flag: ModerationFlag): Promise<void> {
    const subject = `${flagSubjectLabel(flag.subjectType)}${
      flag.authorHandle ? ` by @${flag.authorHandle}` : ''
    }, ${flagReasonLabel(flag.reason).toLowerCase()}`;
    const result = await firstValueFrom(
      this.dialog
        .open<ResolveFlagDialogComponent, ResolveFlagDialogData, { note: string }>(
          ResolveFlagDialogComponent,
          { data: { subject }, width: '480px', maxWidth: 'calc(100vw - 32px)' },
        )
        .afterClosed(),
    );
    if (!result) {
      return;
    }
    this.busy.set(flag.id);
    try {
      const resolved = await firstValueFrom(
        this.api.resolveModerationFlag(
          {
            id: flag.id,
            resolveModerationFlagRequest: result.note ? { note: result.note } : {},
          },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      if (this.state() === 'OPEN') {
        this.flags.update((flags) => (flags ?? []).filter((item) => item.id !== flag.id));
        this.total.update((total) => Math.max(0, total - 1));
      } else {
        this.flags.update((flags) =>
          (flags ?? []).map((item) => (item.id === resolved.id ? resolved : item)),
        );
      }
      this.toasts.show({ title: 'Flag resolved.', sub: RECORDED });
      this.resolved.emit();
      void this.counts?.refresh();
    } catch (error) {
      const apiError = toApiError(error);
      this.toasts.show({
        title:
          apiError.status === 409 ? 'This flag was already resolved.' : friendlyMessage(apiError),
        tone: 'error',
      });
      if (apiError.status === 409) {
        this.load();
      }
    } finally {
      this.busy.set(null);
    }
  }
}
