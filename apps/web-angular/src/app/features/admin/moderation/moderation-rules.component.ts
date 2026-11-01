import { DOCUMENT, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AdminModerationService,
  CreateModerationRuleRequestActionEnum,
  CreateModerationRuleRequestKindEnum,
  CreateModerationRuleRequestScopeEnum,
  ModerationRule,
  UpdateModerationRuleRequestActionEnum,
  UpdateModerationRuleRequestScopeEnum,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AdminIconComponent } from '../console/admin-icon.component';
import { confirmAdminAction, runAdminAction } from '../shared/admin-actions';
import {
  RULE_KINDS,
  RULE_SCOPES,
  describeRate,
  ruleActionLabel,
  ruleKindLabel,
  ruleScopeLabel,
  twinsLine,
} from './moderation-rule-labels';
import { RuleDialogComponent, RuleDialogData, RuleDialogResult } from './rule-dialog.component';

/** "8 rules · 7 on" (board A4's count line). */
export function rulesCountLine(rules: readonly Pick<ModerationRule, 'active'>[]): string {
  const on = rules.filter((rule) => rule.active).length;
  return `${rules.length} ${rules.length === 1 ? 'rule' : 'rules'} · ${on} on`;
}

/**
 * The groups the Rules tab draws (board A4): each scope the filter keeps, with its rules; a scope
 * without any shows its empty line, except while a kind is chosen (then only scopes with matches).
 */
export function ruleGroups(
  rules: readonly ModerationRule[],
  scope: string | null,
  kind: string | null,
): { scope: string; rules: ModerationRule[] }[] {
  return RULE_SCOPES.filter((value) => !scope || value === scope)
    .map((value) => ({
      scope: value as string,
      rules: rules.filter((rule) => rule.scope === value && (!kind || rule.kind === kind)),
    }))
    .filter((group) => !kind || group.rules.length > 0);
}

/**
 * Moderation rules (`GET /admin/moderation/rules`): banned terms, rate limits, repeated-content
 * thresholds and the report threshold, grouped by what they apply to, in the console's look (board
 * A4, review fix 1): the pill selects "Applies to" and "Kind", the count line, one row per rule
 * with its chips, when it changed, edit and delete. Moderators read them (the lock line);
 * administrators create, edit, switch off and delete them (403 otherwise). Every write is audited
 * and caches are dropped by the API. `focusRule` (a flag's "Rule …" link) points one out: tinted,
 * scrolled to and focused.
 */
