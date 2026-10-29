import { Directive, inject } from '@angular/core';
import { ShellLayout } from './shell-layout.service';

/**
 * The title of a tab's own page (Search, Inventory, Messages). Below 960 the top bar is the
 * phone's per-tab bar and shows that title in Sora 28 (spec 16, board W29); the page's own title
 * steps back meanwhile: visually hidden, it stays the page's heading for assistive technology, so
 * a page has one h1 at every width.
 */
@Directive({
  selector: '[appShellTabTitle]',
  host: { '[class.visually-hidden]': 'layout.tabTitle() !== null' },
})
export class ShellTabTitleDirective {
  protected readonly layout = inject(ShellLayout);
}
