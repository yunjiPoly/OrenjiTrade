import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { SHELL_AREAS } from './nav-links';

/**
 * The five areas of the rail and the tab bar, in the phone's order (spec 4.6), and the staff's
 * Admin console (the rail's item at the bottom).
 */
export type ShellArea = 'home' | 'search' | 'inventory' | 'messages' | 'profile' | 'admin';

/** Which top-bar pills a page shows (spec 4.2, the phone's pill scope). */
export type PillScope = 'both' | 'region' | 'none';

/**
 * Workspace pages fill the content area edge to edge and have no footer (Search, Inventory,
 * Import, Messages; Home, which puts its links in its rail); reading pages centre in it and end
 * with the footer (spec 4.1 and 4.10).
 */
export type PageLayout = 'workspace' | 'reading';

/** `data.shell` of a route (merged from the root to the deepest route of a navigation). */
export interface ShellRouteData {
  area?: ShellArea | null;
  pills?: PillScope;
  layout?: PageLayout;
  /** The page has its own search field: "/" focuses it, and the top bar hides its own on Search. */
  pageSearch?: boolean;
  /** The top bar's global search is hidden (Search, whose pane has its own field). */
  hideGlobalSearch?: boolean;
  /**
   * The page is a tab's own page (Home, Search, Inventory, Messages, Profile): below 960 the top
   * bar is that tab's bar of the phone (spec 16, board W29), its title and no wordmark.
   */
  tabBar?: boolean;
  /**
   * A page of its own, without the top bar, the rail, the tab bar or the footer: sign-in, create
   * account and the other account steps, the welcome (spec 14, board W27: "a split page without
   * the rail").
   */
  bare?: boolean;
  /**
   * The admin console (spec 15.1, web stage WH1): its own top bar (the wordmark and "Admin
   * console", the staff search, the role pill, "Back to OrenjiTrade", the avatar) and its grouped
   * nav. The app's top bar, rail, tab bar, footer and session banner step aside; the console's
   * shell draws the banner, the nav and `main#main-content`.
   */
  console?: boolean;
}

export const SHELL_DEFAULTS: Required<ShellRouteData> = {
  area: null,
  pills: 'none',
  layout: 'reading',
  pageSearch: false,
  hideGlobalSearch: false,
  tabBar: false,
  bare: false,
  console: false,
};

/** The shell data of a navigation: every route's `data.shell` from the root down, merged. */
export function shellDataOf(snapshot: ActivatedRouteSnapshot | null): Required<ShellRouteData> {
  let merged: Required<ShellRouteData> = { ...SHELL_DEFAULTS };
  for (let route = snapshot; route; route = route.firstChild) {
    const own = route.routeConfig?.data?.['shell'] as ShellRouteData | undefined;
    if (own) {
      merged = { ...merged, ...own };
    }
  }
  return merged;
}

/** The gap between a bulk dock and the toasts above it. */
export const DOCK_TOAST_GAP = 12;

/**
 * The toasts' lift above the window's bottom edge for a dock whose top is at `dockTop` (window
 * coordinates): its distance to the bottom plus the gap; 0 when the dock is out of view below.
 */
export function dockLiftOf(viewportHeight: number, dockTop: number): number {
  const above = viewportHeight - dockTop;
  return above > 0 ? Math.round(above + DOCK_TOAST_GAP) : 0;
}

/** Below this width the browser shows the phone's design (spec 3 and 16). */
export const NARROW_QUERY = '(max-width: 959.98px)';
/** md, 960 to 1279: compact pills, a 320 search field, overlaying drawers (spec 3). */
export const MEDIUM_QUERY = '(min-width: 960px) and (max-width: 1279.98px)';

/**
 * What the shell needs to know about the current page and the window: the area of the rail, the
 * pills in scope, the page layout, whether the page has its own search, the breakpoint, and the
 * "Skip the map" target a page with the map registers.
 */
@Injectable({ providedIn: 'root' })
export class ShellLayout {
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  private readonly dataState = signal<Required<ShellRouteData>>({ ...SHELL_DEFAULTS });
  private readonly narrowState = signal(false);
  private readonly mediumState = signal(false);
  private readonly skipMapState = signal<string | null>(null);
  private readonly chatOpenState = signal(false);
  private readonly dockLiftState = signal(0);

