import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router } from '@angular/router';
import { AdminModerationService, ModerationRule } from '@orenji/api-client';
import { silentErrors } from '../../../core/http/http-context';
import { AdminFlagsComponent } from '../community/admin-flags.component';
import { AdminCounts } from '../console/admin-counts.service';
import { ModerationRulesComponent } from './moderation-rules.component';

const TABS = ['flags', 'rules'] as const;
type Tab = (typeof TABS)[number];

/** The URL's tab: Flags first (spec 15.4, board A4). */
export function moderationTabOf(value: string | undefined): Tab {
  return value === 'rules' ? 'rules' : 'flags';
}

/**
 * `/admin/moderation`, Flags and rules (spec 15.4, board A4; moderators and admins): one page for
 * the automatic moderation, replacing Moderation and the Community page's duplicate flags tab.
 * Tabs Flags (first) and Rules, in the URL (`?tab=rules`); the flags' state and Subject too
 * (`?state=`, `?subject=`). Rules keep today's filters, groups, dialog, validation, lock line for
 * moderators and the delete confirmation.
 */
@Component({
  selector: 'app-admin-moderation-page',
  imports: [AdminFlagsComponent, ModerationRulesComponent],
  template: `
    <div class="cp">
      <header class="cp__head">
        <div class="cp__heading">
          <p class="cp__eyebrow">Moderation</p>
          <h1 class="cp__title">Flags and rules</h1>
          <p class="cp__sub">
            The automatic rules block or flag content; flags wait for a moderator. Flags never ban
            anyone by themselves.
          </p>
        </div>
      </header>

      <div class="cp-tabs" role="tablist" aria-label="Flags and rules">
        @for (id of tabs; track id) {
          <button
            type="button"
            role="tab"
            class="cp-tab"
            [id]="'moderation-tab-' + id"
            [attr.aria-selected]="current() === id"
            [attr.aria-controls]="'moderation-panel-' + id"
            [attr.tabindex]="current() === id ? 0 : -1"
            (click)="select(id)"
            (keydown)="onTabKey($event)"
          >
            {{ id === 'flags' ? 'Flags' : 'Rules' }}
            @if (id === 'flags' && flagCount() !== null) {
              <span class="cp-badge" [class.cp-badge--hot]="flagCount()! > 0">{{
                flagCount()
              }}</span>
            }
            @if (id === 'rules' && rules().length > 0) {
              <span class="cp-badge">{{ rules().length }}</span>
            }
          </button>
        }
      </div>

      <div
        role="tabpanel"
        [id]="'moderation-panel-' + current()"
        [attr.aria-labelledby]="'moderation-tab-' + current()"
      >
        @if (current() === 'flags') {
          <app-admin-flags [stateParam]="state()" [subjectParam]="subject()" [rules]="rules()" />
        } @else {
          <app-moderation-rules (rulesChange)="rules.set($event)" />
        }
      </div>
    </div>
  `,
  styleUrls: ['../console/console-page.scss', '../console/console-controls.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminModerationPageComponent {
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly api = inject(AdminModerationService);
  private readonly counts = inject(AdminCounts, { optional: true });

  /** Query parameters (withComponentInputBinding). */
  readonly tab = input<string | undefined>();
  readonly state = input<string | undefined>();
  readonly subject = input<string | undefined>();

  protected readonly tabs = TABS;
  protected readonly current = computed(() => moderationTabOf(this.tab()));
  protected readonly rules = signal<readonly ModerationRule[]>([]);
  protected readonly flagCount = computed(() => this.counts?.counts()?.flags ?? null);

  constructor() {
    // The flags name the rule that fired: the rules load once for both tabs.
    this.api.listModerationRules({}, 'body', false, { context: silentErrors() }).subscribe({
      next: (rules) => this.rules.set(rules ?? []),
      error: () => this.rules.set([]),
    });
  }

  protected select(tab: Tab): void {
    void this.router.navigate([], {
      queryParams: { tab: tab === 'flags' ? null : tab, rule: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** The arrows, Home and End move between the two tabs (the tabs pattern). */
  protected onTabKey(event: KeyboardEvent): void {
    const index = TABS.indexOf(this.current());
    let next: number | null = null;
    if (event.key === 'ArrowRight') {
      next = (index + 1) % TABS.length;
    } else if (event.key === 'ArrowLeft') {
      next = (index - 1 + TABS.length) % TABS.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = TABS.length - 1;
    }
    if (next === null) {
      return;
    }
    event.preventDefault();
    this.select(TABS[next]);
    setTimeout(() => this.document.getElementById(`moderation-tab-${TABS[next]}`)?.focus());
  }
}
