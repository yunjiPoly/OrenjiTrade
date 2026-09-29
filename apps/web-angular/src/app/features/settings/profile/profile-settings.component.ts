import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { TagResponse } from '@orenji/api-client';
import { SessionService } from '../../../core/auth/session.service';
import { isApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { GamePickerComponent } from '../../../shared/profile/game-picker/game-picker.component';
import { LanguagePickerComponent } from '../../../shared/profile/language-picker/language-picker.component';
import { MyProfileStore, splitTags } from '../../../shared/profile/my-profile.store';
import { ProfileFieldsComponent } from '../../../shared/profile/profile-fields/profile-fields.component';
import {
  applyProfileServerErrors,
  createProfileForm,
  patchProfileForm,
  profileRequest,
} from '../../../shared/profile/profile-form';
import { TagPickerComponent } from '../../../shared/profile/tag-picker/tag-picker.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/ui/section-card/section-card.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AvatarUploaderComponent } from './avatar-uploader.component';

/** Settings → Profile: avatar, public details, games and languages, tags. */
@Component({
  selector: 'app-profile-settings',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    AvatarUploaderComponent,
    ProfileFieldsComponent,
    GamePickerComponent,
    LanguagePickerComponent,
    TagPickerComponent,
    SectionCardComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  templateUrl: './profile-settings.component.html',
  styleUrl: '../settings-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileSettingsComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly snackBar = inject(MatSnackBar);
  private readonly uploader = viewChild(AvatarUploaderComponent);
  protected readonly store = inject(MyProfileStore);
  protected readonly session = inject(SessionService);

  protected readonly form = createProfileForm(this.fb);
  protected readonly games = signal<string[]>([]);
  protected readonly languages = signal<string[]>([]);
  protected readonly tags = signal<TagResponse[]>([]);
  protected readonly customTags = signal<string[]>([]);
  protected readonly loaded = signal(false);
  protected readonly savingDetails = signal(false);
  protected readonly savingTags = signal(false);
  protected readonly avatarBusy = signal(false);
  protected readonly avatarError = signal<string | null>(null);
  protected readonly detailsError = signal<string | null>(null);
  protected readonly tagsError = signal<string | null>(null);
  protected readonly detailsDirty = signal(false);
  protected readonly tagsDirty = signal(false);

  constructor() {
    void this.load();
    this.form.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.detailsDirty.set(this.form.dirty));
  }

  protected async load(): Promise<void> {
    const profile = await this.store.load();
    if (!profile) {
      return;
    }
    patchProfileForm(this.form, profile);
    this.games.set(profile.games);
    this.languages.set(profile.languages);
    const { curated, custom } = splitTags(profile.tags);
    this.tags.set(curated);
    this.customTags.set(custom);
    this.detailsDirty.set(false);
    this.tagsDirty.set(false);
    this.loaded.set(true);
  }

  protected setGames(games: string[]): void {
    this.games.set(games);
    this.detailsDirty.set(true);
  }

  protected setLanguages(languages: string[]): void {
    this.languages.set(languages);
    this.detailsDirty.set(true);
  }

  protected setTags(tags: TagResponse[]): void {
    this.tags.set(tags);
    this.tagsDirty.set(true);
  }

  protected setCustomTags(labels: string[]): void {
    this.customTags.set(labels);
    this.tagsDirty.set(true);
  }

  protected async saveDetails(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.savingDetails.set(true);
    this.detailsError.set(null);
    try {
      const profile = await this.store.save(
        profileRequest(this.form, this.games(), this.languages()),
      );
      patchProfileForm(this.form, profile);
      this.detailsDirty.set(false);
      this.snackBar.open('Profile saved.', 'OK', { duration: 3000 });
    } catch (error) {
      if (!isApiError(error) || !applyProfileServerErrors(this.form, error)) {
        this.detailsError.set(isApiError(error) ? friendlyMessage(error) : 'Please try again.');
      }
    } finally {
      this.savingDetails.set(false);
    }
  }

  protected async saveTags(): Promise<void> {
    this.savingTags.set(true);
    this.tagsError.set(null);
    try {
      const saved = await this.store.saveTags(this.tags(), this.customTags());
      const { curated, custom } = splitTags(saved);
      this.tags.set(curated);
      this.customTags.set(custom);
      this.tagsDirty.set(false);
      this.snackBar.open('Tags saved.', 'OK', { duration: 3000 });
    } catch (error) {
      this.tagsError.set(isApiError(error) ? friendlyMessage(error) : 'Please try again.');
    } finally {
      this.savingTags.set(false);
    }
  }

  protected async uploadAvatar(file: File): Promise<void> {
    this.avatarBusy.set(true);
    this.avatarError.set(null);
    try {
      await this.store.uploadAvatar(file);
      this.uploader()?.clear();
      this.snackBar.open('Profile picture updated.', 'OK', { duration: 3000 });
    } catch (error) {
      this.avatarError.set(isApiError(error) ? friendlyMessage(error) : 'Please try again.');
    } finally {
      this.avatarBusy.set(false);
    }
  }

  protected async removeAvatar(): Promise<void> {
    this.avatarBusy.set(true);
    this.avatarError.set(null);
    try {
      await this.store.deleteAvatar();
      this.snackBar.open('Profile picture removed.', 'OK', { duration: 3000 });
    } catch (error) {
      this.avatarError.set(isApiError(error) ? friendlyMessage(error) : 'Please try again.');
    } finally {
      this.avatarBusy.set(false);
    }
  }
}