@Component({
  selector: 'app-moderation-rules',
  imports: [
    DatePipe,
    AdminIconComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    RelativeTimePipe,
    SkeletonComponent,
  ],
  template: `
    <div class="rb">
      <div class="rb__filters" role="search" aria-label="Filter rules">
        <label class="rb__select">
          <span class="rb__label">Applies to</span>
          <select class="cp-select" (change)="scope.set(valueOf($event))">
            <option value="" [selected]="!scope()">Everything</option>
            @for (value of scopes; track value) {
              <option [value]="value" [selected]="scope() === value">
                {{ scopeLabel(value) }}
              </option>
            }
          </select>
        </label>
        <label class="rb__select">
          <span class="rb__label">Kind</span>
          <select class="cp-select" (change)="kind.set(valueOf($event))">
            <option value="" [selected]="!kind()">Any kind</option>
            @for (value of kinds; track value) {
              <option [value]="value" [selected]="kind() === value">{{ kindLabel(value) }}</option>
            }
          </select>
        </label>
      </div>
      @if (canEdit()) {
        <button type="button" class="cb cb--primary" (click)="create()">
          <app-admin-icon name="plus" [size]="18" />
          New rule
        </button>
      } @else {
        <p class="rb__lock">
          <app-admin-icon name="lock" [size]="16" />
          Administrators edit rules; moderators can read them.
        </p>
      }
    </div>

    @if (error(); as error) {
      <app-error-state
        title="Rules could not load"
        [message]="message(error)"
        [requestId]="error.requestId"
        retryLabel="Try again"
        (retry)="load()"
      />
    } @else if (rules(); as all) {
      <p class="cp-count" id="rules-count">{{ countLine() }}</p>
      @if (visible().length === 0) {
        <app-empty-state
          icon="rule"
          title="No rules match"
          description="Change the filters, or create a rule."
        />
      } @else {
        @for (group of groups(); track group.scope) {
          <section class="cp-card rg" [attr.aria-labelledby]="'rules-' + group.scope">
            <h2 class="rg__title" [id]="'rules-' + group.scope">
              {{ scopeLabel(group.scope) }}
              <span class="cp-badge">{{ group.rules.length }}</span>
            </h2>
            @if (group.rules.length === 0) {
              <p class="rg__empty">
                No rules apply to {{ scopeLabel(group.scope).toLowerCase() }} yet.
              </p>
            } @else {
              <ul class="cp-rows" [attr.aria-label]="scopeLabel(group.scope) + ' rules'">
                @for (rule of group.rules; track rule.id) {
                  <li
                    class="rule"
                    [class.rule--off]="!rule.active"
                    [class.rule--on]="pointed() === rule.id"
                    [attr.data-rule]="rule.id"
                    [attr.tabindex]="pointed() === rule.id ? -1 : null"
                    [attr.aria-current]="pointed() === rule.id ? 'true' : null"
                  >
                    <div class="rule__text">
                      <code class="rule__pattern">{{ rule.pattern }}</code>
                      @if (rate(rule); as reading) {
                        <span class="rule__reading">{{ reading }}</span>
                      }
                      @if (twins(rule); as line) {
                        <span class="rule__reading">{{ line }}</span>
                      }
                    </div>
                    <div class="rule__meta">
                      <span class="cp-chip cp-chip--accent">{{ kindLabel(rule.kind) }}</span>
                      <span
                        class="cp-chip"
                        [class.cp-chip--danger]="rule.action === 'BLOCK'"
                        [class.cp-chip--warning]="rule.action !== 'BLOCK'"
                        >{{ actionLabel(rule.action) }}</span
                      >
                      @if (!rule.active) {
                        <span class="cp-chip">Off</span>
                      }
                      <span class="rule__when" [title]="rule.updatedAt | date: 'medium'">
                        updated {{ rule.updatedAt | relativeTime }}
                      </span>
                      @if (canEdit()) {
                        <button
                          type="button"
                          class="rule__icon"
                          [attr.aria-disabled]="busy() === rule.id ? 'true' : null"
                          [attr.aria-label]="'Edit rule ' + rule.pattern"
                          (click)="busy() === rule.id || edit(rule)"
                        >
                          <app-admin-icon name="pencil" [size]="18" />
                        </button>
                        <button
                          type="button"
                          class="rule__icon"
                          [attr.aria-disabled]="busy() === rule.id ? 'true' : null"
                          [attr.aria-label]="'Delete rule ' + rule.pattern"
                          (click)="busy() === rule.id || remove(rule)"
                        >
                          <app-admin-icon name="trash" [size]="18" />
                        </button>
                      }
                    </div>
                  </li>
                }
              </ul>
            }
          </section>
        }
      }
    } @else {
      <div aria-busy="true">
        <span class="visually-hidden">Loading rules</span>
        <app-skeleton variant="list" lines="6" />
      </div>
    }
  `,
  styleUrls: ['../console/console-page.scss', '../console/console-controls.scss'],
  styles: `
    .rb {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }
    .rb__filters {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .rb__select {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .rb__label {
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    .rb__lock {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    .rg {
      margin-bottom: 16px;
      overflow: hidden;
    }
    .rg__title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      padding: 16px 20px 12px;
      color: var(--color-ink);
      font-family: var(--font-display);
      font-size: 17px;
      font-weight: var(--font-weight-semibold);
    }
    .rg__empty {
      margin: 0;
      padding: 12px 20px 16px;
      border-top: 1px solid var(--color-border);
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    .rule {
      display: flex;
      align-items: center;
      gap: 12px 16px;
      padding: 12px 20px;
      outline: none;
    }
    .rule--off .rule__text {
      opacity: 0.7;
    }
    .rule--on {
      background: var(--color-primary-tint);
      box-shadow: inset 3px 0 0 var(--color-primary);
    }
    .rule:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: -2px;
    }
    .rule__text {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .rule__pattern {
      color: var(--color-ink);
      font-family: var(--font-mono);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      overflow-wrap: anywhere;
    }
    .rule__reading {
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    .rule__meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
    }
    .rule__when {
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
      white-space: nowrap;
    }
    .rule__icon {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--color-ink);
      cursor: pointer;
    }
    .rule__icon:hover {
      background: var(--color-surface-variant);
    }
    .rule__icon:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 2px;
    }
    .rule__icon[aria-disabled='true'] {
      opacity: 0.55;
      cursor: default;
    }
    @media (max-width: 959.98px) {
      .rule {
        flex-wrap: wrap;
      }
      .rule__meta {
        justify-content: flex-start;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModerationRulesComponent {
  private readonly api = inject(AdminModerationService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly session = inject(SessionService);
  private readonly document = inject(DOCUMENT);

  /** A rule to point out (`?rule=` from a flag's "Rule …" link; review fix 1, U6). */
  readonly focusRule = input<string | undefined>();

  protected readonly scopes = RULE_SCOPES;

  /** "The same pattern is a separate rule for …" (board A4). */
  protected twins(rule: ModerationRule): string | null {
    return twinsLine(rule, this.rules() ?? []);
  }
  protected readonly kinds = RULE_KINDS;
  protected readonly scopeLabel = ruleScopeLabel;
  protected readonly kindLabel = ruleKindLabel;
  protected readonly actionLabel = ruleActionLabel;
  protected readonly canEdit = this.session.isAdmin;

  protected readonly scope = signal<string | null>(null);
  protected readonly kind = signal<string | null>(null);
  protected readonly rules = signal<ModerationRule[] | null>(null);
  /** The rules as loaded and changed (the Flags and rules page's tab count; web stage WH1). */
  readonly rulesChange = output<readonly ModerationRule[]>();
  protected readonly error = signal<ApiError | null>(null);
  protected readonly busy = signal<string | null>(null);
  protected readonly visible = computed(() =>
    (this.rules() ?? []).filter(
      (rule) =>
        (!this.scope() || rule.scope === this.scope()) &&
        (!this.kind() || rule.kind === this.kind()),
    ),
  );
  protected readonly groups = computed(() =>
    ruleGroups(this.rules() ?? [], this.scope(), this.kind()),
  );
  protected readonly countLine = computed(() => rulesCountLine(this.visible()));
  /** The rule pointed out, once it is among the loaded rules. */
  protected readonly pointed = signal<string | null>(null);

  constructor() {
    effect(() => {
      const rules = this.rules();
      if (rules) {
        this.rulesChange.emit(rules);
      }
    });
    effect(() => {
      const id = this.focusRule();
      const rule = id ? (this.rules() ?? []).find((item) => item.id === id) : undefined;
      if (!rule || this.pointed() === rule.id) {
        return;
      }
      // Its row shows whatever the filters were, tinted, scrolled to and focused.
      if (this.scope() && this.scope() !== rule.scope) {
        this.scope.set(null);
      }
      if (this.kind() && this.kind() !== rule.kind) {
        this.kind.set(null);
      }
      this.pointed.set(rule.id);
      setTimeout(() => {
        const row = this.document.querySelector<HTMLElement>(`[data-rule="${rule.id}"]`);
        row?.scrollIntoView({ block: 'center' });
        row?.focus({ preventScroll: true });
      });
    });
    this.load();
  }

  protected valueOf(event: Event): string | null {
    return (event.target as HTMLSelectElement).value || null;
  }

  protected load(): void {
    this.error.set(null);
    this.rules.set(null);
    this.api.listModerationRules({}, 'body', false, { context: silentErrors() }).subscribe({
      next: (rules) => this.rules.set(rules ?? []),
      error: (error: unknown) => this.error.set(toApiError(error)),
    });
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected rate(rule: ModerationRule): string | null {
    return rule.kind === 'BANNED_TERM' ? null : describeRate(rule.pattern);
  }

  protected async create(): Promise<void> {
    const result = await this.openDialog({});
    if (!result) {
      return;
    }
    const created = await runAdminAction(
      this.snackBar,
      this.api.createModerationRule(
        {
          createModerationRuleRequest: {
            kind: result.kind as CreateModerationRuleRequestKindEnum,
            scope: result.scope as CreateModerationRuleRequestScopeEnum,
            pattern: result.pattern,
            action: result.action as CreateModerationRuleRequestActionEnum,
            active: result.active,
          },
        },
        'body',
        false,
        { context: silentErrors() },
      ),
      'Rule created.',
    );
    if (created) {
      this.rules.update((rules) => [...(rules ?? []), created]);
    }
  }

  protected async edit(rule: ModerationRule): Promise<void> {
    const result = await this.openDialog({ rule });
    if (!result) {
      return;
    }
    this.busy.set(rule.id);
    const updated = await runAdminAction(
      this.snackBar,
      this.api.updateModerationRule(
        {
          id: rule.id,
          updateModerationRuleRequest: {
            pattern: result.pattern,
            scope: result.scope as UpdateModerationRuleRequestScopeEnum,
            action: result.action as UpdateModerationRuleRequestActionEnum,
            active: result.active,
          },
        },
        'body',
        false,
        { context: silentErrors() },
      ),
      'Rule saved.',
    );
    this.busy.set(null);
    if (updated) {
      this.rules.update((rules) =>
        (rules ?? []).map((item) => (item.id === updated.id ? updated : item)),
      );
    }
  }

  protected async remove(rule: ModerationRule): Promise<void> {
    const confirmed = await confirmAdminAction(this.dialog, {
      title: 'Delete this rule?',
      message: `“${rule.pattern}” (${ruleKindLabel(rule.kind).toLowerCase()}, ${ruleScopeLabel(
        rule.scope,
      ).toLowerCase()}) stops applying right away. Switch it off instead to keep it for later.`,
      confirmLabel: 'Delete rule',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    this.busy.set(rule.id);
    const done = await runAdminAction(
      this.snackBar,
      this.api.deleteModerationRule({ id: rule.id }, 'response', false, {
        context: silentErrors(),
      }),
      'Rule deleted.',
    );
    this.busy.set(null);
    if (done) {
      this.rules.update((rules) => (rules ?? []).filter((item) => item.id !== rule.id));
    }
  }

  private openDialog(data: RuleDialogData): Promise<RuleDialogResult | undefined> {
    return firstValueFrom(
      this.dialog
        .open<RuleDialogComponent, RuleDialogData, RuleDialogResult>(RuleDialogComponent, {
          data,
          panelClass: 'app-dialog--md',
        })
        .afterClosed(),
    );
  }
}
