import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';

@Component({
  selector: 'app-wishlist-page',
  imports: [MatButtonModule, MatIconModule, PageHeaderComponent, EmptyStateComponent],
  template: `
    <div class="page">
      <app-page-header
        title="Wishlist"
        subtitle="Cards you want. We notify you when a collector nearby lists a match."
      >
        <button actions matButton="filled" type="button" disabled>
          <mat-icon aria-hidden="true">add</mat-icon>
          Add wish
        </button>
      </app-page-header>
      <app-empty-state
        icon="favorite"
        title="Your wishlist is empty"
        description="Wishlists and match notifications arrive in Phase 6."
      />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WishlistPageComponent {}
