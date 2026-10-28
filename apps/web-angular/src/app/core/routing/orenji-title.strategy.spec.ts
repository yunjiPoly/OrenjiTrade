import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { INDEX, NO_INDEX, OrenjiTitleStrategy } from './orenji-title.strategy';

@Component({ template: '' })
class PageComponent {}

describe('OrenjiTitleStrategy (decision 6)', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', pathMatch: 'full', title: 'Home', data: { seo: 'index' }, component: PageComponent },
          {
            path: 'legal',
            data: { seo: 'index' },
            children: [
              { path: '', title: 'Legal', component: PageComponent },
              { path: ':key', title: 'Terms', component: PageComponent },
            ],
          },
          { path: 'collectors/:handle', title: 'Collector', component: PageComponent },
          { path: 'inventory', title: 'Inventory', component: PageComponent },
        ]),
        { provide: TitleStrategy, useClass: OrenjiTitleStrategy },
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  const robots = () => TestBed.inject(Meta).getTag('name="robots"')?.content;

  it('writes "index" only on the landing and the legal pages, "noindex" everywhere else', async () => {
    await harness.navigateByUrl('/');
    expect(robots()).toBe(INDEX);
    expect(document.title).toBe('Home · OrenjiTrade');
    await harness.navigateByUrl('/collectors/x');
    expect(robots()).toBe(NO_INDEX);
    await harness.navigateByUrl('/legal');
    expect(robots()).toBe(INDEX);
    await harness.navigateByUrl('/legal/terms');
    expect(robots()).toBe(INDEX);
    await harness.navigateByUrl('/inventory');
    expect(robots()).toBe(NO_INDEX);
    expect(TestBed.inject(Router).url).toBe('/inventory');
  });
});
