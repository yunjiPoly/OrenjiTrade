/**
 * The English copy of Messages on the web (web redesign spec 10, boards W18 to W21), the phone's
 * words (`apps/mobile/src/features/messages/chatCopy.ts`) where the web shares them. Functions
 * build the sentences that carry a handle, a card or a number. Deals ship by mail and payment stays
 * outside the app (ADR 0018): no word here promises protection, escrow or a guarantee, and nothing
 * here names a price for a feature (ADR 0019).
 */

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The inbox (spec 10.2). */
export const INBOX_COPY = {
  search: 'Search chats',
  all: 'All',
  unread: 'Unread',
  emptyTitle: 'No chats yet',
  emptyBody: 'Find a card and message who has it.',
  emptyAction: 'Search cards',
  noUnreadTitle: 'No unread chats',
  noUnreadBody: 'You’re all caught up.',
  noMatchTitle: (query: string) => `No chats match “${query}”`,
  noMatchBody: 'Try a handle or a card name.',
  clear: 'Show all chats',
  now: 'now',
  yesterday: 'Yesterday',
  minutes: (count: number) => `${count} min`,
  hours: (count: number) => `${count} h`,
  about: (name: string) => `about ${name}`,
} as const;

/** The chat's header and its "⋯" menu (spec 10.3). */
export const CHAT_COPY = {
  online: 'Online',
  typing: 'typing…',
  blocked: 'Blocked',
  muted: 'Muted',
  deal: 'Deal',
  dealShown: 'Deal panel shown',
  dealHidden: 'Deal panel hidden',
  closeDeal: 'Close the deal panel',
  more: (handle: string) => `More for ${handle}`,
  profile: (handle: string) => `Open the profile of ${handle}`,
  rate: (handle: string) => `Rate ${handle}`,
  mute: 'Mute',
  unmute: 'Unmute',
  archive: 'Archive',
  report: (handle: string) => `Report ${handle}`,
  block: (handle: string) => `Block ${handle}`,
  unblock: (handle: string) => `Unblock ${handle}`,
  conversation: (handle: string) => `Chat with ${handle}`,
  log: (handle: string) => `Messages with ${handle}`,
} as const;

/** The shield tip under the pinned bar (spec 10.3). */
export const TIP_COPY = {
  buying: 'Check their rating before you send an e-Transfer, and ask for tracking.',
  selling: 'Ship after the e-Transfer arrives, and add the tracking number when you mark it sold.',
  none: 'Deals happen in the chat and ship by mail. OrenjiTrade never holds the money.',
} as const;

/** The pinned bar (spec 10.3). */
export const PINNED_COPY = {
  yourCard: 'your card',
  yourDeckCore: 'your deck core',
  deckCore: 'Deck core',
  markAsSold: 'Mark as sold',
  sold: 'Sold',
  noLongerListed: 'No longer listed',
  aboutCard: (name: string) => `${name}, open the card`,
  aboutDeckCore: (name: string) => `${name}, open the deck core`,
  markAsSoldLabel: (name: string) => `Mark ${name} as sold`,
} as const;

/** The quick replies above the composer (the phone's, spec 10.3). */
export const QUICK_REPLIES = {
  buyingFirst: ['Is it still available?', 'How much with shipping?'],
  buyingAfter: ['e-Transfer sent!', 'Tracking number?', 'Thanks!'],
  sellingFirst: ['Yes, still available', 'Send me your address'],
  sellingAfter: ['Got your e-Transfer', 'Shipped!', 'Thanks for buying!'],
  label: 'Quick replies',
  send: (text: string) => `Send “${text}”`,
} as const;

