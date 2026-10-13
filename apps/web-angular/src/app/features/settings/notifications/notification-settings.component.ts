import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import {
  ChannelPreferences,
  LocationService,
  NotificationSettingsResponse,
  SettingsService,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/ui/section-card/section-card.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';

export type Channel = keyof ChannelPreferences;
type MasterKey = 'pushEnabled' | 'emailEnabled' | 'inAppEnabled';

export const CHANNELS: readonly { key: Channel; master: MasterKey; label: string; icon: string }[] =
  [
    { key: 'inApp', master: 'inAppEnabled', label: 'In-app', icon: 'notifications' },
    { key: 'push', master: 'pushEnabled', label: 'Push', icon: 'phone_iphone' },
    { key: 'email', master: 'emailEnabled', label: 'Email', icon: 'mail' },
  ];

/** Categories in display order with human labels (unknown API categories still render). */
export const CATEGORY_LABELS: Record<string, { label: string; help: string }> = {
  MESSAGE: { label: 'Messages', help: 'New private messages.' },
  OFFER: { label: 'Offers', help: 'Offers you receive and their answers.' },
  TRADE: { label: 'Trades', help: 'Progress of your trades.' },
  RATING: { label: 'Ratings', help: 'When someone rates a trade with you.' },
  BINDER_FRESHNESS: { label: 'Binder reminders', help: 'When your listings need a refresh.' },
  REPORT_DECISION: { label: 'Report decisions', help: 'Outcome of reports you filed.' },
  MARKETING: { label: 'News and tips', help: 'Occasional product news.' },
};

function timeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  return intl.supportedValuesOf?.('timeZone') ?? ['America/Toronto', 'UTC'];
}

/**
 * Settings → Notifications: channels, the one wishlist alerts switch (with a hint when no country
 * and state are set, since alerts come from collectors of the region), the category × channel
 * matrix and quiet hours.
 */
@Component({
  selector: 'app-notification-settings',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSlideToggleModule,
    RouterLink,
    SectionCardComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  templateUrl: './notification-settings.component.html',
  styleUrls: ['../settings-section.scss', './notification-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationSettingsComponent {
  private readonly settingsApi = inject(SettingsService);
  private readonly locationApi = inject(LocationService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly channels = CHANNELS;
  protected readonly timeZones = timeZones();
  protected readonly draft = signal<NotificationSettingsResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<ApiError | null>(null);
  protected readonly saving = signal(false);
  protected readonly dirty = signal(false);
  protected readonly saveError = signal<string | null>(null);
  /** No country and state yet: wishlist alerts cannot arrive (ADR 0017), said by the switch. */
  protected readonly noLocation = signal(false);
  protected readonly categories = computed(() => {
    const settings = this.draft();
    if (!settings) {
      return [];
    }
    const order = Object.keys(CATEGORY_LABELS);
    return Object.keys(settings.categories)
      .sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
      .map((key) => ({
        key,
        label: CATEGORY_LABELS[key]?.label ?? key.replace(/_/g, ' ').toLowerCase(),
        help: CATEGORY_LABELS[key]?.help ?? '',
      }));
  });
  protected readonly quietHoursInvalid = computed(() => {
    const quiet = this.draft()?.quietHours;
    return !!quiet?.enabled && (!quiet.start || !quiet.end || quiet.start === quiet.end);
  });

  constructor() {
    void this.load();
    void this.loadLocation();
  }

  /** Optional: only drives the "set your location" hint of wishlist alerts. */
  private async loadLocation(): Promise<void> {
    try {
      const mine = await firstValueFrom(
        this.locationApi.getMyLocation('body', false, { context: silentErrors() }),
      );
      this.noLocation.set(!mine.location);
    } catch {
      // Without an answer, no hint.
    }
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const settings = await firstValueFrom(
        this.settingsApi.getNotificationSettings('body', false, { context: silentErrors() }),
      );
      this.draft.set(settings);
      this.dirty.set(false);
    } catch (error) {
      this.loadError.set(toApiError(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected setMaster(key: MasterKey, value: boolean): void {
    this.patch((settings) => ({ ...settings, [key]: value }));
  }

  protected setWishlistAlerts(value: boolean): void {
    this.patch((settings) => ({ ...settings, wishlistAlerts: value }));
  }

  protected setCategory(category: string, channel: Channel, value: boolean): void {
    this.patch((settings) => ({
      ...settings,
      categories: {
        ...settings.categories,
        [category]: { ...settings.categories[category], [channel]: value },
      },
    }));
  }

  protected setQuiet(
    field: 'enabled' | 'start' | 'end' | 'timezone',
    value: string | boolean,
  ): void {
    this.patch((settings) => ({
      ...settings,
      quietHours: { ...settings.quietHours, [field]: value },
    }));
  }

  protected async save(): Promise<void> {
    const settings = this.draft();
    if (!settings || this.quietHoursInvalid()) {
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const saved = await firstValueFrom(
        this.settingsApi.updateNotificationSettings(
          { notificationSettingsRequest: settings },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      this.draft.set(saved);
      this.dirty.set(false);
      this.snackBar.open('Notification preferences saved.', 'OK', { duration: 3000 });
    } catch (error) {
      this.saveError.set(friendlyMessage(toApiError(error)));
    } finally {
      this.saving.set(false);
    }
  }

  private patch(change: (settings: NotificationSettingsResponse) => NotificationSettingsResponse) {
    const settings = this.draft();
    if (settings) {
      this.draft.set(change(settings));
      this.dirty.set(true);
    }
  }
}
