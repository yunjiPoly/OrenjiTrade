import { ComponentFixture, TestBed } from '@angular/core/testing';
import { REGIONS_FIXTURE } from '../../../shared/regions/testing/regions-fixtures';
import { SubdivisionListComponent } from './subdivision-list.component';

describe('SubdivisionListComponent', () => {
  let fixture: ComponentFixture<SubdivisionListComponent>;
  let element: HTMLElement;
  let picked: string[];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SubdivisionListComponent] });
    fixture = TestBed.createComponent(SubdivisionListComponent);
    fixture.componentRef.setInput('region', REGIONS_FIXTURE.regions[0]);
    fixture.componentRef.setInput(
      'counts',
      new Map([
        ['CA-QC', 2],
        ['US-NY', 1],
      ]),
    );
    picked = [];
    fixture.componentInstance.picked.subscribe((code) => picked.push(code));
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  function entries(): string[] {
    return Array.from(
      element.querySelectorAll<HTMLButtonElement>('.sdl__item'),
      (button) =>
        `${button.querySelector('.sdl__item-name')!.textContent!.trim()} ` +
        button.querySelector('.sdl__item-count')!.textContent!.trim(),
    );
  }

  it('lists every state of the region by country with its binder count', () => {
    const headings = Array.from(element.querySelectorAll('h3'), (h) =>
      h.textContent!.replace(/\s+/g, ' ').trim(),
    );
    expect(headings).toEqual(['Canada 2', 'Puerto Rico 0', 'United States 1']);
    expect(entries()).toEqual(['Ontario 0', 'Quebec 2', 'Puerto Rico 0', 'New York 1']);
    const quebec = element.querySelector<HTMLElement>('[data-code="CA-QC"] .sdl__item-count');
    expect(quebec?.getAttribute('aria-label')).toBe('2 public binders');
  });

  it('opens a state from the keyboard-focusable buttons', () => {
    element.querySelector<HTMLButtonElement>('[data-code="US-NY"]')!.click();
    expect(picked).toEqual(['US-NY']);
    fixture.componentRef.setInput('selected', 'US-NY');
    fixture.detectChanges();
    expect(element.querySelector('[data-code="US-NY"]')?.getAttribute('aria-current')).toBe('true');
  });

  it('filters by name (accents ignored, country names match) and by binders', () => {
    const filter = element.querySelector<HTMLInputElement>('[data-testid="subdivision-filter"]')!;
    filter.value = 'quebec';
    filter.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(entries()).toEqual(['Quebec 2']);
    filter.value = 'canada';
    filter.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(entries()).toEqual(['Ontario 0', 'Quebec 2']);
    filter.value = '';
    filter.dispatchEvent(new Event('input'));
    element.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    fixture.detectChanges();
    expect(entries()).toEqual(['Quebec 2', 'New York 1']);
    filter.value = 'zzz';
    filter.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(element.querySelector('[role="status"]')?.textContent).toContain(
      'No state or province matches.',
    );
  });
});
