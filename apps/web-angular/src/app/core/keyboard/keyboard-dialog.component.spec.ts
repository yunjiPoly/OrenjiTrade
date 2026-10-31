import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { KeyboardDialogComponent, keyGroups } from './keyboard-dialog.component';
import { KeyboardPrefs, SINGLE_KEYS_STORAGE_KEY } from './keyboard-prefs.service';

describe('"Keyboard shortcuts" (the "?" dialog, spec 4.9)', () => {
  let fixture: ComponentFixture<KeyboardDialogComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    localStorage.removeItem(SINGLE_KEYS_STORAGE_KEY);
    await TestBed.configureTestingModule({
      imports: [KeyboardDialogComponent],
      providers: [provideRouter([]), { provide: MatDialogRef, useValue: { close: vi.fn() } }],
    }).compileComponents();
    fixture = TestBed.createComponent(KeyboardDialogComponent);
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  afterEach(() => localStorage.removeItem(SINGLE_KEYS_STORAGE_KEY));

  it('lists the shortcuts that work today, with the off switch in its footnote', () => {
    expect(element.querySelector('#keyboard-dialog-title')?.textContent).toBe('Keyboard shortcuts');
    const actions = Array.from(element.querySelectorAll('.kd__action'), (dd) => dd.textContent);
    expect(actions).toContain('Go to Home, Search, Inventory, Messages or Profile');
    expect(actions).toContain('The search in the top bar, from any page');
    expect(actions).toContain('Show these shortcuts');
    // Web WC: the inbox, the composer and the chat drawer.
    expect(actions).toContain('In a chat: or send');
    expect(actions).toContain('Move down and up the chats');
    expect(actions).toContain('Between the page and the chat drawer');
    const foot = element.querySelector('.kd__foot');
    expect(foot?.textContent).toContain('never fire while you type in a field');
    expect(foot?.querySelector('a')?.getAttribute('href')).toBe('/settings/appearance');
  });

  it('strikes the single keys through while they are off', async () => {
    TestBed.inject(KeyboardPrefs).setSingleKeys(false);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(element.querySelector('.kd__off')?.textContent).toContain(
      'Single-key shortcuts are off',
    );
    const single = keyGroups('Ctrl')
      .flatMap((group) => group.rows)
      .filter((row) => row.single);
    expect(element.querySelectorAll('.kd__row--off')).toHaveLength(single.length);
  });

  it('names Ctrl, or ⌘ on a Mac', () => {
    expect(keyGroups('⌘')[0].rows[1].parts[0].text).toBe('⌘');
    expect(keyGroups('Ctrl')[0].rows[1].parts.map((p) => p.text)).toEqual(['Ctrl', 'K']);
  });
});
