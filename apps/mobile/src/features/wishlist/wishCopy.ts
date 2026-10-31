/**
 * The words of "Add a wish" and "Edit a wish" (mockup v50 screens 64 and 65, stage R14) and of
 * the card search that "Add a wish" opens, in one place. The wish's own labels (which copy, the
 * terms, the saved and removed messages) stay in `wishlistLabels.ts`; the form's rules in
 * `wishForm.ts`.
 */
export const WISH_COPY = {
  searchTitle: 'Add a wish',
  searchIntro:
    'Which card are you looking for? We’ll tell you when a collector of your region lists it.',
  addTitle: 'Add to wishlist',
  editTitle: 'Edit wish',
  back: 'Back',
  change: 'Change',
  changeLabel: (name: string) => `Change the card: ${name}`,
  printings: (count: number) => `${count} ${count === 1 ? 'printing' : 'printings'} in the catalog`,
  whichCopy: 'Which copy',
  nearMint: 'Near Mint only',
  nearMintHint: 'Sellers see it; listings in other conditions still show.',
  price: 'Price you would pay (optional)',
  noPrice: 'No price',
  priceHint: 'Compared with the TCGplayer market price. Sellers see it; it never hides a listing.',
  /** The chosen term's amount for the chosen printing ("85% TCG ≈ 21.25 USD for this printing."). */
  priceAmount: (term: string, amount: string) => `${term} ${amount} for this printing.`,
  termsError: 'The price terms could not load.',
  tryAgain: 'Try again',
  note: 'Public note (optional)',
  noteCount: (count: number, max: number) => `${count} / ${max}`,
  notePlaceholder: 'Like “English only” or “Will trade Maxx C”',
  noteHint: 'Everyone who can see your wishlist sees it.',
  add: 'Add to wishlist',
  save: 'Save changes',
  saving: 'Saving…',
  remove: 'Remove from wishlist',
  removeTitle: (name: string) => `Remove ${name}?`,
  removeBody: 'You stop getting alerts for it.',
  removeConfirm: 'Remove',
  keep: 'Keep it',
  removed: (name: string) => `${name} left your wishlist.`,
  updated: 'Wish updated.',
  checkFields: 'Check the highlighted fields.',
  failed: 'Something went wrong. Please try again.',
  tryLater: 'Please try again.',
  cardError: 'This card could not load',
  notFoundTitle: 'This wish no longer exists',
  notFoundBody: 'It may have been removed.',
  backToWishlist: 'Back to your wishlist',
  loadError: 'Your wishlist could not load',
} as const;
