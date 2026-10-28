import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { Injectable, Injector, Type, inject } from '@angular/core';
import { Subject, filter } from 'rxjs';
import { ShellLayout } from '../shell-layout.service';

/** The handle a popover's content injects to close itself. */
export class PopoverRef {
  private readonly closedSubject = new Subject<void>();
  readonly closed$ = this.closedSubject.asObservable();
  private done = false;

  constructor(
    private readonly overlayRef: OverlayRef,
    private readonly anchor: HTMLElement,
  ) {}

  /** Closes the popover; focus returns to the pill that opened it (spec 4.5). */
  close(returnFocus = true): void {
    if (this.done) {
      return;
    }
    this.done = true;
    this.overlayRef.dispose();
    if (returnFocus) {
      this.anchor.focus();
    }
    this.closedSubject.next();
    this.closedSubject.complete();
  }
}

export interface PopoverOptions {
  /** Width at 960 px and wider (spec 4.5: 360). */
  width?: number;
  /** Extra class of the panel. */
  panelClass?: string;
  /** Align the panel's end with the anchor's end (the account menu side). */
  alignEnd?: boolean;
}

/**
 * Anchored popovers of the top bar (the region and game pickers, spec 4.5): `surfaceElevated`,
 * radius 16, below their pill at 960 px and wider, a bottom sheet below 960 (spec 16). Esc and a
 * click outside close them, and focus returns to the pill. The content is a component that
 * injects {@link PopoverRef}; its chunk is loaded by the caller when the pill is first used.
 */
@Injectable({ providedIn: 'root' })
export class Popovers {
  private readonly overlay = inject(Overlay);
  private readonly injector = inject(Injector);
  private readonly layout = inject(ShellLayout);

  open<T>(anchor: HTMLElement, component: Type<T>, options: PopoverOptions = {}): PopoverRef {
    const sheet = this.layout.narrow();
    const position = sheet
      ? this.overlay.position().global().bottom('0').left('0').right('0')
      : this.overlay
          .position()
          .flexibleConnectedTo(anchor)
          .withPush(true)
          .withViewportMargin(8)
          .withPositions(
            options.alignEnd
              ? [
                  {
                    originX: 'end',
                    originY: 'bottom',
                    overlayX: 'end',
                    overlayY: 'top',
                    offsetY: 8,
                  },
                  {
                    originX: 'end',
                    originY: 'top',
                    overlayX: 'end',
                    overlayY: 'bottom',
                    offsetY: -8,
                  },
                ]
              : [
                  {
                    originX: 'start',
                    originY: 'bottom',
                    overlayX: 'start',
                    overlayY: 'top',
                    offsetY: 8,
                  },
                  {
                    originX: 'start',
                    originY: 'top',
                    overlayX: 'start',
                    overlayY: 'bottom',
                    offsetY: -8,
                  },
                ],
          );
    const overlayRef = this.overlay.create({
      positionStrategy: position,
      scrollStrategy: sheet
        ? this.overlay.scrollStrategies.block()
        : this.overlay.scrollStrategies.reposition(),
      hasBackdrop: true,
      backdropClass: sheet ? 'cdk-overlay-dark-backdrop' : 'cdk-overlay-transparent-backdrop',
      panelClass: [
        'app-popover',
        sheet ? 'app-popover--sheet' : 'app-popover--anchored',
        ...(options.panelClass ? [options.panelClass] : []),
      ],
      width: sheet ? '100%' : `${options.width ?? 360}px`,
      maxWidth: sheet ? '100%' : 'calc(100vw - 16px)',
    });
    const ref = new PopoverRef(overlayRef, anchor);
    overlayRef.backdropClick().subscribe(() => ref.close());
    overlayRef
      .keydownEvents()
      .pipe(filter((event) => event.key === 'Escape'))
      .subscribe((event) => {
        event.preventDefault();
        ref.close();
      });
    const injector = Injector.create({
      parent: this.injector,
      providers: [{ provide: PopoverRef, useValue: ref }],
    });
    overlayRef.attach(new ComponentPortal(component, null, injector));
    return ref;
  }
}
