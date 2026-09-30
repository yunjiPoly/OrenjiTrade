import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    <div class="page not-found">
      <p class="not-found__code mono" aria-hidden="true">404</p>
      <h1>Page not found</h1>
      <p class="not-found__text">
        The page you were looking for does not exist or has moved. Check the address, or head back
        to the map to find collectors near you.
      </p>
      <a matButton="filled" routerLink="/map">
        <mat-icon aria-hidden="true">map</mat-icon>
        Back to the map
      </a>
    </div>
  `,
  styles: `
    .not-found {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--spacing-3);
      padding-top: var(--spacing-16);
      text-align: center;
    }
    .not-found__code {
      margin: 0;
      font-size: var(--font-size-4xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-primary);
    }
    .not-found__text {
      max-width: 48ch;
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPageComponent {}
