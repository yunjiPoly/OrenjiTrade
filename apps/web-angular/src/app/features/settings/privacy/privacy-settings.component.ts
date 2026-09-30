import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { PrivacySettings } from '@orenji/api-client';
import { isApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { MyLocationStore } from '../../../shared/location/my-location.store';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/ui/section-card/section-card.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import {
  MESSAGING_OPTIONS,
  PRIVACY_TOGGLES,
  PROFILE_VISIBILITY_OPTIONS,
  PrivacyToggleKey,
} from './privacy-options';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Settings → Privacy. Every change is saved immediately (the endpoint replaces the whole
 * document, so saves are queued in order and a failure restores the last saved state).
 */
@Component({
  selector: 'app-privacy-settings',
  imports: [
    RouterLink,
    MatIconModule,
    MatRadioModule,
    MatSlideToggleModule,
    SectionCardComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  templateUrl: './privacy-settings.component.html',
  styleUrls: ['../settings-section.scss', './privacy-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacySettingsComponent {
  private readonly snackBar = inject(MatSnackBar);
  protected readonly store = inject(MyLocationStore);

  protected readonly toggles = PRIVACY_TOGGLES;
  protected readonly visibilityOptions = PROFILE_VISIBILITY_OPTIONS;
  protected readonly messagingOptions = MESSAGING_OPTIONS;
  protected readonly draft = signal<PrivacySettings | null>(null);
  protected readonly loaded = signal(false);
  protected readonly saveState = signal<SaveState>('idle');
  protected readonly publicLabel = computed(
    () => this.store.location()?.tradingArea?.label ?? null,
  );
  protected readonly hasArea = computed(() => !!this.store.location()?.tradingArea);

  private lastSaved: PrivacySettings | null = null;
  private queue: Promise<void> = Promise.resolve();
  private sequence = 0;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    if (await this.store.load()) {
      this.lastSaved = this.store.privacy();
      this.draft.set(this.lastSaved);
      this.loaded.set(true);
    }
  }

  protected toggle(key: PrivacyToggleKey, value: boolean): void {
    this.update({ [key]: value });
  }

  protected setVisibility(value: PrivacySettings['profileVisibility']): void {
    this.update({ profileVisibility: value });
  }

  protected setMessaging(value: PrivacySettings['messagingPermission']): void {
    this.update({ messagingPermission: value });
  }

  private update(patch: Partial<PrivacySettings>): void {
    const current = this.draft();
    if (!current) {
      return;
    }
    const next = { ...current, ...patch };
    this.draft.set(next);
    this.saveState.set('saving');
    const sequence = ++this.sequence;
    this.queue = this.queue.then(async () => {
      try {
        const saved = await this.store.savePrivacy(next);
        this.lastSaved = saved;
        if (sequence === this.sequence) {
          this.draft.set(saved);
          this.saveState.set('saved');
        }
      } catch (error) {
        if (sequence === this.sequence) {
          this.draft.set(this.lastSaved);
          this.saveState.set('error');
        }
        this.snackBar.open(
          isApiError(error) ? friendlyMessage(error) : 'Your change could not be saved.',
          'OK',
          { duration: 5000 },
        );
      }
    });
  }
}
