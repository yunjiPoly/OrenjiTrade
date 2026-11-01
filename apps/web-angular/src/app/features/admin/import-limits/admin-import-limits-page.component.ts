import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  AdminConsoleService,
  AdminInventoryImportService,
  InventoryImportSettingsResponse,
  JobStatus,
  SystemHealth,
} from '@orenji/api-client';
import { ToastService } from '../../../core/feedback/toast.service';
import { ApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AdminIconComponent } from '../console/admin-icon.component';
import { runConsoleAction } from '../console/console-actions';
import { changedLine } from '../console/editor-line';
import { loadInto, section } from '../console/section';
import { JOBS } from '../health/job-labels';
import {
  IMPORT_LIMIT_FIELDS,
  ImportLimitField,
  ImportLimitKey,
  ImportLimitValues,
  allowedLine,
  changesOf,
  limitError,
  sizeWords,
  valuesOf,
} from './import-limits';

/** A card of the form: its title, line and fields. */
interface LimitCard {
  id: string;
  title: string;
  sub: string;
  badge: string | null;
  icon: 'table' | 'hourglass' | null;
  fields: ImportLimitField[];
}

const CARDS: readonly LimitCard[] = [
  {
    id: 'ydk',
    title: '.ydk deck files',
    sub: 'Yu-Gi-Oh! deck lists in the YGOPro format.',
    badge: 'Y',
    icon: null,
    fields: [IMPORT_LIMIT_FIELDS.ydkMaxKb, IMPORT_LIMIT_FIELDS.ydkMaxLines],
  },
  {
    id: 'csv',
    title: 'Collectr CSV exports',
    sub: 'A collection exported from the Collectr app.',
    badge: null,
    icon: 'table',
    fields: [IMPORT_LIMIT_FIELDS.csvMaxKb, IMPORT_LIMIT_FIELDS.csvMaxRows],
  },
  {
    id: 'previews',
    title: 'Previews',
    sub: 'A collector checks the preview, then imports it.',
    badge: null,
    icon: 'hourglass',
    fields: [IMPORT_LIMIT_FIELDS.previewTtlMinutes],
  },
];

/**
 * `/admin/import-limits` (spec 15.7, board A15; new page): the largest .ydk and Collectr CSV
 * files, their most lines and rows, and how long a preview is kept, on `GET/PUT
 * /admin/inventory/import-settings` (ADMIN, audited). The phone and the web read the same limits
 * from `GET /inventory/imports/limits`.
 */
@Component({
  selector: 'app-admin-import-limits-page',
  imports: [DatePipe, RouterLink, AdminIconComponent, ErrorStateComponent, SkeletonComponent],
  templateUrl: './admin-import-limits-page.component.html',
  styleUrls: [
    '../console/console-page.scss',
    '../console/console-controls.scss',
    './admin-import-limits-page.component.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminImportLimitsPageComponent {
  private readonly api = inject(AdminInventoryImportService);
  private readonly consoleApi = inject(AdminConsoleService);
  private readonly toasts = inject(ToastService);

  protected readonly cards = CARDS;
  protected readonly allowedLine = allowedLine;
  protected readonly settings = section<InventoryImportSettingsResponse>();
  protected readonly health = section<SystemHealth>();
  protected readonly values = signal<ImportLimitValues | null>(null);
  protected readonly tried = signal(false);
  protected readonly saving = signal(false);
  protected readonly cleanUp = JOBS['inventory-import-purge'];

  protected readonly errors = computed(() => {
    const values = this.values();
    const errors: Partial<Record<ImportLimitKey, string>> = {};
    if (values) {
      for (const field of Object.values(IMPORT_LIMIT_FIELDS)) {
        const error = limitError(field, values[field.key]);
        if (error) {
          errors[field.key] = error;
        }
      }
    }
    return errors;
  });
  protected readonly changes = computed(() => {
    const saved = this.settings().data;
    const values = this.values();
    return saved && values ? changesOf(saved, values) : {};
  });
  protected readonly dirty = computed(() => Object.keys(this.changes()).length > 0);
  /** What collectors read with the values typed (board A15's preview). */
  protected readonly preview = computed(() => {
    const values = this.values();
    if (!values) {
      return null;
    }
    const num = (key: ImportLimitKey) => Number(values[key]) || 0;
    return {
      ydk: `Up to ${sizeWords(num('ydkMaxKb'))} and ${num('ydkMaxLines').toLocaleString('en-US')} lines`,
      csv: `Up to ${sizeWords(num('csvMaxKb'))} and ${num('csvMaxRows').toLocaleString('en-US')} rows`,
      ttl: `The preview is kept for ${num('previewTtlMinutes').toLocaleString('en-US')} minutes.`,
    };
  });
  protected readonly job = computed<JobStatus | null>(
    () => this.health().data?.jobs?.find((job) => job.name === 'inventory-import-purge') ?? null,
  );
  protected readonly changed = computed(() => changedLine(this.settings().data));

  constructor() {
    void this.load();
    void this.loadHealth();
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected async load(): Promise<void> {
    const data = await loadInto(
      this.settings,
      this.api.getAdminInventoryImportSettings('body', false, { context: silentErrors() }),
    );
    if (data) {
      this.values.set(valuesOf(data));
      this.tried.set(false);
    }
  }

  protected loadHealth(): Promise<unknown> {
    return loadInto(
      this.health,
      this.consoleApi.getSystemHealth('body', false, { context: silentErrors() }),
    );
  }

  protected set(key: ImportLimitKey, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.values.update((values) => (values ? { ...values, [key]: value } : values));
  }

  protected discard(): void {
    const data = this.settings().data;
    if (data) {
      this.values.set(valuesOf(data));
      this.tried.set(false);
    }
  }

  protected async save(): Promise<void> {
    this.tried.set(true);
    if (Object.keys(this.errors()).length > 0) {
      const first = Object.keys(this.errors())[0];
      document.getElementById(`il-${first}`)?.focus();
      return;
    }
    if (!this.dirty() || this.saving()) {
      return;
    }
    this.saving.set(true);
    const saved = await runConsoleAction(
      this.toasts,
      this.api.updateAdminInventoryImportSettings(
        { updateInventoryImportSettingsRequest: this.changes() },
        'body',
        false,
        { context: silentErrors() },
      ),
      'Import limits saved.',
    );
    this.saving.set(false);
    if (saved) {
      this.settings.set({ data: saved, error: null, loading: false });
      this.values.set(valuesOf(saved));
      this.tried.set(false);
    }
  }
}
