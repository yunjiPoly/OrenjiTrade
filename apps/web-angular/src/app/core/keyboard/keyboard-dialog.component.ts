import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { ShellIconComponent } from '../layout/shell-icon/shell-icon.component';
import { KeyboardPrefs } from './keyboard-prefs.service';

/** One key cap, or a joining word ("then", "or"). */
export interface KeyPart {
  text: string;
  word?: boolean;
}

export interface KeyRow {
  parts: KeyPart[];
  action: string;
  /** A single-key shortcut (off when Settings › Appearance turns them off). */
  single?: boolean;
}

export interface KeyGroup {
  title: string;
  rows: KeyRow[];
}

const K = (text: string): KeyPart => ({ text });
const W = (text: string): KeyPart => ({ text, word: true });

/**
 * The shortcuts that work on the web today (spec 4.9, board W3's wording). Inventory's list, table
 * and drawer shortcuts joined in web stage WB; the composer's come with Messages (WC).
 */
export function keyGroups(mod: string): KeyGroup[] {
  return [
    {
      title: 'Anywhere',
      rows: [
        {
          parts: [K('/')],
          action: 'Search this page, or the top bar on pages without a search',
          single: true,
        },
        { parts: [K(mod), K('K')], action: 'The search in the top bar, from any page' },
        {
          parts: [K('g'), W('then'), K('h'), K('s'), K('i'), K('m'), K('p')],
          action: 'Go to Home, Search, Inventory, Messages or Profile',
          single: true,
        },
        {
          parts: [K('n')],
          action: 'Add cards (outside Inventory, it takes you there first)',
          single: true,
        },
        { parts: [K('Shift'), K('N')], action: 'Quick add rows in Inventory', single: true },
        { parts: [K('?')], action: 'Show these shortcuts', single: true },
      ],
    },
    {
      title: 'In lists and menus',
      rows: [
        {
          parts: [K('↑'), K('↓')],
          action: 'Move up and down the search results, a menu or a picker',
        },
        { parts: [K('Enter')], action: 'Open the row you are on' },
        { parts: [K('Esc')], action: 'Close what is on top, or clear the selection' },
      ],
    },
    {
      title: 'Inventory',
      rows: [
        { parts: [K('j'), K('k')], action: 'Move down and up the cards', single: true },
        { parts: [K('Space'), W('or'), K('x')], action: 'Select the card you are on' },
        { parts: [K(mod), K('A')], action: 'Select the loaded cards (the table focused)' },
        {
          parts: [K('Alt'), K('↑'), K('↓')],
          action: 'In Edit card: save, then the previous or next card',
        },
        { parts: [K(mod), K('Enter')], action: 'Save the drawer' },
        {
          parts: [K(mod), K('Z')],
          action: 'Undo the last delete (outside a text field, within 10 minutes)',
        },
      ],
    },
    {
      title: 'Chats',
      rows: [
        { parts: [K('Enter')], action: 'In a chat: send' },
        { parts: [K('Shift'), K('Enter')], action: 'In a chat: new line' },
      ],
    },
  ];
}

