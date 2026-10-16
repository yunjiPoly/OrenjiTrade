/**
 * The approved English copy of Messages (owner spec 2026-10-14, section 10, mockup screens 22 to
 * 25): the inbox, the chat (top bar, "⋯" sheet, pinned bar, quick replies, the message box and the
 * "+" sheet), Mark as sold and its sale message, and Settings › Shipping details. One object per
 * screen, so the French translation (on hold) can slot in later; functions build the sentences that
 * carry a name or a number. Deals ship by mail and payment stays outside the app (ADR 0018): no
 * word here promises protection, escrow or a guarantee.
 */

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Messages, the inbox (screen 22). */
export const INBOX_COPY = {
  title: 'Messages',
  viewLabel: 'Messages view',
  inbox: 'Inbox',
  community: 'Community',
  loadError: 'Conversations could not load',
  emptyTitle: 'No messages yet',
  empty: 'Find a card in Search and message its owner.',
  emptyAction: 'Open search',
  you: (preview: string) => `You: ${preview}`,
  noMessage: 'No messages yet. Say hello!',
  unread: 'Unread',
  online: 'Online',
  muted: 'Muted',
  yesterday: 'Yesterday',
  minutes: (count: number) => `${count} min`,
  hours: (count: number) => `${count} h`,
  now: 'now',
  /** The subject's picture on the right of a row, for screen readers. */
  about: (name: string) => `about ${name}`,
} as const;

/** The chat's top bar and its "⋯" sheet (screens 23 and 24). */
export const CHAT_COPY = {
  back: 'Back to messages',
  profile: (handle: string) => `${handle}, open profile`,
  more: (handle: string) => `More for ${handle}`,
  online: 'Online',
  typing: 'typing…',
  blocked: 'Blocked',
  muted: 'Muted',
  rate: (handle: string) => `Rate ${handle}`,
  mute: 'Mute',
  muteDetail: 'No notifications for this chat',
  unmute: 'Unmute',
  archive: 'Archive',
  archiveDetail: 'A new message brings it back',
  report: (handle: string) => `Report ${handle}`,
  block: (handle: string) => `Block ${handle}`,
  unblock: (handle: string) => `Unblock ${handle}`,
  mutedToast: 'Chat muted.',
  unmutedToast: 'Chat unmuted.',
  archivedToast: 'Chat archived. A new message brings it back.',
  emptyTitle: (handle: string) => `Say hello to ${handle}`,
  emptyBody: 'Ask about a card, or share one of yours with the + button.',
  notFoundTitle: 'This conversation is not available',
  notFoundBody: 'It may be hidden because of a block, or the collector left OrenjiTrade.',
  notFoundAction: 'Back to messages',
  loadError: 'Messages could not load',
  loading: 'Loading messages',
  start: (handle: string) => `This is the beginning of your conversation with ${handle}.`,
  youBlocked: (handle: string) =>
    `You blocked ${handle}. Neither of you can send messages and this conversation is hidden from your inbox.`,
  cannotMessage: (handle: string) => `You can no longer message ${handle}.`,
  unblockAction: 'Unblock',
  blockTitle: (handle: string) => `Block ${handle}?`,
  blockBody:
    'You will stop seeing each other’s binders, profiles and posts on the map, in search and in the community, and neither of you can send messages. They are not told. You can unblock them from this chat or from Settings → Blocked users.',
  blockConfirm: 'Block',
  blockedToast: (handle: string) => `${handle} is blocked.`,
  unblockedToast: (handle: string) => `${handle} is unblocked.`,
} as const;

/** The pinned bar: the card or deck core the chat is about. */
export const PINNED_COPY = {
  yourCard: 'your card',
  yourDeckCore: 'your deck core',
  deckCore: 'Deck core',
  markAsSold: 'Mark as sold',
  sold: 'Sold',
  noLongerListed: 'No longer listed',
  aboutCard: (name: string) => `${name}, about this card`,
  aboutDeckCore: (name: string) => `${name}, about this deck core`,
  markAsSoldLabel: (name: string) => `Mark ${name} as sold`,
} as const;

