import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { AdminUserSummary } from '@orenji/api-client';
import { ROLE_LABELS, roleList } from '../../../core/auth/roles';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { StatusChipComponent } from '../shared/status-chip.component';

/** Accounts table of the admin console; the name cell links to the detail page. */
@Component({
  selector: 'app-admin-users-table',
  imports: [
    DatePipe,
    RouterLink,
    MatTableModule,
    RelativeTimePipe,
    AvatarComponent,
    StatusChipComponent,
  ],
  template: `
    <div class="table-wrap">
      <table mat-table [dataSource]="users()" class="users" aria-label="Accounts">
        <ng-container matColumnDef="user">
          <th mat-header-cell *matHeaderCellDef scope="col">Collector</th>
          <td mat-cell *matCellDef="let user">
            <a class="users__who" [routerLink]="['/admin/users', user.id]">
              <app-avatar
                size="sm"
                [src]="user.avatarUrl"
                [name]="user.displayName || user.handle"
                [decorative]="true"
              />
              <span class="users__names">
                <span class="users__name">{{ user.displayName || user.handle }}</span>
                <span class="users__handle">&#64;{{ user.handle }}</span>
              </span>
            </a>
          </td>
        </ng-container>
        <ng-container matColumnDef="email">
          <th mat-header-cell *matHeaderCellDef scope="col" class="users__opt">Email</th>
          <td mat-cell *matCellDef="let user" class="users__opt">{{ user.email || '—' }}</td>
        </ng-container>
        <ng-container matColumnDef="status">
          <th mat-header-cell *matHeaderCellDef scope="col">Status</th>
          <td mat-cell *matCellDef="let user"><app-status-chip [status]="user.status" /></td>
        </ng-container>
        <ng-container matColumnDef="roles">
          <th mat-header-cell *matHeaderCellDef scope="col" class="users__opt">Roles</th>
          <td mat-cell *matCellDef="let user" class="users__opt">{{ rolesOf(user) }}</td>
        </ng-container>
        <ng-container matColumnDef="created">
          <th mat-header-cell *matHeaderCellDef scope="col" class="users__opt">Joined</th>
          <td mat-cell *matCellDef="let user" class="users__opt users__date">
            {{ user.createdAt | date: 'mediumDate' }}
          </td>
        </ng-container>
        <ng-container matColumnDef="active">
          <th mat-header-cell *matHeaderCellDef scope="col" class="users__opt">Last active</th>
          <td mat-cell *matCellDef="let user" class="users__opt users__date">
            {{ user.lastActiveAt ? (user.lastActiveAt | relativeTime) : '—' }}
          </td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="columns"></tr>
        <tr mat-row *matRowDef="let row; columns: columns"></tr>
      </table>
    </div>
  `,
  styles: `
    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .users {
      width: 100%;
      --mat-table-background-color: transparent;
    }
    .users__who {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      color: inherit;
      text-decoration: none;
      padding: var(--spacing-1) 0;
    }
    .users__who:hover .users__name {
      color: var(--color-primary);
      text-decoration: underline;
    }
    .users__names {
      display: flex;
      flex-direction: column;
    }
    .users__name {
      font-weight: var(--font-weight-semibold);
    }
    .users__handle {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .users__date {
      white-space: nowrap;
    }
    @media (max-width: 719px) {
      .users__opt {
        display: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsersTableComponent {
  readonly users = input.required<AdminUserSummary[]>();
  protected readonly columns = ['user', 'email', 'status', 'roles', 'created', 'active'];

  protected rolesOf(user: AdminUserSummary): string {
    return roleList(user.roles)
      .map((role) => ROLE_LABELS[role])
      .join(', ');
  }
}
