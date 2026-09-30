import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
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
import { AdminChipComponent } from '../shared/admin-chip.component';
import { confirmAdminAction, runAdminAction } from '../shared/admin-actions';
import {
  RULE_KINDS,
  RULE_SCOPES,
  describeRate,
  ruleActionLabel,
  ruleKindLabel,
  ruleScopeLabel,
} from './moderation-rule-labels';
import { RuleDialogComponent, RuleDialogData, RuleDialogResult } from './rule-dialog.component';

/**
 * Moderation rules (`GET /admin/moderation/rules`): banned terms, rate limits, repeated-content
 * thresholds and the report threshold, grouped by what they apply to. Moderators read them;
 * administrators create, edit, switch off and delete them (403 otherwise). Every write is audited
 * and caches are dropped by the API.
 */
@Component({
  selector: 'app-moderation-rules',
  imports: [
    DatePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    AdminChipComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    RelativeTimePipe,
    SkeletonComponent,
  ],
  template: `
    <div class="rules__bar">
      <div class="admin-filters rules__filters" role="search" aria-label="Filter rules">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Applies to</mat-label>
          <mat-select [value]="scope()" (selectionChange)="scope.set($event.value)">
            <mat-option [value]="null">Everything</mat-option>
            @for (value of scopes; track value) {
              <mat-option [value]="value">{{ scopeLabel(value) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Kind</mat-label>
          <mat-select [value]="kind()" (selectionChange)="kind.set($event.value)">
            <mat-option [value]="null">Any kind</mat-option>
            @for (value of kinds; track value) {
              <mat-option [value]="value">{{ kindLabel(value) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>
      @if (canEdit()) {
        <button matButton="filled" type="button" (click)="create()">
          <mat-icon aria-hidden="true">add</mat-icon>
          New rule
        </button>
      } @else {
        <p class="admin-muted rules__readonly">
          <mat-icon aria-hidden="true">lock</mat-icon>
          Administrators edit rules; moderators can read them.
        </p>
      }
    </div>

    @if (error(); as error) {
      <app-error-state
        title="Rules could not load"
        [message]="message(error)"
        [requestId]="error.requestId"
        (retry)="load()"
      />
    } @else if (rules(); as all) {
      @if (visible().length === 0) {
        <app-empty-state
          icon="rule"
          title="No rules match"
          description="Change the filters, or create a rule."
        />
      } @else {
        @for (group of groups(); track group.scope) {
          <section class="group" [attr.aria-labelledby]="'rules-' + group.scope">
            <h3 class="group__title" [id]="'rules-' + group.scope">
              {{ scopeLabel(group.scope) }}
              <span class="admin-muted">{{ group.rules.length }}</span>
            </h3>
            <ul class="rules" [attr.aria-label]="scopeLabel(group.scope) + ' rules'">
              @for (rule of group.rules; track rule.id) {
                <li class="rule" [class.rule--off]="!rule.active" [attr.data-rule]="rule.id">
                  <div class="rule__text">
                    <p class="rule__pattern">
                      <code>{{ rule.pattern }}</code>
                      @if (rate(rule); as reading) {
                        <span class="admin-muted">{{ reading }}</span>
                      }
                    </p>
                    <p class="rule__meta">
                      <app-admin-chip tone="info">{{ kindLabel(rule.kind) }}</app-admin-chip>
                      <app-admin-chip [tone]="rule.action === 'BLOCK' ? 'danger' : 'warning'">
                        {{ actionLabel(rule.action) }}
                      </app-admin-chip>
                      @if (!rule.active) {
                        <app-admin-chip tone="neutral">Off</app-admin-chip>
                      }
                      <span class="admin-muted" [title]="rule.updatedAt | date: 'medium'">
                        updated {{ rule.updatedAt | relativeTime }}
                      </span>
                    </p>
                  </div>
                  @if (canEdit()) {
                    <div class="rule__actions">
                      <button
                        matIconButton
                        type="button"
                        [disabled]="busy() === rule.id"
                        [attr.aria-label]="'Edit rule ' + rule.pattern"
                        (click)="edit(rule)"
                      >
                        <mat-icon>edit</mat-icon>
                      </button>
                      <button
                        matIconButton
                        type="button"
                        [disabled]="busy() === rule.id"
                        [attr.aria-label]="'Delete rule ' + rule.pattern"
                        (click)="remove(rule)"
                      >
                        <mat-icon>delete</mat-icon>
                      </button>
                    </div>
                  }
                </li>
              }
            </ul>
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
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .rules__bar {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--spacing-3);
    }
    .rules__filters {
      margin-bottom: var(--spacing-2);
    }
    .rules__readonly {
      display: flex;
      align-items: center;
      gap: var(--spacing-1);
    }
    .group {
      margin-bottom: var(--spacing-4);
    }
    .group__title {
      display: flex;
      align-items: baseline;
      gap: var(--spacing-2);
      margin: 0 0 var(--spacing-2);
      font-size: var(--font-size-md);
    }
    .rules {
      margin: 0;
      padding: 0;
      list-style: none;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .rule {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      padding: var(--spacing-2) var(--spacing-4);
      border-bottom: 1px solid var(--color-border);
    }
    .rule:last-child {
      border-bottom: 0;
    }
    .rule--off {
      opacity: 0.65;
    }
    .rule__text {
      flex: 1 1 auto;
      min-width: 0;
    }
    .rule__text p {
      margin: 0;
    }
    .rule__pattern {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--spacing-2);
    }
    .rule__pattern code {
      font-family: var(--font-mono);
      font-size: var(--font-size-sm);
      overflow-wrap: anywhere;
    }
    .rule__meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2);
      margin-top: 4px !important;
    }
    .rule__actions {
      display: flex;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModerationRulesComponent {
  private readonly api = inject(AdminModerationService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly session = inject(SessionService);

  protected readonly scopes = RULE_SCOPES;
  protected readonly kinds = RULE_KINDS;
  protected readonly scopeLabel = ruleScopeLabel;
  protected readonly kindLabel = ruleKindLabel;
  protected readonly actionLabel = ruleActionLabel;
  protected readonly canEdit = this.session.isAdmin;

  protected readonly scope = signal<string | null>(null);
  protected readonly kind = signal<string | null>(null);
  protected readonly rules = signal<ModerationRule[] | null>(null);
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
    RULE_SCOPES.map((scope) => ({
      scope,
      rules: this.visible().filter((rule) => rule.scope === scope),
    })).filter((group) => group.rules.length > 0),
  );

  constructor() {
    this.load();
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