/** The composer and its "+" menu (spec 10.3). */
export const COMPOSER_COPY = {
  placeholder: 'Write a message',
  cannotSend: 'This collector cannot receive messages right now',
  plus: 'Share in this chat',
  send: 'Send',
  sending: 'Sending…',
  hint: 'Enter to send · Shift+Enter for a new line',
  address: 'Send my address',
  etransfer: 'Send my e-Transfer email',
  typedEachTime: 'Typed each time. Never saved on the web.',
  photo: 'Send a photo',
  photoDetail: 'JPEG, PNG or WebP, up to 8 MB',
  card: 'Share a card from your inventory',
  binder: 'Share a binder',
  removeAttachment: 'Remove attachment',
  photoToSend: 'Photo to send',
  dropPhoto: 'Drop the photo to attach it',
  notSent: 'Not sent',
  tryAgain: 'Try again',
  nearLimit: (length: number, max: number) => `${length} / ${max} characters`,
} as const;

/** "Send my address" and "Send my e-Transfer email" (440, typed each time; decision 9). */
export const SEND_DETAIL_COPY = {
  addressTitle: 'Send my address',
  addressBody: (other: string, subject: string | null) =>
    subject
      ? `${other} ships the ${subject} there, with tracking.`
      : `${other} ships your cards there, with tracking.`,
  addressLabel: 'Name and mailing address',
  addressPlaceholder: 'Name, street, city, province and postal code',
  etransferTitle: 'Send my e-Transfer email',
  etransferBody:
    'The email you use for Interac e-Transfer. The money moves outside OrenjiTrade.',
  etransferLabel: 'Your e-Transfer email',
  etransferPlaceholder: 'name@example.com',
  notKept: (other: string) =>
    `OrenjiTrade doesn’t keep this. It goes only into this chat, where you and ${other} can see it.`,
  preview: (other: string) => `${other} will see`,
  cancel: 'Cancel',
  send: 'Send in this chat',
  sending: 'Sending…',
  addressMessage: (address: string) => `Ship to:\n${address}`,
  etransferMessage: (email: string) => `e-Transfer to ${email}`,
  addressSent: 'Address sent in this chat',
  etransferSent: 'e-Transfer email sent in this chat',
  noCopy: 'OrenjiTrade didn’t keep a copy.',
  emailInvalid: 'Write an email address, like name@example.com.',
} as const;

/** "Share a card from your inventory" and "Share a binder" (520 pickers). */
export const SHARE_COPY = {
  cardTitle: 'Share a card from your inventory',
  binderTitle: 'Share a binder',
  cardBody: (other: string) => `${other} sees it in this chat and can open it.`,
  binderBody: (other: string) =>
    `${other} sees it in this chat and can open it. Only public binders can be shared.`,
  cardSearch: 'Search your cards',
  binderSearch: 'Search your binders',
  cardFoot: 'Your cards, newest first',
  binderFoot: 'Your public binders and deck cores',
  cardEmpty: 'You have no cards to share yet.',
  binderEmpty: 'You have no public binder to share yet.',
  cardNoMatch: (query: string) => `None of your cards match “${query}”.`,
  binderNoMatch: (query: string) => `None of your public binders match “${query}”.`,
  loadError: 'Your cards could not load',
  binderLoadError: 'Your binders could not load',
  cancel: 'Cancel',
  share: (name: string) => `Share ${name}`,
  deckCore: 'Deck core',
  binder: 'Binder',
  private: 'Private',
  privateNote: 'A private card is shown to this collector only.',
} as const;

