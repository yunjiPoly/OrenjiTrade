/**
 * Where the keyboard goes on the sign-in steps when a press changes the page without leaving it
 * (WG review A1, A5): a refused submit focuses the first field to fix, whose message is read with
 * it; a panel that replaces the form ("Check your inbox") focuses its heading. Run after the
 * change detection that shows the messages (the next task).
 */
export function focusFirstInvalid(host: HTMLElement): void {
  setTimeout(() => host.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
}

/** Focuses the page's heading (made focusable by script only, `tabindex="-1"`). */
export function focusHeading(host: HTMLElement): void {
  setTimeout(() => {
    const heading = host.querySelector<HTMLElement>('h1');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus();
    }
  });
}
