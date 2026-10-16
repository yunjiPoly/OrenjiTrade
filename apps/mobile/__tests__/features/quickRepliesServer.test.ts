import { readFileSync } from 'fs';
import { join } from 'path';

import { QUICK_REPLIES } from '@/src/features/messages/chatCopy';

/**
 * The API leaves the exact quick replies out of the repeated-content thresholds (stage R4, review
 * fix 1, P2): its list (`messaging.domain.QuickReplies`) must hold the phone's texts, or a reply
 * worded differently here would be flagged there again.
 */
describe('quick replies known to the API', () => {
  it('match the phone’s quick replies exactly', () => {
    const source = readFileSync(
      join(
        __dirname,
        '../../../api/src/main/java/com/orenjitrade/api/messaging/domain/QuickReplies.java'
      ),
      'utf8'
    );
    const block = source.slice(
      source.indexOf('Set.of('),
      source.indexOf(');', source.indexOf('Set.of('))
    );
    const server = [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]).sort();
    const phone = [
      ...QUICK_REPLIES.buyingFirst,
      ...QUICK_REPLIES.buyingAfter,
      ...QUICK_REPLIES.sellingFirst,
      ...QUICK_REPLIES.sellingAfter,
    ].sort();
    expect(server).toEqual(phone);
  });
});
