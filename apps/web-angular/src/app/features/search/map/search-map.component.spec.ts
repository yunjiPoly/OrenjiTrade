import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RegionsStore } from '../../../shared/regions/regions.store';
import { BoundaryMapComponent } from '../../map/boundary-map/boundary-map.component';
import { BoundaryAssets } from '../../map/data/boundaries';
import { SearchMapComponent, stateCardSubtitle } from './search-map.component';

const QUEBEC = {
  subdivision: { code: 'CA-QC', name: 'Quebec', wholeCountry: false },
  country: { code: 'CA', name: 'Canada' },
};
const ONTARIO = {
  subdivision: { code: 'CA-ON', name: 'Ontario', wholeCountry: false },
  country: { code: 'CA', name: 'Canada' },
};

/** Below 960 a tap shows the phone's state card first (spec 16, board W29). */
describe('SearchMapComponent: the state card below 960', () => {
  async function render() {
    TestBed.configureTestingModule({
      imports: [SearchMapComponent],
      providers: [
        {
          provide: BoundaryAssets,
          useValue: { load: async () => ({ type: 'FeatureCollection', features: [] }) },
        },
        {
          provide: RegionsStore,
          useValue: {
            subdivision: (code: string) =>
              code === 'CA-QC' ? QUEBEC : code === 'CA-ON' ? ONTARIO : null,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(SearchMapComponent);
    fixture.componentRef.setInput('region', 'americas-north');
    fixture.componentRef.setInput('stateCard', true);
    fixture.componentRef.setInput('home', 'CA-QC');
    fixture.componentRef.setInput('counts', new Map([['CA-ON', 2]]));
    fixture.componentRef.setInput('deckCores', new Map([['CA-ON', 1]]));
    fixture.componentRef.setInput(
      'names',
      new Map([
        ['CA-QC', 'Quebec, Canada'],
        ['CA-ON', 'Ontario, Canada'],
      ]),
    );
    fixture.detectChanges();
    await fixture.whenStable();
    const map = fixture.debugElement.query(By.directive(BoundaryMapComponent))
      .componentInstance as BoundaryMapComponent;
    return { fixture, map, element: fixture.nativeElement as HTMLElement };
  }

  it('names the state over "Canada · your province" for the viewer’s own (WD review R1-5)', async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { fixture, map, element } = await render();
    map.subdivisionSelected.emit('CA-QC');
    fixture.detectChanges();
    await fixture.whenStable();
    const card = element.querySelector<HTMLElement>('.sm__card')!;
    expect(card.querySelector('.sm__card-title')?.textContent?.trim()).toBe('Quebec');
    expect(card.querySelector('.sm__card-sub')?.textContent?.trim()).toBe('Canada · your province');
    // Opened at the map's bottom, it is brought into view above the tab bar.
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
    map.subdivisionSelected.emit('CA-ON');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(card.querySelector('.sm__card-title')?.textContent?.trim()).toBe('Ontario');
    expect(card.querySelector('.sm__card-sub')?.textContent?.trim()).toBe('Canada');
    expect(card.querySelector('.sm__card-line')?.textContent?.trim()).toContain('binder');
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it('says "your province" only for the viewer’s own', () => {
    expect(stateCardSubtitle('Canada', true)).toBe('Canada · your province');
    expect(stateCardSubtitle('Canada', false)).toBe('Canada');
  });
});
