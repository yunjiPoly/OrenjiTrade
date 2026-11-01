import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideApiClient } from '../../../core/api/provide-api-client';
import {
  KeyboardPrefs,
  SINGLE_KEYS_STORAGE_KEY,
} from '../../../core/keyboard/keyboard-prefs.service';
import { KeyboardShortcuts } from '../../../core/keyboard/keyboard-shortcuts.service';
import {
  AppearanceSettingsComponent,
  SINGLE_KEYS_OFF,
  SINGLE_KEYS_ON,
} from './appearance-settings.component';

describe('Settings › Appearance (decisions 12 and 24)', () => {
  let fixture: ComponentFixture<AppearanceSettingsComponent>;
  let element: HTMLElement;
  let openHelp: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    localStorage.removeItem(SINGLE_KEYS_STORAGE_KEY);
    openHelp = vi.fn();
    await TestBed.configureTestingModule({
      imports: [AppearanceSettingsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClient(),
        { provide: KeyboardShortcuts, useValue: { openHelp } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AppearanceSettingsComponent);
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  afterEach(() => localStorage.removeItem(SINGLE_KEYS_STORAGE_KEY));

  it('follows the system by default', () => {
    const pressed = element.querySelector('.ap__tile--on');
    expect(pressed?.textContent).toContain('Same as the system');
  });

  it('turns the single-key shortcuts off and on, saying what still works', async () => {
    const line = () => element.querySelector('#appearance-keys-line')?.textContent?.trim();
    expect(line()).toBe(SINGLE_KEYS_ON);
    const toggle = element.querySelector<HTMLButtonElement>(
      '[data-testid="single-key-shortcuts"] button[role="switch"]',
    )!;
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    toggle.click();
    await fixture.whenStable();
    expect(TestBed.inject(KeyboardPrefs).singleKeys()).toBe(false);
    expect(localStorage.getItem(SINGLE_KEYS_STORAGE_KEY)).toBe('off');
    expect(line()).toBe(SINGLE_KEYS_OFF);
    expect(element.querySelectorAll('.appearance__chip--off')).toHaveLength(4);
    toggle.click();
    await fixture.whenStable();
    expect(TestBed.inject(KeyboardPrefs).singleKeys()).toBe(true);
  });

  it('opens every shortcut from "See all shortcuts"', () => {
    Array.from(element.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('See all shortcuts'))!
      .click();
    expect(openHelp).toHaveBeenCalled();
  });
});