/** "Keyboard shortcuts" (the "?" dialog, 520; spec 4.9, decision 24). */
@Component({
  selector: 'app-keyboard-dialog',
  imports: [MatDialogModule, RouterLink, ShellIconComponent],
  template: `
    <div class="kd">
      <header class="kd__head">
        <div>
          <h2 class="kd__title" id="keyboard-dialog-title">Keyboard shortcuts</h2>
          <p class="kd__lead">Every shortcut also has a button or a menu.</p>
        </div>
        <button type="button" class="kd__close" aria-label="Close" mat-dialog-close>
          <app-shell-icon name="close" [size]="20" />
        </button>
      </header>
      @if (!prefs.singleKeys()) {
        <p class="kd__off" role="note">
          Single-key shortcuts are off in this browser. {{ mod() }}+K and the chat keys still work.
        </p>
      }
      <div class="kd__body">
        @for (group of groups(); track group.title) {
          <section class="kd__group" [attr.aria-labelledby]="'kd-' + $index">
            <h3 class="kd__group-title" [id]="'kd-' + $index">{{ group.title }}</h3>
            <dl class="kd__list">
              @for (row of group.rows; track row.action) {
                <div class="kd__row" [class.kd__row--off]="row.single && !prefs.singleKeys()">
                  <dt class="kd__keys">
                    @for (part of row.parts; track $index) {
                      @if (part.word) {
                        <span class="kd__word">{{ part.text }}</span>
                      } @else {
                        <kbd class="kd__key">{{ part.text }}</kbd>
                      }
                    }
                  </dt>
                  <dd class="kd__action">{{ row.action }}</dd>
                </div>
              }
            </dl>
          </section>
        }
        <p class="kd__foot">
          Single-key shortcuts never fire while you type in a field, and you can turn them off in
          <a routerLink="/settings/appearance" mat-dialog-close>Settings › Appearance</a>.
          @if (mod() === 'Ctrl') {
            On a Mac, use ⌘ in place of Ctrl.
          }
        </p>
      </div>
    </div>
  `,
  styles: `
    .kd {
      display: flex;
      flex-direction: column;
      max-height: min(820px, calc(100dvh - 48px));
      color: var(--color-ink);
    }
    .kd__head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--spacing-4);
      padding: var(--spacing-6) var(--spacing-6) var(--spacing-2);
    }
    .kd__title {
      font-family: var(--font-display);
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-semibold);
      line-height: 28px;
    }
    .kd__lead {
      margin: var(--spacing-1) 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .kd__close {
      display: grid;
      place-items: center;
      flex: none;
      width: 40px;
      height: 40px;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--color-ink);
      cursor: pointer;
    }
    .kd__close:hover {
      background: var(--color-surface-variant);
    }
    .kd__off {
      margin: var(--spacing-2) var(--spacing-6) 0;
      padding: var(--spacing-2) var(--spacing-3);
      border-radius: var(--radius-input);
      background: var(--color-surface-variant);
      color: var(--color-text-secondary);
      font-size: var(--font-size-meta);
    }
    .kd__body {
      overflow: auto;
      padding: 0 var(--spacing-6) var(--spacing-6);
    }
    .kd__group {
      margin-top: var(--spacing-5);
    }
    .kd__group-title {
      margin: 0 0 var(--spacing-1);
      color: var(--color-text-muted);
      font-family: var(--font-body);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.6px;
      text-transform: uppercase;
    }
    .kd__list {
      margin: 0;
    }
    .kd__row {
      display: grid;
      grid-template-columns: minmax(0, 220px) minmax(0, 1fr);
      gap: var(--spacing-4);
      align-items: center;
      min-height: 40px;
      padding: var(--spacing-2) 0;
      border-bottom: 1px solid var(--color-border);
    }
    .kd__row:last-child {
      border-bottom: 0;
    }
    .kd__row--off .kd__keys,
    .kd__row--off .kd__action {
      color: var(--color-text-muted);
      text-decoration: line-through;
    }
    .kd__keys {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }
    .kd__key {
      display: inline-grid;
      place-items: center;
      min-width: 24px;
      height: 24px;
      padding: 0 7px;
      border: 1px solid var(--color-border-strong);
      border-bottom-width: 2px;
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      color: var(--color-ink);
      font-family: var(--font-mono);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
    }
    .kd__word {
      color: var(--color-text-muted);
      font-size: var(--font-size-meta);
    }
    .kd__action {
      margin: 0;
      font-size: var(--font-size-sm);
      line-height: 20px;
    }
    .kd__foot {
      margin: var(--spacing-5) 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-meta);
      line-height: 18px;
    }
    @media (max-width: 599px) {
      .kd__row {
        grid-template-columns: minmax(0, 1fr);
        gap: var(--spacing-1);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyboardDialogComponent {
  protected readonly prefs = inject(KeyboardPrefs);
  private readonly document = inject(DOCUMENT);
  /** ⌘ on Apple platforms, Ctrl elsewhere. */
  protected readonly mod = computed(() =>
    /Mac|iPhone|iPad/.test(this.document.defaultView?.navigator.platform ?? '') ? '⌘' : 'Ctrl',
  );
  protected readonly groups = computed(() => keyGroups(this.mod()));
}