/** Mark as sold (480, spec 10.5), its toast and the undo. */
export const MARK_SOLD_COPY = {
  title: 'Mark as sold?',
  close: 'Close',
  copiesSold: 'Copies sold',
  of: (count: number) => `of ${count}`,
  fewer: 'One copy fewer',
  more: 'One copy more',
  trackingLabel: 'Tracking number',
  optional: 'optional',
  trackingPlaceholder: (buyer: string) => `So ${buyer} can follow the package`,
  trackingHint: (buyer: string) => `Only you and ${buyer} see it.`,
  clearTracking: 'Clear the tracking number',
  lastCopy: (buyer: string) =>
    `Sold to ${buyer}. It was your last copy, so the card leaves your inventory. You can rate each other next.`,
  copiesLeft: (buyer: string, left: number) =>
    `Sold to ${buyer}. You keep ${plural(left, 'copy', 'copies')} in your inventory. You can rate each other next.`,
  deckCore: (buyer: string) =>
    `Sold to ${buyer}. The deck core and its cards leave Search and your inventory. You can rate each other next.`,
  confirm: 'Mark as sold',
  saving: 'Marking…',
  notYet: 'Not yet',
  toast: 'Marked as sold',
  undo: 'Undo',
  undone: 'Sale undone. It is back in your inventory.',
  trackingInvalid: 'Use letters, digits, spaces, dots and dashes only.',
  trackingTooLong: 'At most 64 characters.',
  nothingLeft: 'Nothing left to sell: this card is no longer in your inventory.',
  undoClosed: 'This sale can no longer be undone.',
  undoRated: 'This sale was already rated, so it stays.',
  subjectChanged: (other: string) =>
    `${other} opened another of your listings. Check the card above, then mark it sold.`,
} as const;

/** The sale note both collectors read, worded for each side (spec 10.5, "Afterwards"). */
export const SALE_COPY = {
  seller: (name: string, buyer: string) => `You marked ${name} as sold to ${buyer}.`,
  buyer: (seller: string, name: string) => `${seller} marked ${name} as sold to you.`,
  copies: (count: number) => plural(count, 'copy', 'copies'),
  tracking: 'Tracking',
  rate: (other: string) => `Rate ${other}`,
  undo: 'Undo',
  undoLabel: (name: string) => `Undo the sale of ${name}`,
} as const;

/** The deal panel (320, spec 10.4). */
export const DEAL_COPY = {
  label: 'Deal',
  about: 'This chat is about',
  viewCard: 'View card',
  viewDeckCore: 'View deck core',
  yourCopies: 'Your copies',
  visibility: 'Visibility',
  binder: 'Binder',
  unfiled: 'Not in a binder',
  public: 'Public',
  private: 'Private',
  temporarilyPublic: 'Public for now',
  openInInventory: 'Open in Inventory',
  copiesUnknown: 'Your copies could not load.',
  soldOn: (date: string) => `Sold ${date}`,
  soldToYou: (seller: string) => `${seller} marked it sold to you`,
  sold: 'Sold',
  tracking: 'Tracking',
  howDeals: 'How deals work here',
  steps: [
    'Agree in the chat',
    'The buyer pays by e-Transfer',
    'The seller ships with tracking',
    'Mark as sold, then rate each other',
  ],
  noProtection: 'OrenjiTrade never holds the money and does not protect payments.',
  tradingSafely: 'Trading safely',
  with: 'With',
  viewProfile: 'View profile',
  viewProfileOf: (handle: string) => `View ${handle}’s profile`,
  rating: (average: string, count: number) => `★${average} · ${plural(count, 'rating', 'ratings')}`,
  ratingLabel: (average: string, count: number) =>
    `Rated ${average} out of 5 from ${plural(count, 'rating', 'ratings')}`,
  noRatings: 'No ratings yet',
  memberSince: (year: number) => `Member since ${year}`,
  moreFrom: (handle: string) => `More from ${handle}`,
  seeAll: 'See all',
  seeAllLabel: (handle: string) => `See all of ${handle}’s cards`,
  moreHint: 'Ask about one to ship it in the same package.',
  askTile: (name: string, price: string | null, handle: string) =>
    `${name}${price ? `, ${price}` : ''}. Ask ${handle} to add it to the same package`,
  askDraft: (name: string, price: string | null) =>
    price
      ? `Could you add your ${name} (${price}) to the same package?`
      : `Could you add your ${name} to the same package?`,
  noSubject: 'This chat is not about a card yet.',
  noSubjectHint: 'Share one of your cards and it pins here.',
  shareCard: 'Share a card from your inventory',
} as const;