/** The quick replies above the message box (spec section 16, default 10). */
export const QUICK_REPLIES = {
  buyingFirst: ['Is it still available?', 'How much with shipping?'],
  buyingAfter: ['e-Transfer sent!', 'Tracking number?', 'Thanks!'],
  sellingFirst: ['Yes, still available', 'Send me your address'],
  sellingAfter: ['Got your e-Transfer', 'Shipped!', 'Thanks for buying!'],
  label: 'Quick replies',
  send: (text: string) => `Send “${text}”`,
} as const;

/** The message box and the "+" sheet. */
export const COMPOSER_COPY = {
  placeholder: 'Message',
  cannotSend: (handle: string) => `You cannot message ${handle}`,
  attach: 'Share in this chat',
  send: 'Send',
  sending: 'Sending…',
  sheetTitle: 'Share in this chat',
  address: 'Send my address',
  etransfer: 'Send my e-Transfer email',
  savedOnPhone: 'Saved on this phone only',
  photo: 'Send a photo',
  photoDetail: 'JPEG, PNG or WebP, up to 8 MB',
  card: 'Share a card from your inventory',
  binder: 'Share a binder',
  cancel: 'Cancel',
  removeAttachment: 'Remove attachment',
  photoToSend: 'Photo to send',
  photoAccess: 'Allow access to your photos to send one.',
  nearLimit: (length: number, max: number) => `${length} / ${max} characters`,
  attachmentCard: 'Your card',
  attachmentBinder: 'Public binder',
  attachmentPhoto: 'Photo',
} as const;

/** The first-time question of "Send my address" / "Send my e-Transfer email". */
export const SAVED_DETAIL_COPY = {
  addressTitle: 'Your shipping address',
  addressLabel: 'Address',
  addressPlaceholder: 'Name\nStreet and number\nCity, province, postal code',
  etransferTitle: 'Your e-Transfer email',
  etransferLabel: 'Email or phone number',
  etransferPlaceholder: 'you@example.com',
  hint: 'Saved on this phone only, never on OrenjiTrade. It goes into the message box so you can check it before you send it.',
  save: 'Save and use',
  cancel: 'Cancel',
  required: 'Write it first.',
  tooLong: (max: number) => `At most ${max} characters.`,
  addressMessage: (address: string) => `Ship to:\n${address}`,
  etransferMessage: (email: string) => `e-Transfer to ${email}`,
} as const;

/** Mark as sold, the sheet (screen 25), its toast and the undo. */
export const MARK_SOLD_COPY = {
  title: 'Mark as sold?',
  copies: (count: number) => plural(count, 'copy', 'copies'),
  copiesSold: 'Copies sold',
  trackingLabel: 'Tracking number',
  optional: 'optional',
  trackingPlaceholder: (buyer: string) => `So ${buyer} can follow the package`,
  lastCopy: (buyer: string) =>
    `Sold to ${buyer}. It was your last copy, so the card leaves your inventory. You can rate each other next.`,
  copiesLeft: (buyer: string, left: number) =>
    `Sold to ${buyer}. You'll have ${left} left. You can rate each other next.`,
  deckCore: (buyer: string) =>
    `Sold to ${buyer}. The deck core and its cards leave Search and your inventory. You can rate each other next.`,
  confirm: 'Mark as sold',
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

/** The sale message both collectors read, worded for each side. */
export const SALE_MESSAGE_COPY = {
  seller: (name: string, buyer: string) => `You marked ${name} as sold to ${buyer}.`,
  buyer: (seller: string, name: string) => `${seller} marked ${name} as sold to you.`,
  tracking: 'Tracking',
  trackingSpoken: (number: string) => `Tracking ${number}`,
  rate: (other: string) => `Rate ${other}`,
} as const;

/** Settings › Shipping details. */
export const SHIPPING_DETAILS_COPY = {
  title: 'Shipping details',
  intro:
    'Your address and your e-Transfer email or phone number stay on this phone only. In a chat, the + button puts them into the message box; nothing is sent until you tap send.',
  address: 'Shipping address',
  addressHint: 'For “Send my address” when you buy.',
  etransfer: 'e-Transfer email or phone number',
  etransferHint: 'For “Send my e-Transfer email” when you sell.',
  save: 'Save',
  saved: 'Saved on this phone.',
  clear: 'Delete from this phone',
  cleared: 'Deleted from this phone.',
  noChanges: 'No changes yet',
  unavailable: 'This phone cannot keep them safely, so nothing is saved.',
  row: 'Shipping details',
  rowDetail: 'Your address and e-Transfer email, saved on this phone only',
} as const;