  readonly data = this.dataState.asReadonly();
  readonly area = computed(() => this.dataState().area);
  readonly pills = computed(() => this.dataState().pills);
  readonly layout = computed(() => this.dataState().layout);
  readonly pageSearch = computed(() => this.dataState().pageSearch);
  readonly hideGlobalSearch = computed(() => this.dataState().hideGlobalSearch);
  readonly narrow = this.narrowState.asReadonly();
  /** The page stands alone: no top bar, rail, tab bar or footer (the account steps). */
  readonly bare = computed(() => this.dataState().bare);
  /** The admin console draws its own frame (spec 15.1). */
  readonly console = computed(() => this.dataState().console);
  /** Below 960 on a tab's own page: the top bar is the phone's per-tab bar (spec 16). */
  readonly tabBar = computed(
    () => this.narrowState() && this.dataState().tabBar && !this.dataState().bare,
  );
  /**
   * The title of that per-tab bar ("Search", "Inventory", "Messages", "Profile"; Home shows its
   * pills instead), `null` while there is none. The page's own title steps back meanwhile
   * (`ShellTabTitleDirective`).
   */
  readonly tabTitle = computed(() => {
    const area = this.dataState().area;
    if (!this.tabBar() || area === 'home') {
      return null;
    }
    return SHELL_AREAS.find((link) => link.area === area)?.label ?? null;
  });
  readonly medium = this.mediumState.asReadonly();
  /** Id of the element "Skip the map" jumps to, while a page shows the map. */
  readonly skipMapTarget = this.skipMapState.asReadonly();
  /**
   * A chat is open below 960 (`/messages/:id`): as on the phone, where a chat opens above the
   * tabs, the shell shows neither the per-tab top bar nor the tab bar, and the chat's own header
   * (Back, the handle, Deal, "⋯") leads. The chat, its deal sheet and a 200 percent zoom keep the
   * whole height (WC review U2, A4, A5).
   */
  readonly inChat = computed(() => this.narrowState() && this.chatOpenState());

  constructor() {
    const destroyRef = inject(DestroyRef);
    const subscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.dataState.set(shellDataOf(this.router.routerState.snapshot.root)));
    destroyRef.onDestroy(() => subscription.unsubscribe());

    const view = this.document.defaultView;
    if (view && typeof view.matchMedia === 'function') {
      for (const [query, state] of [
        [NARROW_QUERY, this.narrowState],
        [MEDIUM_QUERY, this.mediumState],
      ] as const) {
        const list = view.matchMedia(query);
        state.set(list.matches);
        const listener = (event: MediaQueryListEvent) => state.set(event.matches);
        list.addEventListener('change', listener);
        destroyRef.onDestroy(() => list.removeEventListener('change', listener));
      }
    }
  }

  /**
   * What the top bar's placeholder field held before the global search's chunk replaced it (a
   * Ctrl/Cmd+K or a first letter right after the page loaded): the component takes it over.
   */
  readonly searchHandoff = { focused: false, text: '' };

  /** The Messages page shows a chat (`true`) or the inbox (`false`; also when it leaves). */
  setChatOpen(open: boolean): void {
    this.chatOpenState.set(open);
  }

  /**
   * How far above the window's bottom edge the toasts keep clear of a bulk dock at the bottom of a
   * list pane (Search › Wishlist): from the dock's top as measured, plus a 12 px gap; 0 without a
   * dock. The dock grows with its error line and moves with the list, so it is measured, not
   * assumed (WD review U15 and R1-3).
   */
  readonly dockLift = this.dockLiftState.asReadonly();
  readonly dockOpen = computed(() => this.dockLiftState() > 0);
  private dockElement: HTMLElement | null = null;
  private dockObserver: ResizeObserver | null = null;
  private dockFrame = 0;
  private readonly onDockMove = () => {
    const view = this.document.defaultView;
    if (!view || this.dockFrame) {
      return;
    }
    this.dockFrame = view.requestAnimationFrame(() => {
      this.dockFrame = 0;
      this.measureDock();
    });
  };

  /**
   * A list pane's bulk dock while it shows (`null` when it goes): its top is measured now, when it
   * changes size (an error line), on a scroll of any pane or the page and on a resize; the pane
   * calls `measureDock()` after it rendered (the list above it changed).
   */
  trackDock(element: HTMLElement | null): void {
    if (element === this.dockElement) {
      this.measureDock();
      return;
    }
    const view = this.document.defaultView;
    if (this.dockElement) {
      this.dockObserver?.disconnect();
      this.dockObserver = null;
      view?.removeEventListener('scroll', this.onDockMove, true);
      view?.removeEventListener('resize', this.onDockMove);
    }
    this.dockElement = element;
    if (element && view) {
      if (typeof view.ResizeObserver === 'function') {
        this.dockObserver = new view.ResizeObserver(this.onDockMove);
        this.dockObserver.observe(element);
      }
      view.addEventListener('scroll', this.onDockMove, true);
      view.addEventListener('resize', this.onDockMove);
    }
    this.measureDock();
  }

  /** Measures the tracked dock again (after its pane rendered). */
  measureDock(): void {
    const view = this.document.defaultView;
    const element = this.dockElement;
    this.dockLiftState.set(
      element && view ? dockLiftOf(view.innerHeight, element.getBoundingClientRect().top) : 0,
    );
  }

  /** A page that shows the map registers the element after it; `null` when it leaves. */
  setSkipMapTarget(id: string | null): void {
    this.skipMapState.set(id);
  }
}
