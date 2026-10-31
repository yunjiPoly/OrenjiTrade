import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LegalTextsService } from '../../legal/legal-texts.service';
import { LegalSettingsComponent } from './legal-settings.component';

describe('LegalSettingsComponent (spec 13, decision 23)', () => {
  it('lists the visible documents (the payment policies are left out by the service), each on its page', () => {
    TestBed.configureTestingModule({
      imports: [LegalSettingsComponent],
      providers: [
        provideRouter([]),
        {
          provide: LegalTextsService,
          useValue: {
            draftBanner: signal(null),
            translationNotice: signal(null),
            visibleDocuments: signal([
              { key: 'terms', title: 'Terms of Service', summary: 'The rules.' },
              { key: 'trading-safely', title: 'Trading safely', summary: 'How deals go.' },
            ]),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(LegalSettingsComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const rows = [...element.querySelectorAll('[data-testid="settings-legal-doc"]')];
    expect(rows.map((row) => row.getAttribute('href'))).toEqual([
      '/legal/terms',
      '/legal/trading-safely',
    ]);
    expect(element.textContent).not.toMatch(/Payment Protection|Refund & Dispute/);
  });
});
