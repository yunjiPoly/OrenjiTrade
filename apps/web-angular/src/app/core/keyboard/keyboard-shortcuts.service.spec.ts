import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SINGLE_KEYS_STORAGE_KEY, KeyboardPrefs } from './keyboard-prefs.service';
import {
  G_TIMEOUT_MS,
  GLOBAL_SEARCH_ID,
  KeyboardShortcuts,
  PAGE_SEARCH_ATTR,
  isEditableTarget,
} from './keyboard-shortcuts.service';

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe('KeyboardShortcuts (spec 4.9, decision 24)', () => {
  let shortcuts: KeyboardShortcuts;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;
  let navigate: ReturnType<typeof vi.spyOn>;
  let openHelp: ReturnType<typeof vi.spyOn>;
  let fixtureRoot: HTMLElement;

  beforeEach(() => {
    localStorage.removeItem(SINGLE_KEYS_STORAGE_KEY);
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const router = TestBed.inject(Router);
    navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    shortcuts = TestBed.inject(KeyboardShortcuts);
    openHelp = vi.spyOn(shortcuts, 'openHelp').mockResolvedValue(undefined);
    shortcuts.start();
    fixtureRoot = document.createElement('div');
    fixtureRoot.innerHTML = `
      <input id="${GLOBAL_SEARCH_ID}" />
      <main><input class="page" ${PAGE_SEARCH_ATTR} /><textarea></textarea><button>b</button></main>`;
    document.body.appendChild(fixtureRoot);
  });

  afterEach(() => {
    fixtureRoot.remove();
    localStorage.removeItem(SINGLE_KEYS_STORAGE_KEY);
    vi.useRealTimers();
  });

  it('knows which targets are fields', () => {
    const input = document.createElement('input');
    const checkbox = Object.assign(document.createElement('input'), { type: 'checkbox' });
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const combobox = document.createElement('div');
    combobox.setAttribute('role', 'combobox');
    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
    expect(isEditableTarget(document.createElement('select'))).toBe(true);
    expect(isEditableTarget(combobox)).toBe(true);
    expect(isEditableTarget(editable)).toBe(true);
    const inside = editable.appendChild(document.createElement('span'));
    expect(isEditableTarget(inside)).toBe(true);
    const off = document.createElement('div');
    off.setAttribute('contenteditable', 'false');
    expect(isEditableTarget(off)).toBe(false);
    expect(isEditableTarget(checkbox)).toBe(false);
    expect(isEditableTarget(document.createElement('button'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });

  it('"/" focuses the page’s own search, else the top bar’s', () => {
    const event = press('/');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(fixtureRoot.querySelector('input.page'));
    fixtureRoot.querySelector('input.page')!.remove();
    (document.activeElement as HTMLElement).blur();
    press('/');
    expect(document.activeElement?.id).toBe(GLOBAL_SEARCH_ID);
  });

  it('Ctrl/Cmd+K always focuses the top bar’s search, even from a field', () => {
    const textarea = fixtureRoot.querySelector('textarea')!;
    textarea.focus();
    press('k', { ctrlKey: true }, textarea);
    expect(document.activeElement?.id).toBe(GLOBAL_SEARCH_ID);
    (document.activeElement as HTMLElement).blur();
    press('K', { metaKey: true });
    expect(document.activeElement?.id).toBe(GLOBAL_SEARCH_ID);
  });

  it('opens Search when no field is on screen (below 960 the top bar has none)', () => {
    fixtureRoot.innerHTML = '<main><button>b</button></main>';
    press('k', { ctrlKey: true });
    expect(navigateByUrl).toHaveBeenCalledWith('/search');
  });

  it('stays on Search when its tab has no field: the tab, region and state are kept', () => {
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue('/search?tab=wishlist');
    fixtureRoot.innerHTML = '<main><button>b</button></main>';
    press('/');
    press('k', { ctrlKey: true });
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('on Search › Binders, "/" and Ctrl/Cmd+K focus the map pane’s own field', () => {
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue(
      '/search?tab=binders&region=europe&state=FR-IDF',
    );
    fixtureRoot.innerHTML = `<main><div ${PAGE_SEARCH_ATTR}><input class="map" /></div></main>`;
    press('/');
    expect(document.activeElement).toBe(fixtureRoot.querySelector('input.map'));
    (document.activeElement as HTMLElement).blur();
    press('k', { metaKey: true });
    expect(document.activeElement).toBe(fixtureRoot.querySelector('input.map'));
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('"g" then a letter goes to an area, within 1.5 s only', () => {
    vi.useFakeTimers();
    press('g');
    press('i');
    expect(navigateByUrl).toHaveBeenCalledWith('/inventory');
    press('g');
    press('p');
    expect(navigateByUrl).toHaveBeenLastCalledWith('/profile');
    navigateByUrl.mockClear();
    press('g');
    vi.advanceTimersByTime(G_TIMEOUT_MS + 1);
    press('h');
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('"n" opens Add cards in Inventory and "?" the shortcuts', () => {
    press('n');
    expect(navigate).toHaveBeenCalledWith(['/inventory'], { queryParams: { add: 'new' } });
    press('?', { shiftKey: true });
    expect(openHelp).toHaveBeenCalled();
  });

  it('never fires a single key inside a field, nor while a dialog or menu is open', () => {
    const textarea = fixtureRoot.querySelector('textarea')!;
    textarea.focus();
    expect(press('/', {}, textarea).defaultPrevented).toBe(false);
    press('n', {}, textarea);
    expect(navigate).not.toHaveBeenCalled();
    textarea.blur();
    const overlay = document.createElement('div');
    overlay.className = 'cdk-overlay-container';
    overlay.innerHTML = '<div role="dialog"></div>';
    document.body.appendChild(overlay);
    press('n');
    expect(navigate).not.toHaveBeenCalled();
    overlay.remove();
  });

  it('turns single keys off from Settings › Appearance, keeping Ctrl/Cmd+K', () => {
    TestBed.inject(KeyboardPrefs).setSingleKeys(false);
    expect(localStorage.getItem(SINGLE_KEYS_STORAGE_KEY)).toBe('off');
    press('n');
    press('?');
    press('g');
    press('i');
    expect(navigate).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(openHelp).not.toHaveBeenCalled();
    press('k', { ctrlKey: true });
    expect(document.activeElement?.id).toBe(GLOBAL_SEARCH_ID);
    TestBed.inject(KeyboardPrefs).setSingleKeys(true);
    expect(localStorage.getItem(SINGLE_KEYS_STORAGE_KEY)).toBeNull();
  });
});
