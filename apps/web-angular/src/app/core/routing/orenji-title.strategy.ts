import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';

export const APP_NAME = 'OrenjiTrade';

/** The robots rule of pages nobody should index (decision 6; the default of index.html). */
export const NO_INDEX = 'noindex, nofollow';
export const INDEX = 'index, follow';

/** True when the navigation's deepest route (or one above it) says `data.seo: 'index'`. */
export function indexable(snapshot: RouterStateSnapshot): boolean {
  let allowed = false;
  for (let route: ActivatedRouteSnapshot | null = snapshot.root; route; route = route.firstChild) {
    if (route.routeConfig?.data?.['seo'] === 'index') {
      allowed = true;
    }
  }
  return allowed;
}

/**
 * Document titles read `<page> · OrenjiTrade`, or just `OrenjiTrade` when a route has no title.
 * It also sets the robots rule (decision 6): no indexing, except the landing and the legal pages
 * (`data.seo: 'index'`); people pages (profiles, binders, holders) always stay `noindex`.
 */
@Injectable({ providedIn: 'root' })
export class OrenjiTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const pageTitle = this.buildTitle(snapshot);
    this.title.setTitle(pageTitle ? `${pageTitle} · ${APP_NAME}` : APP_NAME);
    this.meta.updateTag({ name: 'robots', content: indexable(snapshot) ? INDEX : NO_INDEX });
  }
}
