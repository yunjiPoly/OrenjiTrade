import { ComponentFixture, TestBed } from '@angular/core/testing';
import { item } from '../testing/fixtures';
import { readAskingPrice } from '../data/item-price';
import { PriceEditorComponent, savedPriceText } from './price-editor.component';

describe('the inline price (spec 9.4)', () => {
  let fixture: ComponentFixture<PriceEditorComponent>;
  let saved: (string | null)[];
  let dismissed: number;

  async function open(askingPriceText: string | null): Promise<HTMLInputElement> {
    fixture = TestBed.createComponent(PriceEditorComponent);
    fixture.componentRef.setInput('item', item('a', { askingPriceText }));
    saved = [];
    dismissed = 0;
    fixture.componentInstance.save.subscribe((text) => saved.push(text));
    fixture.componentInstance.dismiss.subscribe(() => dismissed++);
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input')!;
  }

  function enter(input: HTMLInputElement): void {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }

  it('Enter with nothing typed keeps a phone-made price as it was typed (F6)', async () => {
    const input = await open('12.5 $');
    enter(input);
    expect(saved).toEqual([]);
    expect(dismissed).toBe(1);
  });

  it('saves a changed price, and clears one emptied', async () => {
    let input = await open('12.5 $');
    input.value = '13';
    input.dispatchEvent(new Event('input'));
    enter(input);
    expect(saved).toEqual(['$13.00']);

    input = await open('$12.50');
    input.value = '';
    input.dispatchEvent(new Event('input'));
    enter(input);
    expect(saved).toEqual([null]);
  });

  it('reads a saved price back as its mode shows it', () => {
    expect(savedPriceText(readAskingPrice({ askingPriceText: '12.5 $' }))).toBe('$12.50');
    expect(savedPriceText(readAskingPrice({ askingPriceText: '85%' }))).toBe('85% TCG');
    expect(savedPriceText(readAskingPrice({ askingPriceText: 'Trade only' }))).toBe('Trade only');
    expect(savedPriceText(readAskingPrice({}))).toBeNull();
  });
});
