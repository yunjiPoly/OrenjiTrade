import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ALL_ROLES, PRIVILEGED_ROLES, ROLE_LABELS, Role } from '../../../core/auth/roles';

const ROLE_HELP: Record<Role, string> = {
  USER: 'Every account. Always kept.',
  PREMIUM_USER: 'Premium entitlements (manual override).',
  MODERATOR: 'Moderation areas of the admin console.',
  ADMIN: 'The whole admin console.',
  SUPER_ADMIN: 'Admin plus feature flags, plans and role grants.',
};

/** Why a role checkbox is locked, or null when it can be changed. */
export function roleLockReason(
  role: Role,
  context: { actorIsSuperAdmin: boolean; isSelf: boolean; current: readonly Role[] },
): string | null {
  if (role === 'USER') {
    return 'Every account keeps USER.';
  }
  if (PRIVILEGED_ROLES.includes(role) && !context.actorIsSuperAdmin) {
    return 'Only a super admin can grant or revoke this role.';
  }
  if (role === 'SUPER_ADMIN' && context.isSelf && context.current.includes('SUPER_ADMIN')) {
    return 'You cannot remove your own super admin role.';
  }
  return null;
}

/** Role checkboxes following the API rules (USER always, SUPER_ADMIN-only privileged grants). */
@Component({
  selector: 'app-roles-editor',
  imports: [MatButtonModule, MatCheckboxModule, MatProgressSpinnerModule],
  template: `
    <fieldset class="roles" [disabled]="busy()">
      <legend class="visually-hidden">Roles</legend>
      @for (role of allRoles; track role) {
        @let lock = lockOf(role);
        <div class="roles__row">
          <mat-checkbox
            [checked]="draft().includes(role)"
            [disabled]="lock !== null || busy()"
            (change)="toggle(role, $event.checked)"
            [aria-describedby]="'role-help-' + role"
          >
            {{ labels[role] }}
          </mat-checkbox>
          <span class="roles__help" [id]="'role-help-' + role">{{ lock ?? help[role] }}</span>
        </div>
      }
    </fieldset>
    <div class="roles__actions">
      <button matButton type="button" [disabled]="!dirty() || busy()" (click)="reset()">
        Reset
      </button>
      <button
        matButton="filled"
        type="button"
        [disabled]="!dirty() || busy()"
        (click)="save.emit(draft())"
      >
        @if (busy()) {
          <mat-spinner diameter="18" aria-hidden="true" />
        }
        Save roles
      </button>
    </div>
  `,
  styles: `
    .roles {
      margin: 0;
      padding: 0;
      border: 0;
    }
    .roles__row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-2);
      border-bottom: 1px solid var(--color-border);
    }
    .roles__row:last-child {
      border-bottom: 0;
    }
    .roles__help {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .roles__actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--spacing-2);
      margin-top: var(--spacing-3);
    }
    .roles__actions mat-spinner {
      display: inline-block;
      margin-right: var(--spacing-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RolesEditorComponent {
  readonly roles = input.required<Role[]>();
  readonly actorIsSuperAdmin = input(false, { transform: booleanAttribute });
  readonly isSelf = input(false, { transform: booleanAttribute });
  readonly busy = input(false, { transform: booleanAttribute });
  readonly save = output<Role[]>();

  protected readonly allRoles = ALL_ROLES;
  protected readonly labels = ROLE_LABELS;
  protected readonly help = ROLE_HELP;
  protected readonly draft = linkedSignal(() => this.roles());
  protected readonly dirty = computed(() => {
    const current = new Set(this.roles());
    const draft = new Set(this.draft());
    return current.size !== draft.size || [...draft].some((role) => !current.has(role));
  });

  protected lockOf(role: Role): string | null {
    return roleLockReason(role, {
      actorIsSuperAdmin: this.actorIsSuperAdmin(),
      isSelf: this.isSelf(),
      current: this.roles(),
    });
  }

  protected toggle(role: Role, checked: boolean): void {
    this.draft.update((draft) =>
      checked
        ? ALL_ROLES.filter((r) => r === role || draft.includes(r))
        : draft.filter((r) => r !== role),
    );
  }

  protected reset(): void {
    this.draft.set(this.roles());
  }
}
