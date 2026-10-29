import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MapService, PublicBindersService } from '@orenji/api-client';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { SessionService } from '../../../core/auth/session.service';
import { BinderListStore } from '../data/binder-list.store';
import { BindersPaneComponent } from './binders-pane.component';

const BINDERS = [
  {
    id: 'b1',
    name: 'Hand traps',
    itemCount: 36,
    sellsAsCore: false,
    owner: {
      id: 'o1',
      handle: 'duelist.jp',
      place: { subdivisionCode: 'CA-QC', subdivisionName: 'Quebec' },
    },
  },
  {
    id: 'b2',
    name: 'Yubel core',
    itemCount: 20,
    sellsAsCore: true,
    askingPriceText: '$95',
    owner: {
      id: 'o2',
      handle: 'maya_k',
      place: { subdivisionCode: 'CA-ON', subdivisionName: 'Ontario' },
    },
  },
];

/** Decision 14: hovering, focusing or listing never spends a binder view; only an open does. */
describe('BindersPaneComponent (spec 6.3)', () => {
  let fixture: ComponentFixture<BindersPaneComponent>;
  let element: HTMLElement;
  let getPublicBinder: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    getPublicBinder = vi.fn(() => of({}));
    TestBed.configureTestingModule({
      imports: [BindersPaneComponent],
      providers: [
        BinderListStore,
        {
          provide: MapService,
          useValue: {
            listSubdivisionBinders: () => of({ items: BINDERS, hasMore: false }),
            listRegionBinders: () => of({ items: BINDERS, hasMore: false }),
          },
        },
        { provide: PublicBindersService, useValue: { getPublicBinder } },
        { provide: AuthService, useValue: { isAuthenticated: signal(true) } },
        { provide: SessionService, useValue: { me: signal({ id: 'o1' }) } },
      ],
    });
    fixture = TestBed.createComponent(BindersPaneComponent);
    fixture.componentRef.setInput('regionCode', 'americas-north');
    fixture.componentRef.setInput('game', 'yugioh');
    fixture.componentRef.setInput('gameName', 'Yu-Gi-Oh!');
    fixture.componentRef.setInput('state', 'CA-QC');
    fixture.componentRef.setInput('stateName', 'Quebec');
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it("lists rows without a count, marks one's own, and the chip says what it shows", () => {
    const rows = [...element.querySelectorAll<HTMLElement>('[data-testid="binder-row"]')];
    expect(rows.map((row) => row.querySelector('.br__line')?.textContent)).toEqual([
      'duelist.jp · Quebec · 36 cards',
      'maya_k · Ontario',
    ]);
    expect(rows[0].textContent).toContain('Yours');
    expect(rows[1].textContent).toContain('$95');
    expect(element.querySelector('[data-testid="state-chip"]')?.getAttribute('aria-label')).toBe(
      'Showing Quebec. Show the whole region',
    );
  });

  it('outlines the province on hover and focus and fetches nothing; a click opens', () => {
    const highlights: (string | null)[] = [];
    const opened: string[] = [];
    fixture.componentInstance.highlight.subscribe((code) => highlights.push(code));
    fixture.componentInstance.opened.subscribe((event) => opened.push(event.binder.id));
    const rows = [...element.querySelectorAll<HTMLElement>('[data-testid="binder-row"]')];
    rows[0].dispatchEvent(new MouseEvent('mouseenter'));
    rows[1].dispatchEvent(new FocusEvent('focus'));
    rows[1].dispatchEvent(new MouseEvent('mouseleave'));
    expect(highlights).toEqual(['CA-QC', 'CA-ON', null]);
    expect(getPublicBinder).not.toHaveBeenCalled();
    rows[1].click();
    expect(opened).toEqual(['b2']);
    // Opening is the page's (the drill-in or the full page): the pane itself still read nothing.
    expect(getPublicBinder).not.toHaveBeenCalled();
  });

  it('shows "Browse by state or province" without a state and a text', async () => {
    fixture.componentRef.setInput('state', null);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.textContent).toContain('Browse by state or province');
    expect(element.textContent).toContain('Whole region');
    expect(element.querySelector('[data-testid="binder-row"]')).toBeNull();
    expect(element.textContent).toContain('Pick on the map');
  });
});
