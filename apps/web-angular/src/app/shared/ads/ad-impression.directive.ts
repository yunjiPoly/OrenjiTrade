import { DestroyRef, Directive, ElementRef, afterNextRender, inject, output } from '@angular/core';

/** Share of the ad that must be on screen to count as seen (IAB display guideline). */
const VISIBLE_RATIO = 0.5;

/**
 * Emits `adSeen` once, the first time at least half of the host is visible in the viewport
 * (IntersectionObserver). Without IntersectionObserver (old browsers, tests) it emits right after
 * the first render. Nothing is emitted once the host is destroyed (an observer notification
 * already queued when the ad leaves the page is dropped).
 */
@Directive({ selector: '[appAdImpression]' })
export class AdImpressionDirective {
  readonly adSeen = output<void>();

  private destroyed = false;
  private observer: IntersectionObserver | null = null;

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.observer?.disconnect();
      this.observer = null;
    });
    afterNextRender(() => {
      if (this.destroyed) {
        return;
      }
      if (typeof IntersectionObserver === 'undefined') {
        this.adSeen.emit();
        return;
      }
      this.observer = new IntersectionObserver(
        (entries) => {
          const visible = entries.some(
            (entry) => entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO,
          );
          if (visible && !this.destroyed) {
            this.observer?.disconnect();
            this.observer = null;
            this.adSeen.emit();
          }
        },
        { threshold: [VISIBLE_RATIO] },
      );
      this.observer.observe(host.nativeElement);
    });
  }
}
