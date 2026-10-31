import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, Injector, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { areaOfKey } from '../layout/nav-links';
import { ShellLayout } from '../layout/shell-layout.service';
import { KeyboardPrefs } from './keyboard-prefs.service';

/** Id of the top bar's search field (Ctrl/Cmd+K, and "/" on pages without their own search). */
export const GLOBAL_SEARCH_ID = 'global-search-input';
/** Marks a page's own search field: "/" focuses it (Inventory, Messages, Search; spec 4.9). */
export const PAGE_SEARCH_ATTR = 'data-page-search';
/** How long "g" waits for its letter. */
export const G_TIMEOUT_MS = 1500;

/** True when the key goes to a field: inputs, text areas, selects, editable content, comboboxes. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  // isContentEditable, and the attribute for engines without it (inherited from an ancestor).
  const editableHost = target.closest('[contenteditable]');
  if (
    target.isContentEditable ||
    (editableHost && editableHost.getAttribute('contenteditable') !== 'false')
  ) {
    return true;
  }
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(
      type,
    );
  }
  const role = target.getAttribute('role');
  return role === 'textbox' || role === 'combobox' || role === 'searchbox';
}

/**
 * The app's keyboard shortcuts (spec 4.9, decision 24): `/` focuses the page's own search, or the
 * top bar's; Ctrl/Cmd+K always the top bar's (on Search, the pane's field); `g` then h, s, i, m or
 * p goes to an area; `n` opens Add cards in Inventory, Shift+N its quick add rows; `?` shows the
 * shortcuts. Single-key
 * shortcuts never fire inside a field, nor while a dialog or a menu is open, nor on the bare pages
 * of the sign-in steps and the welcome (but "?"), and Settings › Appearance turns them off.
 */
@Injectable({ providedIn: 'root' })
export class KeyboardShortcuts {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly layout = inject(ShellLayout);
  private readonly prefs = inject(KeyboardPrefs);

  private pendingG: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private readonly helpOpenState = signal(false);
  /** The "?" dialog is open (the rail's "?" button shows it pressed). */
  readonly helpOpen = this.helpOpenState.asReadonly();

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    const listener = (event: KeyboardEvent) => this.onKeydown(event);
    this.document.addEventListener('keydown', listener);
    this.injector.get(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('keydown', listener);
      this.clearG();
    });
  }

  /** Handles one key press; returns true when it was a shortcut. */
  onKeydown(event: KeyboardEvent): boolean {
    if (event.defaultPrevented || event.isComposing) {
      return false;
    }
    const mod = event.ctrlKey || event.metaKey;
    if (mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.focusSearch(true);
      return true;
    }
    if (mod || event.altKey || !this.prefs.singleKeys()) {
      return false;
    }
    // The sign-in steps and the welcome (bare pages: no rail, no "?" button) keep their keys: a
    // letter never leaves a form half filled (WG review A4). "?" still lists the shortcuts.
    if (this.layout.bare() && event.key !== '?') {
      this.clearG();
      return false;
    }
    if (isEditableTarget(event.target) || this.overlayOpen()) {
      this.clearG();
      return false;
    }
    if (this.pendingG) {
      this.clearG();
      const link = areaOfKey(event.key);
      if (link) {
        event.preventDefault();
        void this.router.navigateByUrl(link.path);
        return true;
      }
      return false;
    }
    switch (event.key) {
      case '/':
        event.preventDefault();
        this.focusSearch(false);
        return true;
      case '?':
        event.preventDefault();
        void this.openHelp();
        return true;
      case 'g':
        this.pendingG = setTimeout(() => this.clearG(), G_TIMEOUT_MS);
        return true;
      case 'n':
        event.preventDefault();
        void this.router.navigate(['/inventory'], { queryParams: { add: 'new' } });
        return true;
      case 'N':
        // Shift+N: quick add rows (spec 4.9 and 9.10), in Inventory's Cards tab.
        event.preventDefault();
        void this.router.navigate(['/inventory'], {
          queryParams: { quick: '1', tab: null },
          queryParamsHandling: this.onInventory() ? 'merge' : '',
        });
        return true;
      default:
        return false;
    }
  }

  /**
   * `/` (global = false): the page's own search when it has one, otherwise the top bar's.
   * Ctrl/Cmd+K (global = true): the top bar's, or the page's on Search, which hides the top bar's.
   * With neither on screen (below 960), Search opens with its field focused.
   */
  focusSearch(global: boolean, openSearch = true): void {
    const pageField = this.document.querySelector<HTMLElement>(
      `main [${PAGE_SEARCH_ATTR}] input, main input[${PAGE_SEARCH_ATTR}]`,
    );
    const globalField = this.document.getElementById(GLOBAL_SEARCH_ID);
    const target =
      global && !this.layout.hideGlobalSearch()
        ? (globalField ?? pageField)
        : (pageField ?? globalField);
    if (!target) {
      // Below 960 the top bar has no field (the tab bar has Search): open Search and its field.
      // Already on Search (a tab without a field, Wishlist), stay: never lose the tab or region.
      if (openSearch && !this.onSearch()) {
        void this.router
          .navigateByUrl('/search')
          .then(() => setTimeout(() => this.focusSearch(false, false), 300));
      }
      return;
    }
    target.focus();
    if (target instanceof HTMLInputElement) {
      target.select();
    }
  }

  /** Opens "Keyboard shortcuts" (a lazy chunk: the dialog and its table). */
  async openHelp(): Promise<void> {
    if (this.helpOpenState()) {
      return;
    }
    this.helpOpenState.set(true);
    try {
      const [{ MatDialog }, { KeyboardDialogComponent }] = await Promise.all([
        import('@angular/material/dialog'),
        import('./keyboard-dialog.component'),
      ]);
      const ref = this.injector.get(MatDialog).open(KeyboardDialogComponent, {
        panelClass: 'app-dialog--form',
        autoFocus: 'dialog',
        ariaLabelledBy: 'keyboard-dialog-title',
      });
      ref.afterClosed().subscribe(() => this.helpOpenState.set(false));
    } catch {
      this.helpOpenState.set(false);
    }
  }

  private onInventory(): boolean {
    return this.router.url.split(/[?#]/)[0] === '/inventory';
  }

  private onSearch(): boolean {
    const path = this.router.url.split(/[?#]/)[0];
    return path === '/search' || path.startsWith('/search/');
  }

  /**
   * A dialog, a menu or a list lies on top, or an in-page drawer is open (`data-shortcuts-off`,
   * Inventory's drawers, WB review A6): single keys then belong to it.
   */
  private overlayOpen(): boolean {
    return !!this.document.querySelector(
      '.cdk-overlay-container [role="dialog"], .cdk-overlay-container .mat-mdc-menu-panel, .cdk-overlay-container [role="listbox"], [data-shortcuts-off]',
    );
  }

  private clearG(): void {
    if (this.pendingG) {
      clearTimeout(this.pendingG);
      this.pendingG = null;
    }
  }
}
